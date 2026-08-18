/**
 * Turning raw activities into daily readiness snapshots.
 *
 * This is the piece that connects the engine to the database: it takes an
 * athlete's activity history (and their recovery data, when a wellness source
 * is connected), runs the load → fitness/fatigue → readiness chain, and
 * produces one row per calendar day ready to upsert into `readiness_snapshots`.
 *
 * Deliberately free of database calls so it can be tested without one. The
 * server action in src/actions/readiness.ts does the reading and writing.
 */

import { sessionLoad, toDailySeries, type LoadProfile } from "@/lib/planning/load";
import { loadRatio } from "@/lib/planning/acwr";
import { computePmc, seedFromHistory } from "@/lib/planning/pmc";
import { computeReadiness } from "@/lib/planning/readiness";
import { estimateThresholds, type HistoryActivity } from "@/lib/planning/thresholds";
import {
  hrvVsBaselinePct, latestSleepHours, type RecoverySignal,
} from "@/lib/wellness/intervalsIcu";
import { buildNarrative } from "@/lib/narrative/buildNarrative";

/** Matches a row of the `activities` table. */
export interface ActivityRow {
  started_at: string | null;
  distance_m: number | null;
  duration_s: number | null;
  avg_hr: number | null;
}

/**
 * What we know about the athlete's physiology.
 *
 * ⚠️ `profiles` currently has no age or sex column, so callers pass defaults.
 * See supabase/migrations/0002_profile_physiology.sql — not yet applied.
 */
export interface AthleteProfile {
  age: number;
  sex: "male" | "female";
  /** overrides the estimate when a wellness source supplies it */
  restingHr?: number;
  /** carried between runs so the threshold estimate can only fall slowly */
  previousLthr?: number;
}

/** One row of `readiness_snapshots`. */
export interface ReadinessSnapshot {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number | null;
  cardiac_drift: number | null;
  readiness_score: number;
  narrative: string | null;
}

export interface PipelineResult {
  snapshots: ReadinessSnapshot[];
  /** the full narrative for the most recent day, including the reasoning lines */
  latestNarrative: ReturnType<typeof buildNarrative> | null;
  /** thresholds used, so they can be cached and shown in the UI */
  thresholds: ReturnType<typeof estimateThresholds>;
  /** how many runs were scored from heart rate rather than pace */
  hrScoredRuns: number;
  totalRuns: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

/** Longest run in the 30 days up to `asOf`, in metres. */
function longestRecent(history: HistoryActivity[], asOf: string): number | null {
  const from = iso(new Date(new Date(asOf).getTime() - 30 * DAY));
  const inWindow = history.filter((h) => h.date > from && h.date <= asOf);
  if (inWindow.length === 0) return null;
  return Math.max(...inWindow.map((h) => h.distanceM));
}

/**
 * @param activities all of the athlete's runs, any order
 * @param recovery   wellness rows; pass [] when no source is connected
 * @param days       how many days of snapshots to emit, counting back from `asOf`
 *
 * Note the engine always runs over the *full* history even when only the last
 * 90 days are emitted — fitness is a 42-day decay and needs roughly 126 days of
 * run-up before it means anything.
 */
export function buildSnapshots(
  activities: ActivityRow[],
  recovery: RecoverySignal[],
  profile: AthleteProfile,
  asOf: Date = new Date(),
  days = 90,
): PipelineResult {
  const history: HistoryActivity[] = activities
    .filter((a) => a.started_at && (a.duration_s ?? 0) > 0)
    .map((a) => ({
      durationSec: a.duration_s as number,
      distanceM: a.distance_m ?? 0,
      avgHr: a.avg_hr,
      date: (a.started_at as string).slice(0, 10),
    }));

  const thresholds = estimateThresholds(history, {
    age: profile.age,
    sex: profile.sex,
    hrRest: profile.restingHr,
    previousLthr: profile.previousLthr,
  });

  const loadProfile: LoadProfile = {
    hrMax: thresholds.hrMax,
    hrRest: thresholds.hrRest,
    lthr: thresholds.lthr,
    sex: profile.sex,
    thresholdSpeedMps: thresholds.thresholdSpeedMps,
    thresholdsMeasured: thresholds.measured,
  };

  const scored = history.map((h) => ({ h, s: sessionLoad(h, loadProfile) }));
  const hrScoredRuns = scored.filter((x) => x.s.method === "hrss").length;

  if (history.length === 0) {
    return { snapshots: [], thresholds, hrScoredRuns: 0, totalRuns: 0, latestNarrative: null };
  }

  const first = history.reduce((min, h) => (h.date < min ? h.date : min), history[0].date);
  const series = toDailySeries(
    scored.map((x) => ({ date: x.h.date, load: x.s.load })),
    first,
    iso(asOf),
  );

  const pmc = computePmc(series, {
    seedCtl: seedFromHistory(series.slice(0, 42)),
    seedAtl: seedFromHistory(series.slice(0, 7)),
  });

  const emitFrom = Math.max(0, pmc.length - days);
  const snapshots: ReadinessSnapshot[] = [];
  let lastNarrative: ReturnType<typeof buildNarrative> | null = null;

  for (let i = emitFrom; i < pmc.length; i++) {
    const point = pmc[i];

    // load ratio as it stood on that day, not today
    const ratio = loadRatio(series.slice(0, i + 1)).ratio;

    const sleepHours = latestSleepHours(recovery, point.date);
    const hrvPct = hrvVsBaselinePct(recovery, point.date);

    const readiness = computeReadiness({
      pmc: point,
      loadRatio: ratio,
      cardiacDriftPct: null, // needs per-activity streams — not wired yet
      sleepHours,
      hrvVsBaselinePct: hrvPct,
    });

    // The narrative is computed, not generated — see buildNarrative for why.
    // It is stored per day so the dashboard never recomputes it on a page view,
    // and so a future AI rewrite has a stable input to work from.
    const narrative = buildNarrative({
      readiness,
      pmc: point,
      loadRatio: ratio,
      sleepHours,
      hrvVsBaselinePct: hrvPct,
      cardiacDriftPct: null, // needs per-activity streams — not wired yet
      restingHr: profile.restingHr ?? null,
      longestRecentM: longestRecent(history, point.date),
    });

    snapshots.push({
      date: point.date,
      ctl: round1(point.ctl),
      atl: round1(point.atl),
      tsb: round1(point.tsb),
      acwr: ratio === null ? null : round2(ratio),
      cardiac_drift: null,
      readiness_score: readiness.score,
      narrative: narrative.body,
    });

    lastNarrative = narrative;
  }

  return {
    snapshots,
    thresholds,
    hrScoredRuns,
    totalRuns: history.length,
    latestNarrative: lastNarrative,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

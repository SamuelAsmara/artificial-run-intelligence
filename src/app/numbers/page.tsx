import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NumbersView } from "@/components/screens/NumbersView";
import { buildNumbersTiles, type NumbersLive } from "@/lib/screens/numbers";
import { buildSnapshots, type ActivityRow } from "@/lib/readiness/pipeline";
import { sessionLoad } from "@/lib/planning/load";
import type { RecoverySignal } from "@/lib/wellness/intervalsIcu";
import { PR_DISTANCES } from "@/lib/wellness/icuStreams";
import { weekStart, zonedNow, APP_LOCALE, APP_TIME_ZONE } from "@/lib/time/week";

export const metadata = { title: "Your numbers · Runi" };

/**
 * Your numbers — every figure in Runi, on this athlete's data.
 *
 * The loader gathers what the tiles need and hands it to a pure builder
 * (lib/screens/numbers.ts). Thresholds and per-run load come from the same
 * pipeline the readiness job runs, so a value here is the value the dashboard
 * would show, never a second opinion.
 *
 * /settings/methodology, where this lived as a page of formulas, redirects
 * here.
 */

const RACE_LABEL: Record<string, string> = { "5k": "5K", "10k": "10K", half: "Half marathon", marathon: "Marathon" };
const PB_ORDER = ["marathon", "half", "10k", "5k", "1k"];

function parseHms(s: string | null): number | null {
  if (!s) return null;
  const parts = s.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export default async function NumbersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/numbers");

  const [{ data: profile }, { data: activities }, { data: recoveryRows }, { data: snaps }, { data: race }] = await Promise.all([
    supabase.from("profiles").select("age, sex, lthr").eq("id", user.id).maybeSingle(),
    supabase.from("activities")
      .select("started_at, distance_m, duration_s, avg_hr, avg_pace, cardiac_drift_pct, best_efforts")
      .eq("user_id", user.id).order("started_at", { ascending: true }),
    supabase.from("recovery_signals").select("date, sleep_hours, resting_hr, hrv, source")
      .eq("user_id", user.id).order("date", { ascending: true }),
    supabase.from("readiness_snapshots").select("date, ctl, atl, tsb, acwr, readiness_score")
      .eq("user_id", user.id).order("date", { ascending: false }).limit(100),
    supabase.from("goal_races").select("race_type, race_date, target_time")
      .eq("user_id", user.id).eq("status", "active").order("race_date", { ascending: true }).limit(1).maybeSingle(),
  ]);

  const acts = (activities ?? []).filter((a) => a.started_at && (a.duration_s ?? 0) > 0);
  const recovery: RecoverySignal[] = (recoveryRows ?? []).map((r) => ({
    date: r.date, sleepHours: r.sleep_hours, restingHr: r.resting_hr, hrv: r.hrv, source: r.source as RecoverySignal["source"],
  }));
  const withRest = recovery.filter((r) => r.restingHr != null);
  const restingHr = withRest.length ? Math.round(withRest[withRest.length - 1].restingHr as number) : undefined;

  // thresholds and per-run load, from the readiness pipeline itself
  let thresholds: NumbersLive["thresholds"] = null;
  let loadProfile: Parameters<typeof sessionLoad>[1] | null = null;
  if (acts.length > 0) {
    const result = buildSnapshots(acts as ActivityRow[], recovery, {
      age: profile?.age ?? 34,
      sex: (profile?.sex as "male" | "female") ?? "male",
      restingHr,
      previousLthr: profile?.lthr ?? undefined,
    }, new Date(), 90);
    const t = result.thresholds;
    thresholds = {
      hrMax: Math.round(t.hrMax), hrRest: Math.round(t.hrRest), lthr: Math.round(t.lthr), measured: t.measured,
      thresholdPaceSecPerKm: t.thresholdSpeedMps > 0 ? 1000 / t.thresholdSpeedMps : null,
    };
    loadProfile = {
      hrMax: t.hrMax, hrRest: t.hrRest, lthr: t.lthr,
      sex: (profile?.sex as "male" | "female") ?? "male",
      thresholdSpeedMps: t.thresholdSpeedMps, thresholdsMeasured: t.measured,
    };
  }

  const last = acts.length ? acts[acts.length - 1] : null;
  const lastLoad = last && loadProfile
    ? sessionLoad({ durationSec: last.duration_s as number, distanceM: last.distance_m ?? 0, avgHr: last.avg_hr }, loadProfile)
    : null;

  // weekly volume, Sunday-start, in the product's time zone
  const now = zonedNow();
  const thisStart = weekStart(now);
  const lastStart = new Date(thisStart); lastStart.setDate(lastStart.getDate() - 7);
  const inRange = (iso: string, from: Date, to: Date) => { const d = new Date(iso); return d >= from && d < to; };
  const thisWeek = acts.filter((a) => inRange(a.started_at as string, thisStart, new Date(thisStart.getTime() + 7 * 86_400_000)));
  const lastWeek = acts.filter((a) => inRange(a.started_at as string, lastStart, thisStart));
  const km = (rows: typeof acts) => rows.reduce((s, a) => s + (a.distance_m ?? 0), 0) / 1000;

  // snapshots: today's and one about a week back
  const latest = snaps && snaps.length ? snaps[0] : null;
  const weekAgo = snaps && snaps.length > 7 ? snaps[7] : snaps && snaps.length ? snaps[snaps.length - 1] : null;

  // the best effort the prediction can stand on
  let raceLive: NumbersLive["race"] = null;
  if (race) {
    const best: Record<string, number> = {};
    for (const a of acts) {
      const be = (a.best_efforts ?? {}) as Record<string, number>;
      for (const [k, v] of Object.entries(be)) if (Number.isFinite(v) && v > 0 && (best[k] == null || v < best[k])) best[k] = v;
    }
    const baseKey = PB_ORDER.find((k) => best[k] != null && PR_DISTANCES[k] != null);
    const distanceM = PR_DISTANCES[race.race_type] ?? null;
    // With no personal best on file the builder shows "needs a personal best".
    if (distanceM) {
      raceLive = {
        label: RACE_LABEL[race.race_type] ?? race.race_type,
        distanceM,
        targetSec: parseHms(race.target_time),
        baseLabel: baseKey ? (RACE_LABEL[baseKey] ?? baseKey.toUpperCase()) : "",
        baseDistanceM: baseKey ? PR_DISTANCES[baseKey] : 0,
        baseSec: baseKey ? best[baseKey] : 0,
      };
    }
  }

  // the past year, for the history chart in each panel
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const yearAgo = new Date(now); yearAgo.setDate(yearAgo.getDate() - 366);
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const series: NonNullable<NumbersLive["series"]> = {
    today: todayIso,
    snapshots: [...(snaps ?? [])].reverse().map((r) => ({ date: r.date, ctl: r.ctl, atl: r.atl, tsb: r.tsb, acwr: r.acwr, readiness: r.readiness_score })),
    runs: acts.filter((a) => new Date(a.started_at as string) >= yearAgo).map((a) => {
      const l = loadProfile ? sessionLoad({ durationSec: a.duration_s as number, distanceM: a.distance_m ?? 0, avgHr: a.avg_hr }, loadProfile) : null;
      const paceSec = a.distance_m && a.distance_m > 0 ? (a.duration_s as number) / (a.distance_m / 1000) : null;
      return {
        date: dayOf(a.started_at as string), avgHr: a.avg_hr, paceSecPerKm: paceSec, distanceM: a.distance_m,
        load: l && l.method !== "none" ? l.load : null, driftPct: a.cardiac_drift_pct,
      };
    }),
    nights: recovery.filter((r) => r.date >= dayOf(yearAgo.toISOString())).map((r) => ({ date: r.date, sleepHours: r.sleepHours })),
  };

  const live: NumbersLive = {
    snapshot: latest ? { date: latest.date, ctl: latest.ctl, atl: latest.atl, tsb: latest.tsb, acwr: latest.acwr, readiness: latest.readiness_score } : null,
    weekAgo: weekAgo ? { ctl: weekAgo.ctl, atl: weekAgo.atl } : null,
    lastRun: last ? {
      date: (last.started_at as string).slice(0, 10),
      distanceM: last.distance_m, durationS: last.duration_s, avgHr: last.avg_hr, avgPace: last.avg_pace,
      driftPct: last.cardiac_drift_pct, load: lastLoad?.load ?? null, loadMethod: lastLoad?.method ?? null,
    } : null,
    thresholds,
    volume: acts.length ? { thisWeekKm: km(thisWeek), lastWeekKm: km(lastWeek), runsThisWeek: thisWeek.length } : null,
    recovery: recovery.length ? { date: recovery[recovery.length - 1].date, sleepHours: recovery[recovery.length - 1].sleepHours, restingHr: recovery[recovery.length - 1].restingHr, hrv: recovery[recovery.length - 1].hrv } : null,
    race: raceLive,
    series,
  };

  const asOf = new Intl.DateTimeFormat(APP_LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: APP_TIME_ZONE }).format(now);
  return <NumbersView tiles={buildNumbersTiles(live)} asOf={asOf} />;
}

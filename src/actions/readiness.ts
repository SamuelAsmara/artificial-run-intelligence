"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildSnapshots, type ActivityRow } from "@/lib/readiness/pipeline";
import {
  fetchWellness, toRecoverySignals, type RecoverySignal,
} from "@/lib/wellness/intervalsIcu";
import { icuConfigForCurrentUser } from "@/lib/providers/credentials";
import {
  hrvVsBaselinePct, latestSleepHours,
} from "@/lib/wellness/intervalsIcu";
import { computeReadiness } from "@/lib/planning/readiness";
import { buildNarrative, type Narrative } from "@/lib/narrative/buildNarrative";

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Recomputes the athlete's readiness history and stores it.
 *
 * Reads every activity we hold for them, pulls recovery data when a wellness
 * source is configured, runs the engine, and upserts one row per day into
 * `readiness_snapshots`. Safe to run repeatedly — the unique key on
 * (user_id, date) makes it idempotent.
 *
 * Called after a Strava sync, from the daily cron, and manually from Settings.
 */
export async function recomputeReadiness(
  days = 90,
): Promise<ActionResult<{ days: number; runs: number; hrScored: number; withRecovery: boolean }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: activities, error: actErr } = await supabase
    .from("activities")
    .select("started_at, distance_m, duration_s, avg_hr")
    .eq("user_id", user.id)
    .order("started_at", { ascending: true });

  if (actErr) return { error: `Could not read activities: ${actErr.message}` };
  if (!activities || activities.length === 0) {
    return { error: "No activities yet — connect Strava and sync first." };
  }

  /* --- recovery, if a wellness source is configured --- */
  let recovery: RecoverySignal[] = [];
  // The athlete's own connection first, falling back to the server environment
  // so a developer setup keeps working. See src/actions/providers.ts.
  const icu = await icuConfigForCurrentUser();
  if (icu) {
    try {
      const rows = await fetchWellness(
        icu,
        iso(new Date(Date.now() - 400 * 86400000)),
        iso(new Date()),
      );
      recovery = toRecoverySignals(rows);

      // cache it so the score can be recomputed without hitting the API again
      if (recovery.length > 0) {
        await supabase.from("recovery_signals").upsert(
          recovery.map((r) => ({
            user_id: user.id,
            date: r.date,
            sleep_hours: r.sleepHours,
            resting_hr: r.restingHr,
            hrv: r.hrv,
            source: r.source,
          })),
          { onConflict: "user_id,date" },
        );
      }
    } catch {
      // A wellness outage must not stop the load model from updating; the
      // score simply falls back to its load-only weighting for this run.
      recovery = [];
    }
  }

  if (recovery.length === 0) {
    const { data: cached } = await supabase
      .from("recovery_signals")
      .select("date, sleep_hours, resting_hr, hrv, source")
      .eq("user_id", user.id);
    recovery = (cached ?? []).map((r) => ({
      date: r.date,
      sleepHours: r.sleep_hours,
      restingHr: r.resting_hr,
      hrv: r.hrv,
      source: r.source as "webhook" | "derived",
    }));
  }

  /* --- run the engine --- */
  const recentRestingHrs = recovery
    .filter((r) => r.restingHr != null)
    .slice(-30)
    .map((r) => r.restingHr as number);
  const restingHr = recentRestingHrs.length
    ? Math.round(recentRestingHrs.reduce((s, v) => s + v, 0) / recentRestingHrs.length)
    : undefined;

  const result = buildSnapshots(
    activities as ActivityRow[],
    recovery,
    // TODO: read age and sex from `profiles` once migration 0002 is applied.
    { age: 34, sex: "male", restingHr },
    new Date(),
    days,
  );

  if (result.snapshots.length === 0) {
    return { error: "Not enough history to compute readiness yet." };
  }

  const { error: upsertErr } = await supabase.from("readiness_snapshots").upsert(
    result.snapshots.map((s) => ({ ...s, user_id: user.id })),
    { onConflict: "user_id,date" },
  );
  if (upsertErr) return { error: `Could not store snapshots: ${upsertErr.message}` };

  revalidatePath("/dashboard");

  return {
    data: {
      days: result.snapshots.length,
      runs: result.totalRuns,
      hrScored: result.hrScoredRuns,
      withRecovery: recovery.length > 0,
    },
  };
}

/** The most recent snapshot, for the dashboard. */
export async function getLatestReadiness() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("readiness_snapshots")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/** The last `days` snapshots, oldest first — the fitness/fatigue/form chart. */
export async function getReadinessSeries(days = 84) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const from = iso(new Date(Date.now() - days * 86400000));
  const { data } = await supabase
    .from("readiness_snapshots")
    .select("date, ctl, atl, tsb, acwr, readiness_score")
    .eq("user_id", user.id)
    .gte("date", from)
    .order("date", { ascending: true });

  return data ?? [];
}

/**
 * Today's narrative and its reasoning, for the dashboard.
 *
 * The snapshot table stores the narrative *text* so the history is preserved,
 * but not the reasoning lines behind it. Rather than widen the schema, this
 * rebuilds the full object from the stored numbers. `buildNarrative` is a pure
 * function, so reconstructing it is exact and costs microseconds — and it means
 * the reasoning panel always reflects the current explanation logic rather than
 * whatever was frozen into the row months ago.
 */
export async function getDashboardNarrative(): Promise<Narrative | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: snap } = await supabase
    .from("readiness_snapshots")
    .select("date, ctl, atl, tsb, acwr, readiness_score")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!snap) return null;

  const asOf = snap.date;

  // recovery for the night before `asOf`, plus enough history for the baseline
  const { data: recoveryRows } = await supabase
    .from("recovery_signals")
    .select("date, sleep_hours, resting_hr, hrv, source")
    .eq("user_id", user.id)
    .lte("date", asOf)
    .order("date", { ascending: false })
    .limit(30);

  const recovery: RecoverySignal[] = (recoveryRows ?? []).map((r) => ({
    date: r.date,
    sleepHours: r.sleep_hours,
    restingHr: r.resting_hr,
    hrv: r.hrv,
    source: r.source as RecoverySignal["source"],
  }));

  const sleepHours = latestSleepHours(recovery, asOf);
  const hrvPct = hrvVsBaselinePct(recovery, asOf);

  const restingHrs = recovery
    .map((r) => r.restingHr)
    .filter((v): v is number => v != null);
  const restingHr = restingHrs.length
    ? Math.round(restingHrs.reduce((s, v) => s + v, 0) / restingHrs.length)
    : null;

  // the previous 30 days of runs, for "your longest run in the last month"
  const from = iso(new Date(new Date(asOf).getTime() - 30 * 86_400_000));
  const { data: recentRuns } = await supabase
    .from("activities")
    .select("distance_m")
    .eq("user_id", user.id)
    .gte("started_at", from)
    .order("distance_m", { ascending: false })
    .limit(1);

  const longestRecentM = recentRuns?.[0]?.distance_m ?? null;

  const pmc = {
    ctl: Number(snap.ctl ?? 0),
    atl: Number(snap.atl ?? 0),
    tsb: Number(snap.tsb ?? 0),
    rampRate: 0, // not stored per day; the narrative treats 0 as "maintaining"
  };
  const loadRatio = snap.acwr === null ? null : Number(snap.acwr);

  const readiness = computeReadiness({
    pmc,
    loadRatio,
    cardiacDriftPct: null,
    sleepHours,
    hrvVsBaselinePct: hrvPct,
  });

  return buildNarrative({
    readiness,
    pmc,
    loadRatio,
    sleepHours,
    hrvVsBaselinePct: hrvPct,
    restingHr,
    longestRecentM,
  });
}

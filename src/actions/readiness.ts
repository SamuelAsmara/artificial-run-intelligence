"use server";

/**
 * Today's readiness — computing it, and reading it back.
 *
 * Readiness is one number from four inputs: form, load ratio, resting heart
 * rate and HRV, each scored against *the athlete's own* thirty-day baseline
 * rather than against a population. `computeReadiness` in `lib/planning/` does
 * that arithmetic; this file gathers what it needs and stores what it says.
 *
 * A missing input is dropped from the weighted sum rather than counted as
 * zero — an athlete with no HRV strap gets a score built from what is actually
 * known, and the explanation panel says which parts were available.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recomputeForUser } from "@/lib/readiness/recompute";
import { hrvVsBaselinePct, latestSleepHours, type RecoverySignal } from "@/lib/wellness/intervalsIcu";
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

  // The work itself lives in a lib so the nightly cron can run it for an
  // athlete who is not the one signed in. This is the session wrapper.
  const result = await recomputeForUser(supabase, user.id, days);
  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard");
  return { data: result.data };
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

  // Eight rows, not one: the eighth is a week back, which is what the fitness
  // ramp is measured against. See the `rampRate` note below.
  const { data: snaps } = await supabase
    .from("readiness_snapshots")
    .select("date, ctl, atl, tsb, acwr, readiness_score")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(8);

  const snap = snaps?.[0];
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

  // The most recent reading, not a thirty-day mean — the narrative renders this
  // as "resting heart rate is 52", which is a claim about today. Averaging is
  // exactly what hides the morning it jumps nine beats.
  const withRestingHr = recovery.filter((r) => r.restingHr != null);
  const restingHr = withRestingHr.length
    ? Math.round(withRestingHr[0].restingHr as number)
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

  /*
   * The weekly fitness ramp, recovered from the stored series.
   *
   * This used to be hard-coded to 0 with a comment saying the narrative would
   * read that as "maintaining" — and the file's own docstring claimed the
   * rebuild was exact. It was not. `whatStandsOut` has branches for fitness
   * climbing faster than the usual 5–8 points a week, and for a collapse during
   * a lay-off; with the ramp pinned at zero neither could ever fire. The
   * narrative *written* by the nightly pipeline said "fitness is climbing at
   * 9.2 points a week, faster than the usual guidance"; the narrative the
   * dashboard *displayed* silently dropped that sentence.
   *
   * CTL is stored per day, so the ramp is simply the difference over the last
   * seven of them.
   */
  const weekAgo = snaps && snaps.length >= 8 ? snaps[7] : null;
  const rampRate =
    weekAgo && weekAgo.ctl !== null && snap.ctl !== null
      ? Number(snap.ctl) - Number(weekAgo.ctl)
      : 0;

  const pmc = {
    ctl: Number(snap.ctl ?? 0),
    atl: Number(snap.atl ?? 0),
    tsb: Number(snap.tsb ?? 0),
    rampRate,
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

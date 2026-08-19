/**
 * Running the readiness engine for one athlete.
 *
 * Lifted out of the server action so the nightly job can call it too: the
 * action knows who is signed in, the cron does not, so the athlete is a
 * parameter rather than a session.
 *
 * Idempotent — the unique key on (user_id, date) means running it twice
 * produces the same rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { buildSnapshots, type ActivityRow } from "@/lib/readiness/pipeline";
import type { RecoverySignal } from "@/lib/wellness/intervalsIcu";

type Client = SupabaseClient<Database>;

export interface RecomputeResult {
  days: number;
  runs: number;
  hrScored: number;
  withRecovery: boolean;
}

export async function recomputeForUser(
  supabase: Client,
  userId: string,
  days = 90,
): Promise<{ ok: true; data: RecomputeResult } | { ok: false; error: string }> {
  const { data: activities, error: actErr } = await supabase
    .from("activities")
    .select("started_at, distance_m, duration_s, avg_hr, cardiac_drift_pct")
    .eq("user_id", userId)
    .order("started_at", { ascending: true });

  if (actErr) return { ok: false, error: `Could not read activities: ${actErr.message}` };
  if (!activities || activities.length === 0) {
    return { ok: false, error: "No activities yet — connect a data source and sync first." };
  }

  const { data: cached } = await supabase
    .from("recovery_signals")
    .select("date, sleep_hours, resting_hr, hrv, source")
    .eq("user_id", userId)
    // Explicitly ordered. The `.slice(-30)` below meant "the last thirty" and
    // the query made no promise about order, so it was taking whichever thirty
    // Postgres happened to return last.
    .order("date", { ascending: true });

  const recovery: RecoverySignal[] = (cached ?? []).map((r) => ({
    date: r.date,
    sleepHours: r.sleep_hours,
    restingHr: r.resting_hr,
    hrv: r.hrv,
    source: r.source as RecoverySignal["source"],
  }));

  /*
   * The most recent resting heart rate, not a thirty-day mean.
   *
   * The narrative renders this as a point reading — "resting heart rate is 52"
   * — so a mean was answering a different question from the one being asked.
   * It also destroyed the signal that matters most: an athlete whose mean is 52
   * and whose reading this morning is 61 is getting ill, and averaging is
   * precisely how that disappears.
   */
  const withRestingHr = recovery.filter((r) => r.restingHr != null);
  const restingHr = withRestingHr.length
    ? Math.round(withRestingHr[withRestingHr.length - 1].restingHr as number)
    : undefined;

  // Age and sex feed the maximum-heart-rate estimate, so read them rather than
  // assuming. An athlete who has not filled them in falls back to a default,
  // and the profile screen is where that gets fixed.
  const { data: profile } = await supabase
    .from("profiles")
    .select("age, sex, lthr")
    .eq("id", userId)
    .maybeSingle();

  const result = buildSnapshots(
    activities as ActivityRow[],
    recovery,
    {
      age: profile?.age ?? 34,
      sex: (profile?.sex as "male" | "female") ?? "male",
      restingHr,
      // Yesterday's answer, so today's cannot swing on one hard week — see the
      // slow-decay rule in lib/planning/thresholds.ts. Nothing supplied this
      // before, because nothing wrote `profiles.lthr` in the first place.
      previousLthr: profile?.lthr ?? undefined,
    },
    new Date(),
    days,
  );

  if (result.snapshots.length === 0) {
    return { ok: false, error: "Not enough history to compute readiness yet." };
  }

  const { error: upsertErr } = await supabase.from("readiness_snapshots").upsert(
    result.snapshots.map((s) => ({ ...s, user_id: userId })),
    { onConflict: "user_id,date" },
  );
  if (upsertErr) return { ok: false, error: `Could not store snapshots: ${upsertErr.message}` };

  /*
   * Write the thresholds back to the profile.
   *
   * `buildSnapshots` has always returned them and this function has always
   * thrown them away, so `hr_max`, `lthr`, `threshold_speed_mps` and
   * `thresholds_measured` were read in three places and written in none.
   * Consequences: `thresholds_measured` was false for every athlete forever, so
   * the activity page's zone strip printed its "provisional, estimated from
   * your age" caveat permanently — even for someone with two years of hard
   * running behind them — and `thresholds_updated_at` had no writer at all.
   *
   * It also closes a loop inside the estimator: `estimateThresholds` accepts a
   * `previousLthr` so the threshold decays slowly rather than jumping around
   * with one hard week, and nothing could ever supply one.
   */
  const t = result.thresholds;
  await supabase
    .from("profiles")
    .update({
      hr_max: Math.round(t.hrMax),
      lthr: Math.round(t.lthr),
      threshold_speed_mps: Number(t.thresholdSpeedMps.toFixed(3)),
      thresholds_measured: t.measured,
      thresholds_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  return {
    ok: true,
    data: {
      days: result.snapshots.length,
      runs: result.totalRuns,
      hrScored: result.hrScoredRuns,
      withRecovery: recovery.length > 0,
    },
  };
}

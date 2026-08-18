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
    .select("started_at, distance_m, duration_s, avg_hr")
    .eq("user_id", userId)
    .order("started_at", { ascending: true });

  if (actErr) return { ok: false, error: `Could not read activities: ${actErr.message}` };
  if (!activities || activities.length === 0) {
    return { ok: false, error: "No activities yet — connect a data source and sync first." };
  }

  const { data: cached } = await supabase
    .from("recovery_signals")
    .select("date, sleep_hours, resting_hr, hrv, source")
    .eq("user_id", userId);

  const recovery: RecoverySignal[] = (cached ?? []).map((r) => ({
    date: r.date,
    sleepHours: r.sleep_hours,
    restingHr: r.resting_hr,
    hrv: r.hrv,
    source: r.source as RecoverySignal["source"],
  }));

  const recentRestingHrs = recovery
    .filter((r) => r.restingHr != null)
    .slice(-30)
    .map((r) => r.restingHr as number);
  const restingHr = recentRestingHrs.length
    ? Math.round(recentRestingHrs.reduce((s, v) => s + v, 0) / recentRestingHrs.length)
    : undefined;

  // Age and sex feed the maximum-heart-rate estimate, so read them rather than
  // assuming. An athlete who has not filled them in falls back to a default,
  // and the profile screen is where that gets fixed.
  const { data: profile } = await supabase
    .from("profiles")
    .select("age, sex")
    .eq("id", userId)
    .maybeSingle();

  const result = buildSnapshots(
    activities as ActivityRow[],
    recovery,
    {
      age: profile?.age ?? 34,
      sex: (profile?.sex as "male" | "female") ?? "male",
      restingHr,
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

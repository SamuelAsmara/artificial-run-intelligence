import type { SupabaseClient } from "@supabase/supabase-js";
import { decideAdjustments, highDriftRate } from "./adjustPlan";
import type { DailyLoad } from "./acwr";
import type { Database } from "@/types/database.types";
import { addDays, todayIso } from "@/lib/time/week";

/** Runs from the last two weeks feed the cardiac-drift rate. */
const DRIFT_WINDOW_DAYS = 14;
/** Runs from the last four weeks feed the acute:chronic workload ratio. */
const LOAD_WINDOW_DAYS = 28;

/**
 * Runs the adaptation engine for one athlete and writes the result back.
 *
 * Called by the nightly cron (`api/cron/sync-intervals`) with a service-role
 * client after new runs have been imported, so there is no session here: the
 * caller decides whose plan this is. Reads the recent runs and the coming
 * week's sessions, asks `decideAdjustments` what to do, and applies the two
 * automatic decisions — reduce and restore. `shift_week` is advisory and is
 * not applied (see `adjustPlan.ts`).
 */
export async function runPlanAdjustment(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ adjustedCount: number }> {
  const today = todayIso();
  const todayDate = new Date(`${today}T12:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const loadSince = iso(addDays(todayDate, -LOAD_WINDOW_DAYS));
  const driftSince = iso(addDays(todayDate, -DRIFT_WINDOW_DAYS));

  const { data: activities } = await supabase
    .from("activities")
    .select("distance_m, started_at, cardiac_drift_pct")
    .eq("user_id", userId)
    .gte("started_at", `${loadSince}T00:00:00Z`);

  const runs = (activities ?? []).filter(
    (a): a is { distance_m: number; started_at: string; cardiac_drift_pct: number | null } =>
      a.started_at != null && a.distance_m != null,
  );

  const dailyLoads: DailyLoad[] = runs.map((a) => ({
    date: a.started_at.slice(0, 10),
    load: a.distance_m,
  }));

  const driftRate = highDriftRate(
    runs.filter((a) => a.started_at.slice(0, 10) >= driftSince).map((a) => a.cardiac_drift_pct),
  );

  const { data: plan } = await supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return { adjustedCount: 0 };
  }

  const { data: upcomingWorkouts } = await supabase
    .from("plan_workouts")
    .select("id, week_number, status, planned_distance, origin, planned_distance_original")
    .eq("plan_id", plan.id)
    .gte("day_date", today)
    .lte("day_date", iso(addDays(todayDate, 7)));

  const decisions = decideAdjustments(
    (upcomingWorkouts ?? []).map((w) => ({
      id: w.id,
      weekNumber: w.week_number,
      status: w.status,
      plannedDistance: w.planned_distance,
      origin: w.origin,
      plannedDistanceOriginal: w.planned_distance_original,
    })),
    dailyLoads,
    driftRate,
  );

  let adjustedCount = 0;
  for (const decision of decisions) {
    const workout = upcomingWorkouts?.find((w) => w.id === decision.workoutId);
    if (!workout) continue;

    if (decision.action === "reduce_intensity") {
      if (!workout.planned_distance) continue;
      /*
       * Keep what it was. `planned_distance_original` is what `restore` puts
       * back; `?? workout.planned_distance` keeps an already-recorded original
       * from being overwritten with a reduced number.
       */
      await supabase
        .from("plan_workouts")
        .update({
          planned_distance: Math.round(workout.planned_distance * (decision.reductionFactor ?? 1)),
          planned_distance_original: workout.planned_distance_original ?? workout.planned_distance,
          status: "adjusted",
          adjusted_reason: decision.reason,
          adjusted_at: new Date().toISOString(),
        })
        .eq("id", decision.workoutId);
      adjustedCount++;
      continue;
    }

    if (decision.action === "restore") {
      if (workout.planned_distance_original == null) continue;
      await supabase
        .from("plan_workouts")
        .update({
          planned_distance: workout.planned_distance_original,
          planned_distance_original: null,
          status: "planned",
          adjusted_reason: null,
          adjusted_at: null,
        })
        .eq("id", decision.workoutId);
      adjustedCount++;
      continue;
    }
  }

  return { adjustedCount };
}

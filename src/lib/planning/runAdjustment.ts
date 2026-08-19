import type { SupabaseClient } from "@supabase/supabase-js";
import { decideAdjustments } from "./adjustPlan";
import type { DailyLoad } from "./acwr";
import type { Database } from "@/types/database.types";
import { todayIso } from "@/lib/time/week";

/**
 * הליבה של מנוע ההתאמה הדינמית, מנותקת מהקשר האימות.
 * נקראת משני מקומות שונים עם לקוחות Supabase שונים:
 *  - actions/plan.ts (adjustPlan Server Action) — anon client + בדיקת session, מופעל מה-UI.
 *  - api/cron/sync-strava/route.ts — service-role client, מופעל אוטומטית ע"י Vercel Cron
 *    (אין session בהקשר cron — ראו מסמך ארכיטקטורה §5).
 */
export async function runPlanAdjustment(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ adjustedCount: number }> {
  const since = new Date();
  since.setDate(since.getDate() - 28);

  const { data: activities } = await supabase
    .from("activities")
    .select("distance_m, started_at")
    .eq("user_id", userId)
    .gte("started_at", since.toISOString());

  const dailyLoads: DailyLoad[] = (activities ?? [])
    .filter((a): a is { distance_m: number; started_at: string } => a.started_at != null && a.distance_m != null)
    .map((a) => ({
      date: a.started_at.slice(0, 10),
      load: a.distance_m,
    }));

  const { data: plan } = await supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!plan) {
    return { adjustedCount: 0 };
  }

  const nextWeekStart = new Date();
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  const { data: upcomingWorkouts } = await supabase
    .from("plan_workouts")
    .select("id, week_number, status, planned_distance, origin, planned_distance_original")
    .eq("plan_id", plan.id)
    .gte("day_date", todayIso())
    .lte("day_date", nextWeekStart.toISOString().slice(0, 10));

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
    0 // TODO: cumulativeHighDriftRate — דורש activity streams, מחוץ ל-MVP הראשוני
  );

  let adjustedCount = 0;
  for (const decision of decisions) {
    const workout = upcomingWorkouts?.find((w) => w.id === decision.workoutId);
    if (!workout) continue;

    if (decision.action === "reduce_intensity") {
      if (!workout.planned_distance) continue;
      /*
       * Keep what it was.
       *
       * Without `planned_distance_original` the pre-adjustment distance was
       * simply gone, so an athlete whose ACWR came back down two days later
       * kept the reduced week for ever. `?? workout.planned_distance` matters:
       * if an original is somehow already recorded we must not overwrite it
       * with an already-reduced number and bake the cut in.
       */
      await supabase
        .from("plan_workouts")
        .update({
          planned_distance: Math.round(workout.planned_distance * (decision.reductionFactor ?? 1)),
          planned_distance_original:
            workout.planned_distance_original ?? workout.planned_distance,
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

    // "shift_week" — TODO: הרחבה עתידית, דורש הזזת week_number לכל
    // plan_workouts עתידיים ולא רק לשבוע הקרוב.
  }

  return { adjustedCount };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generatePlan, RaceTooSoonError } from "@/lib/planning/generatePlan";
import { runPlanAdjustment } from "@/lib/planning/runAdjustment";
import { readCapacity } from "@/lib/planning/readCapacity";
import { estimateThresholds, type HistoryActivity } from "@/lib/planning/thresholds";
import { paceLabel } from "@/lib/planning/paces";
import { buildRealPlan, type RealPlan } from "@/lib/dashboard/realPlan";

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/**
 * Server Action: בונה את מבנה ה-periodization הראשוני (plan_workouts).
 * מסמך ארכיטקטורה §5, מסמך תכנון טכני §5.
 */
export async function generatePlanAction(
  goalRaceId: string,
): Promise<ActionResult<{ planId: string; notes: string[]; achievable: boolean }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "יש להתחבר כדי ליצור תוכנית" };
  }

  const { data: goalRace, error: fetchError } = await supabase
    .from("goal_races")
    .select("id, race_type, race_date, user_id")
    .eq("id", goalRaceId)
    .single();

  if (fetchError || !goalRace || goalRace.user_id !== user.id) {
    return { error: "מרוץ היעד לא נמצא" };
  }

  // The plan must be sized against this athlete. Generating from the generic
  // per-race table produces first-week long runs that ARI's own spike check
  // flags as elevated risk — see src/lib/planning/capacity.ts.
  const { data: history } = await supabase
    .from("activities")
    .select("started_at, distance_m, duration_s, avg_hr")
    .eq("user_id", user.id)
    .order("started_at", { ascending: true });

  const runs: HistoryActivity[] = (history ?? [])
    .filter((a) => a.started_at && (a.duration_s ?? 0) > 0)
    .map((a) => ({
      durationSec: a.duration_s as number,
      distanceM: a.distance_m ?? 0,
      avgHr: a.avg_hr,
      date: (a.started_at as string).slice(0, 10),
    }));

  if (runs.length === 0) {
    return {
      error:
        "אין עדיין היסטוריית ריצות. חבר את Strava וסנכרן לפני בניית תוכנית — " +
        "בלי לדעת מה אתה רץ היום, כל תוכנית תהיה ניחוש.",
    };
  }

  const capacity = readCapacity(runs.map((r) => ({ date: r.date, distanceM: r.distanceM })));

  // Learned from the athlete's own efforts; used only to prescribe paces.
  // TODO: read age and sex from `profiles` once migration 0002 is applied.
  const thresholds = estimateThresholds(runs, { age: 34, sex: "male" });

  let generated;
  try {
    generated = generatePlan(
      goalRace.race_type,
      new Date(goalRace.race_date),
      new Date(),
      capacity,
    );
  } catch (err) {
    if (err instanceof RaceTooSoonError) {
      // מסמך אפיון בדיקות §6: תאריך קרוב מדי -> הודעה מפורשת, לא קריסה
      return { error: err.message };
    }
    return { error: "יצירת התוכנית נכשלה, נסה שוב" };
  }

  const { data: plan, error: planError } = await supabase
    .from("training_plans")
    .insert({ user_id: user.id, goal_race_id: goalRaceId })
    .select("id")
    .single();

  if (planError || !plan) {
    return { error: "שמירת התוכנית נכשלה, נסה שוב" };
  }

  const workoutRows = generated.workouts.map((w) => ({
    plan_id: plan.id,
    week_number: w.weekNumber,
    day_date: w.dayDate,
    workout_type: w.workoutType,
    planned_distance: w.plannedDistance,
    planned_pace: paceLabel(w.workoutType, thresholds.thresholdSpeedMps),
  }));

  const { error: workoutsError } = await supabase.from("plan_workouts").insert(workoutRows);
  if (workoutsError) {
    return { error: "שמירת אימוני התוכנית נכשלה, נסה שוב" };
  }

  revalidatePath("/plan");
  revalidatePath("/dashboard");

  return {
    data: {
      planId: plan.id,
      // The UI must show these. If the race distance is not safely reachable,
      // the athlete needs to know before they start, not at 30 km.
      notes: generated.capacity?.notes ?? [],
      achievable: generated.capacity?.achievable ?? true,
    },
  };
}

/**
 * Server Action: מריץ את מנוע ההתאמה הדינמית (ACWR + cardiac drift + אימונים
 * שפוספסו) ומעדכן אימונים עתידיים. מסמך ארכיטקטורה §5.
 * מופעלת מתוך /api/cron/sync-strava אחרי סנכרון אימונים חדשים.
 */
export async function adjustPlan(userId: string): Promise<ActionResult<{ adjustedCount: number }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return { error: "אין הרשאה" };
  }

  const result = await runPlanAdjustment(supabase, userId);

  revalidatePath("/plan");
  revalidatePath("/dashboard");

  return { data: result };
}

/**
 * The athlete's active plan, shaped for the dashboard.
 *
 * Returns null when there is no plan yet, which is the signal for the view to
 * keep showing its reference week rather than an empty strip.
 */
export async function getDashboardPlan(): Promise<RealPlan | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: plan } = await supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return null;

  const { data: rows } = await supabase
    .from("plan_workouts")
    .select("week_number, day_date, workout_type, planned_distance, planned_pace, status")
    .eq("plan_id", plan.id)
    .order("day_date", { ascending: true });

  if (!rows || rows.length === 0) return null;

  // Completed sessions are derived from what was actually run, not from the
  // plan's own status column — see src/lib/dashboard/realPlan.ts.
  const from = rows[0].day_date;
  const { data: runs } = await supabase
    .from("activities")
    .select("started_at, distance_m, duration_s, avg_hr")
    .eq("user_id", user.id)
    .gte("started_at", from);

  const completed = (runs ?? [])
    .filter((r) => r.started_at)
    .map((r) => ({
      date: (r.started_at as string).slice(0, 10),
      distanceM: r.distance_m ?? 0,
    }));

  // Thresholds want the whole history, not just the plan window, so paces stay
  // stable rather than shifting with whatever happens to be in range.
  const { data: allRuns } = await supabase
    .from("activities")
    .select("started_at, distance_m, duration_s, avg_hr")
    .eq("user_id", user.id)
    .order("started_at", { ascending: true });

  const history: HistoryActivity[] = (allRuns ?? [])
    .filter((a) => a.started_at && (a.duration_s ?? 0) > 0)
    .map((a) => ({
      durationSec: a.duration_s as number,
      distanceM: a.distance_m ?? 0,
      avgHr: a.avg_hr,
      date: (a.started_at as string).slice(0, 10),
    }));

  const thresholdSpeedMps = history.length
    ? estimateThresholds(history, { age: 34, sex: "male" }).thresholdSpeedMps
    : null;

  return buildRealPlan(rows, completed, thresholdSpeedMps);
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generatePlan, RaceTooSoonError } from "@/lib/planning/generatePlan";
import { runPlanAdjustment } from "@/lib/planning/runAdjustment";

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/**
 * Server Action: בונה את מבנה ה-periodization הראשוני (plan_workouts).
 * מסמך ארכיטקטורה §5, מסמך תכנון טכני §5.
 */
export async function generatePlanAction(goalRaceId: string): Promise<ActionResult<{ planId: string }>> {
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

  let generated;
  try {
    generated = generatePlan(goalRace.race_type, new Date(goalRace.race_date));
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
  }));

  const { error: workoutsError } = await supabase.from("plan_workouts").insert(workoutRows);
  if (workoutsError) {
    return { error: "שמירת אימוני התוכנית נכשלה, נסה שוב" };
  }

  revalidatePath("/plan");
  revalidatePath("/dashboard");

  return { data: { planId: plan.id } };
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

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { goalRaceSchema, type GoalRaceInput } from "@/lib/validation/schemas";
import { generatePlanAction } from "./plan";

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/** יוצר מרוץ יעד ומפעיל את מנוע יצירת התוכנית. במודל החדש אין גידור premium לאתלט. */
export async function createGoalRace(
  input: GoalRaceInput
): Promise<ActionResult<{ goalRaceId: string; planId: string }>> {
  const parsed = goalRaceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "יש להתחבר כדי להגדיר מרוץ יעד" };

  const { data: goalRace, error: insertError } = await supabase
    .from("goal_races")
    .insert({
      user_id: user.id,
      race_type: parsed.data.raceType,
      race_date: parsed.data.raceDate,
      target_time: parsed.data.targetTime ?? null,
    })
    .select("id")
    .single();

  if (insertError || !goalRace) return { error: "יצירת מרוץ היעד נכשלה, נסה שוב" };

  const planResult = await generatePlanAction(goalRace.id);
  if (planResult.error) return { error: planResult.error };

  revalidatePath("/dashboard");
  revalidatePath("/plan");
  return { data: { goalRaceId: goalRace.id, planId: planResult.data!.planId } };
}

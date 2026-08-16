"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

const PRO_SEAT_LIMIT = 25;

/** מנוי מאמן (seats) — mock. מעדכן subscriptions ל-pro ורושם billing_event (מסמך אפיון מוצר §9). */
export async function upgradeCoachSeats(): Promise<ActionResult<{ plan: "pro"; seatLimit: number }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "יש להתחבר כדי לשדרג" };

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan, seat_limit")
    .eq("user_id", user.id)
    .maybeSingle();

  const planFrom = sub?.plan ?? "free";
  if (planFrom === "pro") return { data: { plan: "pro", seatLimit: sub?.seat_limit ?? PRO_SEAT_LIMIT } };

  const { error } = await supabase
    .from("subscriptions")
    .upsert({ user_id: user.id, plan: "pro", seat_limit: PRO_SEAT_LIMIT }, { onConflict: "user_id" });
  if (error) return { error: "השדרוג נכשל, נסה שוב" };

  await supabase.from("billing_events").insert({
    user_id: user.id, plan_from: planFrom, plan_to: "pro", seats: PRO_SEAT_LIMIT,
  });

  revalidatePath("/billing");
  revalidatePath("/coach");
  return { data: { plan: "pro", seatLimit: PRO_SEAT_LIMIT } };
}

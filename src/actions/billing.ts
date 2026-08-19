"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

const PRO_SEAT_LIMIT = 25;

/**
 * מנוי מאמן (seats) — mock (מסמך אפיון מוצר §9).
 *
 * Disabled, and the reason is worth writing down. This is a `"use server"`
 * file, so every export is a public endpoint whether or not a page links to it.
 * There is no /upgrade screen, but the action id ships in the client bundle
 * regardless — so "no UI" was never a control. As written it upserted
 * `plan: "pro", seat_limit: 25` for whoever called it, with no payment step of
 * any kind: a free paid plan for anyone who read the bundle.
 *
 * A mock that writes to the real subscriptions table is not a mock. When
 * billing is actually built this becomes a webhook from the payment provider,
 * not something the browser can call.
 */
export async function upgradeCoachSeats(): Promise<ActionResult<{ plan: "pro"; seatLimit: number }>> {
  return { error: "Billing is not available yet." };
}

/** The original mock, kept unreachable until there is a payment step in front of it. */
async function upgradeCoachSeatsMock(): Promise<ActionResult<{ plan: "pro"; seatLimit: number }>> {
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

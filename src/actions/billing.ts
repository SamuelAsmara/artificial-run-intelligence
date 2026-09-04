"use server";

/**
 * Packages — the coach's (Basic / Premium, which sets the roster's seat cap)
 * and the athlete's.
 *
 * Billing is a mockup in this version: choosing a package writes the
 * `subscriptions` row that `join_coach` reads for the seat cap, and the
 * payment-method form in Settings → Billing (`PaymentMethodMock`) stores
 * nothing. Nothing is charged. The row and this file are the seam where a
 * payment provider (Stripe or similar) plugs in: its webhook will own the
 * `plan` column, and the self-service update below goes away with it.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ATHLETE_PLANS, COACH_PLANS, tierOf, type CoachTier } from "@/lib/billing/plans";

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

export interface CoachPlanView {
  /** null for an account that signed up before the packages existed */
  tier: CoachTier | null;
  seatLimit: number | null;
  /** active athletes on the roster today */
  athletes: number;
  since: string | null;
}

/**
 * The coach's package, and how full the roster is against it.
 *
 * Read by Settings → Billing, which shows the two package cards and marks
 * the current one.
 */
export async function getCoachPlan(): Promise<CoachPlanView | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: sub }, { count }] = await Promise.all([
    supabase.from("subscriptions").select("plan, seat_limit, updated_at").eq("user_id", user.id).eq("scope", "coach").maybeSingle(),
    supabase.from("coach_athletes").select("athlete_id", { count: "exact", head: true }).eq("coach_id", user.id).eq("status", "active"),
  ]);
  return {
    tier: tierOf(sub?.plan),
    seatLimit: sub?.seat_limit ?? null,
    athletes: count ?? 0,
    since: sub?.updated_at ?? null,
  };
}

/**
 * The coach picks a package — on the page that opens right after signing up
 * as a coach, or later from settings.
 *
 * ## What this is, and is not
 *
 * It records a choice. It does not take money: there is no payment provider
 * behind it in this version, and Premium opens without a charge. That is
 * stated on the page in as many words, so nobody is shown a checkout that
 * is not one. When a provider is connected, the Premium branch of this
 * function becomes "start checkout", and the row is written by the
 * provider's webhook instead — which is why the write stays in one place.
 *
 * Only a coach account can call it, and it only ever touches the coach-scoped
 * row — see `scope` on `subscriptions` (0023): a coach who also trains keeps
 * a separate athlete-scoped row, so the two packages can never collide.
 */
export async function chooseCoachPlan(tier: CoachTier): Promise<ActionResult<{ tier: CoachTier }>> {
  const plan = COACH_PLANS[tier];
  if (!plan) return { error: "Pick Basic or Premium." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "coach") return { error: "Packages are for coach accounts." };

  const { data: current } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).eq("scope", "coach").maybeSingle();
  if (current?.plan === plan.dbPlan) return { data: { tier } };

  const { data: written, error } = await supabase
    .from("subscriptions")
    .upsert({ user_id: user.id, scope: "coach", plan: plan.dbPlan, seat_limit: plan.seatLimit, updated_at: new Date().toISOString() }, { onConflict: "user_id,scope" })
    .select("user_id");
  if (error || !written?.length) {
    console.error("[runi] chooseCoachPlan failed", error);
    return { error: "Saving your choice failed — try again." };
  }

  await supabase.from("billing_events").insert({
    user_id: user.id, scope: "coach", plan_from: current?.plan ?? null, plan_to: plan.dbPlan, seats: plan.seatLimit,
  });

  revalidatePath("/coach");
  revalidatePath("/coach/settings");
  return { data: { tier } };
}


export interface AthletePlanView {
  tier: CoachTier | null;
  since: string | null;
}

/**
 * The athlete's own package — Basic or Premium. Read by settings to show it.
 *
 * No seat count here: an athlete isn't managing a roster, so the only thing
 * that changes between tiers is which features are unlocked (RunAI, for now).
 */
export async function getAthletePlan(): Promise<AthletePlanView | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: sub } = await supabase.from("subscriptions").select("plan, updated_at").eq("user_id", user.id).eq("scope", "athlete").maybeSingle();
  return { tier: tierOf(sub?.plan), since: sub?.updated_at ?? null };
}

/**
 * The athlete picks a package, from settings.
 *
 * Same shape and the same caveat as `chooseCoachPlan`: it records a choice,
 * not a charge — there is no payment provider behind Premium yet, so RunAI
 * opens without one. When Stripe is connected, this becomes "start
 * checkout" and the row is written by its webhook instead.
 *
 * Only an athlete account can call it today — `profiles.role` is still one
 * exclusive value, so a coach account can't reach this yet even though the
 * product doc already describes one account holding both roles. `scope` on
 * `subscriptions` (0023) makes the DATA side of that safe whenever the role
 * model catches up; until then a coach picks a package from coach settings,
 * where the seat count actually matters.
 */
export async function chooseAthletePlan(tier: CoachTier): Promise<ActionResult<{ tier: CoachTier }>> {
  const plan = ATHLETE_PLANS[tier];
  if (!plan) return { error: "Pick Basic or Premium." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "coach") return { error: "Coaches pick a package from coach settings." };

  const { data: current } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).eq("scope", "athlete").maybeSingle();
  if (current?.plan === plan.dbPlan) return { data: { tier } };

  const { data: written, error } = await supabase
    .from("subscriptions")
    .upsert({ user_id: user.id, scope: "athlete", plan: plan.dbPlan, updated_at: new Date().toISOString() }, { onConflict: "user_id,scope" })
    .select("user_id");
  if (error || !written?.length) {
    console.error("[runi] chooseAthletePlan failed", error);
    return { error: "Saving your choice failed — try again." };
  }

  await supabase.from("billing_events").insert({
    user_id: user.id, scope: "athlete", plan_from: current?.plan ?? null, plan_to: plan.dbPlan, seats: null,
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { data: { tier } };
}

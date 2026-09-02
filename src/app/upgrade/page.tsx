import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCoachPlan } from "@/actions/billing";
import { CoachPlanChoice } from "@/components/coach/CoachPlanChoice";

export const metadata = { title: "Your package · Runi" };

/*
 * The coach package page — Basic or Premium.
 *
 * It sits outside /coach on purpose: the coach layout sends an account with
 * no package here, and a page inside that layout would send itself here
 * forever. The role check is repeated instead, once.
 */
export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/upgrade");

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (data?.role !== "coach") notFound();

  const [plan, sp] = await Promise.all([getCoachPlan(), searchParams]);
  return <CoachPlanChoice current={plan?.tier ?? null} athletes={plan?.athletes ?? 0} first={sp.first === "1" || !plan?.tier} />;
}

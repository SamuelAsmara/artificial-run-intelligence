import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The product has no separate marketing page — the design handoff covers the
 * app only. Signed in goes to their front door; everyone else to sign-in.
 *
 * ## Which front door
 *
 * A coach's is `/coach`, not `/dashboard`. This used to send everybody to the
 * athlete dashboard, so a coach with twenty athletes on their roster opened the
 * app to their *own* empty training screen: no readiness score, dashes in every
 * tile, and a "Connect intervals.icu · Build my training plan" prompt. Nothing
 * was broken, and the first thing the product said to a coach was that it had
 * nothing for them.
 *
 * Coaches who also run reach their own training from the strip at the top of
 * every coach screen; that is what it is for.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  redirect(profile?.role === "coach" ? "/coach" : "/dashboard");
}

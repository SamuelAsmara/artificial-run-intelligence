import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingView } from "@/components/screens/LandingView";

/**
 * Signed out gets the landing page (LandingView, from the Claude Design
 * handoff); signed in goes to their front door.
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
export default async function Home({ searchParams }: { searchParams: Promise<{ error_code?: string; error?: string }> }) {
  /*
   * An auth link that fails — expired, or already used — sends the browser
   * here with the failure in the query string, because Supabase falls back to
   * the site URL when it cannot honour the link's own redirect. Landing on
   * the marketing page with no word about it reads as "nothing happened";
   * the sign-in screen has the sentence for this and the form to ask again.
   */
  const sp = await searchParams;
  if (sp.error_code || sp.error) redirect("/login?error=link-expired");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <LandingView />;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  redirect(profile?.role === "coach" ? "/coach" : "/dashboard");
}

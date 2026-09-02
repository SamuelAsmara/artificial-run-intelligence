import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The coaching workspace is for coaches.
 *
 * ## Why a layout rather than a check in each page
 *
 * There are six routes under /coach and two of them — templates and settings —
 * had no guard at all, because a guard written per page is a guard somebody
 * forgets on the seventh. A layout runs before every child, so the rule is
 * stated once and cannot be skipped by adding a file.
 *
 * ## What this is and is not
 *
 * It is presentation, not permission. No athlete data leaks without it: every
 * coach query is scoped through `coach_athletes` in RLS, so an athlete who
 * typed /coach saw an empty workspace rather than anybody's training. What they
 * saw was the wrong product — a roster panel, a join-code card, an athlete
 * calendar — which is its own kind of broken. The real boundary is in the
 * database and stays there.
 *
 * `notFound()` rather than a redirect to /dashboard: the route genuinely does
 * not exist for this account, and bouncing somebody who typed a URL into a
 * different screen is more confusing than telling them there is nothing here.
 */
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/coach");

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (data?.role !== "coach") notFound();

  return <>{children}</>;
}

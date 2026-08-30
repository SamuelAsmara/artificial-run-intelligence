/**
 * The coach's morning screen: the calendar, who needs attention today, and the
 * private reminders. Reachable only by a coach — `coach/layout.tsx` is the gate.
 */

import { redirect } from "next/navigation";
import { getCoachWorkspace } from "@/actions/coach";
import { CoachHomeView } from "@/components/screens/CoachHomeView";
import { todayIso } from "@/lib/time/week";

export const metadata = { title: "Coach · Runi" };

export default async function CoachPage() {
  // A year either side, because the calendar's year view asks for one.
  const iso = todayIso();
  const year = Number(iso.slice(0, 4));
  /*
   * The window is built from the *local* year, and as plain strings.
   *
   * `new Date(y, 0, 1).toISOString()` is 31 December of the year before in any
   * timezone ahead of UTC, so the year view quietly lost its first day and
   * gained one it never asked for.
   */
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const data = await getCoachWorkspace(from, to);
  if (!data) redirect("/login?redirectTo=/coach");

  return <CoachHomeView data={data} today={iso} />;
}

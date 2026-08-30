/**
 * The roster, with filters. One query for the athletes and one for their
 * sessions — never one query per athlete.
 */

import { redirect } from "next/navigation";
import { getCoachWorkspace } from "@/actions/coach";
import { CoachAthletesView } from "@/components/screens/CoachAthletesView";
import { todayIso } from "@/lib/time/week";

export const metadata = { title: "Athletes · Runi" };

export default async function CoachAthletesPage() {
  const data = await getCoachWorkspace();
  if (!data) redirect("/login?redirectTo=/coach/athletes");
  return <CoachAthletesView data={data} today={todayIso()} />;
}

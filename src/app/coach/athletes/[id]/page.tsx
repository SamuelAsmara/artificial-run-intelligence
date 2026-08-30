/**
 * One athlete, as their coach sees them: metrics, trend, the plan week, and
 * recent runs.
 */

import { notFound } from "next/navigation";
import { getAthleteDetail } from "@/actions/coach";
import { CoachAthleteView } from "@/components/screens/CoachAthleteView";
import { todayIso } from "@/lib/time/week";

export const metadata = { title: "Athlete · Runi" };

export default async function CoachAthletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getAthleteDetail(id);
  if (!detail) notFound();
  return <CoachAthleteView detail={detail} today={todayIso()} />;
}

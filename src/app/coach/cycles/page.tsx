/**
 * Athletes grouped by the race they are training for.
 */

import { redirect } from "next/navigation";
import { getCoachWorkspace } from "@/actions/coach";
import { getCoachCycles } from "@/actions/cycles";
import { CoachCyclesView } from "@/components/screens/CoachCyclesView";
import { todayIso } from "@/lib/time/week";

export const metadata = { title: "Cycles · Runi" };

export default async function CoachCyclesPage() {
  const [data, managed] = await Promise.all([getCoachWorkspace(), getCoachCycles()]);
  if (!data) redirect("/login?redirectTo=/coach/cycles");
  return <CoachCyclesView data={data} today={todayIso()} cycles={managed.cycles} templates={managed.templates} />;
}

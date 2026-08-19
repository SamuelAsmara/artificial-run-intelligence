import { redirect } from "next/navigation";
import { getCoachWorkspace } from "@/actions/coach";
import { CoachCyclesView } from "@/components/screens/CoachCyclesView";
import { todayIso } from "@/lib/time/week";

export const metadata = { title: "Cycles · ARI" };

export default async function CoachCyclesPage() {
  const data = await getCoachWorkspace();
  if (!data) redirect("/login?redirectTo=/coach/cycles");
  return <CoachCyclesView data={data} today={todayIso()} />;
}

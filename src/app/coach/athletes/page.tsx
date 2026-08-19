import { redirect } from "next/navigation";
import { getCoachWorkspace } from "@/actions/coach";
import { CoachAthletesView } from "@/components/screens/CoachAthletesView";

export const metadata = { title: "Athletes · ARI" };

export default async function CoachAthletesPage() {
  const data = await getCoachWorkspace();
  if (!data) redirect("/login?redirectTo=/coach/athletes");
  return <CoachAthletesView data={data} today={new Date().toISOString().slice(0, 10)} />;
}

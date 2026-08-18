import { redirect } from "next/navigation";
import { getCoachHome } from "@/actions/coach";
import { CoachAthletesView } from "@/components/screens/CoachAthletesView";

export const metadata = { title: "Athletes · ARI" };

export default async function CoachAthletesPage() {
  const home = await getCoachHome();
  if (!home) redirect("/login?redirectTo=/coach/athletes");
  return <CoachAthletesView home={home} today={new Date().toISOString().slice(0, 10)} />;
}

import { redirect } from "next/navigation";
import { getCoachHome } from "@/actions/coach";
import { CoachHomeView } from "@/components/screens/CoachHomeView";

export const metadata = { title: "Coach · ARI" };

export default async function CoachPage() {
  const home = await getCoachHome();
  if (!home) redirect("/login?redirectTo=/coach");
  return <CoachHomeView home={home} today={new Date().toISOString().slice(0, 10)} />;
}

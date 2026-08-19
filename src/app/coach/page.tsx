import { redirect } from "next/navigation";
import { getCoachWorkspace } from "@/actions/coach";
import { CoachHomeView } from "@/components/screens/CoachHomeView";

export const metadata = { title: "Coach · ARI" };

export default async function CoachPage() {
  // A year either side, because the calendar's year view asks for one.
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = iso(new Date(today.getFullYear(), 0, 1));
  const to = iso(new Date(today.getFullYear(), 11, 31));

  const data = await getCoachWorkspace(from, to);
  if (!data) redirect("/login?redirectTo=/coach");

  return <CoachHomeView data={data} today={iso(today)} />;
}

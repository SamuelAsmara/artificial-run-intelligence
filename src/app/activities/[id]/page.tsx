import { ActivityDetailView } from "@/components/screens/ActivityDetailView";

export const metadata = { title: "Activity · ARI" };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string; state?: string }>;
}) {
  const sp = await searchParams;
  const state = sp.state === "toofast" || sp.state === "tooslow" ? sp.state : "ontarget";
  return <ActivityDetailView coachView={sp.coach === "1"} paceState={state} />;
}

import { notFound } from "next/navigation";
import { getAthleteDetail } from "@/actions/coach";
import { CoachAthleteView } from "@/components/screens/CoachAthleteView";

export const metadata = { title: "Athlete · ARI" };

export default async function CoachAthletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getAthleteDetail(id);
  if (!detail) notFound();
  return <CoachAthleteView detail={detail} today={new Date().toISOString().slice(0, 10)} />;
}

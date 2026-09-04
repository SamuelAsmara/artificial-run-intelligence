/**
 * The analysis of a single run. Streams are fetched and derived on the server;
 * the view receives a finished chart model.
 */

import { notFound } from "next/navigation";
import { ActivityDetailView } from "@/components/screens/ActivityDetailView";
import { getActivityDetail } from "@/actions/activities";

export const metadata = { title: "Activity · Runi" };

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ coach?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  const detail = await getActivityDetail(id);
  // A run that does not exist, or belongs to someone else, is a 404 rather than
  // a page showing whatever happened to be first.
  if (!detail) notFound();

  return <ActivityDetailView coachView={sp.coach === "1"} data={detail} />;
}

import { notFound } from "next/navigation";
import { ActivityDetailView } from "@/components/screens/ActivityDetailView";
import { getActivityDetail } from "@/actions/activities";

export const metadata = { title: "Activity · ARI" };

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ coach?: string; demo?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  /*
   * The reference run needs the same gate the reference dashboard has.
   *
   * It was reachable at /activities/demo by any signed-in athlete, and its only
   * tell was the string "Reference run" where the date usually goes — splits,
   * heart rates up to 181, power and cadence all invented and presented exactly
   * as a real run is. `?demo=1` is how the rest of the app marks this.
   */
  if (id === "demo") {
    if (sp.demo !== "1") notFound();
    return <ActivityDetailView coachView={sp.coach === "1"} />;
  }

  const detail = await getActivityDetail(id);
  // A run that does not exist, or belongs to someone else, is a 404 rather than
  // a page showing whatever happened to be first.
  if (!detail) notFound();

  return <ActivityDetailView coachView={sp.coach === "1"} data={detail} />;
}

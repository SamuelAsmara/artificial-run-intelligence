/**
 * The training plan, or the form that builds one when there is none yet.
 */

import { PlanView } from "@/components/screens/PlanView";
import { getPlanScreen } from "@/actions/plan";
import { todayIso } from "@/lib/time/week";

export const metadata = { title: "Plan · Runi" };

export default async function PlanPage() {
  const { plan, planMeta, race, start } = await getPlanScreen();
  return <PlanView data={{ plan, planMeta, race, start, today: todayIso() }} />;
}

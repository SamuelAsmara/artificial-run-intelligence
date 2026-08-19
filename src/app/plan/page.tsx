import { PlanView } from "@/components/screens/PlanView";
import { getPlanScreen } from "@/actions/plan";

export const metadata = { title: "Plan · ARI" };

export default async function PlanPage() {
  const { plan, race } = await getPlanScreen();
  return <PlanView data={{ plan, race }} />;
}

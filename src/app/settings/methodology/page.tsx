import { MethodologyView } from "@/components/screens/MethodologyView";
import { isCoach } from "@/lib/auth/role";

export const metadata = { title: "How the numbers work · Runi" };

/*
 * One page for both audiences.
 *
 * It was tempting to make this coach-only — the formulas are the coach's
 * professional interest, and an athlete arguably wants the plan, not the
 * arithmetic. But a product that computes a readiness score and will not say
 * how is asking for trust it has not earned, and the athlete is the one being
 * told to rest. So: same page, and the coach simply arrives with the formulas
 * already open.
 */
export default async function MethodologyPage() {
  return <MethodologyView isCoach={await isCoach()} />;
}

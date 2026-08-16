import { DashboardView } from "@/components/dashboard/DashboardView";

export const metadata = { title: "Dashboard · ARI" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string; score?: string; risk?: string }>;
}) {
  const sp = await searchParams;
  return (
    <DashboardView
      coachView={sp.coach === "1"}
      readinessScore={sp.score ? Number(sp.score) : 82}
      acwrRisk={sp.risk === "1"}
    />
  );
}

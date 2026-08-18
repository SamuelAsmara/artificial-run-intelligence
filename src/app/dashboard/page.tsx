import { DashboardView, type DashboardData } from "@/components/dashboard/DashboardView";
import { EmptyDashboard } from "@/components/dashboard/EmptyDashboard";
import { getDashboardNarrative, getReadinessSeries } from "@/actions/readiness";
import { getDashboardPlan } from "@/actions/plan";
import { buildNarrative } from "@/lib/narrative/buildNarrative";
import { computeReadiness } from "@/lib/planning/readiness";
import { createClient } from "@/lib/supabase/server";
import { formatPace } from "@/lib/format/pace";
import { paceShapeColor, paceShapeToPath } from "@/lib/dashboard/sparkline";
import { personalRecords } from "@/lib/dashboard/personalRecords";

export const metadata = { title: "Dashboard · ARI" };

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string; score?: string; risk?: string; demo?: string }>;
}) {
  const sp = await searchParams;

  // ?demo=1 forces the reference data — useful for screenshots and for showing
  // the design when an account has no history yet.
  if (sp.demo === "1") {
    const demo = demoNarrative();
    return (
      <DashboardView
        coachView={sp.coach === "1"}
        readinessScore={sp.score ? Number(sp.score) : demo.readiness.score}
        acwrRisk={sp.risk === "1"}
        data={{ narrative: demo }}
      />
    );
  }

  const series = await getReadinessSeries(84);

  // Nothing to show yet. Previously this fell through to the demo dataset, which
  // meant a brand-new account saw someone else's readiness score, personal bests
  // and race countdown with no indication they weren't real. Show the empty
  // state instead — demo data now lives only behind ?demo=1.
  if (series.length < 2) {
    return <EmptyDashboard name={await athleteName()} />;
  }

  const latest = series[series.length - 1];

  const [narrative, recentActivities, plan, derived] = await Promise.all([
    getDashboardNarrative(),
    recentActivityRows(),
    getDashboardPlan(),
    streamDerived(),
  ]);

  const data: DashboardData = {
    isReal: true,
    pmcSeries: {
      C: series.map((s) => Number(s.ctl ?? 0)),
      A: series.map((s) => Number(s.atl ?? 0)),
      T: series.map((s) => Number(s.tsb ?? 0)),
    },
    loadRatio: latest.acwr ?? null,
    recentActivities,
    narrative: narrative ?? undefined,
    plan: plan ?? undefined,
    personalRecords: derived.prs,
    cardiacDriftPct: derived.cardiacDrift,
  };

  return (
    <DashboardView
      coachView={sp.coach === "1"}
      readinessScore={sp.score ? Number(sp.score) : latest.readiness_score ?? undefined}
      acwrRisk={sp.risk === "1"}
      data={data}
    />
  );
}

/** Whatever we can greet them by — username from sign-up, else nothing. */
async function athleteName(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = user?.user_metadata as { username?: string; full_name?: string } | undefined;
  return meta?.username ?? meta?.full_name ?? null;
}

/**
 * Personal records and the most recent cardiac-drift reading.
 *
 * Both come from `best_efforts` and `cardiac_drift_pct`, which are derived once
 * per activity from its stream and stored — see src/lib/wellness/icuStreams.ts.
 */
async function streamDerived() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { prs: undefined, cardiacDrift: undefined };

  const { data } = await supabase
    .from("activities")
    .select("started_at, best_efforts, cardiac_drift_pct")
    .eq("user_id", user.id)
    .not("best_efforts", "is", null)
    .order("started_at", { ascending: false })
    .limit(400);

  const rows = data ?? [];

  // A record set in the last month is worth calling out.
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const prs = personalRecords(rows, monthAgo);

  // The latest run long and steady enough to have produced a reading.
  const drift = rows.find((r) => r.cardiac_drift_pct !== null)?.cardiac_drift_pct;

  return {
    prs: rows.length ? prs : undefined,
    cardiacDrift: typeof drift === "number" ? drift : undefined,
  };
}

/** The rail's recent-runs list, from real activities. */
async function recentActivityRows() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return undefined;

  const { data } = await supabase
    .from("activities")
    .select("started_at, distance_m, duration_s, pace_shape")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(9);

  if (!data || data.length === 0) return undefined;

  return data.map((a) => {
    const d = a.started_at ? new Date(a.started_at) : new Date();
    const km = (a.distance_m ?? 0) / 1000;
    const pace = km > 0 ? (a.duration_s ?? 0) / km : 0;
    return {
      date: `${MO[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`,
      km: km.toFixed(1),
      pace: formatPace(pace),
      spark: paceShapeToPath(a.pace_shape),
      sparkColor: paceShapeColor(a.pace_shape),
    };
  });
}

/**
 * A narrative for the reference dataset, so the walkthrough can open "Show
 * reasoning" and see the real component.
 *
 * The demo score is *derived* from these inputs rather than taken from the
 * mockup's headline 82. The reasoning panel shows the weighted total, and a
 * worked example whose numbers do not add up is worse than useless — it is the
 * exact thing this panel exists to disprove.
 */
function demoNarrative() {
  const pmc = { ctl: 47, atl: 39, tsb: 6, rampRate: 2.4 };
  const readiness = computeReadiness({
    pmc,
    loadRatio: 1.08,
    cardiacDriftPct: 2.4,
    sleepHours: 7.4,
    hrvVsBaselinePct: 101,
  });
  return {
    ...buildNarrative({
      readiness,
      pmc,
      loadRatio: 1.08,
      sleepHours: 7.4,
      cardiacDriftPct: 2.4,
      hrvVsBaselinePct: 101,
      restingHr: 52,
      longestRecentM: 26000,
    }),
    readiness,
  };
}

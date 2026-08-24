import { DashboardView, type DashboardData } from "@/components/dashboard/DashboardView";
import { EmptyDashboard } from "@/components/dashboard/EmptyDashboard";
import { getDashboardNarrative, getReadinessSeries } from "@/actions/readiness";
import { getDashboardPlan } from "@/actions/plan";
import { buildNarrative } from "@/lib/narrative/buildNarrative";
import { computeReadiness } from "@/lib/planning/readiness";
import { createClient } from "@/lib/supabase/server";
import { formatPace } from "@/lib/format/pace";
import { paceShapeColor, paceShapeToPath } from "@/lib/dashboard/sparkline";
import { getPersonalRecords } from "@/actions/activities";
import { APP_LOCALE, APP_TIME_ZONE, todayIso } from "@/lib/time/week";
import {
  calendarDots, raceCountdown, runStreak, weeklyVolume, weeklyVolumeSummary,
} from "@/lib/dashboard/rail";

export const metadata = { title: "Dashboard · ARI" };

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

  const [narrative, recentActivities, plan, derived, rail, avatar] = await Promise.all([
    getDashboardNarrative(),
    recentActivityRows(),
    getDashboardPlan(),
    streamDerived(),
    railData(),
    athletePhoto(),
  ]);

  /*
   * The score, or nothing.
   *
   * `?score=` is a demo affordance and used to be trusted as a number, so
   * `?score=abc` produced NaN and rendered a ring with `strokeDasharray="NaN"`.
   * And a snapshot whose score is null fell through to the component's default
   * of 82 — a confident "Ready to load" for an athlete we have no score for.
   */
  const override = Number(sp.score);
  const readinessScore = Number.isFinite(override) && override >= 0 && override <= 100
    ? override
    : latest.readiness_score ?? undefined;

  const data: DashboardData = {
    isReal: true,
    pmcSeries: {
      C: series.map((s) => Number(s.ctl ?? 0)),
      A: series.map((s) => Number(s.atl ?? 0)),
      T: series.map((s) => Number(s.tsb ?? 0)),
      D: series.map((s) => s.date),
    },
    loadRatio: latest.acwr ?? null,
    recentActivities,
    narrative: narrative ?? undefined,
    plan: plan ?? undefined,
    today: todayIso(),
    readinessAsOf: latest.date,
    athleteName: await athleteName(),
    avatarUrl: avatar.url,
    personalRecords: derived.prs,
    cardiacDriftPct: derived.cardiacDrift,
    rail,
  };

  /*
   * `?coach=1` is not honoured on a real dashboard.
   *
   * The banner it raises reads "You are viewing Samuel Cohen's training data" —
   * a name from the prototype, hard-coded in model.ts, shown to whoever typed
   * the parameter. Coaches read an athlete through /coach/athletes/[id], which
   * is scoped by the roster; this was a mock of that, and a real coach seeing a
   * stranger's name on their own dashboard is worse than no banner at all.
   */
  return (
    <DashboardView
      readinessScore={readinessScore}
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

/** The photo and framing the athlete saved in Settings, if any. */
async function athletePhoto(): Promise<{ url: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { url: null };
  const { data } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  return { url: data?.avatar_url ?? null };
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

  // One implementation, shared with the activity list. See getPersonalRecords.
  const prs = await getPersonalRecords();

  // The latest run long and steady enough to have produced a reading.
  const drift = rows.find((r) => r.cardiac_drift_pct !== null)?.cardiac_drift_pct;

  return {
    prs: rows.length ? prs : undefined,
    cardiacDrift: typeof drift === "number" ? drift : undefined,
  };
}

/**
 * The right-hand rail: weekly volume, the calendar, the streak and the race
 * countdown. Every appearance decision comes from `presentation.ts`, so real
 * data inherits the design rather than inventing one.
 */
async function railData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return undefined;

  const from = new Date(Date.now() - 120 * 86_400_000).toISOString();

  const [{ data: runRows }, { data: race }] = await Promise.all([
    supabase
      .from("activities")
      .select("started_at, distance_m")
      .eq("user_id", user.id)
      .gte("started_at", from),
    supabase
      .from("goal_races")
      .select("race_type, race_date, target_time")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("race_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const runs = (runRows ?? [])
    .filter((r) => r.started_at)
    .map((r) => ({
      date: (r.started_at as string).slice(0, 10),
      distanceM: r.distance_m ?? 0,
    }));

  // Deliberately no early return for an empty `runs`. It used to bail here,
  // and because the readiness snapshots keep decaying for months afterwards the
  // dashboard still rendered as "real" — with the prototype's volume bars,
  // calendar dots, "6 day streak" and marathon countdown standing in for an
  // athlete who had not run since spring. An empty rail is the truthful answer.

  // Planned sessions drive the calendar's "planned" and "missed" dots.
  const { data: plan } = await supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let planned: { date: string; isRest: boolean }[] = [];
  let planStart: string | null = null;
  let totalWeeks = 0;

  if (plan) {
    const { data: rows } = await supabase
      .from("plan_workouts")
      .select("day_date, workout_type, week_number")
      .eq("plan_id", plan.id)
      .order("day_date", { ascending: true });

    planned = (rows ?? []).map((r) => ({
      date: r.day_date,
      isRest: r.workout_type === "rest",
    }));
    planStart = rows?.[0]?.day_date ?? null;
    totalWeeks = rows?.length ? Math.max(...rows.map((r) => r.week_number)) : 0;
  }

  return {
    volumes: weeklyVolume(runs),
    volumeSummary: weeklyVolumeSummary(runs),
    calendarDots: calendarDots(planned, runs),
    streak: runStreak(runs),
    race: race
      ? raceCountdown(race.race_type, race.race_date, planStart, totalWeeks)
      : null,
    /** the athlete's own goal time, or null when they never set one */
    raceTarget: race?.target_time ?? null,
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
    .select("id, started_at, distance_m, duration_s, pace_shape")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    // Five, not nine. The rail is a glance at what just happened, not the
    // activity list — and nine rows pushed the personal records off the screen.
    .limit(5);

  if (!data || data.length === 0) return undefined;

  /*
   * The date, in the athlete's timezone.
   *
   * `getMonth()`/`getDate()` read the server's clock, which on Vercel is UTC —
   * so a run started at 01:00 on Tuesday in Tel Aviv was listed as Monday. The
   * activity list was rewritten to use `APP_TIME_ZONE` for exactly this; the
   * rail on the dashboard beside it still had the bug.
   */
  const label = new Intl.DateTimeFormat(APP_LOCALE, {
    day: "2-digit", month: "short", timeZone: APP_TIME_ZONE,
  });

  return data.map((a) => {
    const d = a.started_at ? new Date(a.started_at) : new Date();
    const km = (a.distance_m ?? 0) / 1000;
    const pace = km > 0 ? (a.duration_s ?? 0) / km : 0;
    return {
      id: a.id,
      date: label.format(d).replace(/^(\d+) (\w+)$/, "$2 $1"),
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

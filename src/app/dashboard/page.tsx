/**
 * The athlete's home screen — a Server Component, and the clearest example in
 * the project of how data reaches a page.
 *
 * Everything is fetched here, on the server, in parallel: the profile, the
 * readiness snapshots, the recent runs, the plan. Postgres filters those reads
 * by row-level security, so the page cannot see another athlete's rows even if
 * this code asked for them. The raw rows are then turned into a view model —
 * chart geometry, streak, weekly volume, the sentence of explanation — and
 * handed to `DashboardView` as props.
 *
 * `DashboardView` fetches nothing. That is the rule the whole codebase follows:
 * pages read, components display.
 */

import { DashboardView, type DashboardData } from "@/components/dashboard/DashboardView";
import { EmptyDashboard } from "@/components/dashboard/EmptyDashboard";
import { getDashboardNarrative, getReadinessSeries } from "@/actions/readiness";
import { getDashboardPlan } from "@/actions/plan";
import { createClient } from "@/lib/supabase/server";
import { formatPace } from "@/lib/format/pace";
import { paceShapeColor, paceShapeToPath } from "@/lib/dashboard/sparkline";
import { getPersonalRecords } from "@/actions/activities";
import { APP_LOCALE, APP_TIME_ZONE, todayIso } from "@/lib/time/week";
import { riegel } from "@/lib/screens/numbers";
import { parseTargetTime, RACE_DISTANCE_M } from "@/lib/planning/ownPlan";
import { PR_DISTANCES } from "@/lib/wellness/icuStreams";
import { formatDuration } from "@/lib/format/pace";
import {
  calendarDots, planCountdown, raceCountdown, runStreak, weeklyVolume, weeklyVolumeSummary,
} from "@/lib/dashboard/rail";

export const metadata = { title: "Dashboard · Runi" };

export default async function DashboardPage() {
  const series = await getReadinessSeries(84);

  // Fewer than two snapshots is nothing to chart yet: show the empty state.
  if (series.length < 2) {
    const [name, plan] = await Promise.all([athleteName(), getDashboardPlan()]);
    const next = plan?.next;
    return (
      <EmptyDashboard
        name={name}
        plan={plan ? {
          weekLabel: plan.weeks[plan.currentWeek]?.label ?? null,
          nextSession: next ? `${next.isToday ? "Today" : next.date}: ${next.name} · ${next.summary}` : null,
        } : null}
      />
    );
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

  // The score, or nothing: a snapshot whose score is null renders as a dash,
  // never as a default.
  const readinessScore = latest.readiness_score ?? undefined;

  const data: DashboardData = {
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

  // Coaches read an athlete through /coach/athletes/[id], which is scoped by
  // the roster; the athlete's own dashboard carries no coach banner.
  return <DashboardView readinessScore={readinessScore} data={data} />;
}

/**
 * Whatever we can greet them by. The name saved in Settings (profiles.full_name)
 * wins; the username typed at sign-up is only the fallback for someone who has
 * never opened Settings. Reading the sign-up metadata first was a bug: renaming
 * yourself in Settings changed nothing up here.
 */
async function athleteName(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const saved = data?.full_name?.trim();
  if (saved) return saved;
  const meta = user.user_metadata as { username?: string; full_name?: string } | undefined;
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
    // Always the four rows: a distance never run shows as a dash.
    prs,
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
    .select("id, name, goal_race_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let planned: { date: string; isRest: boolean }[] = [];
  let planStart: string | null = null;
  let planEnd: string | null = null;
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
    planEnd = rows?.length ? rows[rows.length - 1].day_date : null;
    totalWeeks = rows?.length ? Math.max(...rows.map((r) => r.week_number)) : 0;
  }

  return {
    volumes: weeklyVolume(runs),
    volumeSummary: weeklyVolumeSummary(runs),
    calendarDots: calendarDots(planned, runs),
    streak: runStreak(runs),
    // A race plan counts down to race day; a plan of the athlete's own, with
    // no race behind it, counts down to its last day.
    race: race
      ? raceCountdown(race.race_type, race.race_date, planStart, totalWeeks)
      : plan && plan.goal_race_id == null && planEnd
        ? planCountdown(plan.name ?? "your plan", planEnd, planStart, totalWeeks)
        : null,
    /** the athlete's own goal time, or null when they never set one */
    raceTarget: race?.target_time ?? null,
    racePrediction: race ? await racePrediction(race.race_type, race.target_time) : null,
  };
}

/**
 * The predicted finish on the countdown card — the same Riegel prediction the
 * Numbers board shows, from the athlete's longest personal best. This card
 * printed a dash for every real athlete since the prototype's 3:47:10 was
 * removed; the number existed one tab away the whole time.
 */
async function racePrediction(raceType: string, targetTime: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const distanceM = RACE_DISTANCE_M[raceType as keyof typeof RACE_DISTANCE_M];
  if (!distanceM) return null;

  const { data } = await supabase
    .from("activities")
    .select("best_efforts")
    .eq("user_id", user.id)
    .not("best_efforts", "is", null)
    .order("started_at", { ascending: false })
    .limit(400);
  const best: Record<string, number> = {};
  for (const a of data ?? []) {
    for (const [k, v] of Object.entries((a.best_efforts ?? {}) as Record<string, number>)) {
      if (Number.isFinite(v) && v > 0 && (best[k] == null || v < best[k])) best[k] = v;
    }
  }
  // the longest distance with a best on file predicts most honestly
  const baseKey = ["marathon", "half", "10k", "5k", "1k"].find((k) => best[k] != null && PR_DISTANCES[k] != null);
  if (!baseKey) return null;
  const predicted = riegel(best[baseKey], PR_DISTANCES[baseKey], distanceM);
  const targetSec = parseTargetTime(targetTime);
  const label = targetSec == null
    ? "Predicted · from your PBs"
    : predicted <= targetSec ? "Predicted · on target"
      : predicted - targetSec <= 300 ? "Predicted · closing"
        : "Predicted · off target";
  const tone: "positive" | "caution" | "neutral" = targetSec == null ? "neutral" : predicted <= targetSec ? "positive" : "caution";
  return { text: formatDuration(Math.round(predicted)), label, tone };
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

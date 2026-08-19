"use server";

/**
 * The coaching side: joining, the roster, and a coach's own plan templates.
 *
 * ## What a coach may see, and what they may not
 *
 * The row-level policies decide this, not the code here. `is_coach_of(user_id)`
 * grants SELECT on the training tables; `provider_connections` has no coach
 * policy at all, so an athlete's intervals.icu key is invisible to them. That
 * asymmetry is the point: **a coach can see how you train and never how you are
 * connected.**
 *
 * Every function below is still written as if RLS might be missing — scoping
 * explicitly by the signed-in user — because a policy is a second lock, not an
 * excuse for leaving the first one open.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RaceType, WorkoutType } from "@/types/database.types";
import {
  defaultTemplate, validateTemplate, RACE_TYPES,
  type CoachTemplate,
} from "@/lib/coach/templates";
import type { CalendarSession } from "@/lib/coach/calendar";
import {
  DEFAULT_PREFERENCES, targetPaceSeconds, type CoachPreferences,
} from "@/lib/coach/preferences";
import {
  flagsFor, rosterFlags, summariseRoster, weekBoard, weekDates,
  type AthleteRow, type BoardRow, type Flag, type PlannedSession,
  type RosterSummary, type RunRecord,
} from "@/lib/coach/roster";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* Joining                                                             */
/* ------------------------------------------------------------------ */

/** This coach's join code, issued on first ask. */
export async function getMyCoachCode(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_coach_code");
  if (error) return null;
  return data;
}

/**
 * Redeems a coach's code.
 *
 * Typing the code *is* the consent, which is why the link is created active
 * rather than pending: the athlete initiated it. The database function is the
 * only thing that can look a coach up by code — see migration 0008.
 */
export async function joinCoach(code: string): Promise<Result<{ coachName: string }>> {
  const trimmed = (code ?? "").trim();
  if (trimmed.length < 4) return { ok: false, error: "That code looks too short." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_coach", { code: trimmed });

  if (error) {
    // The function raises for an unknown code and for your own code; neither is
    // worth a stack trace in the interface.
    const message = /no coach/.test(error.message)
      ? "No coach has that code. Check it with them."
      : /your own/.test(error.message)
        ? "That is your own code."
        : "Could not join that coach.";
    return { ok: false, error: message };
  }

  const row = Array.isArray(data) ? data[0] : null;
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, data: { coachName: row?.coach_name ?? "your coach" } };
}

export interface MyCoach {
  id: string;
  name: string;
  since: string;
}

/** The athlete's own coach, if they have one. */
export async function getMyCoach(): Promise<MyCoach | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: link } = await supabase
    .from("coach_athletes")
    .select("coach_id, created_at")
    .eq("athlete_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!link) return null;

  const { data: coach } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", link.coach_id)
    .maybeSingle();

  return {
    id: link.coach_id,
    name: coach?.full_name || coach?.email || "Your coach",
    since: link.created_at,
  };
}

/** Ends the coaching relationship. Either side may, and neither needs consent. */
export async function leaveCoach(): Promise<Result<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { error } = await supabase
    .from("coach_athletes")
    .delete()
    .eq("athlete_id", user.id);

  if (error) return { ok: false, error: `Could not leave: ${error.message}` };
  revalidatePath("/settings");
  return { ok: true, data: null };
}

/** Removes an athlete from this coach's roster. */
export async function removeAthlete(athleteId: string): Promise<Result<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { error } = await supabase
    .from("coach_athletes")
    .delete()
    .eq("coach_id", user.id)
    .eq("athlete_id", athleteId);

  if (error) return { ok: false, error: `Could not remove: ${error.message}` };
  revalidatePath("/coach");
  return { ok: true, data: null };
}

/* ------------------------------------------------------------------ */
/* The roster                                                          */
/* ------------------------------------------------------------------ */

export interface CoachHome {
  athletes: AthleteRow[];
  summary: RosterSummary;
  flags: Flag[];
  board: BoardRow[];
  /** the seven ISO dates the board covers */
  week: string[];
  code: string | null;
}

/**
 * Everything both coach screens need, in one pass.
 *
 * Written as a handful of set-based queries rather than a loop over athletes:
 * a coach with thirty athletes would otherwise cost thirty round trips per
 * screen, and the roster is exactly the place that habit shows up first.
 */
export async function getCoachHome(): Promise<CoachHome | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const day = today();
  const week = weekDates(day);

  const { data: links } = await supabase
    .from("coach_athletes")
    .select("athlete_id")
    .eq("coach_id", user.id)
    .eq("status", "active");

  const ids = (links ?? []).map((l) => l.athlete_id);
  const code = await getMyCoachCode();

  if (ids.length === 0) {
    return {
      athletes: [], code, week,
      summary: summariseRoster([], day),
      flags: [], board: [],
    };
  }

  const [{ data: profiles }, { data: snapshots }, { data: runs }, { data: races }, { data: plans }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name, email, avatar_url, age, sex").in("id", ids),
      // Newest first; the first row seen per athlete is their current state.
      supabase
        .from("readiness_snapshots")
        .select("user_id, date, readiness_score, tsb, acwr")
        .in("user_id", ids)
        .order("date", { ascending: false }),
      supabase
        .from("activities")
        .select("user_id, started_at, distance_m")
        .in("user_id", ids)
        .gte("started_at", `${week[0]}T00:00:00Z`)
        .order("started_at", { ascending: false }),
      supabase
        .from("goal_races")
        .select("user_id, race_type, race_date, target_time")
        .in("user_id", ids)
        .eq("status", "active")
        .order("race_date", { ascending: true }),
      supabase
        .from("training_plans")
        .select("id, user_id")
        .in("user_id", ids)
        .eq("status", "active"),
    ]);

  // The most recent run of all time is a separate question from this week's
  // runs, and "no run in nine days" is the flag that matters most.
  const { data: lastRuns } = await supabase
    .from("activities")
    .select("user_id, started_at, distance_m")
    .in("user_id", ids)
    .order("started_at", { ascending: false });

  const planIds = (plans ?? []).map((p) => p.id);
  const planOwner = new Map((plans ?? []).map((p) => [p.id, p.user_id]));

  const { data: sessions } = planIds.length
    ? await supabase
        .from("plan_workouts")
        .select("plan_id, day_date, workout_type, planned_distance")
        .in("plan_id", planIds)
        .gte("day_date", week[0])
        .lte("day_date", week[6])
    : { data: [] };

  const firstBy = <T extends { user_id: string }>(rows: T[] | null) => {
    const seen = new Map<string, T>();
    for (const r of rows ?? []) if (!seen.has(r.user_id)) seen.set(r.user_id, r);
    return seen;
  };

  const latestSnapshot = firstBy(snapshots);
  const latestRun = firstBy(lastRuns);
  const raceBy = firstBy(races);

  const planned: PlannedSession[] = (sessions ?? []).map((s) => ({
    athleteId: planOwner.get(s.plan_id) as string,
    date: s.day_date,
    workoutType: s.workout_type,
    distanceM: s.planned_distance,
  }));

  const ran: RunRecord[] = (runs ?? [])
    .filter((r) => r.started_at)
    .map((r) => ({
      athleteId: r.user_id,
      date: (r.started_at as string).slice(0, 10),
      distanceM: r.distance_m ?? 0,
    }));

  const ranKeys = new Set(ran.map((r) => `${r.athleteId}|${r.date}`));

  const athletes: AthleteRow[] = (profiles ?? []).map((p) => {
    const snap = latestSnapshot.get(p.id);
    const last = latestRun.get(p.id);
    const race = raceBy.get(p.id);

    const missedThisWeek = planned.filter(
      (s) =>
        s.athleteId === p.id &&
        s.workoutType !== "rest" &&
        s.date < day &&
        !ranKeys.has(`${p.id}|${s.date}`),
    ).length;

    return {
      id: p.id,
      name: p.full_name || p.email || "Athlete",
      avatarUrl: p.avatar_url,
      readiness: snap?.readiness_score ?? null,
      form: snap?.tsb ?? null,
      loadRatio: snap?.acwr ?? null,
      lastRunAt: last?.started_at ?? null,
      lastRunM: last?.distance_m ?? null,
      raceType: (race?.race_type as RaceType) ?? null,
      raceDate: race?.race_date ?? null,
      missedThisWeek,
    };
  });

  return {
    athletes,
    code,
    week,
    summary: summariseRoster(athletes, day),
    flags: rosterFlags(athletes, day),
    board: weekBoard(athletes, planned, ran, day),
  };
}

/* ------------------------------------------------------------------ */
/* Plan templates                                                      */
/* ------------------------------------------------------------------ */

/**
 * One template per distance, the coach's own where it exists.
 *
 * Deliberately not keyed on the athlete's level as well. That would be twelve
 * forms; nobody fills in twelve forms, and the athlete's level already scales
 * volume inside the generator.
 */
export async function getCoachTemplates(): Promise<CoachTemplate[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return RACE_TYPES.map(defaultTemplate);

  const [{ data: mine }, { data: defaults }] = await Promise.all([
    supabase
      .from("plan_templates")
      .select("id, race_type, name, weeks, phase_structure, weekly_mix")
      .eq("coach_id", user.id),
    supabase
      .from("plan_templates")
      .select("id, race_type, name, weeks, phase_structure, weekly_mix")
      .is("coach_id", null),
  ]);

  const ownBy = new Map((mine ?? []).map((t) => [t.race_type, t]));
  const defaultBy = new Map((defaults ?? []).map((t) => [t.race_type, t]));

  return RACE_TYPES.map((raceType) => {
    const own = ownBy.get(raceType);
    const row = own ?? defaultBy.get(raceType);
    const fallback = defaultTemplate(raceType);
    return {
      id: own?.id ?? null,
      raceType,
      name: row?.name ?? fallback.name,
      weeks: row?.weeks ?? fallback.weeks,
      phaseStructure: row?.phase_structure ?? fallback.phaseStructure,
      weeklyMix: row?.weekly_mix ?? fallback.weeklyMix,
      isDefault: !own,
    };
  });
}

/** Saves a coach's template for one distance. Affects future plans only. */
export async function saveCoachTemplate(t: CoachTemplate): Promise<Result<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const invalid = validateTemplate(t);
  if (invalid) return { ok: false, error: invalid };

  const { error } = await supabase.from("plan_templates").upsert(
    {
      ...(t.id ? { id: t.id } : {}),
      coach_id: user.id,
      race_type: t.raceType,
      // The column still exists and is still keyed on by the generator; a
      // coach's template covers every level and the generator scales volume.
      level: "experienced",
      name: t.name.trim() || defaultTemplate(t.raceType).name,
      weeks: t.weeks,
      phase_structure: t.phaseStructure,
      weekly_mix: t.weeklyMix,
    },
    { onConflict: "coach_id,race_type" },
  );

  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  revalidatePath("/coach");
  return { ok: true, data: null };
}

/* ------------------------------------------------------------------ */
/* One athlete                                                         */
/* ------------------------------------------------------------------ */

export interface AthleteWorkout {
  id: string;
  /** ISO date */
  date: string;
  weekNumber: number;
  workoutType: string;
  plannedDistanceM: number | null;
  plannedPace: string | null;
  status: string;
  /** metres actually run that day, when something was */
  actualM: number | null;
  /** seconds actually run that day */
  actualS: number | null;
}

export interface AthleteRun {
  id: string;
  startedAt: string | null;
  distanceM: number | null;
  durationS: number | null;
  avgHr: number | null;
}

export interface AthleteTrend {
  /** ISO date */
  date: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  readiness: number | null;
}

export interface AthleteDetail {
  athlete: AthleteRow;
  email: string | null;
  level: string | null;
  age: number | null;
  /** the six weeks of fitness/fatigue behind today */
  trend: AthleteTrend[];
  /** last week and the next three, so the coach can see and change what is coming */
  workouts: AthleteWorkout[];
  recentRuns: AthleteRun[];
  flags: Flag[];
  /** null when they have no active plan */
  planId: string | null;
  targetTime: string | null;
}

const shift = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Everything one athlete's page shows.
 *
 * The link is checked explicitly before anything is read. RLS would refuse the
 * rows anyway, but an unlinked athlete should get "not your athlete" rather than
 * a page of empty sections that reads like a bug.
 */
export async function getAthleteDetail(athleteId: string): Promise<AthleteDetail | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: link } = await supabase
    .from("coach_athletes")
    .select("athlete_id")
    .eq("coach_id", user.id)
    .eq("athlete_id", athleteId)
    .eq("status", "active")
    .maybeSingle();

  if (!link) return null;

  const day = today();
  const from = shift(day, -42);
  const workoutsFrom = shift(day, -7);
  const workoutsTo = shift(day, 21);

  const [{ data: profile }, { data: snaps }, { data: race }, { data: plan }, { data: runs }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, running_level, age")
        .eq("id", athleteId)
        .maybeSingle(),
      supabase
        .from("readiness_snapshots")
        .select("date, ctl, atl, tsb, acwr, readiness_score")
        .eq("user_id", athleteId)
        .gte("date", from)
        .order("date", { ascending: true }),
      supabase
        .from("goal_races")
        .select("race_type, race_date, target_time")
        .eq("user_id", athleteId)
        .eq("status", "active")
        .order("race_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("training_plans")
        .select("id")
        .eq("user_id", athleteId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("activities")
        .select("id, started_at, distance_m, duration_s, avg_hr")
        .eq("user_id", athleteId)
        .order("started_at", { ascending: false })
        .limit(30),
    ]);

  const { data: workoutRows } = plan?.id
    ? await supabase
        .from("plan_workouts")
        .select("id, week_number, day_date, workout_type, planned_distance, planned_pace, status")
        .eq("plan_id", plan.id)
        .gte("day_date", workoutsFrom)
        .lte("day_date", workoutsTo)
        .order("day_date", { ascending: true })
    : { data: [] };

  // What was actually run, by day, so a planned session can be shown against it.
  const ranByDay = new Map<string, { m: number; s: number }>();
  for (const r of runs ?? []) {
    if (!r.started_at) continue;
    const d = r.started_at.slice(0, 10);
    const prev = ranByDay.get(d) ?? { m: 0, s: 0 };
    ranByDay.set(d, { m: prev.m + (r.distance_m ?? 0), s: prev.s + (r.duration_s ?? 0) });
  }

  const latest = (snaps ?? []).length ? (snaps ?? [])[(snaps ?? []).length - 1] : null;
  const lastRun = (runs ?? [])[0] ?? null;

  const week = weekDates(day);
  const missedThisWeek = (workoutRows ?? []).filter(
    (w) =>
      w.day_date >= week[0] &&
      w.day_date < day &&
      w.workout_type !== "rest" &&
      !ranByDay.has(w.day_date),
  ).length;

  const athlete: AthleteRow = {
    id: athleteId,
    name: profile?.full_name || profile?.email || "Athlete",
    avatarUrl: profile?.avatar_url ?? null,
    readiness: latest?.readiness_score ?? null,
    form: latest?.tsb ?? null,
    loadRatio: latest?.acwr ?? null,
    lastRunAt: lastRun?.started_at ?? null,
    lastRunM: lastRun?.distance_m ?? null,
    raceType: (race?.race_type as RaceType | undefined) ?? null,
    raceDate: race?.race_date ?? null,
    missedThisWeek,
  };

  return {
    athlete,
    email: profile?.email ?? null,
    level: profile?.running_level ?? null,
    age: profile?.age ?? null,
    trend: (snaps ?? []).map((s) => ({
      date: s.date,
      ctl: s.ctl,
      atl: s.atl,
      tsb: s.tsb,
      readiness: s.readiness_score,
    })),
    workouts: (workoutRows ?? []).map((w) => {
      const ran = ranByDay.get(w.day_date) ?? null;
      return {
        id: w.id,
        date: w.day_date,
        weekNumber: w.week_number,
        workoutType: w.workout_type,
        plannedDistanceM: w.planned_distance,
        plannedPace: w.planned_pace,
        status: w.status,
        actualM: ran?.m ?? null,
        actualS: ran?.s ?? null,
      };
    }),
    recentRuns: (runs ?? []).slice(0, 10).map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      distanceM: r.distance_m,
      durationS: r.duration_s,
      avgHr: r.avg_hr,
    })),
    flags: flagsFor(athlete, day),
    planId: plan?.id ?? null,
    targetTime: race?.target_time ?? null,
  };
}

/**
 * Changes one planned session.
 *
 * A coach adjusting a plan is the whole point of the coaching side, and it is
 * also the one place where their edit collides with the automatic adjustment
 * engine. For now the coach wins and the change is written straight through;
 * the provenance model that would let the engine know not to touch a
 * hand-edited session (`origin`, `locked_by`) is documented as the next step
 * rather than half-built here.
 *
 * ## Why the ownership check is here and not left to RLS
 *
 * This is a `"use server"` file, so this function is a public endpoint: anyone
 * signed in can call it with any workout id they can guess or observe. The
 * first version went straight to `update ... where id = $1`, which trusted that
 * id completely. Whether that was exploitable came down to how the UPDATE
 * policy on `plan_workouts` happens to be phrased — and "we are safe as long as
 * a policy we did not read is written the stricter of two common ways" is not a
 * position to be in. So the workout is resolved to its plan, the plan to its
 * owner, and the owner has to be the caller or somebody the caller actively
 * coaches. RLS stays as the second lock.
 */
export async function updateWorkout(
  workoutId: string,
  patch: { workoutType?: WorkoutType; plannedDistanceM?: number | null; plannedPace?: string | null },
): Promise<Result<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const fields: {
    workout_type?: WorkoutType;
    planned_distance?: number | null;
    planned_pace?: string | null;
  } = {};
  if (patch.workoutType !== undefined) fields.workout_type = patch.workoutType;
  if (patch.plannedDistanceM !== undefined) fields.planned_distance = patch.plannedDistanceM;
  if (patch.plannedPace !== undefined) fields.planned_pace = patch.plannedPace;
  if (Object.keys(fields).length === 0) return { ok: true, data: null };

  // Whose session is this?
  const { data: workout } = await supabase
    .from("plan_workouts")
    .select("plan_id")
    .eq("id", workoutId)
    .maybeSingle();

  if (!workout) return { ok: false, error: "That session no longer exists." };

  const { data: plan } = await supabase
    .from("training_plans")
    .select("user_id")
    .eq("id", workout.plan_id)
    .maybeSingle();

  if (!plan) return { ok: false, error: "That session no longer exists." };

  if (plan.user_id !== user.id) {
    const { data: link } = await supabase
      .from("coach_athletes")
      .select("athlete_id")
      .eq("coach_id", user.id)
      .eq("athlete_id", plan.user_id)
      .eq("status", "active")
      .maybeSingle();

    // Deliberately the same message as a missing row. Telling a stranger that
    // the id exists but is not theirs turns this into a way to enumerate plans.
    if (!link) return { ok: false, error: "That session no longer exists." };
  }

  /*
   * `select()` on the update, so a row that RLS silently declined is not
   * reported as saved.
   *
   * Postgres does not raise when a policy excludes a row from an UPDATE — the
   * statement simply matches nothing and returns success. Before migration 0009
   * there was no coach UPDATE policy on `plan_workouts` at all, so every edit a
   * coach made came back `error === null`, showed "Saved", and changed nothing.
   * Asking for the changed rows back turns that silence into an answer.
   */
  const { data: changed, error } = await supabase
    .from("plan_workouts")
    .update(fields)
    .eq("id", workoutId)
    .select("id");

  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  if (!changed || changed.length === 0) {
    return { ok: false, error: "That change was refused — you may not have permission to edit this session." };
  }

  revalidatePath("/coach");
  return { ok: true, data: null };
}

/* ------------------------------------------------------------------ */
/* The coach workspace                                                 */
/* ------------------------------------------------------------------ */

/** This coach's settings, or the built-in defaults when they have never saved. */
export async function getCoachPreferences(): Promise<CoachPreferences> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PREFERENCES;

  const { data } = await supabase
    .from("coach_preferences")
    .select("race_colors, silent_days, overload_ratio, underload_ratio, low_readiness, race_soon_days")
    .eq("coach_id", user.id)
    .maybeSingle();

  if (!data) return DEFAULT_PREFERENCES;

  return {
    raceColors: (data.race_colors as Record<string, string>) ?? {},
    silentDays: data.silent_days,
    overloadRatio: Number(data.overload_ratio),
    underloadRatio: Number(data.underload_ratio),
    lowReadiness: data.low_readiness,
    raceSoonDays: data.race_soon_days,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Saves a coach's settings.
 *
 * Colours are validated here as well as where they are read. The value ends up
 * in an inline style, and a check at the only place it enters the system is
 * cheaper than trusting every place it leaves.
 */
export async function saveCoachPreferences(prefs: CoachPreferences): Promise<Result<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const colors: Record<string, string> = {};
  for (const [key, value] of Object.entries(prefs.raceColors)) {
    if (RACE_TYPES.includes(key as RaceType) && HEX.test(value)) colors[key] = value;
  }

  const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
  if (!inRange(prefs.silentDays, 1, 30)) return { ok: false, error: "Silent days must be between 1 and 30." };
  if (!inRange(prefs.overloadRatio, 1, 3)) return { ok: false, error: "The overload ratio must be between 1.0 and 3.0." };
  if (!inRange(prefs.underloadRatio, 0.1, 1)) return { ok: false, error: "The underload ratio must be between 0.1 and 1.0." };
  if (!inRange(prefs.lowReadiness, 0, 100)) return { ok: false, error: "Readiness must be between 0 and 100." };
  if (!inRange(prefs.raceSoonDays, 1, 120)) return { ok: false, error: "Race window must be between 1 and 120 days." };

  const { error } = await supabase.from("coach_preferences").upsert(
    {
      coach_id: user.id,
      race_colors: colors,
      silent_days: Math.round(prefs.silentDays),
      overload_ratio: prefs.overloadRatio,
      underload_ratio: prefs.underloadRatio,
      low_readiness: Math.round(prefs.lowReadiness),
      race_soon_days: Math.round(prefs.raceSoonDays),
    },
    { onConflict: "coach_id" },
  );

  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  revalidatePath("/coach");
  return { ok: true, data: null };
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

export interface Reminder {
  id: string;
  body: string;
  dueDate: string | null;
  done: boolean;
  athleteId: string | null;
  athleteName: string | null;
}

export async function getReminders(): Promise<Reminder[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("coach_reminders")
    .select("id, body, due_date, done, athlete_id")
    .eq("coach_id", user.id)
    .eq("done", false)
    // Dated notes first, soonest at the top; undated ones sink below them.
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = data ?? [];
  const athleteIds = [...new Set(rows.map((r) => r.athlete_id).filter((v): v is string => !!v))];

  const names = new Map<string, string>();
  if (athleteIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", athleteIds);
    for (const p of profiles ?? []) names.set(p.id, p.full_name || p.email || "Athlete");
  }

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    dueDate: r.due_date,
    done: r.done,
    athleteId: r.athlete_id,
    athleteName: r.athlete_id ? names.get(r.athlete_id) ?? null : null,
  }));
}

export async function addReminder(
  body: string,
  dueDate: string | null,
  athleteId: string | null,
): Promise<Result<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const text = body.trim();
  if (text.length === 0) return { ok: false, error: "A note needs some words." };
  if (text.length > 500) return { ok: false, error: "That note is too long." };

  const { error } = await supabase.from("coach_reminders").insert({
    coach_id: user.id,
    athlete_id: athleteId,
    body: text,
    due_date: dueDate,
  });

  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  revalidatePath("/coach");
  return { ok: true, data: null };
}

/** Marks a note done. Scoped to the caller, so an id alone is not enough. */
export async function completeReminder(id: string): Promise<Result<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data, error } = await supabase
    .from("coach_reminders")
    .update({ done: true })
    .eq("id", id)
    .eq("coach_id", user.id)
    .select("id");

  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  if (!data || data.length === 0) return { ok: false, error: "That note no longer exists." };

  revalidatePath("/coach");
  return { ok: true, data: null };
}

/* ------------------------------------------------------------------ */
/* The calendar                                                        */
/* ------------------------------------------------------------------ */

/** An athlete plus the details only the roster screen needs. */
export interface CoachRosterRow extends AthleteRow {
  age: number | null;
  sex: string | null;
  /** the goal time they entered, verbatim */
  targetTime: string | null;
  /** that time over that distance, in seconds per kilometre */
  targetPaceSec: number | null;
  /** the cycle they belong to, or null when they have no goal race */
  cycleId: string | null;
}

export interface CoachWorkspace {
  athletes: AthleteRow[];
  /** the same people, with the extra columns the Athletes screen shows */
  roster: CoachRosterRow[];
  summary: RosterSummary;
  flags: Flag[];
  code: string | null;
  preferences: CoachPreferences;
  reminders: Reminder[];
  /** every planned session in the requested window, across the whole roster */
  sessions: CalendarSession[];
  /** ISO date the window starts and ends on */
  from: string;
  to: string;
  /** the coach's own name, for the greeting */
  coachName: string | null;
}

const shiftIso = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Everything the coach's home needs, for a window of dates.
 *
 * One call rather than one per panel. The window is a parameter because the
 * same screen draws a week, a month and a year: asking for a year of sessions
 * to render a week would be wasteful, and asking for a week to render a year
 * would be wrong.
 */
export async function getCoachWorkspace(
  from?: string,
  to?: string,
): Promise<CoachWorkspace | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const day = today();
  const windowFrom = from ?? shiftIso(day, -35);
  const windowTo = to ?? shiftIso(day, 35);

  const { data: links } = await supabase
    .from("coach_athletes")
    .select("athlete_id")
    .eq("coach_id", user.id)
    .eq("status", "active");

  const ids = (links ?? []).map((l) => l.athlete_id);

  const [code, preferences, reminders, { data: me }] = await Promise.all([
    getMyCoachCode(),
    getCoachPreferences(),
    getReminders(),
    supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
  ]);

  const coachName = me?.full_name || me?.email?.split("@")[0] || null;

  if (ids.length === 0) {
    return {
      athletes: [], roster: [], summary: summariseRoster([], day), flags: [], code,
      preferences, reminders, sessions: [], from: windowFrom, to: windowTo, coachName,
    };
  }

  const [{ data: profiles }, { data: snapshots }, { data: races }, { data: plans }, { data: lastRuns }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name, email, avatar_url, age, sex").in("id", ids),
      supabase
        .from("readiness_snapshots")
        .select("user_id, date, readiness_score, tsb, acwr")
        .in("user_id", ids)
        .order("date", { ascending: false }),
      supabase
        .from("goal_races")
        .select("user_id, race_type, race_date, target_time")
        .in("user_id", ids)
        .eq("status", "active")
        .order("race_date", { ascending: true }),
      supabase.from("training_plans").select("id, user_id").in("user_id", ids).eq("status", "active"),
      supabase
        .from("activities")
        .select("user_id, started_at, distance_m")
        .in("user_id", ids)
        .order("started_at", { ascending: false }),
    ]);

  const nameOf = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Athlete"] as const),
  );

  const latestSnap = new Map<string, { readiness_score: number | null; tsb: number | null; acwr: number | null }>();
  for (const s of snapshots ?? []) if (!latestSnap.has(s.user_id)) latestSnap.set(s.user_id, s);

  const raceOf = new Map<string, { race_type: RaceType; race_date: string; target_time: string | null }>();
  for (const r of races ?? []) {
    if (!raceOf.has(r.user_id)) {
      raceOf.set(r.user_id, { race_type: r.race_type, race_date: r.race_date, target_time: r.target_time });
    }
  }

  const lastRunOf = new Map<string, { started_at: string | null; distance_m: number | null }>();
  const ranByDay = new Set<string>();
  for (const r of lastRuns ?? []) {
    if (!lastRunOf.has(r.user_id)) lastRunOf.set(r.user_id, r);
    if (r.started_at) ranByDay.add(`${r.user_id}|${r.started_at.slice(0, 10)}`);
  }

  const planIds = (plans ?? []).map((p) => p.id);
  const planOwner = new Map((plans ?? []).map((p) => [p.id, p.user_id]));

  const { data: workouts } = planIds.length
    ? await supabase
        .from("plan_workouts")
        .select("plan_id, day_date, workout_type, planned_distance")
        .in("plan_id", planIds)
        .gte("day_date", windowFrom)
        .lte("day_date", windowTo)
    : { data: [] };

  const week = weekDates(day);
  const athletes: AthleteRow[] = ids.map((id) => {
    const snap = latestSnap.get(id);
    const race = raceOf.get(id);
    const last = lastRunOf.get(id);
    const missed = (workouts ?? []).filter((w) => {
      if (planOwner.get(w.plan_id) !== id) return false;
      return (
        w.day_date >= week[0] &&
        w.day_date < day &&
        w.workout_type !== "rest" &&
        !ranByDay.has(`${id}|${w.day_date}`)
      );
    }).length;

    return {
      id,
      name: nameOf.get(id) ?? "Athlete",
      avatarUrl: (profiles ?? []).find((p) => p.id === id)?.avatar_url ?? null,
      readiness: snap?.readiness_score ?? null,
      form: snap?.tsb ?? null,
      loadRatio: snap?.acwr ?? null,
      lastRunAt: last?.started_at ?? null,
      lastRunM: last?.distance_m ?? null,
      raceType: race?.race_type ?? null,
      raceDate: race?.race_date ?? null,
      missedThisWeek: missed,
    };
  });

  const sessions: CalendarSession[] = (workouts ?? []).flatMap((w) => {
    const athleteId = planOwner.get(w.plan_id);
    if (!athleteId) return [];
    return [{
      date: w.day_date,
      athleteId,
      athleteName: nameOf.get(athleteId) ?? "Athlete",
      raceType: raceOf.get(athleteId)?.race_type ?? null,
      workoutType: w.workout_type,
      plannedDistanceM: w.planned_distance,
      done: ranByDay.has(`${athleteId}|${w.day_date}`),
    }];
  });

  const profileOf = new Map((profiles ?? []).map((p) => [p.id, p] as const));

  const roster: CoachRosterRow[] = athletes.map((a) => {
    const p = profileOf.get(a.id);
    const race = raceOf.get(a.id);
    return {
      ...a,
      age: p?.age ?? null,
      sex: p?.sex ?? null,
      targetTime: race?.target_time ?? null,
      targetPaceSec: targetPaceSeconds(race?.race_type ?? null, race?.target_time ?? null),
      cycleId: race ? `${race.race_type}|${race.race_date}` : null,
    };
  });

  return {
    athletes,
    roster,
    summary: summariseRoster(athletes, day),
    // The coach's own thresholds, not ours — see coach_preferences.
    flags: rosterFlags(athletes, day, {
      silentDays: preferences.silentDays,
      overloadRatio: preferences.overloadRatio,
      underloadRatio: preferences.underloadRatio,
      lowReadiness: preferences.lowReadiness,
      raceSoonDays: preferences.raceSoonDays,
    }),
    code,
    preferences,
    reminders,
    sessions,
    from: windowFrom,
    to: windowTo,
    coachName,
  };
}

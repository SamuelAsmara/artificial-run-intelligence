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
      supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", ids),
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
        .select("user_id, race_type, race_date")
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

  const { error } = await supabase.from("plan_workouts").update(fields).eq("id", workoutId);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  revalidatePath("/coach");
  return { ok: true, data: null };
}

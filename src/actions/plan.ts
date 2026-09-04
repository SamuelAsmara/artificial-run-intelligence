"use server";

/**
 * Everything that creates, reads or adjusts a training plan.
 *
 * This is a `"use server"` file, so every exported function here is a public
 * endpoint: signed-in callers reach them directly, with whatever arguments they
 * like. Each one therefore establishes who is calling before it does anything,
 * and none of them trusts an id it was handed.
 *
 * The division of labour with `lib/planning/` is deliberate and worth knowing:
 * **the arithmetic is not here.** `generatePlan` decides what a plan looks
 * like, `readCapacity` decides what the athlete can currently take, and
 * `runAdjustment` decides what to reduce. This file reads the rows those
 * functions need, calls them, writes the result back, and tells Next which
 * pages to rebuild. That separation is why the plan engine has 49 tests and
 * needs neither a database nor a browser to run them.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generatePlan, RaceTooSoonError, type PlanStructure } from "@/lib/planning/generatePlan";
import { zonedNow } from "@/lib/time/week";
import { readCapacity } from "@/lib/planning/readCapacity";
import { estimateThresholds, type HistoryActivity } from "@/lib/planning/thresholds";
import { paceLabel } from "@/lib/planning/paces";
import { parseTargetTime, thresholdSpeedFromTarget, RACE_DISTANCE_M } from "@/lib/planning/ownPlan";
import type { AthleteCapacity } from "@/lib/planning/capacity";
import { buildRealPlan, type RealPlan } from "@/lib/dashboard/realPlan";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, RaceType } from "@/types/database.types";

/**
 * The two profile fields that set an athlete's maximum-heart-rate estimate.
 *
 * The defaults are the population figures the formula falls back to, and they
 * are a real approximation rather than a placeholder: a 55-year-old woman
 * treated as a 34-year-old man gets a maximum heart rate about fifteen beats
 * too high, a threshold to match, and every prescribed pace shifted with it.
 * The profile screen is where an athlete corrects this.
 */
async function readDemographics(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ age: number; sex: "male" | "female" }> {
  const { data } = await supabase
    .from("profiles")
    .select("age, sex")
    .eq("id", userId)
    .maybeSingle();

  return {
    age: data?.age ?? 34,
    sex: (data?.sex as "male" | "female" | null) ?? "male",
  };
}

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/**
 * The plan structure to build this athlete's plan from.
 *
 * Preference order: the template their own coach wrote, then the built-in row
 * for the distance, then nothing — in which case `generatePlan` uses its own
 * table and behaves exactly as it always has.
 *
 * The athlete is allowed to read this. Migration 0008 says why: *"An athlete
 * must be able to read the template their own plan was built from, or their
 * plan screen cannot explain where its structure came from."* The policy was
 * written and then nothing ever used it, because nothing read templates at all.
 */
async function readTemplate(
  supabase: SupabaseClient<Database>,
  userId: string,
  raceType: RaceType,
  cycleId: string | null = null,
): Promise<PlanStructure | undefined> {
  // A cycle names its template outright.
  if (cycleId) {
    const { data: cycle } = await supabase.from("coach_cycles").select("template_id").eq("id", cycleId).maybeSingle();
    if (cycle?.template_id) {
      const { data: t } = await supabase.from("plan_templates").select("phase_structure, weekly_mix").eq("id", cycle.template_id).maybeSingle();
      if (t) return { phaseStructure: t.phase_structure, weeklyMix: t.weekly_mix };
    }
  }
  const { data: link } = await supabase
    .from("coach_athletes")
    .select("coach_id")
    .eq("athlete_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (link?.coach_id) {
    const { data: own } = await supabase
      .from("plan_templates")
      .select("phase_structure, weekly_mix")
      .eq("coach_id", link.coach_id)
      .eq("race_type", raceType)
      .maybeSingle();
    if (own) {
      return { phaseStructure: own.phase_structure, weeklyMix: own.weekly_mix };
    }
  }

  const { data: builtIn } = await supabase
    .from("plan_templates")
    .select("phase_structure, weekly_mix")
    .is("coach_id", null)
    .eq("race_type", raceType)
    .maybeSingle();

  return builtIn
    ? { phaseStructure: builtIn.phase_structure, weeklyMix: builtIn.weekly_mix }
    : undefined;
}

/**
 * Server Action: builds the initial periodised structure (plan_workouts).
 * Architecture doc §5, Technical design §5.
 */
export async function generatePlanAction(
  goalRaceId: string,
  /**
   * What to size the plan against when the athlete has no runs on file yet —
   * the two numbers the Runi-plan form asks for in that case. Without runs
   * and without this, the action refuses rather than guess.
   */
  opts: { fallbackCapacity?: AthleteCapacity; cycleId?: string | null; forUserId?: string } = {},
): Promise<ActionResult<{ planId: string; notes: string[]; achievable: boolean }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in to build a plan." };
  }

  const { data: goalRace, error: fetchError } = await supabase
    .from("goal_races")
    .select("id, race_type, race_date, user_id, target_time")
    .eq("id", goalRaceId)
    .single();

  // A coach may build for an athlete on their roster (row-level security is
  // what actually enforces that); anyone else builds only for themselves.
  const athleteId = opts.forUserId ?? user.id;
  if (fetchError || !goalRace || goalRace.user_id !== athleteId) {
    return { error: "Goal race not found." };
  }

  // The plan must be sized against this athlete. Generating from the generic
  // per-race table produces first-week long runs that Runi's own spike check
  // flags as elevated risk — see src/lib/planning/capacity.ts.
  const { data: history } = await supabase
    .from("activities")
    .select("started_at, distance_m, duration_s, avg_hr")
    .eq("user_id", athleteId)
    .order("started_at", { ascending: true });

  const runs: HistoryActivity[] = (history ?? [])
    .filter((a) => a.started_at && (a.duration_s ?? 0) > 0)
    .map((a) => ({
      durationSec: a.duration_s as number,
      distanceM: a.distance_m ?? 0,
      avgHr: a.avg_hr,
      date: (a.started_at as string).slice(0, 10),
    }));

  if (runs.length === 0 && !opts.fallbackCapacity) {
    return {
      error:
        "No runs on file yet. Connect your watch in Settings and sync, or tell Runi what you run now — " +
        "without knowing what you run today, any plan is a guess.",
    };
  }

  const capacity = runs.length
    ? readCapacity(runs.map((r) => ({ date: r.date, distanceM: r.distanceM })))
    : (opts.fallbackCapacity as AthleteCapacity);

  // Learned from the athlete's own efforts; used only to prescribe paces.
  // Age and sex set the maximum-heart-rate estimate, which sets the threshold,
  // which sets every prescribed pace — so they are read rather than assumed.
  // The readiness pipeline already did this; the plan did not, and the two then
  // produced different paces for the same athlete on the same day.
  //
  // With no runs at all, the target time stands in: Riegel turns it into the
  // pace of an hour's race, which is what threshold is. The measured value
  // takes over the first time the plan is rebuilt after runs arrive.
  const demographics = await readDemographics(supabase, athleteId);
  const thresholdSpeedMps = runs.length
    ? estimateThresholds(runs, demographics).thresholdSpeedMps
    : thresholdSpeedFromTarget(RACE_DISTANCE_M[goalRace.race_type], parseTargetTime(goalRace.target_time) ?? 0) ?? 0;

  // The coach's structure, when this athlete has a coach who wrote one — or
  // the cycle's template, when the plan is being built for a cycle.
  const template = await readTemplate(supabase, athleteId, goalRace.race_type, opts.cycleId ?? null);

  let generated;
  try {
    generated = generatePlan(
      goalRace.race_type,
      new Date(goalRace.race_date),
      zonedNow(),
      capacity,
      template,
    );
  } catch (err) {
    if (err instanceof RaceTooSoonError) {
      // Test plan §6: a race too close gets an explicit message, not a crash
      return { error: err.message };
    }
    console.error("[runi] generatePlan failed", { goalRaceId, athleteId }, err);
    return { error: "Building the plan failed — try again." };
  }

  const { data: plan, error: planError } = await supabase
    .from("training_plans")
    .insert({ user_id: athleteId, goal_race_id: goalRaceId, cycle_id: opts.cycleId ?? null })
    .select("id")
    .single();

  if (planError || !plan) {
    console.error("[runi] training_plans insert failed", planError);
    return { error: "Saving the plan failed — try again." };
  }

  const workoutRows = generated.workouts.map((w) => ({
    plan_id: plan.id,
    week_number: w.weekNumber,
    day_date: w.dayDate,
    workout_type: w.workoutType,
    planned_distance: w.plannedDistance,
    planned_pace: paceLabel(w.workoutType, thresholdSpeedMps),
    /*
     * The generator has computed this since day one and it was dropped right
     * here, on this map — the one place the plan touches the ground. Stored so
     * the plan screen can show where the athlete is in the arc of the plan
     * without re-deriving proportions the generator (or a coach's template)
     * already decided.
     */
    phase: w.phase,
  }));

  const { error: workoutsError } = await supabase.from("plan_workouts").insert(workoutRows);
  if (workoutsError) {
    console.error("[runi] plan_workouts insert failed", workoutsError);
    return { error: "Saving the plan’s sessions failed — try again." };
  }

  revalidatePath("/plan");
  revalidatePath("/dashboard");

  return {
    data: {
      planId: plan.id,
      // The UI must show these. If the race distance is not safely reachable,
      // the athlete needs to know before they start, not at 30 km.
      notes: generated.capacity?.notes ?? [],
      achievable: generated.capacity?.achievable ?? true,
    },
  };
}

/**
 * Leave the active training plan.
 *
 * ## Why this exists
 *
 * There was no way out. `buildPlanForActiveRace` refuses while a plan exists,
 * nothing else closed one, and even changing the goal race left the old plan
 * standing — an athlete who built a plan once was in it forever. The same
 * class of hole as the "no plan yet" loop this file already documents, from
 * the other side.
 *
 * ## Why it marks rather than deletes
 *
 * The rows stay, as `status = 'abandoned'`. Every screen reads plans through
 * `status = 'active'`, so a left plan disappears from the product — but the
 * history it represents is real (sessions were run against it) and deleting
 * it would be rewriting the athlete's past. Leaving is also deliberately
 * unceremonious — one action, no questions, same as leaving a coach: an
 * athlete must never need permission to stop.
 */
export async function abandonPlan(): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase
    .from("training_plans")
    .update({ status: "abandoned" })
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) return { error: "Could not leave the plan. Try again." };

  revalidatePath("/plan");
  revalidatePath("/dashboard");
  return { data: null };
}

/**
 * The athlete's active plan, shaped for the dashboard.
 *
 * Returns null when there is no plan yet, which is the signal for the view to
 * keep showing its reference week rather than an empty strip.
 */
export async function getDashboardPlan(): Promise<RealPlan | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: plan } = await supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return null;

  const { data: rows } = await supabase
    .from("plan_workouts")
    .select(
      "week_number, day_date, workout_type, planned_distance, planned_pace, status, origin, adjusted_reason, phase",
    )
    .eq("plan_id", plan.id)
    .order("day_date", { ascending: true });

  if (!rows || rows.length === 0) return null;

  // Completed sessions are derived from what was actually run, not from the
  // plan's own status column — see src/lib/dashboard/realPlan.ts.
  const from = rows[0].day_date;
  const { data: runs } = await supabase
    .from("activities")
    .select("started_at, distance_m, duration_s, avg_hr")
    .eq("user_id", user.id)
    .gte("started_at", from);

  const completed = (runs ?? [])
    .filter((r) => r.started_at)
    .map((r) => ({
      date: (r.started_at as string).slice(0, 10),
      distanceM: r.distance_m ?? 0,
    }));

  // Thresholds want the whole history, not just the plan window, so paces stay
  // stable rather than shifting with whatever happens to be in range.
  const { data: allRuns } = await supabase
    .from("activities")
    .select("started_at, distance_m, duration_s, avg_hr")
    .eq("user_id", user.id)
    .order("started_at", { ascending: true });

  const history: HistoryActivity[] = (allRuns ?? [])
    .filter((a) => a.started_at && (a.duration_s ?? 0) > 0)
    .map((a) => ({
      durationSec: a.duration_s as number,
      distanceM: a.distance_m ?? 0,
      avgHr: a.avg_hr,
      date: (a.started_at as string).slice(0, 10),
    }));

  const thresholdSpeedMps = history.length
    ? estimateThresholds(history, await readDemographics(supabase, user.id)).thresholdSpeedMps
    : null;

  return buildRealPlan(rows, completed, thresholdSpeedMps);
}

/**
 * Everything the /plan screen shows: the athlete's plan and the race it is for.
 * Both may be null; the screen then offers the three ways to start a plan.
 */
export interface PlanStart {
  /** the coach the athlete is linked to, if any */
  coach: { name: string; cycleName: string | null } | null;
  /** how many runs Runi holds — zero means the Runi plan asks for two numbers */
  runsOnFile: number;
}

export async function getPlanScreen(): Promise<{
  plan: RealPlan | null;
  /** the active plan's own name and whether it is one the athlete wrote */
  planMeta: { name: string | null; own: boolean; cycleName: string | null } | null;
  race: { raceType: string; raceDate: string; targetTime: string | null } | null;
  start: PlanStart;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { plan: null, planMeta: null, race: null, start: { coach: null, runsOnFile: 0 } };

  const [plan, { data: race }, { data: activePlan }, { data: link }, { count: runs }] = await Promise.all([
    getDashboardPlan(),
    supabase
      .from("goal_races")
      .select("race_type, race_date, target_time")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("race_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("training_plans").select("name, goal_race_id, cycle_id").eq("user_id", user.id).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("coach_athletes").select("coach_id, cycle_id").eq("athlete_id", user.id).eq("status", "active").maybeSingle(),
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  let coach: PlanStart["coach"] = null;
  let cycleName: string | null = null;
  if (link?.coach_id) {
    const { data: rows } = await supabase.rpc("my_coach_name");
    const me = Array.isArray(rows) ? rows[0] : null;
    const cycleId = activePlan?.cycle_id ?? link.cycle_id;
    if (cycleId) {
      const { data: cycle } = await supabase.from("coach_cycles").select("name").eq("id", cycleId).maybeSingle();
      cycleName = cycle?.name ?? null;
    }
    coach = { name: me?.coach_name ?? "your coach", cycleName };
  }

  return {
    plan,
    planMeta: activePlan ? { name: activePlan.name, own: activePlan.goal_race_id == null, cycleName } : null,
    race: race
      ? { raceType: race.race_type, raceDate: race.race_date, targetTime: race.target_time }
      : null,
    start: { coach, runsOnFile: runs ?? 0 },
  };
}

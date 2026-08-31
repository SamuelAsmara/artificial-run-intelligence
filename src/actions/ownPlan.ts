"use server";

/**
 * The two ways an athlete without a coach gets a plan: Runi's own, previewed
 * before it is applied, and one they write themselves.
 *
 * The third way — a coach — is `joinCoach` in actions/coach.ts, and the plan
 * then arrives through the cycle the coach puts them in.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generatePlan, RaceTooSoonError, weekPatternFrom } from "@/lib/planning/generatePlan";
import { readCapacity } from "@/lib/planning/readCapacity";
import { estimateThresholds, type HistoryActivity } from "@/lib/planning/thresholds";
import { paceLabel } from "@/lib/planning/paces";
import {
  buildOwnPlan, parseTargetTime, thresholdSpeedFromTarget, validateOwnPlan, weeklyKm,
  RACE_DISTANCE_M, type OwnPlanInput,
} from "@/lib/planning/ownPlan";
import { goalRaceSchema } from "@/lib/validation/schemas";
import { zonedNow } from "@/lib/time/week";
import { generatePlanAction } from "./plan";
import type { RaceType, WorkoutType } from "@/types/database.types";

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

export interface RuniPlanInput {
  raceType: RaceType;
  raceDate: string;
  targetTime?: string;
  /** asked for only when the athlete has no runs on file */
  currentWeeklyKm?: number;
  longestRecentKm?: number;
}

export interface RuniPlanPreview {
  totalWeeks: number;
  phases: { phase: string; weeks: number }[];
  /** the shape of one week, Sunday first */
  week: { day: string; type: WorkoutType; km: number | null; pace: string | null }[];
  peakWeekKm: number;
  peakLongRunKm: number;
  achievable: boolean;
  notes: string[];
  /** where the paces came from */
  pacesFrom: "your runs" | "your target time" | "nowhere yet";
  /** whether the plan will be sized from runs on file or from the two numbers typed in */
  sizedFrom: "your runs" | "what you told us";
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function athleteRuns(userId: string): Promise<HistoryActivity[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("started_at, distance_m, duration_s, avg_hr")
    .eq("user_id", userId)
    .order("started_at", { ascending: true });
  return (data ?? [])
    .filter((a) => a.started_at && (a.duration_s ?? 0) > 0)
    .map((a) => ({ durationSec: a.duration_s as number, distanceM: a.distance_m ?? 0, avgHr: a.avg_hr, date: (a.started_at as string).slice(0, 10) }));
}

/**
 * What Runi would build, without building it.
 *
 * The athlete sees the length, the phases, one week's shape with paces, and
 * the peak the plan climbs to — against their own numbers — and only then
 * presses apply. A plan applied blind is a plan left after a week.
 */
export async function previewRuniPlan(input: RuniPlanInput): Promise<ActionResult<RuniPlanPreview>> {
  const parsed = goalRaceSchema.safeParse({ raceType: input.raceType, raceDate: input.raceDate, targetTime: input.targetTime });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the race details." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const runs = await athleteRuns(user.id);
  const typed = input.currentWeeklyKm != null && input.longestRecentKm != null
    ? { currentWeeklyM: input.currentWeeklyKm * 1000, longestRecentM: input.longestRecentKm * 1000 }
    : null;
  if (runs.length === 0 && !typed) {
    return { error: "No runs on file yet — tell Runi roughly how far you run in a week and your longest recent run, so the plan is sized to you." };
  }
  const capacity = runs.length ? readCapacity(runs.map((r) => ({ date: r.date, distanceM: r.distanceM }))) : typed!;

  const { data: profile } = await supabase.from("profiles").select("age, sex").eq("id", user.id).maybeSingle();
  const targetSec = parseTargetTime(input.targetTime);
  const thresholdSpeedMps = runs.length
    ? estimateThresholds(runs, { age: profile?.age ?? 34, sex: (profile?.sex as "male" | "female") ?? "male" }).thresholdSpeedMps
    : targetSec ? thresholdSpeedFromTarget(RACE_DISTANCE_M[input.raceType], targetSec) ?? 0 : 0;

  let generated;
  try {
    generated = generatePlan(input.raceType, new Date(input.raceDate), zonedNow(), capacity);
  } catch (err) {
    return { error: err instanceof RaceTooSoonError ? err.message : "Could not lay the plan out for that date." };
  }

  // One representative week: the middle of the build phase, where the plan
  // is most itself — neither the gentle start nor the taper.
  const build = generated.phases.build;
  const sampleWeek = Math.round((build.startWeek + build.endWeek) / 2);
  const inWeek = generated.workouts.filter((w) => w.weekNumber === sampleWeek);
  const pattern = weekPatternFrom({ easy: 3, long: 1, interval: 1, rest: 2 });
  const week = DAY_NAMES.map((day, i) => {
    const w = inWeek.find((x) => new Date(`${x.dayDate}T00:00:00Z`).getUTCDay() === i);
    const type: WorkoutType = w?.workoutType ?? pattern.find((x) => x.offset === i)?.type ?? "rest";
    return {
      day, type,
      km: w?.plannedDistance != null ? Math.round(w.plannedDistance / 100) / 10 : null,
      pace: type === "rest" ? null : paceLabel(type, thresholdSpeedMps),
    };
  });

  const byWeek = new Map<number, number>();
  for (const w of generated.workouts) byWeek.set(w.weekNumber, (byWeek.get(w.weekNumber) ?? 0) + (w.plannedDistance ?? 0));
  const peakWeekKm = Math.round(Math.max(...byWeek.values()) / 100) / 10;
  const peakLongRunKm = Math.round(Math.max(...generated.workouts.map((w) => w.plannedDistance ?? 0)) / 100) / 10;

  return {
    data: {
      totalWeeks: generated.totalWeeks,
      phases: (["base", "build", "peak", "taper"] as const).map((p) => ({ phase: p, weeks: generated.phases[p].endWeek - generated.phases[p].startWeek + 1 })),
      week,
      peakWeekKm,
      peakLongRunKm,
      achievable: generated.capacity?.achievable ?? true,
      notes: generated.capacity?.notes ?? [],
      pacesFrom: runs.length ? "your runs" : targetSec ? "your target time" : "nowhere yet",
      sizedFrom: runs.length ? "your runs" : "what you told us",
    },
  };
}

/** Save the goal race and build the plan the preview showed. */
export async function startRuniPlan(input: RuniPlanInput): Promise<ActionResult<{ planId: string; notes: string[] }>> {
  const parsed = goalRaceSchema.safeParse({ raceType: input.raceType, raceDate: input.raceDate, targetTime: input.targetTime });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the race details." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data: active } = await supabase.from("training_plans").select("id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (active) return { error: "You already have a plan. Leave it first if you want a different one." };

  // Reuse the active goal race when it is the same race; otherwise retire it
  // and write the new one, so the dashboard's race card follows the plan.
  const { data: current } = await supabase.from("goal_races").select("id, race_type, race_date").eq("user_id", user.id).eq("status", "active").order("race_date", { ascending: true }).limit(1).maybeSingle();
  let raceId = current && current.race_type === parsed.data.raceType && current.race_date === parsed.data.raceDate ? current.id : null;
  if (!raceId) {
    if (current) await supabase.from("goal_races").update({ status: "cancelled" }).eq("id", current.id);
    const { data: race, error } = await supabase
      .from("goal_races")
      .insert({ user_id: user.id, race_type: parsed.data.raceType, race_date: parsed.data.raceDate, target_time: parsed.data.targetTime?.trim() || null })
      .select("id").single();
    if (error || !race) return { error: "Saving the goal race failed — try again." };
    raceId = race.id;
  } else if (parsed.data.targetTime !== undefined) {
    await supabase.from("goal_races").update({ target_time: parsed.data.targetTime.trim() || null }).eq("id", raceId);
  }

  const fallbackCapacity = input.currentWeeklyKm != null && input.longestRecentKm != null
    ? { currentWeeklyM: input.currentWeeklyKm * 1000, longestRecentM: input.longestRecentKm * 1000 }
    : undefined;
  const result = await generatePlanAction(raceId, { fallbackCapacity });
  if (result.error) return { error: result.error };
  revalidatePath("/plan");
  revalidatePath("/dashboard");
  return { data: { planId: result.data!.planId, notes: result.data!.notes } };
}

/** Lay out and save a plan the athlete wrote. Returns the kilometres per week, for the confirmation. */
export async function createOwnPlan(input: OwnPlanInput): Promise<ActionResult<{ planId: string; weeklyKm: number[] }>> {
  const invalid = validateOwnPlan(input);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data: active } = await supabase.from("training_plans").select("id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (active) return { error: "You already have a plan. Leave it first if you want a different one." };

  const rows = buildOwnPlan(input);
  if (rows.length === 0) return { error: "That start date leaves nothing to plan." };

  const { data: plan, error: planError } = await supabase
    .from("training_plans")
    .insert({ user_id: user.id, goal_race_id: null, name: input.name.trim() })
    .select("id").single();
  if (planError || !plan) return { error: `Saving the plan failed — ${planError?.message ?? "try again"}.` };

  const { error: rowsError } = await supabase.from("plan_workouts").insert(rows.map((r) => ({
    plan_id: plan.id,
    week_number: r.weekNumber,
    day_date: r.dayDate,
    workout_type: r.workoutType,
    planned_distance: r.plannedDistance,
    planned_pace: r.plannedPace,
    origin: "athlete" as const,
    phase: null,
  })));
  if (rowsError) return { error: "Saving the plan’s sessions failed — try again." };

  revalidatePath("/plan");
  revalidatePath("/dashboard");
  return { data: { planId: plan.id, weeklyKm: weeklyKm(rows) } };
}

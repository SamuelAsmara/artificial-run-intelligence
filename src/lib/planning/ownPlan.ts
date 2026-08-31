/**
 * A plan the athlete writes themselves.
 *
 * Not every block of training is aimed at a race. Someone coming back from a
 * break, or simply keeping a routine, wants eight steady weeks with the same
 * shape — and the generator, which builds backwards from a race day, has no
 * answer for that. This module has: the athlete describes one week (what each
 * day is, how far, at what pace), says how many weeks, and Runi lays it out on
 * the calendar in the same rows the generated plans use, so the dashboard, the
 * calendar dots and planned-vs-actual on a run all work unchanged.
 *
 * Pure. The action in `actions/ownPlan.ts` reads the input, calls this, and
 * saves the rows; the tests exercise this directly.
 */

import type { WorkoutType } from "@/types/database.types";
import { formatPace } from "@/lib/format/pace";

/** Sunday first, like every week in Runi. */
export interface OwnPlanDay {
  type: WorkoutType;
  /** kilometres; ignored for rest */
  km: number | null;
  /** "5:30" per km; optional */
  pace: string | null;
}

export interface OwnPlanInput {
  name: string;
  /** ISO date the plan starts; the week that contains it is week 1 */
  startDate: string;
  weeks: number;
  /** seven entries, Sunday → Saturday */
  pattern: OwnPlanDay[];
  /**
   * Grow the week gently: +7% a week, and every fourth week a step back to
   * 75% — the same rule the generated plans and the safety checker use.
   */
  ramp: boolean;
}

export interface OwnPlanRow {
  weekNumber: number;
  dayDate: string;
  workoutType: WorkoutType;
  /** metres; null for rest */
  plannedDistance: number | null;
  plannedPace: string | null;
}

export const OWN_PLAN_LIMITS = { minWeeks: 1, maxWeeks: 24, minKm: 1, maxKm: 60 } as const;

const PACE_RE = /^(\d{1,2}):(\d{2})$/;

/** A sentence saying what is wrong, or null when the input can be laid out. */
export function validateOwnPlan(input: OwnPlanInput): string | null {
  if (!input.name.trim()) return "Give the plan a name.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return "Pick a start date.";
  if (!Number.isInteger(input.weeks) || input.weeks < OWN_PLAN_LIMITS.minWeeks || input.weeks > OWN_PLAN_LIMITS.maxWeeks) {
    return `Between ${OWN_PLAN_LIMITS.minWeeks} and ${OWN_PLAN_LIMITS.maxWeeks} weeks.`;
  }
  if (input.pattern.length !== 7) return "A week has seven days.";
  let sessions = 0;
  for (const d of input.pattern) {
    if (d.type === "rest") continue;
    sessions += 1;
    if (d.km == null || !Number.isFinite(d.km) || d.km < OWN_PLAN_LIMITS.minKm || d.km > OWN_PLAN_LIMITS.maxKm) {
      return `Each run needs a distance between ${OWN_PLAN_LIMITS.minKm} and ${OWN_PLAN_LIMITS.maxKm} km.`;
    }
    if (d.pace && !PACE_RE.test(d.pace.trim())) return "Paces look like 5:30 — minutes and seconds per kilometre.";
  }
  if (sessions === 0) return "At least one day has to be a run.";
  return null;
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The Sunday on or before the given ISO date, in UTC day arithmetic. */
export function sundayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return iso(d);
}

/** How much of the pattern's distance week `n` (1-based) carries. */
export function rampFactor(week: number, ramp: boolean): number {
  if (!ramp) return 1;
  // +7% a week, compounding from week 1; every fourth week steps back to 75%
  // of where the ramp had got to — a recovery week, not a reset.
  const grown = Math.pow(1.07, week - 1);
  return week % 4 === 0 ? grown * 0.75 : grown;
}

/**
 * Lay the pattern out on the calendar.
 *
 * Days before the start date in week 1 are left out rather than written as
 * missed: the athlete did not plan them. Rest days are written, so the
 * calendar can show them as rest rather than as nothing.
 */
export function buildOwnPlan(input: OwnPlanInput): OwnPlanRow[] {
  const invalid = validateOwnPlan(input);
  if (invalid) throw new Error(invalid);

  const weekOne = new Date(`${sundayOf(input.startDate)}T00:00:00Z`);
  const rows: OwnPlanRow[] = [];
  for (let w = 1; w <= input.weeks; w++) {
    const factor = rampFactor(w, input.ramp);
    for (let day = 0; day < 7; day++) {
      const date = new Date(weekOne.getTime() + ((w - 1) * 7 + day) * DAY);
      const d = iso(date);
      if (d < input.startDate) continue;
      const p = input.pattern[day];
      const km = p.type === "rest" || p.km == null ? null : Math.round(p.km * factor * 10) / 10;
      rows.push({
        weekNumber: w,
        dayDate: d,
        workoutType: p.type,
        plannedDistance: km == null ? null : Math.round(km * 1000),
        plannedPace: p.type === "rest" ? null : p.pace?.trim() || null,
      });
    }
  }
  return rows;
}

/** Kilometres in each week of the laid-out plan, week 1 first. */
export function weeklyKm(rows: OwnPlanRow[]): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const i = r.weekNumber - 1;
    out[i] = (out[i] ?? 0) + (r.plannedDistance ?? 0) / 1000;
  }
  return out.map((v) => Math.round(v * 10) / 10);
}

/* ------------------------------------------------------------------ */
/* paces from a target, for the athlete with no runs on file yet       */
/* ------------------------------------------------------------------ */

/**
 * Threshold speed implied by a target time, in m/s.
 *
 * Threshold is, near enough, the pace you can hold for an hour. Riegel
 * (T₂ = T₁ · (D₂/D₁)^1.06) turns "42.2 km in 3:45" into the distance the
 * same runner covers in 60 minutes, and that distance over 3600 s is the
 * threshold speed every prescribed pace is a ratio of. Used only until the
 * athlete's own runs arrive, when the measured threshold takes over.
 */
export function thresholdSpeedFromTarget(distanceM: number, targetSec: number): number | null {
  if (!(distanceM > 0) || !(targetSec > 0)) return null;
  const hourDistance = distanceM * Math.pow(3600 / targetSec, 1 / 1.06);
  return hourDistance / 3600;
}

/** "3:45:00" or "45:00" → seconds; null for anything else. */
export function parseTargetTime(s: string | null | undefined): number | null {
  if (!s) return null;
  const parts = s.trim().split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export const RACE_DISTANCE_M = { "5k": 5000, "10k": 10000, half: 21097, full: 42195 } as const;

export { formatPace };

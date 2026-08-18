/**
 * A coach's plan template: the shape of their methodology, as data.
 *
 * A coach does not write a plan per athlete. They decide how *they* prepare
 * somebody for 5K, 10K, half and marathon, and the generator applies that to
 * whoever is training for the distance. This file describes one of those four
 * documents and the rules for it being coherent.
 *
 * Pure: no queries, no React. It lives outside `actions/coach.ts` because that
 * file is `"use server"`, where every export becomes a public endpoint.
 */

import type { RaceType } from "@/types/database.types";

export interface CoachTemplate {
  /** null until the coach has saved their own; then the row id */
  id: string | null;
  raceType: RaceType;
  /** what the coach calls it */
  name: string;
  weeks: number;
  /** e.g. { base: 8, build: 6, peak: 2, taper: 2 } — must total `weeks` */
  phaseStructure: Record<string, number>;
  /** e.g. { easy: 3, long: 1, interval: 1, rest: 2 } — must total 7 */
  weeklyMix: Record<string, number>;
  /** true while this is still the built-in default rather than the coach's own */
  isDefault: boolean;
}

export const RACE_TYPES: RaceType[] = ["5k", "10k", "half", "full"];

export const RACE_LABEL: Record<RaceType, string> = {
  "5k": "5K", "10k": "10K", half: "Half marathon", full: "Marathon",
};

/** The phases a plan moves through, in order. */
export const PHASES = ["base", "build", "peak", "taper"] as const;

/** The kinds of session a week can hold. */
export const SESSIONS = ["easy", "long", "interval", "rest"] as const;

export const DEFAULT_NAME: Record<RaceType, string> = {
  "5k": "5K build", "10k": "10K build", half: "Half marathon", full: "Marathon",
};

export const DEFAULT_WEEKS: Record<RaceType, number> = {
  "5k": 8, "10k": 10, half: 14, full: 18,
};

export const DEFAULT_PHASES: Record<RaceType, Record<string, number>> = {
  "5k": { base: 3, build: 3, peak: 1, taper: 1 },
  "10k": { base: 4, build: 4, peak: 1, taper: 1 },
  half: { base: 6, build: 5, peak: 2, taper: 1 },
  full: { base: 8, build: 6, peak: 2, taper: 2 },
};

export const DEFAULT_MIX: Record<string, number> = {
  easy: 3, long: 1, interval: 1, rest: 2,
};

export const MIN_WEEKS = 4;
export const MAX_WEEKS = 32;

/**
 * Why a template can be wrong.
 *
 * Both failures here are off-by-one mistakes that are impossible to notice
 * afterwards: the generator will happily build a plan from an incoherent
 * template, and the result is not an error but a subtly wrong training plan
 * that somebody then runs for four months.
 *
 * Returns the sentence to show the coach, or null when it is sound.
 */
export function validateTemplate(t: CoachTemplate): string | null {
  if (!Number.isInteger(t.weeks) || t.weeks < MIN_WEEKS || t.weeks > MAX_WEEKS) {
    return `A plan should run between ${MIN_WEEKS} and ${MAX_WEEKS} weeks.`;
  }

  const phaseValues = Object.values(t.phaseStructure);
  if (phaseValues.some((v) => !Number.isInteger(v) || v < 0)) {
    return "Phase lengths have to be whole weeks.";
  }

  const phaseTotal = phaseValues.reduce((a, b) => a + b, 0);
  if (phaseTotal !== t.weeks) {
    return `The phases add up to ${phaseTotal} weeks but the plan is ${t.weeks}.`;
  }

  if ((t.phaseStructure.taper ?? 0) < 1) {
    return "Leave at least one taper week — nobody races into a peak.";
  }

  const mixValues = Object.values(t.weeklyMix);
  if (mixValues.some((v) => !Number.isInteger(v) || v < 0)) {
    return "Session counts have to be whole days.";
  }

  const days = mixValues.reduce((a, b) => a + b, 0);
  if (days !== 7) return `The weekly mix adds up to ${days} days, not 7.`;

  if ((t.weeklyMix.rest ?? 0) < 1) return "Leave at least one rest day a week.";
  if ((t.weeklyMix.long ?? 0) < 1) return "Every week needs a long run.";

  return null;
}

/** The built-in template for a distance, used until a coach writes their own. */
export function defaultTemplate(raceType: RaceType): CoachTemplate {
  return {
    id: null,
    raceType,
    name: DEFAULT_NAME[raceType],
    weeks: DEFAULT_WEEKS[raceType],
    phaseStructure: { ...DEFAULT_PHASES[raceType] },
    weeklyMix: { ...DEFAULT_MIX },
    isDefault: true,
  };
}

/** How many sessions a week actually asks for, rest excluded. */
export const runningDays = (mix: Record<string, number>): number =>
  Object.entries(mix)
    .filter(([k]) => k !== "rest")
    .reduce((sum, [, v]) => sum + v, 0);

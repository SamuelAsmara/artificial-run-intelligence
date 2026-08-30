/**
 * Anchoring a training plan to the athlete who has to run it.
 *
 * ## The problem this solves
 *
 * `generatePlan` originally sized every plan from a lookup table: a marathon
 * peaks at 70 km a week, a half at 55, and so on, regardless of who is running
 * it. For an athlete currently running 28 km a week whose longest run in the
 * last month is 10.3 km, that plan opens with a 14 km long run and climbs to 28.
 *
 * That is not a small inaccuracy. Runi's own safety model
 * (`sessionSpikeVsRecentMax`) would flag the very first long run of that plan as
 * a 36% jump over recent maximum — the "moderate" band, hazard ratio 1.52. The
 * app would have been generating sessions it then warns you about.
 *
 * So the plan is built from two things the athlete actually has: how much they
 * are running now, and how far their longest recent run went. Everything else
 * is derived by ramping from there.
 *
 * ## The two ramps
 *
 * **Weekly volume** grows by a fixed percentage per progression week, with
 * every fourth week cut back. The step-back week isn't decoration: it is where
 * adaptation is consolidated, and it is what stops the acute:chronic ratio from
 * ratcheting upward for months.
 *
 * **Long run** grows by at most 10% over the athlete's own recent maximum per
 * progression. That figure is not arbitrary — it is the top of the band that
 * Frandsen et al. (BJSM 2025) associate with no elevated injury hazard, and it
 * is the same threshold `sessionSpikeVsRecentMax` uses. The plan generator and
 * the safety checker therefore agree by construction.
 *
 * ## Saying "no"
 *
 * If the race is too close for the athlete to reach the distance safely, this
 * says so rather than generating an aggressive plan and hoping. That is the
 * single most useful thing a coach does and almost no training app does it.
 */

import type { RaceType } from "@/types/database.types";

/** What the athlete is actually doing right now. */
export interface AthleteCapacity {
  /** mean weekly distance over the last four weeks, in metres */
  currentWeeklyM: number;
  /** longest single run in the last 30 days, in metres */
  longestRecentM: number;
}

export interface CapacityPlan {
  /** weekly volume the plan builds to, metres */
  peakWeeklyM: number;
  /** longest run the plan builds to, metres */
  peakLongRunM: number;
  /** whether the race distance is reachable safely in the weeks available */
  achievable: boolean;
  /** how many progression weeks would have been needed to get there */
  weeksNeededForDistance: number;
  /** plain-language notes for the UI; the first is the headline */
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* constants, all stated rather than buried                            */
/* ------------------------------------------------------------------ */

/** Weekly volume growth on a progression week. 5–8% is the usual guidance. */
export const WEEKLY_RAMP = 0.07;

/**
 * Long-run growth per progression week.
 *
 * Frandsen et al. (BJSM 2025) find no elevated injury hazard for a session
 * within 10% of the athlete's recent maximum, and a hazard ratio of 1.64 once
 * it passes it. We ramp at 9% rather than 10% deliberately: sitting exactly on
 * a threshold means rounding a distance to the nearest 100 m can tip a session
 * into the elevated band. The margin costs about one extra week over a long
 * build and removes the whole class of off-by-a-rounding failures.
 */
export const LONG_RUN_RAMP = 0.09;

/** Every fourth week steps back to this fraction of the preceding week. */
export const STEP_BACK_FRACTION = 0.75;

/** One progression week in four is a step-back week. */
export const PROGRESSION_WEEKS_IN_CYCLE = 3;
export const CYCLE_LENGTH = 4;

/**
 * The long run a race realistically needs.
 *
 * Note the marathon figure is 32 km, not 42. Almost no plan has an amateur run
 * the full distance in training — the cost in recovery outweighs the benefit,
 * and race day carries you the rest.
 */
export const REQUIRED_LONG_RUN_M: Record<RaceType, number> = {
  "5k": 10_000,
  "10k": 14_000,
  half: 20_000,
  full: 32_000,
};

/** Weekly volume a well-prepared athlete would peak at, by race. The ceiling. */
export const TARGET_PEAK_WEEKLY_M: Record<RaceType, number> = {
  "5k": 40_000,
  "10k": 50_000,
  half: 65_000,
  full: 80_000,
};

/**
 * A ceiling on the long run as a share of the week.
 *
 * A single session that is most of the week's running is a session you spend
 * the following days recovering from. Plans for lower-volume runners do push
 * this higher than the 30–35% you see in high-mileage programmes, so 45% is a
 * permissive ceiling rather than a target.
 */
export const LONG_RUN_MAX_SHARE = 0.45;

/** Floor for an athlete with almost no history, so a plan is still generated. */
const MIN_WEEKLY_M = 15_000;
const MIN_LONG_RUN_M = 5_000;

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const roundToHundred = (m: number) => Math.round(m / 100) * 100;

/* ------------------------------------------------------------------ */

/** How many of the first `weeks` weeks are progression rather than step-back. */
export function progressionWeeks(weeks: number): number {
  const fullCycles = Math.floor(weeks / CYCLE_LENGTH);
  const remainder = weeks % CYCLE_LENGTH;
  return fullCycles * PROGRESSION_WEEKS_IN_CYCLE + Math.min(remainder, PROGRESSION_WEEKS_IN_CYCLE);
}

/** Weeks of progression needed to grow `from` to `to` at `ramp` per week. */
export function weeksToReach(from: number, to: number, ramp: number): number {
  if (from <= 0) return Infinity;
  if (to <= from) return 0;
  return Math.ceil(Math.log(to / from) / Math.log(1 + ramp));
}

/**
 * Works out what this athlete can safely build to, in the weeks they have.
 *
 * @param buildWeeks weeks of building available — the plan minus its taper
 */
export function planCapacity(
  raceType: RaceType,
  buildWeeks: number,
  athlete: AthleteCapacity,
): CapacityPlan {
  const startWeekly = Math.max(MIN_WEEKLY_M, athlete.currentWeeklyM);
  const startLong = Math.max(MIN_LONG_RUN_M, athlete.longestRecentM);

  const requiredLong = REQUIRED_LONG_RUN_M[raceType];
  const targetWeekly = TARGET_PEAK_WEEKLY_M[raceType];

  const growth = progressionWeeks(Math.max(0, buildWeeks));

  const reachableWeekly = startWeekly * Math.pow(1 + WEEKLY_RAMP, growth);
  const reachableLong = startLong * Math.pow(1 + LONG_RUN_RAMP, growth);

  const peakWeeklyM = roundToHundred(Math.min(reachableWeekly, targetWeekly));

  // The long run is limited by three separate things, and the binding one is
  // whichever is smallest: how far the ramp gets from where they are, what the
  // race actually needs, and how much of a week a single run should be.
  const shareCeiling = peakWeeklyM * LONG_RUN_MAX_SHARE;
  const peakLongRunM = roundToHundred(
    Math.min(reachableLong, requiredLong, shareCeiling),
  );

  const achievable = peakLongRunM >= requiredLong;
  const limitedByWeeklyVolume = shareCeiling < Math.min(reachableLong, requiredLong);

  // Convert the progression weeks needed back into calendar weeks, since one
  // week in four is a step-back and does not progress anything.
  const progressionNeeded = weeksToReach(startLong, requiredLong, LONG_RUN_RAMP);
  const weeksNeededForDistance = Math.ceil(
    (progressionNeeded / PROGRESSION_WEEKS_IN_CYCLE) * CYCLE_LENGTH,
  );

  const notes: string[] = [];

  if (achievable) {
    notes.push(
      `Built from where you are now: ${km(startWeekly)} a week, longest run ${km(startLong)}. ` +
        `The plan grows that to ${km(peakWeeklyM)} a week and a ${km(peakLongRunM)} long run.`,
    );
  } else if (limitedByWeeklyVolume) {
    notes.push(
      `A ${km(requiredLong)} long run would be more than ${Math.round(LONG_RUN_MAX_SHARE * 100)}% ` +
        `of the ${km(peakWeeklyM)} week this plan builds to. One run that dominates the week ` +
        `costs more in recovery than it returns, so the long run is held at ${km(peakLongRunM)}. ` +
        `Reaching the full distance safely means starting from a higher weekly volume, not a longer single run.`,
    );
  } else {
    notes.push(
      `There isn't enough time to reach a ${km(requiredLong)} long run safely. ` +
        `From ${km(startLong)}, growing ${Math.round(LONG_RUN_RAMP * 100)}% at a time, that needs about ` +
        `${weeksNeededForDistance} weeks of building — you have ${buildWeeks}. ` +
        `This plan builds to ${km(peakLongRunM)} instead.`,
    );
    notes.push(
      `You can still run the race. It means going in under-prepared for the distance, ` +
        `which is a decision worth making deliberately rather than discovering at 30 km.`,
    );
  }

  if (peakWeeklyM >= targetWeekly) {
    notes.push(
      `Weekly volume is capped at ${km(targetWeekly)} — beyond that the extra fatigue ` +
        `costs more than the extra fitness returns for most amateur runners.`,
    );
  }

  notes.push(
    `Every fourth week steps back to ${Math.round(STEP_BACK_FRACTION * 100)}% ` +
      `so the training is absorbed rather than just accumulated.`,
  );

  return { peakWeeklyM, peakLongRunM, achievable, weeksNeededForDistance, notes };
}

/**
 * The volume multiplier for a given week: a rising ramp with a step-back every
 * fourth week, expressed as a fraction of the plan's peak.
 */
export function weekVolumeFraction(
  week: number,
  buildWeeks: number,
  startFraction: number,
): number {
  if (week > buildWeeks) return 1; // caller handles the taper
  const isStepBack = week % CYCLE_LENGTH === 0;
  const grown = progressionWeeks(week);
  const total = Math.max(1, progressionWeeks(buildWeeks));
  const linear = startFraction + (1 - startFraction) * (grown / total);
  return isStepBack ? linear * STEP_BACK_FRACTION : linear;
}

/**
 * The long run for a given week, in metres.
 *
 * Ramped from the athlete's own recent maximum rather than taken as a share of
 * the week, because the long run is the anchor a plan is built around and the
 * single session most likely to spike. Step-back weeks cut it too — a recovery
 * week that keeps the long run is not a recovery week.
 */
export function weekLongRunM(
  week: number,
  buildWeeks: number,
  athlete: AthleteCapacity,
  capacity: CapacityPlan,
): number {
  const start = Math.max(MIN_LONG_RUN_M, athlete.longestRecentM);
  const grown = progressionWeeks(Math.min(week, buildWeeks));
  const ramped = start * Math.pow(1 + LONG_RUN_RAMP, grown);
  const capped = Math.min(ramped, capacity.peakLongRunM);
  const isStepBack = week % CYCLE_LENGTH === 0;
  return roundToHundred(isStepBack ? capped * STEP_BACK_FRACTION : capped);
}

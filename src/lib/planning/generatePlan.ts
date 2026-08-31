import { addDays, differenceInCalendarWeeks, startOfWeek } from "date-fns";
import { isoDate, WEEK_STARTS_ON } from "@/lib/time/week";

/**
 * The plan's weeks must be the same seven days as everything else's.
 *
 * This file used `weekStartsOn: 1` while `lib/time/week` — which the coach's
 * board, the dashboard's volume bars and the plan strip all read — is Sunday.
 * The two agreed Monday to Saturday and disagreed every Sunday, so on Sundays
 * the plan strip and the race card printed different week numbers for the same
 * day, on the same screen.
 */
const WEEK_OPTS = { weekStartsOn: WEEK_STARTS_ON as 0 | 1 } as const;
import type { RaceType, WorkoutType } from "@/types/database.types";
import {
  planCapacity, weekLongRunM, weekVolumeFraction,
  type AthleteCapacity, type CapacityPlan,
} from "./capacity";

/**
 * מנוע יצירת תוכנית (Periodization) — מסמך תכנון טכני §6.
 * מחלק את השבועות עד המרוץ לארבע פאזות: בסיס / בנייה / שיא / טייפר.
 * הטייפר תופס 10%-20% מהתקופה הכוללת.
 */

export type Phase = "base" | "build" | "peak" | "taper";

export interface PlannedWorkout {
  weekNumber: number;
  dayDate: string; // ISO date
  workoutType: WorkoutType;
  phase: Phase;
  plannedDistance: number | null; // מטרים, null עבור rest
}

export interface GeneratedPlan {
  totalWeeks: number;
  phases: Record<Phase, { startWeek: number; endWeek: number }>;
  workouts: PlannedWorkout[];
  /**
   * What the plan was sized against, and whether the race distance is
   * reachable in the time available. Present whenever the caller supplied the
   * athlete's current volume; see ./capacity.ts for how it is derived.
   */
  capacity?: CapacityPlan;
}

const MIN_WEEKS_FOR_FULL_PLAN = 4;

/**
 * A coach's structure, as the templates screen stores it.
 *
 * Only the two fields the generator can act on. `weeks` is deliberately not
 * here: the template's nominal length is a preference, and the race date is a
 * fact — a 14-week half-marathon template handed to somebody racing in nine
 * weeks has to become nine weeks, keeping the coach's *proportions*.
 */
export interface PlanStructure {
  /** e.g. { base: 6, build: 5, peak: 2, taper: 1 } */
  phaseStructure: Record<string, number>;
  /** e.g. { easy: 3, long: 1, interval: 1, rest: 2 } — seven days */
  weeklyMix: Record<string, number>;
}

/**
 * Where each kind of session prefers to sit in the week, best first.
 *
 * Sunday is offset 0, so Friday is 5 and Saturday is 6 — the Israeli weekend,
 * for the same reason `lib/time/week` starts the week on Sunday.
 *
 * The long run wants Friday. Rest wants Saturday, then the day after the hard
 * session. Intervals want mid-week with easy days either side. These are
 * preferences, not rules: whatever is still free gets filled in order, so any
 * mix that adds to seven produces a coherent week.
 */
const DAY_PREFERENCE: Record<string, number[]> = {
  long: [5, 6, 4, 0, 3, 2, 1],
  rest: [6, 1, 3, 0, 2, 4, 5],
  interval: [2, 4, 0, 3, 5, 1, 6],
  easy: [0, 4, 2, 3, 1, 5, 6],
};

/** Relative volume share of one session of each kind, before normalising. */
const SESSION_SHARE: Record<string, number> = {
  long: 0.4, interval: 0.25, easy: 0.2, rest: 0,
};

const TO_DB_TYPE: Record<string, WorkoutType> = {
  easy: "easy", long: "long", interval: "interval", rest: "rest",
};

/**
 * Lay a weekly mix out across seven days.
 *
 * The default pattern below is what this returns for `{easy:3, long:1,
 * interval:1, rest:2}`, which is why wiring a coach's template in changed
 * nothing for anybody who had not written one.
 */
export function weekPatternFrom(
  mix: Record<string, number>,
): { offset: number; type: WorkoutType; share: number }[] {
  const taken = new Set<number>();
  const placed: { offset: number; type: WorkoutType; share: number }[] = [];

  // Long first — it is the week's anchor and the hardest to move. Then rest, so
  // the recovery days land where they were wanted rather than on leftovers.
  for (const kind of ["long", "rest", "interval", "easy"]) {
    const count = Math.max(0, Math.trunc(mix[kind] ?? 0));
    const preference = DAY_PREFERENCE[kind] ?? [0, 1, 2, 3, 4, 5, 6];
    let placedOfKind = 0;
    for (const offset of preference) {
      if (placedOfKind >= count) break;
      if (taken.has(offset)) continue;
      taken.add(offset);
      placed.push({ offset, type: TO_DB_TYPE[kind] ?? "easy", share: SESSION_SHARE[kind] ?? 0.2 });
      placedOfKind++;
    }
  }

  // A mix that does not add to seven is caught by `validateTemplate` before it
  // is stored, but a row written before that check existed must still produce a
  // whole week rather than a partial one.
  for (let offset = 0; offset < 7; offset++) {
    if (!taken.has(offset)) placed.push({ offset, type: "rest", share: 0 });
  }

  const total = placed.reduce((sum, w) => sum + w.share, 0);
  return total > 0
    ? placed.map((w) => ({ ...w, share: w.share / total }))
    : placed;
}

/**
 * The coach's phase proportions, rescaled to the weeks actually available.
 *
 * Returns null for a structure that says nothing usable, so the caller keeps the
 * built-in per-race table rather than dividing by zero.
 */
function ratiosFrom(structure: Record<string, number>): [number, number, number, number] | null {
  const values = (["base", "build", "peak", "taper"] as const).map((k) =>
    Math.max(0, Number(structure[k] ?? 0)),
  );
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return values.map((v) => v / total) as [number, number, number, number];
}

// יחס בסיסי לחלוקת שבועות לפי סוג מרוץ (base/build/peak/taper)
const PHASE_RATIOS: Record<RaceType, [number, number, number, number]> = {
  "5k": [0.3, 0.35, 0.2, 0.15],
  "10k": [0.3, 0.35, 0.2, 0.15],
  half: [0.35, 0.3, 0.2, 0.15],
  full: [0.35, 0.3, 0.15, 0.2],
};

// ק"מ שיא שבועי בערך גס לפי סוג מרוץ — ממנו נגזר תמהיל האימונים (mock, לצורך MVP)
const PEAK_WEEKLY_KM: Record<RaceType, number> = {
  "5k": 30,
  "10k": 40,
  half: 55,
  full: 70,
};

export class RaceTooSoonError extends Error {
  constructor(public weeksAvailable: number) {
    super(
      `Not enough time for a full plan — ${weeksAvailable} week${weeksAvailable === 1 ? "" : "s"} left, and a plan needs at least ${MIN_WEEKS_FOR_FULL_PLAN}.`
    );
    this.name = "RaceTooSoonError";
  }
}

/**
 * @throws {RaceTooSoonError} אם תאריך המרוץ קרוב מדי לבניית תוכנית הגיונית
 *   (מסמך אפיון בדיקות §6 — "מקרי קצה").
 */
export function generatePlan(
  raceType: RaceType,
  raceDate: Date,
  today: Date = new Date(),
  /**
   * The athlete's current training, used to size the plan. Omit it and the plan
   * falls back to the generic per-race table, which is what the original
   * version always did — kept so existing callers and tests keep working, but
   * every real caller should pass this.
   */
  athlete?: AthleteCapacity,
  /**
   * The coach's template, when the athlete has a coach who wrote one.
   *
   * The templates screen has been saving these to `plan_templates` and nothing
   * read them back — a coach could spend twenty minutes tuning a structure, see
   * "Saved", and change nothing, ever. Optional, and omitting it reproduces the
   * built-in structure exactly, which is what every existing test asserts.
   */
  template?: PlanStructure,
): GeneratedPlan {
  const totalWeeks = Math.max(1, differenceInCalendarWeeks(raceDate, today, WEEK_OPTS));

  if (totalWeeks < MIN_WEEKS_FOR_FULL_PLAN) {
    throw new RaceTooSoonError(totalWeeks);
  }

  /*
   * The coach's proportions when there are any, ours otherwise.
   *
   * Proportions rather than week counts: the template's nominal length is a
   * preference and the race date is a fact. A 14-week half-marathon template
   * given to somebody racing in nine weeks becomes nine weeks that keep the
   * coach's shape, instead of a plan that ends five weeks after the race.
   */
  const [baseRatio, buildRatio, peakRatio, taperRatio] =
    (template ? ratiosFrom(template.phaseStructure) : null) ?? PHASE_RATIOS[raceType];

  const baseWeeks = Math.max(1, Math.round(totalWeeks * baseRatio));
  const buildWeeks = Math.max(1, Math.round(totalWeeks * buildRatio));
  const taperWeeks = Math.max(1, Math.round(totalWeeks * taperRatio));
  const peakWeeks = Math.max(1, totalWeeks - baseWeeks - buildWeeks - taperWeeks);

  const phases: GeneratedPlan["phases"] = {
    base: { startWeek: 1, endWeek: baseWeeks },
    build: { startWeek: baseWeeks + 1, endWeek: baseWeeks + buildWeeks },
    peak: { startWeek: baseWeeks + buildWeeks + 1, endWeek: baseWeeks + buildWeeks + peakWeeks },
    taper: {
      startWeek: baseWeeks + buildWeeks + peakWeeks + 1,
      endWeek: totalWeeks,
    },
  };

  const phaseForWeek = (week: number): Phase => {
    if (week <= phases.base.endWeek) return "base";
    if (week <= phases.build.endWeek) return "build";
    if (week <= phases.peak.endWeek) return "peak";
    return "taper";
  };

  // עצימות יחסית לשבוע (חלק מהעומס השיאי) — עולה עד השיא, יורדת בטייפר
  const intensityForWeek = (week: number, phase: Phase): number => {
    if (phase === "base") return 0.5 + 0.3 * (week / Math.max(1, baseWeeks));
    if (phase === "build") return 0.65 + 0.25 * ((week - baseWeeks) / Math.max(1, buildWeeks));
    if (phase === "peak") return 0.95 + 0.05 * ((week - baseWeeks - buildWeeks) / Math.max(1, peakWeeks));
    const taperProgress = (week - baseWeeks - buildWeeks - peakWeeks) / Math.max(1, taperWeeks);
    return 0.9 - 0.5 * taperProgress; // יורד לכ-40% מהשיא בשבוע האחרון
  };

  // Weeks of actual building — the taper does not grow anything.
  const buildingWeeks = totalWeeks - taperWeeks;

  const capacity = athlete ? planCapacity(raceType, buildingWeeks, athlete) : undefined;

  const peakWeeklyMeters = capacity
    ? capacity.peakWeeklyM
    : PEAK_WEEKLY_KM[raceType] * 1000;

  // Where the ramp starts, as a fraction of its peak. Anchored to what the
  // athlete is running now rather than to a fixed 50% of an arbitrary target.
  const startFraction = capacity
    ? Math.min(0.95, Math.max(0.4, athlete!.currentWeeklyM / capacity.peakWeeklyM))
    : 0.5;

  const planStart = startOfWeek(today, WEEK_OPTS);
  const workouts: PlannedWorkout[] = [];

  /*
   * Offsets are from the start of the week, which is Sunday.
   *
   *   Sun easy · Mon rest · Tue interval · Wed rest · Thu easy · Fri long · Sat rest
   *
   * The long run lands on Friday and the full rest day on Saturday, which is
   * the Israeli weekend rather than the European one — the same reason
   * `lib/time/week` starts the week on Sunday in the first place.
   */
  /*
   * The hard-coded week below and the template screen's default disagree.
   *
   * `DEFAULT_MIX` in lib/coach/templates.ts is three easy days, a long run, an
   * interval session and two rest days — five running days, and what the coach
   * has always been shown. This pattern is two easy, one interval, one long and
   * *three* rest — four. The screen described a plan nobody was building.
   *
   * Passing a template settles it in favour of the thing a coach can see and
   * change. This stays as the answer when no template exists at all, so a plan
   * built before `plan_templates` was seeded still comes out the same.
   */
  const weekWorkoutPattern: { offset: number; type: WorkoutType; share: number }[] = template
    ? weekPatternFrom(template.weeklyMix)
    : [
        { offset: 0, type: "easy", share: 0.2 },
        { offset: 2, type: "interval", share: 0.25 },
        { offset: 4, type: "easy", share: 0.15 },
        { offset: 5, type: "long", share: 0.4 },
        { offset: 1, type: "rest", share: 0 },
        { offset: 3, type: "rest", share: 0 },
        { offset: 6, type: "rest", share: 0 },
      ];

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = phaseForWeek(week);
    // With a capacity model the ramp comes from the athlete's own starting
    // point and includes a step-back every fourth week; without one it falls
    // back to the original phase-based curve.
    const weekLoadMeters = capacity
      ? peakWeeklyMeters *
        (phase === "taper"
          ? intensityForWeek(week, phase)
          : weekVolumeFraction(week, buildingWeeks, startFraction))
      : peakWeeklyMeters * intensityForWeek(week, phase);
    const weekStart = addDays(planStart, (week - 1) * 7);

    // With a capacity model the long run is set first, from its own ramp, and
    // the rest of the week is whatever volume remains. Without one, every
    // session is a fixed share of the week as before.
    const longRun = capacity ? weekLongRunM(week, buildingWeeks, athlete!, capacity) : null;

    const otherShareTotal = weekWorkoutPattern
      .filter((w) => w.type !== "long" && w.type !== "rest")
      .reduce((sum, w) => sum + w.share, 0);
    const remaining = longRun === null ? 0 : Math.max(0, weekLoadMeters - longRun);

    for (const { offset, type, share } of weekWorkoutPattern) {
      let plannedDistance: number | null;
      if (type === "rest") {
        plannedDistance = null;
      } else if (longRun === null) {
        plannedDistance = Math.round(weekLoadMeters * share);
      } else if (type === "long") {
        plannedDistance = longRun;
      } else {
        plannedDistance = Math.round((remaining * share) / otherShareTotal);
      }

      workouts.push({
        weekNumber: week,
        // Local calendar date — a UTC one is yesterday for an athlete in Israel
        // for the first two or three hours of every day.
        dayDate: isoDate(addDays(weekStart, offset)),
        workoutType: type,
        phase,
        plannedDistance,
      });
    }
  }

  return { totalWeeks, phases, workouts, capacity };
}

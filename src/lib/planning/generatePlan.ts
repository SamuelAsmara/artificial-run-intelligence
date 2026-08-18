import { addDays, differenceInCalendarWeeks, startOfWeek } from "date-fns";
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
      `אין מספיק זמן לבניית תוכנית מלאה — נותרו ${weeksAvailable} שבועות בלבד (מינימום ${MIN_WEEKS_FOR_FULL_PLAN}).`
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
): GeneratedPlan {
  const totalWeeks = Math.max(1, differenceInCalendarWeeks(raceDate, today, { weekStartsOn: 1 }));

  if (totalWeeks < MIN_WEEKS_FOR_FULL_PLAN) {
    throw new RaceTooSoonError(totalWeeks);
  }

  const [baseRatio, buildRatio, peakRatio, taperRatio] = PHASE_RATIOS[raceType];

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

  const planStart = startOfWeek(today, { weekStartsOn: 1 });
  const workouts: PlannedWorkout[] = [];

  const weekWorkoutPattern: { offset: number; type: WorkoutType; share: number }[] = [
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
        dayDate: addDays(weekStart, offset).toISOString().slice(0, 10),
        workoutType: type,
        phase,
        plannedDistance,
      });
    }
  }

  return { totalWeeks, phases, workouts, capacity };
}

import { addDays, differenceInCalendarWeeks, startOfWeek } from "date-fns";
import type { RaceType, WorkoutType } from "@/types/database.types";

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
export function generatePlan(raceType: RaceType, raceDate: Date, today: Date = new Date()): GeneratedPlan {
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

  const peakWeeklyMeters = PEAK_WEEKLY_KM[raceType] * 1000;
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
    const weekLoadMeters = peakWeeklyMeters * intensityForWeek(week, phase);
    const weekStart = addDays(planStart, (week - 1) * 7);

    for (const { offset, type, share } of weekWorkoutPattern) {
      workouts.push({
        weekNumber: week,
        dayDate: addDays(weekStart, offset).toISOString().slice(0, 10),
        workoutType: type,
        phase,
        plannedDistance: type === "rest" ? null : Math.round(weekLoadMeters * share),
      });
    }
  }

  return { totalWeeks, phases, workouts };
}

import { ACWR_INJURY_RISK_THRESHOLD, calculateACWR, type DailyLoad } from "./acwr";
import type { WorkoutStatus } from "@/types/database.types";

/**
 * מנוע ההתאמה הדינמית — מסמך תכנון טכני §6.
 * שלוש כניסות: ACWR גבוה, cardiac drift מצטבר, אימונים שפוספסו.
 *
 * זוהי פונקציית ליבה טהורה (ניתנת לבדיקת unit ללא DB) — ה-Server Action
 * adjustPlan() ב-src/actions/plan.ts עוטפת אותה, שולפת/כותבת ל-Supabase.
 */

export interface WorkoutForAdjustment {
  id: string;
  weekNumber: number;
  status: WorkoutStatus;
  plannedDistance: number | null;
}

export interface AdjustmentDecision {
  workoutId: string;
  action: "reduce_intensity" | "shift_week" | "none";
  /** מקדם הפחתה (0-1) כאשר action === 'reduce_intensity' */
  reductionFactor?: number;
  reason: string;
}

const INTENSITY_REDUCTION_ON_HIGH_ACWR = 0.8; // מוריד ל-80% מהעומס המתוכנן
const MISSED_WORKOUTS_THRESHOLD_PER_WEEK = 1; // "יותר מפעם אחת" = 2+

export function decideAdjustments(
  upcomingWeekWorkouts: WorkoutForAdjustment[],
  dailyLoads: DailyLoad[],
  cumulativeHighDriftRate: number // 0-1: שיעור אימונים עם drift משמעותי לאחרונה
): AdjustmentDecision[] {
  const decisions: AdjustmentDecision[] = [];

  const acwrResult = calculateACWR(dailyLoads);
  const highAcwr = acwrResult.acwr !== null && acwrResult.acwr > ACWR_INJURY_RISK_THRESHOLD;

  const missedThisWeek = upcomingWeekWorkouts.filter((w) => w.status === "missed").length;
  const missedTooMany = missedThisWeek > MISSED_WORKOUTS_THRESHOLD_PER_WEEK;

  for (const workout of upcomingWeekWorkouts) {
    if (workout.status !== "planned") {
      decisions.push({ workoutId: workout.id, action: "none", reason: "אימון לא ממתין להתאמה" });
      continue;
    }

    if (missedTooMany) {
      // אימון שפוספס יותר מפעם אחת בשבוע -> מזיזים את שבוע הבנייה קדימה,
      // לא "מדביקים פער" בבת אחת (מסמך תכנון טכני §6).
      decisions.push({
        workoutId: workout.id,
        action: "shift_week",
        reason: `${missedThisWeek} אימונים פוספסו השבוע — דוחים את שלב הבנייה קדימה במקום להכביד עומס`,
      });
      continue;
    }

    if (highAcwr) {
      decisions.push({
        workoutId: workout.id,
        action: "reduce_intensity",
        reductionFactor: INTENSITY_REDUCTION_ON_HIGH_ACWR,
        reason: `ACWR = ${acwrResult.acwr?.toFixed(2)} (מעל ${ACWR_INJURY_RISK_THRESHOLD}) — מוריד עצימות למניעת פציעת עומס-יתר`,
      });
      continue;
    }

    if (cumulativeHighDriftRate >= 0.4) {
      decisions.push({
        workoutId: workout.id,
        action: "reduce_intensity",
        reductionFactor: INTENSITY_REDUCTION_ON_HIGH_ACWR,
        reason: `שיעור גבוה של cardiac drift באימונים אחרונים (${Math.round(
          cumulativeHighDriftRate * 100
        )}%) — סימן לעייפות/התייבשות מצטברת`,
      });
      continue;
    }

    decisions.push({ workoutId: workout.id, action: "none", reason: "אין צורך בהתאמה" });
  }

  return decisions;
}

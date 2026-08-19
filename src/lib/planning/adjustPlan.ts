import { ACWR_INJURY_RISK_THRESHOLD, calculateACWR, type DailyLoad } from "./acwr";
import type { WorkoutOrigin, WorkoutStatus } from "@/types/database.types";

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
  /**
   * Whose decision this session's numbers are — see migration 0014.
   *
   * Anything a person set is out of the engine's reach. Optional so existing
   * callers and tests keep working; absent means "generated", which is what
   * every row was before the column existed.
   */
  origin?: WorkoutOrigin;
  /** what it was before an automatic reduction, if one is in force */
  plannedDistanceOriginal?: number | null;
}

export interface AdjustmentDecision {
  workoutId: string;
  /**
   * `restore` puts an automatic reduction back.
   *
   * Without it a cut was permanent: the engine skips anything whose status is
   * not 'planned', which correctly stops a reduction compounding night after
   * night, and also meant there was no way back once ACWR came down. The week
   * stayed at 80% for ever, unmarked and unexplained.
   */
  action: "reduce_intensity" | "shift_week" | "restore" | "none";
  /** מקדם הפחתה (0-1) כאשר action === 'reduce_intensity' */
  reductionFactor?: number;
  reason: string;
}

const INTENSITY_REDUCTION_ON_HIGH_ACWR = 0.8; // מוריד ל-80% מהעומס המתוכנן
const MISSED_WORKOUTS_THRESHOLD_PER_WEEK = 1; // "יותר מפעם אחת" = 2+

export function decideAdjustments(
  upcomingWeekWorkouts: WorkoutForAdjustment[],
  dailyLoads: DailyLoad[],
  cumulativeHighDriftRate: number, // 0-1: שיעור אימונים עם drift משמעותי לאחרונה
  /**
   * התאריך שממנו סופרים אחורה. חובה להזריק אותו בטסטים — בלי זה הפונקציה
   * תלויה בשעון המערכת, והטסטים נשברים מעצמם כשעובר הזמן.
   */
  asOf: Date = new Date(),
): AdjustmentDecision[] {
  const decisions: AdjustmentDecision[] = [];

  const acwrResult = calculateACWR(dailyLoads, asOf);
  const highAcwr = acwrResult.acwr !== null && acwrResult.acwr > ACWR_INJURY_RISK_THRESHOLD;

  const missedThisWeek = upcomingWeekWorkouts.filter((w) => w.status === "missed").length;
  const missedTooMany = missedThisWeek > MISSED_WORKOUTS_THRESHOLD_PER_WEEK;

  const needsRestraint = highAcwr || cumulativeHighDriftRate >= 0.4;

  for (const workout of upcomingWeekWorkouts) {
    /*
     * A person set this. Leave it alone.
     *
     * `updateWorkout` leaves `status` at 'planned', which is exactly the state
     * this loop is hunting for, so a coach's Thursday 18 km became 14.4 km
     * overnight with nothing on screen to say why. Provenance, not status, is
     * what says "this was a decision".
     */
    if (workout.origin === "coach" || workout.origin === "athlete") {
      decisions.push({ workoutId: workout.id, action: "none", reason: "אימון שנקבע ידנית — המנוע לא נוגע בו" });
      continue;
    }

    /*
     * An earlier reduction whose reason has passed.
     *
     * This is the only branch that looks at an already-adjusted session, and it
     * only ever puts distance back — so it cannot deepen a cut, and it cannot
     * fight with the reduction branch below, which requires 'planned'.
     */
    if (workout.status === "adjusted" && workout.plannedDistanceOriginal != null) {
      decisions.push(
        needsRestraint
          ? { workoutId: workout.id, action: "none", reason: "ההתאמה עדיין בתוקף" }
          : {
              workoutId: workout.id,
              action: "restore",
              reason: "העומס חזר לטווח הבטוח — מחזירים את האימון למרחק המקורי",
            },
      );
      continue;
    }

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

import { ACWR_INJURY_RISK_THRESHOLD, calculateACWR, type DailyLoad } from "./acwr";
import type { WorkoutOrigin, WorkoutStatus } from "@/types/database.types";

/**
 * The adaptation engine (Technical design §6).
 *
 * Three inputs decide whether the coming week should be lightened: a high
 * acute:chronic workload ratio, a run of sessions with high cardiac drift, and
 * sessions the athlete missed. The function is pure — rows in, decisions out —
 * so it is unit-tested without a database; `runAdjustment.ts` reads the rows,
 * calls it, and writes the decisions back.
 *
 * Two of the decisions are applied automatically (`reduce_intensity` and its
 * mirror `restore`); `shift_week` is advisory only — see the note on it below.
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
   * `restore` puts an automatic reduction back once its cause has passed;
   * without it a cut would be permanent, because the engine only touches
   * sessions that are still `planned`.
   *
   * `shift_week` is a recommendation, not an action: moving a build week is a
   * decision the athlete or coach should confirm, so the runner never applies
   * it. Surfacing it for confirmation is planned for the next version.
   */
  action: "reduce_intensity" | "shift_week" | "restore" | "none";
  /** multiplier (0–1) applied to the planned distance when action is `reduce_intensity` */
  reductionFactor?: number;
  /** one sentence, shown next to the session so the athlete knows why */
  reason: string;
}

/** A reduction takes the session to 80% of its planned distance. */
const INTENSITY_REDUCTION_ON_HIGH_ACWR = 0.8;
/** "more than once a week" — two or more missed sessions triggers a shift recommendation. */
const MISSED_WORKOUTS_THRESHOLD_PER_WEEK = 1;
/** Share of recent runs with high cardiac drift that reads as accumulated fatigue. */
export const HIGH_DRIFT_RATE_THRESHOLD = 0.4;

export function decideAdjustments(
  upcomingWeekWorkouts: WorkoutForAdjustment[],
  dailyLoads: DailyLoad[],
  /** 0–1: share of recent runs whose cardiac drift was high — see `highDriftRate` */
  cumulativeHighDriftRate: number,
  /**
   * The date to count back from. Tests must pass it explicitly; otherwise the
   * function depends on the system clock and the tests age out by themselves.
   */
  asOf: Date = new Date(),
): AdjustmentDecision[] {
  const decisions: AdjustmentDecision[] = [];

  const acwrResult = calculateACWR(dailyLoads, asOf);
  const highAcwr = acwrResult.acwr !== null && acwrResult.acwr > ACWR_INJURY_RISK_THRESHOLD;
  const highDrift = cumulativeHighDriftRate >= HIGH_DRIFT_RATE_THRESHOLD;

  const missedThisWeek = upcomingWeekWorkouts.filter((w) => w.status === "missed").length;
  const missedTooMany = missedThisWeek > MISSED_WORKOUTS_THRESHOLD_PER_WEEK;

  const needsRestraint = highAcwr || highDrift;

  for (const workout of upcomingWeekWorkouts) {
    /*
     * A person set this. Leave it alone.
     *
     * `updateWorkout` leaves `status` at 'planned', which is exactly the state
     * this loop is hunting for, so provenance — not status — is what says
     * "this was a decision".
     */
    if (workout.origin === "coach" || workout.origin === "athlete") {
      decisions.push({
        workoutId: workout.id,
        action: "none",
        reason: "Set by hand — the engine leaves it alone",
      });
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
          ? { workoutId: workout.id, action: "none", reason: "Reduction still in force" }
          : {
              workoutId: workout.id,
              action: "restore",
              reason: "Load is back in the safe range — restoring the original distance",
            },
      );
      continue;
    }

    if (workout.status !== "planned") {
      decisions.push({ workoutId: workout.id, action: "none", reason: "Not awaiting adjustment" });
      continue;
    }

    if (missedTooMany) {
      // Two or more sessions missed this week: recommend pushing the build
      // week forward rather than piling the missed load onto the next one.
      decisions.push({
        workoutId: workout.id,
        action: "shift_week",
        reason: `${missedThisWeek} sessions missed this week — recommend moving the build week forward instead of adding load`,
      });
      continue;
    }

    if (highAcwr) {
      decisions.push({
        workoutId: workout.id,
        action: "reduce_intensity",
        reductionFactor: INTENSITY_REDUCTION_ON_HIGH_ACWR,
        reason: `ACWR ${acwrResult.acwr?.toFixed(2)} (above ${ACWR_INJURY_RISK_THRESHOLD}) — reduced to 80% to lower overload risk`,
      });
      continue;
    }

    if (highDrift) {
      decisions.push({
        workoutId: workout.id,
        action: "reduce_intensity",
        reductionFactor: INTENSITY_REDUCTION_ON_HIGH_ACWR,
        reason: `High cardiac drift in ${Math.round(cumulativeHighDriftRate * 100)}% of recent runs — a sign of accumulated fatigue, reduced to 80%`,
      });
      continue;
    }

    decisions.push({ workoutId: workout.id, action: "none", reason: "No adjustment needed" });
  }

  return decisions;
}

/** A run whose heart rate climbed more than this at a steady pace counts as high drift. */
export const HIGH_DRIFT_PCT = 5;

/**
 * Share (0–1) of recent runs whose cardiac drift was high. Runs without a
 * drift figure (no heart-rate stream) are left out of both numerator and
 * denominator; with fewer than three scored runs the rate is 0, because one
 * bad day is not a pattern.
 */
export function highDriftRate(drifts: Array<number | null | undefined>): number {
  const scored = drifts.filter((d): d is number => typeof d === "number" && Number.isFinite(d));
  if (scored.length < 3) return 0;
  const high = scored.filter((d) => d > HIGH_DRIFT_PCT).length;
  return high / scored.length;
}

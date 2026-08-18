/**
 * Prescribing a pace for each session.
 *
 * A plan that says "6 km" is a distance target. A plan that says "6 km at
 * 5:49/km" is a training session — the pace is what decides whether the run
 * develops aerobic base or digs a hole.
 *
 * Every pace here is expressed as a ratio of the athlete's own threshold speed,
 * which `estimateThresholds` learns from their fastest sustained efforts. That
 * matters: percentage-of-threshold zones travel between athletes of wildly
 * different ability, whereas absolute paces do not, and age-predicted zones are
 * wrong for most people.
 *
 * The ratios follow the conventional physiological anchors:
 *
 *   - **Easy** runs sit around 75–80% of threshold speed. This is the pace most
 *     amateurs get wrong, running easy days too hard and hard days too easy —
 *     the widely-observed "moderate intensity rut".
 *   - **Long** runs are easy pace, marginally slower, because the duration is
 *     the stimulus rather than the speed.
 *   - **Interval** reps sit above threshold, around 105–108% of threshold
 *     speed, which is roughly 5K race effort for a trained runner.
 *   - **Tempo** work is threshold itself, by definition.
 */

import type { WorkoutType } from "@/types/database.types";
import { formatPace } from "@/lib/format/pace";

/**
 * Session pace as a fraction of threshold *speed*, not threshold pace.
 * Below 1 is slower than threshold, above 1 is faster.
 */
export const PACE_RATIO: Record<Exclude<WorkoutType, "rest">, number> = {
  easy: 0.78,
  long: 0.76,
  interval: 1.06,
};

/**
 * Seconds per kilometre for a session type.
 *
 * @param thresholdSpeedMps metres per second at lactate threshold
 * @returns seconds per km, or null for a rest day or an unusable threshold
 */
export function paceForWorkout(
  workoutType: WorkoutType,
  thresholdSpeedMps: number,
): number | null {
  if (workoutType === "rest") return null;
  if (!Number.isFinite(thresholdSpeedMps) || thresholdSpeedMps <= 0) return null;

  const speed = thresholdSpeedMps * PACE_RATIO[workoutType];
  if (speed <= 0) return null;
  return 1000 / speed;
}

/** The same thing as "5:49", ready to store in `plan_workouts.planned_pace`. */
export function paceLabel(
  workoutType: WorkoutType,
  thresholdSpeedMps: number,
): string | null {
  const secPerKm = paceForWorkout(workoutType, thresholdSpeedMps);
  return secPerKm === null ? null : formatPace(secPerKm);
}

/**
 * A one-line description of a session, the way the dashboard shows it:
 * "6.0 km @ 5:49/km". Falls back to distance alone when no threshold is known.
 */
export function describeSession(
  workoutType: WorkoutType,
  plannedDistanceM: number | null,
  thresholdSpeedMps: number | null,
): string {
  if (workoutType === "rest") return "Rest";
  if (!plannedDistanceM || plannedDistanceM <= 0) return "—";

  const distance = `${(plannedDistanceM / 1000).toFixed(1)} km`;
  const pace = thresholdSpeedMps ? paceLabel(workoutType, thresholdSpeedMps) : null;
  return pace ? `${distance} @ ${pace}/km` : distance;
}

/** Estimated duration in seconds, for "~49 min" on the session card. */
export function estimateDuration(
  workoutType: WorkoutType,
  plannedDistanceM: number | null,
  thresholdSpeedMps: number | null,
): number | null {
  if (workoutType === "rest" || !plannedDistanceM || !thresholdSpeedMps) return null;
  const secPerKm = paceForWorkout(workoutType, thresholdSpeedMps);
  if (secPerKm === null) return null;
  return Math.round((plannedDistanceM / 1000) * secPerKm);
}

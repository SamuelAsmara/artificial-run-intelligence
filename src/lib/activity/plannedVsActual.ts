/**
 * Comparing a run against the session that was planned for that day.
 *
 * ## Why this exists
 *
 * The activity page shipped with a "Planned vs actual" block whose text came
 * from the design prototype: *"Planned · Easy run, 6 km @ 5:30/km"*. It said
 * that beside every run, including a real 10 km one, which is how an athlete
 * ends up believing they opened somebody else's activity. A block that cannot
 * tell the truth should not be on screen, so `comparePlanned` returns null when
 * there is no planned session to compare against and the page renders nothing.
 *
 * ## What counts as on target
 *
 * Pace decides the verdict and distance only qualifies it. That ordering is
 * deliberate: running an easy day 20 s/km too fast is the mistake that costs
 * you the next session, while running 6.4 km instead of 6.0 km costs nothing.
 * The tolerance is ±10 s/km, matching the shaded band the chart draws, so the
 * words under the chart and the picture on it cannot disagree.
 *
 * ## Except when the distance is the story
 *
 * That ordering holds while the distance is roughly right. It stops holding
 * somewhere: an athlete who was given 6.6 km and ran 15.7 was told "pace came
 * in 20 s/km slower than planned" and nothing else — a note about pace, to
 * somebody who ran two and a half times the session. It read as though the app
 * had not noticed.
 *
 * So past {@link DISTANCE_HEADLINE} the distance is said first and the pace
 * second, and below it the distance note is appended rather than dropped. The
 * verdict tag still follows pace, because that is what the plan prescribed.
 *
 * Everything here is pure. It takes two plain objects and returns strings.
 */

import { formatPace } from "@/lib/format/pace";

/** Seconds per kilometre either side of plan that still counts as on target. */
export const PACE_TOLERANCE_S = 10;

/** How far the distance may drift before it is worth mentioning. */
export const DISTANCE_TOLERANCE = 0.1;

/**
 * Drift past which the distance leads the note rather than trailing it.
 *
 * A quarter is deliberately well clear of the ±10% that counts as "close
 * enough": between the two the distance is mentioned, and only past this is it
 * the first thing said.
 */
export const DISTANCE_HEADLINE = 0.25;

export interface PlannedSession {
  /** "easy" | "long" | "tempo" | "intervals" | "rest" | … */
  workoutType: string;
  plannedDistanceM: number | null;
  /** as stored: "5:30", minutes and seconds per kilometre */
  plannedPace: string | null;
}

export interface ActualRun {
  distanceM: number;
  durationS: number;
}

export type Verdict = "ontarget" | "toofast" | "tooslow" | "unplanned";

export interface Comparison {
  verdict: Verdict;
  /** the tag: "On target", "Too fast", … */
  label: string;
  /** css variable for the tag's text colour */
  color: string;
  /** "Planned · Easy run, 6.0 km @ 5:30/km" */
  plannedLine: string;
  /** "Actual · 6.2 km @ 5:24/km" */
  actualLine: string;
  /** one sentence of coaching, or "" when there is nothing worth saying */
  note: string;
  /** planned pace in seconds per kilometre, for the chart's band; null if none */
  plannedPaceSec: number | null;
}

/** "5:30" -> 330. Returns null on anything else. */
export function parsePaceLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(label.trim());
  if (!m) return null;
  const seconds = Number(m[1]) * 60 + Number(m[2]);
  // Under two minutes or over fifteen is not a running pace.
  return seconds >= 120 && seconds <= 900 ? seconds : null;
}

const TYPE_NAMES: Record<string, string> = {
  easy: "Easy run",
  long: "Long run",
  tempo: "Tempo run",
  intervals: "Intervals",
  recovery: "Recovery run",
  race: "Race",
  rest: "Rest",
};

const typeName = (t: string) => TYPE_NAMES[t] ?? t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Compares one run against the day's plan.
 *
 * Returns null when there is nothing honest to say — no planned session, or a
 * run with no distance or duration to compare.
 */
export function comparePlanned(
  planned: PlannedSession | null,
  actual: ActualRun,
): Comparison | null {
  if (actual.distanceM <= 0 || actual.durationS <= 0) return null;

  const actualKm = actual.distanceM / 1000;
  const actualPaceSec = actual.durationS / actualKm;
  const actualLine = `Actual · ${actualKm.toFixed(1)} km @ ${formatPace(actualPaceSec)}/km`;

  // A run on a rest day is a real event and worth naming, but it is not a
  // failure to hit a target that was never set.
  if (!planned || planned.workoutType === "rest") {
    if (!planned) return null;
    return {
      verdict: "unplanned",
      label: "Rest day",
      color: "var(--color-caution)",
      plannedLine: "Planned · Rest",
      actualLine,
      note:
        "Today was a rest day. One extra easy run is rarely a problem, but it is " +
        "load the plan did not account for.",
      plannedPaceSec: null,
    };
  }

  const plannedPaceSec = parsePaceLabel(planned.plannedPace);
  const plannedKm = planned.plannedDistanceM ? planned.plannedDistanceM / 1000 : null;

  const plannedLine =
    `Planned · ${typeName(planned.workoutType)}` +
    (plannedKm ? `, ${plannedKm.toFixed(1)} km` : "") +
    (plannedPaceSec ? ` @ ${formatPace(plannedPaceSec)}/km` : "");

  // Without a target pace there is no verdict to give. Say what was planned and
  // what happened, and stop there.
  if (plannedPaceSec === null) {
    return {
      verdict: "ontarget",
      label: "Logged",
      color: "var(--color-muted)",
      plannedLine,
      actualLine,
      note: distanceNote(plannedKm, actualKm),
      plannedPaceSec: null,
    };
  }

  // Negative means faster than planned, because pace counts down.
  const delta = Math.round(actualPaceSec - plannedPaceSec);
  const easyDay = planned.workoutType === "easy" || planned.workoutType === "recovery";

  if (Math.abs(delta) <= PACE_TOLERANCE_S) {
    return {
      verdict: "ontarget",
      label: "On target",
      color: "var(--color-positive)",
      plannedLine,
      actualLine,
      note:
        distanceNote(plannedKm, actualKm) ||
        "Pace landed inside the planned window.",
      plannedPaceSec,
    };
  }

  if (delta < 0) {
    const pace = easyDay
      ? `You ran ${-delta} s/km faster than planned on an easy day. That costs ` +
        "recovery — the next session assumes you kept this easy."
      : `${-delta} s/km faster than planned. Worth knowing why: good legs, or ` +
        "a target that is now too soft?";
    return {
      verdict: "toofast",
      label: "Too fast",
      color: "var(--color-caution)",
      plannedLine,
      actualLine,
      note: withDistance(pace, plannedKm, actualKm),
      plannedPaceSec,
    };
  }

  const pace =
    `Pace came in ${delta} s/km slower than planned. If you felt heavy, that is ` +
    "worth logging — fatigue may be higher than the model estimates.";

  return {
    verdict: "tooslow",
    label: "Below target",
    color: "var(--color-caution)",
    plannedLine,
    actualLine,
    note: withDistance(pace, plannedKm, actualKm),
    plannedPaceSec,
  };
}

/**
 * Puts the pace sentence and the distance sentence in the right order.
 *
 * Past {@link DISTANCE_HEADLINE} the distance goes first: it is the larger
 * departure from the plan and the one the athlete already knows about.
 */
function withDistance(
  paceSentence: string,
  plannedKm: number | null,
  actualKm: number,
): string {
  const distance = distanceNote(plannedKm, actualKm);
  if (!distance) return paceSentence;

  const drift =
    plannedKm && plannedKm > 0 ? Math.abs(actualKm - plannedKm) / plannedKm : 0;

  return drift > DISTANCE_HEADLINE
    ? `${distance} ${paceSentence}`
    : `${paceSentence} ${distance}`;
}

/** A sentence about distance, or "" when the distance was close enough. */
function distanceNote(plannedKm: number | null, actualKm: number): string {
  if (!plannedKm || plannedKm <= 0) return "";
  const drift = (actualKm - plannedKm) / plannedKm;
  if (Math.abs(drift) <= DISTANCE_TOLERANCE) return "";
  const km = Math.abs(actualKm - plannedKm).toFixed(1);
  return drift > 0
    ? `You went ${km} km further than planned.`
    : `You stopped ${km} km short of the planned distance.`;
}

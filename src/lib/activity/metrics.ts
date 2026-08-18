/**
 * The numbers the activity-analysis screen reports.
 *
 * Every function here is pure: it takes arrays and returns numbers. Nothing
 * fetches, nothing reads the database, nothing formats for display. That
 * matters because these are the claims the screen makes about an athlete's
 * training, and a claim you cannot test is a claim you should not print.
 */

import type { ChartStreams } from "./resample";
import { MOVING_MPS } from "./resample";

/* ------------------------------------------------------------------ */
/* Grade-adjusted pace                                                 */
/* ------------------------------------------------------------------ */

/**
 * The energy cost of running one metre at gradient `i`, in J/kg/m.
 *
 * Minetti et al. (2002), "Energy cost of walking and running at extreme uphill
 * and downhill slopes", J Appl Physiol 93(3). `i` is a fraction, not a
 * percentage: 0.05 is a 5% climb. The polynomial was fitted over −0.45 to 0.45
 * and is nonsense outside it, so callers clamp.
 *
 * Note the shape is not symmetric, and that is the interesting part. A gentle
 * descent is genuinely cheaper than the flat, but a steep one costs *more* than
 * the flat, because braking is work. Anyone who has run down a mountain knows
 * this; a linear grade adjustment does not.
 */
export function energyCost(i: number): number {
  const g = Math.max(-0.45, Math.min(0.45, i));
  return (
    155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6
  );
}

/** Cost on the flat, the denominator for every adjustment. */
export const FLAT_COST = energyCost(0);

/**
 * Grade-adjusted pace: the pace this effort would have produced on the flat.
 *
 * Answers the question a raw split cannot — "was that kilometre slow, or was it
 * uphill?" Each sample's speed is scaled by how much more or less that gradient
 * costs than level ground, and the adjusted speeds are averaged over distance
 * rather than over time, because a pace is distance-weighted by definition.
 *
 * Returns null when the run has no usable altitude or no movement.
 */
export function gradeAdjustedPace(s: ChartStreams): number | null {
  let adjustedMetres = 0;
  let seconds = 0;

  for (let i = 1; i < s.n; i++) {
    const dd = s.dist[i] - s.dist[i - 1];
    const dt = s.time[i] - s.time[i - 1];
    if (dd <= 0 || dt <= 0) continue;
    if (dd / dt < MOVING_MPS) continue; // standing still has no pace

    const rise = s.alt[i] - s.alt[i - 1];
    const gradient = Number.isFinite(rise) ? rise / dd : 0;
    // Distance that would have cost the same energy on the flat.
    adjustedMetres += dd * (energyCost(gradient) / FLAT_COST);
    seconds += dt;
  }

  if (adjustedMetres <= 0 || seconds <= 0) return null;
  return seconds / (adjustedMetres / 1000);
}

/* ------------------------------------------------------------------ */
/* Climb                                                               */
/* ------------------------------------------------------------------ */

/**
 * Metres of ascent, ignoring barometric noise.
 *
 * A barometric altimeter drifts by tens of centimetres from second to second.
 * Summing every positive change would turn an hour of flat running into a
 * hundred metres of imaginary climbing, which is why every platform applies a
 * threshold. Only a sustained rise of at least `CLIMB_THRESHOLD_M` counts.
 */
export const CLIMB_THRESHOLD_M = 1.5;

export function totalClimb(alt: number[]): number {
  let gain = 0;
  let anchor = alt.find(Number.isFinite);
  if (anchor === undefined) return 0;

  for (const a of alt) {
    if (!Number.isFinite(a)) continue;
    if (a > anchor + CLIMB_THRESHOLD_M) {
      gain += a - anchor;
      anchor = a;
    } else if (a < anchor) {
      anchor = a;
    }
  }
  return Math.round(gain);
}

/* ------------------------------------------------------------------ */
/* Drift onset                                                         */
/* ------------------------------------------------------------------ */

/** Samples either side of a point that the rolling ratio averages over. */
export const DRIFT_WINDOW_S = 300;
/** Baseline is taken from this stretch: past the warm-up, before the fatigue. */
export const BASELINE_FROM_S = 300;
export const BASELINE_TO_S = 900;
/** How far above baseline counts as drift. */
export const DRIFT_THRESHOLD = 1.05;
/**
 * And for how long it must stay there before we call it.
 *
 * This has to exceed the rolling window, and that is not an arbitrary choice —
 * it is forced. A five-minute rolling mean smears any three-minute event across
 * roughly eight minutes of output, so a three-minute persistence test can be
 * satisfied by the smear of a single hill. A test caught exactly that.
 */
export const PERSISTENCE_S = 300;

/**
 * Where cardiac drift began, in metres into the run.
 *
 * Cardiac drift is heart rate climbing while pace does not — the same work
 * costing more as the run goes on. We already report it as a percentage
 * (first half against second). This finds the moment it started, which is the
 * more useful coaching fact: an athlete can look at the chart and see what they
 * were doing when their body began to charge more for it.
 *
 * The definition, stated plainly so it can be argued with:
 *
 *   Take heart rate divided by speed in a five-minute rolling window. Baseline
 *   is the mean of that ratio between minutes five and fifteen — past the
 *   warm-up, before fatigue. Onset is the first moment the ratio goes 5% above
 *   baseline *and stays there for three minutes*.
 *
 * The persistence test is the load-bearing part. Without it every hill, every
 * traffic light and every stride would be reported as the onset of fatigue.
 *
 * Returns null when the run is too short, has no heart rate, or never drifted —
 * and null must be rendered as "no drift", never as zero.
 */
export function driftOnset(s: ChartStreams): number | null {
  const duration = s.time[s.n - 1] - s.time[0];
  if (duration < BASELINE_TO_S + PERSISTENCE_S) return null;

  // Speed corrected for gradient, so a climb does not look like fatigue.
  //
  // This is the difference between measuring drift and measuring terrain. Heart
  // rate rises on a hill for an honest reason — the work really is harder — and
  // a ratio built on raw speed reports that as the body failing. Dividing by
  // grade-adjusted speed asks the question we actually mean: is this effort
  // costing more than the same effort cost earlier?
  const effort: number[] = new Array(s.n).fill(0);
  for (let i = 1; i < s.n; i++) {
    const dd = s.dist[i] - s.dist[i - 1];
    const dt = s.time[i] - s.time[i - 1];
    if (dd <= 0 || dt <= 0) continue;
    const rise = s.alt[i] - s.alt[i - 1];
    const gradient = Number.isFinite(rise) ? rise / dd : 0;
    effort[i] = (dd / dt) * (energyCost(gradient) / FLAT_COST);
  }

  // Rolling heart-rate-to-effort ratio. Null wherever the athlete was not
  // running, because standing still has an undefined ratio, not a high one.
  const ratio: (number | null)[] = new Array(s.n).fill(null);
  for (let i = 0; i < s.n; i++) {
    let beats = 0;
    let speed = 0;
    let count = 0;
    for (let j = i; j >= 0 && s.time[i] - s.time[j] <= DRIFT_WINDOW_S; j--) {
      if (s.vel[j] >= MOVING_MPS && s.hr[j] > 0 && effort[j] > 0) {
        beats += s.hr[j];
        speed += effort[j];
        count++;
      }
    }
    if (count >= 5 && speed > 0) ratio[i] = beats / speed;
  }

  const baseline: number[] = [];
  for (let i = 0; i < s.n; i++) {
    const t = s.time[i] - s.time[0];
    if (t >= BASELINE_FROM_S && t <= BASELINE_TO_S && ratio[i] !== null) {
      baseline.push(ratio[i] as number);
    }
  }
  if (baseline.length < 5) return null;

  const base = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const limit = base * DRIFT_THRESHOLD;

  // Drift does not recover. That is what separates it from everything else
  // that lifts heart rate for a few minutes — a hill, a surge, a hot stretch of
  // road, a dog. Those come back down; fatigue does not, because the cost that
  // caused it is still being paid at the finish. So unless the ratio is still
  // elevated at the end of the run, nothing that happened in the middle gets
  // called an onset.
  //
  // A cool-down does not defeat this: slowing down drops heart rate and effort
  // together, and a tired athlete's ratio stays high through both.
  const ending = ratio.filter((r): r is number => r !== null).slice(-5);
  if (ending.length === 0) return null;
  const endedElevated = ending.reduce((a, b) => a + b, 0) / ending.length > limit;
  if (!endedElevated) return null;

  for (let i = 0; i < s.n; i++) {
    if (s.time[i] - s.time[0] <= BASELINE_TO_S) continue;
    if (ratio[i] === null || (ratio[i] as number) <= limit) continue;

    // Candidate. Does it hold?
    let held = true;
    for (let j = i; j < s.n && s.time[j] - s.time[i] <= PERSISTENCE_S; j++) {
      if (ratio[j] !== null && (ratio[j] as number) <= limit) {
        held = false;
        break;
      }
    }
    // A candidate too close to the finish cannot be proven either way, so it is
    // not claimed. Silence beats a guess on a coaching screen.
    if (held && s.time[s.n - 1] - s.time[i] >= PERSISTENCE_S) {
      return Math.round(s.dist[i] - s.dist[0]);
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Per-kilometre segments                                              */
/* ------------------------------------------------------------------ */

export interface Segment {
  /** 1-based, and the label shown: "3", "18-20" when grouped, "10 · 1.4 km" when long */
  label: string;
  /** metres covered by this segment */
  distanceM: number;
  /** seconds spent running */
  durationS: number;
  /** wall-clock seconds, including any standing still */
  elapsedS: number;
  /** seconds per kilometre, over moving time */
  paceSec: number;
  avgHr: number | null;
  /** index range into the stream, for aligning the strip with the chart */
  from: number;
  to: number;
}

/**
 * How much of a segment may be absorbed into the one before it.
 *
 * A 10.4 km run should not produce a 400-metre eleventh column: it would be
 * unreadable, and its pace would be a single surge rather than a kilometre.
 * Anything up to half a kilometre joins its predecessor instead.
 *
 * But absorbing is not the same as hiding. When the final segment ends up
 * materially longer than the others, its label carries the real distance, so a
 * pace attributed to "kilometre 10" is not quietly a pace over 1.4 km.
 */
export const ABSORB_FRACTION = 0.5;

/**
 * How many columns the segment strip can carry before they stop being legible.
 *
 * A 10 km run gives ten columns and reads well. A 32 km long run would give
 * thirty-two in the same width — about thirty pixels each, which is narrower
 * than the pace it has to print. Past this, kilometres are grouped.
 */
export const MAX_SEGMENTS = 15;

/**
 * Seconds spent actually running between two indices.
 *
 * A sum, not a measurement: the counting happened in `resampleForChart` while
 * the stream was still at one sample per second. Deciding it here, from buckets
 * ten seconds wide, blurs the edge of every stop — see the note on
 * `ChartStreams.moving`.
 */
function movingSeconds(s: ChartStreams, from: number, to: number): number {
  let seconds = 0;
  for (let i = from + 1; i <= to; i++) seconds += s.moving[i] ?? 0;
  return seconds;
}

/** Splits a run into segments of `step` kilometres. */
export function segments(s: ChartStreams, step = 1): Segment[] {
  const out: Segment[] = [];
  const total = s.dist[s.n - 1] - s.dist[0];
  if (total <= 0) return out;

  const stepM = step * 1000;
  let from = 0;
  let mark = stepM;

  for (let i = 1; i < s.n; i++) {
    const covered = s.dist[i] - s.dist[0];
    const last = i === s.n - 1;
    if (covered < mark && !last) continue;

    const distanceM = s.dist[i] - s.dist[from];
    const durationS = s.time[i] - s.time[from];

    // A trailing part-kilometre belongs to the segment before it, not to a
    // column of its own.
    if (last && distanceM < stepM * ABSORB_FRACTION && out.length > 0) {
      const prev = out[out.length - 1];
      prev.distanceM += distanceM;
      prev.elapsedS += durationS;
      prev.durationS = movingSeconds(s, prev.from, i);
      prev.paceSec = prev.durationS > 0 ? prev.durationS / (prev.distanceM / 1000) : 0;
      prev.to = i;
      prev.label = labelFor(prev.label, prev.distanceM, stepM);
      break;
    }

    const beats: number[] = [];
    for (let j = from; j <= i; j++) if (s.hr[j] > 0) beats.push(s.hr[j]);

    const index = out.length + 1;
    const moving = movingSeconds(s, from, i);
    out.push({
      label: step === 1 ? String(index) : `${(index - 1) * step + 1}-${index * step}`,
      distanceM,
      durationS: moving,
      elapsedS: durationS,
      paceSec: moving > 0 && distanceM > 0 ? moving / (distanceM / 1000) : 0,
      avgHr: beats.length ? Math.round(beats.reduce((a, b) => a + b, 0) / beats.length) : null,
      from,
      to: i,
    });

    from = i;
    mark += stepM;
    if (last) break;
  }

  return out;
}

/**
 * Segments at whatever granularity keeps the strip readable.
 *
 * Chooses the step rather than truncating, because dropping the last twelve
 * kilometres of a marathon would be a silent lie about the run.
 */
export function readableSegments(s: ChartStreams, max = MAX_SEGMENTS): Segment[] {
  const km = (s.dist[s.n - 1] - s.dist[0]) / 1000;
  const step = km <= max ? 1 : km <= max * 2 ? 2 : 5;
  return segments(s, step);
}

/** Adds the true distance to a label once the segment stops being one step long. */
function labelFor(base: string, distanceM: number, stepM: number): string {
  const over = distanceM / stepM;
  if (over < 1.1) return base;
  return `${base} · ${(distanceM / 1000).toFixed(2)} km`;
}

/** The index of the fastest segment, or -1 when there is nothing to compare. */
export function fastestSegment(list: Segment[]): number {
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].paceSec <= 0) continue;
    if (best === -1 || list[i].paceSec < list[best].paceSec) best = i;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Summary over a range                                                */
/* ------------------------------------------------------------------ */

export interface RangeSummary {
  distanceM: number;
  /**
   * Seconds spent running — the number on the watch, and the one every athlete
   * means by "my run took".
   */
  durationS: number;
  /**
   * Wall-clock seconds from first sample to last, standing still included.
   *
   * Kept alongside rather than instead of, because the chart draws the whole
   * recording and the header would otherwise describe a different run from the
   * picture beneath it. The difference is shown, not hidden.
   */
  elapsedS: number;
  /** seconds per kilometre */
  paceSec: number | null;
  gapSec: number | null;
  speedKmh: number | null;
  climbM: number;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  avgPower: number | null;
  /** how long the athlete stood still; 0 when they never did */
  stoppedS: number;
}

/**
 * Everything the header reports, over any slice of the run.
 *
 * The whole run is just the slice from 0 to n−1, so dragging a selection and
 * loading the page take the same path. Two code paths would eventually
 * disagree, and the one nobody is looking at would be the wrong one.
 */
export function summarise(
  s: ChartStreams,
  from = 0,
  to = s.n - 1,
  /**
   * The device's own moving time for the whole run, in seconds.
   *
   * When intervals.icu gives us one, it wins. It is the figure Garmin computed
   * on the wrist and the figure the athlete has already seen, and an app that
   * recomputes it will differ by a second or two however carefully it is done —
   * which reads as unreliable, and rightly so. We are not a second opinion on
   * the watch.
   *
   * The stream-derived count still earns its keep: it is what distributes that
   * total across a dragged selection. Scaling it so the whole run matches the
   * authoritative figure exactly keeps the parts summing to the right whole.
   */
  authoritativeMovingS?: number | null,
): RangeSummary {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(s.n - 1, Math.max(from, to));

  const distanceM = s.dist[hi] - s.dist[lo];
  const elapsedS = s.time[hi] - s.time[lo];

  const rangeMoving = movingSeconds(s, lo, hi);
  const wholeMoving = movingSeconds(s, 0, s.n - 1);
  const scale =
    authoritativeMovingS && authoritativeMovingS > 0 && wholeMoving > 0
      ? authoritativeMovingS / wholeMoving
      : 1;
  // Never claim more movement than the clock allows for this range.
  const durationS = Math.min(elapsedS, Math.round(rangeMoving * scale));

  const beats: number[] = [];
  const steps: number[] = [];
  const watts: number[] = [];
  for (let i = lo; i <= hi; i++) {
    if (s.hr[i] > 0) beats.push(s.hr[i]);
    if (s.cad[i] > 0) steps.push(s.cad[i]);
    if (s.pow[i] > 0) watts.push(s.pow[i]);
  }

  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  const slice: ChartStreams = {
    ...s,
    n: hi - lo + 1,
    dist: s.dist.slice(lo, hi + 1),
    time: s.time.slice(lo, hi + 1),
    vel: s.vel.slice(lo, hi + 1),
    hr: s.hr.slice(lo, hi + 1),
    alt: s.alt.slice(lo, hi + 1),
    cad: s.cad.slice(lo, hi + 1),
    pow: s.pow.slice(lo, hi + 1),
  };

  return {
    distanceM,
    durationS,
    elapsedS,
    paceSec: distanceM > 0 && durationS > 0 ? durationS / (distanceM / 1000) : null,
    gapSec: gradeAdjustedPace(slice),
    speedKmh: durationS > 0 ? (distanceM / 1000) / (durationS / 3600) : null,
    stoppedS: Math.max(0, Math.round(elapsedS - durationS)),
    climbM: totalClimb(slice.alt),
    avgHr: avg(beats),
    maxHr: beats.length ? Math.round(Math.max(...beats)) : null,
    avgCadence: avg(steps),
    avgPower: avg(watts),
  };
}

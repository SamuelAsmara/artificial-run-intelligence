import { formatMinSec } from "@/lib/format/pace";
/**
 * Estimating an athlete's physiological thresholds from training history alone.
 *
 * We have no lab test and no dedicated field test — only the summary rows
 * Strava gives us. The insight that makes this workable: an activity's
 * *average* heart rate is, by definition, a heart rate the athlete sustained
 * for that duration. A filtered maximum over those averages is therefore a
 * legitimate proxy for a peak-sustained-HR curve.
 *
 * Approach mirrors what TrainingPeaks and intervals.icu do publicly:
 * take a high percentile of sustained efforts, correct for duration, clamp to
 * a physiologically plausible band, and only ever let the estimate fall slowly.
 *
 * See docs/research/01-training-load-metrics.md §6.
 */

import type { Sex } from "./load";

export interface HistoryActivity {
  durationSec: number;
  distanceM: number;
  avgHr: number | null;
  /** ISO date, YYYY-MM-DD */
  date: string;
}

export interface ThresholdEstimate {
  hrMax: number;
  hrRest: number;
  lthr: number;
  thresholdSpeedMps: number;
  /** false while any value is still a seed rather than a measurement */
  measured: boolean;
  /** human-readable account of how each number was derived, for the UI */
  notes: string[];
}

/* ---------------------------------------------------------------- */
/* HRmax                                                             */
/* ---------------------------------------------------------------- */

/**
 * Tanaka et al. — more accurate than the familiar `220 − age`, though it still
 * overestimates women by roughly 5 bpm.
 */
export const tanakaHrMax = (age: number) => 208 - 0.7 * age;

/**
 * Best available HRmax: highest observed average in a short hard effort,
 * scaled up slightly (an average is necessarily below the peak), else Tanaka.
 */
export function estimateHrMax(
  history: HistoryActivity[],
  age: number,
): { hrMax: number; measured: boolean } {
  const shortHard = history
    .filter((a) => a.avgHr !== null && a.durationSec >= 300 && a.durationSec <= 1800)
    .map((a) => a.avgHr as number);

  const predicted = tanakaHrMax(age);
  if (shortHard.length === 0) return { hrMax: predicted, measured: false };

  const observed = Math.max(...shortHard) * 1.03;
  // never trust an observation that implies a wildly implausible max
  if (observed > predicted * 1.15 || observed < predicted * 0.8) {
    return { hrMax: predicted, measured: false };
  }
  return { hrMax: Math.max(observed, predicted * 0.95), measured: true };
}

/* ---------------------------------------------------------------- */
/* LTHR                                                              */
/* ---------------------------------------------------------------- */

/** Efforts shorter than threshold pace are run above it, and vice versa. */
function durationCorrection(durationSec: number): number {
  const min = durationSec / 60;
  if (min < 30) return 0.98;
  if (min < 45) return 0.99;
  return 1.0;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Lactate threshold heart rate.
 *
 * Uses the **95th percentile** of qualifying efforts rather than the maximum:
 * a single strap dropout or a hot day would otherwise permanently inflate the
 * estimate, and everything downstream (all load, all fitness) scales with it.
 */
export function estimateLthr(
  history: HistoryActivity[],
  hrMax: number,
  previous?: number,
): { lthr: number; measured: boolean } {
  const candidates = history
    .filter(
      (a) =>
        a.avgHr !== null &&
        a.durationSec >= 1200 && // 20 min
        a.durationSec <= 4500 && // 75 min
        a.avgHr > hrMax * 0.6 &&
        a.avgHr < hrMax * 1.02,
    )
    .map((a) => (a.avgHr as number) * durationCorrection(a.durationSec))
    .sort((x, y) => x - y);

  const floor = hrMax * 0.8;
  const ceil = hrMax * 0.94;
  const seed = hrMax * 0.88;

  if (candidates.length < 3) {
    return { lthr: previous ?? seed, measured: false };
  }

  const raw = percentile(candidates, 0.95);
  const clamped = Math.min(ceil, Math.max(floor, raw));

  // Ratchet: rise immediately, fall slowly. One hot or ill session must not
  // collapse the whole series; genuine detraining shows up over many weeks.
  if (previous !== undefined && clamped < previous) {
    return { lthr: previous - Math.min(previous - clamped, 1), measured: true };
  }
  return { lthr: clamped, measured: true };
}

/* ---------------------------------------------------------------- */
/* Threshold pace                                                    */
/* ---------------------------------------------------------------- */

/**
 * Fastest sustained speed over 35–75 minutes, gated on the effort actually
 * having been hard (>= 90% of LTHR) so easy long runs don't set the threshold.
 * Falls back to Riegel-scaling the best short effort.
 */
export function estimateThresholdSpeed(
  history: HistoryActivity[],
  lthr: number,
): { thresholdSpeedMps: number; measured: boolean } {
  const hard = history.filter(
    (a) =>
      a.durationSec >= 2100 &&
      a.durationSec <= 4500 &&
      a.distanceM > 0 &&
      a.avgHr !== null &&
      a.avgHr >= lthr * 0.9,
  );

  if (hard.length > 0) {
    const best = Math.max(...hard.map((a) => a.distanceM / a.durationSec));
    return { thresholdSpeedMps: best, measured: true };
  }

  // no qualifying effort — take the best speed over any run of 20+ minutes
  // and shade it down, since a shorter effort is run above threshold
  const any = history.filter((a) => a.durationSec >= 1200 && a.distanceM > 0);
  if (any.length === 0) return { thresholdSpeedMps: 0, measured: false };
  const best = Math.max(...any.map((a) => a.distanceM / a.durationSec));
  return { thresholdSpeedMps: best * 0.94, measured: false };
}

/* ---------------------------------------------------------------- */
/* Resting HR                                                        */
/* ---------------------------------------------------------------- */

/**
 * Strava gives us no resting heart rate. Until a wellness source is connected
 * we use an age-independent default; the error this introduces is small
 * *because* load is normalised (see load.ts).
 */
export const DEFAULT_HR_REST = 55;

/* ---------------------------------------------------------------- */
/* Everything together                                               */
/* ---------------------------------------------------------------- */

export function estimateThresholds(
  history: HistoryActivity[],
  opts: {
    age: number;
    sex: Sex;
    hrRest?: number;
    previousLthr?: number;
  },
): ThresholdEstimate {
  const notes: string[] = [];
  const hrRest = opts.hrRest ?? DEFAULT_HR_REST;
  if (opts.hrRest === undefined) {
    notes.push(`Resting heart rate defaulted to ${DEFAULT_HR_REST} bpm — no wellness source connected.`);
  }

  const { hrMax, measured: hrMaxMeasured } = estimateHrMax(history, opts.age);
  notes.push(
    hrMaxMeasured
      ? `Max heart rate ${Math.round(hrMax)} bpm, from your hardest short efforts.`
      : `Max heart rate ${Math.round(hrMax)} bpm, predicted from age (Tanaka).`,
  );

  const { lthr, measured: lthrMeasured } = estimateLthr(history, hrMax, opts.previousLthr);
  notes.push(
    lthrMeasured
      ? `Threshold heart rate ${Math.round(lthr)} bpm, from your sustained hard runs.`
      : `Threshold heart rate ${Math.round(lthr)} bpm — provisional until you log 3 sustained hard runs.`,
  );

  const { thresholdSpeedMps, measured: paceMeasured } = estimateThresholdSpeed(history, lthr);
  if (thresholdSpeedMps > 0) {
    const pace = formatMinSec(1000 / thresholdSpeedMps);
    notes.push(
      paceMeasured
        ? `Threshold pace ${pace}/km, from your fastest sustained run.`
        : `Threshold pace ${pace}/km — estimated, no qualifying hard run yet.`,
    );
  }

  return {
    hrMax,
    hrRest,
    lthr,
    thresholdSpeedMps,
    measured: hrMaxMeasured && lthrMeasured,
    notes,
  };
}

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
 * Shortest effort that still says something about threshold, in seconds.
 *
 * Was 35 minutes, which is stricter than the evidence requires and stricter
 * than the industry: TrainingPeaks, Friel and Tredict all accept a 20-minute
 * effort. Twenty minutes at threshold heart rate is a real threshold effort,
 * and demanding 35 excluded most interval sessions — which is how athletes who
 * train hard twice a week ended up with no measurable threshold at all.
 */
export const MIN_THRESHOLD_EFFORT_S = 1200;

/** Beyond this an effort is long enough that fatigue, not threshold, sets the pace. */
export const MAX_THRESHOLD_EFFORT_S = 4500;

/**
 * An effort shorter than an hour is run *above* threshold, so it is shaded down.
 *
 * The industry convention is threshold ≈ 95% of a best 20-minute effort
 * (TrainingPeaks, Friel). An effort of 35 minutes or more is close enough to
 * threshold to take as-is. Between the two we interpolate.
 *
 * Without this, widening the window would have produced a threshold that is too
 * *fast* — the opposite error, and a worse one: every prescribed pace would come
 * out harder than intended.
 */
export function durationDiscount(durationSec: number): number {
  if (durationSec >= 2100) return 1;
  const t = (durationSec - MIN_THRESHOLD_EFFORT_S) / (2100 - MIN_THRESHOLD_EFFORT_S);
  return 0.95 + 0.05 * Math.max(0, Math.min(1, t));
}

/**
 * Fastest sustained speed over 20–75 minutes, gated on the effort actually
 * having been hard (>= 90% of LTHR) so easy long runs don't set the threshold.
 *
 * ## Why there is no longer a fallback
 *
 * There used to be one: with no qualifying effort, take the best speed over any
 * run of 20+ minutes and shade it down 6%. It looks harmless and it is not.
 *
 * For an athlete who only ever runs easy, "the best run over 20 minutes" *is* an
 * easy run. The fallback therefore treated an easy pace as threshold pace and
 * then made it slower still — and because every prescribed pace is a ratio of
 * this number, it told beginners to run 8:15, 8:30, even 10:29 per kilometre
 * when their actual easy pace was 6:45. The app was instructing people to run
 * slower than they already run easily, and it compounds: run to those paces and
 * the next estimate is slower again.
 *
 * The reason it produced nonsense is that it never checked heart rate. The main
 * path does; the fallback inferred effort from speed alone, which only works for
 * somebody who does hard sessions — exactly the athlete who never needs it.
 *
 * So it is gone. No qualifying effort means no threshold pace: zero, `measured`
 * false, and the callers already handle that — `paceForWorkout` returns null and
 * `describeSession` falls back to distance alone, so the plan reads "8.0 km,
 * easy" instead of inventing a number.
 *
 * This is also the industry norm. TrainingPeaks, WKO5, GoldenCheetah and Final
 * Surge all leave threshold *pace* as a field somebody fills in; intervals.icu
 * computes a critical speed and still refuses to write it there. Nobody guesses
 * this from ordinary training, because it cannot be done.
 */
export function estimateThresholdSpeed(
  history: HistoryActivity[],
  lthr: number,
): { thresholdSpeedMps: number; measured: boolean } {
  const hard = history.filter(
    (a) =>
      a.durationSec >= MIN_THRESHOLD_EFFORT_S &&
      a.durationSec <= MAX_THRESHOLD_EFFORT_S &&
      a.distanceM > 0 &&
      a.avgHr !== null &&
      a.avgHr >= lthr * 0.9,
  );

  if (hard.length === 0) return { thresholdSpeedMps: 0, measured: false };

  const best = Math.max(
    ...hard.map((a) => (a.distanceM / a.durationSec) * durationDiscount(a.durationSec)),
  );
  return { thresholdSpeedMps: best, measured: true };
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

  const { thresholdSpeedMps } = estimateThresholdSpeed(history, lthr);
  if (thresholdSpeedMps > 0) {
    notes.push(
      `Threshold pace ${formatMinSec(1000 / thresholdSpeedMps)}/km, from your fastest sustained run.`,
    );
  } else {
    /*
     * Say why there is no pace, rather than leaving a silent blank.
     *
     * This branch is now reachable — it was not, because the old fallback
     * always produced a number — so the athlete needs to know what to do about
     * it. The plan still works: it prescribes distances, and picks up paces the
     * moment there is something real to base them on.
     */
    notes.push(
      "No threshold pace yet — sessions show distance only. One sustained hard " +
        "effort of 20 minutes or more sets it.",
    );
  }

  return {
    hrMax,
    hrRest,
    lthr,
    thresholdSpeedMps,
    /*
     * Measured means the *threshold* was measured, not everything.
     *
     * This used to require `hrMaxMeasured && lthrMeasured`, and the result was
     * that it came back false for every athlete in the database — including
     * ones with sixteen weeks of hard training behind them. A caveat that is
     * always shown carries no information; it just teaches people to ignore
     * the label.
     *
     * The reason is that a maximum heart rate is only "measured" when somebody
     * has produced a genuinely all-out effort, which recreational runners
     * rarely do and never do on demand. Gating on it asked for something the
     * data will not contain.
     *
     * It is also the wrong condition. What this flag governs is the confidence
     * of the load figures and the honesty of the heart-rate zone labels, and
     * both of those rest on LTHR. The maximum enters only through heart-rate
     * reserve, and the header of load.ts sets out why that barely matters: the
     * normalisation cancels the coefficient, dropping sensitivity to an error
     * in HRmax from about ±25% to ±2–8%. Predicting it from age is what
     * Firstbeat does in every Garmin on the market.
     *
     * So the flag follows LTHR. `notes` still reports the basis of each of the
     * three values separately, for anyone who wants the detail.
     */
    measured: lthrMeasured,
    notes,
  };
}

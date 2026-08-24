/**
 * Comparing a run against the athlete's own past runs.
 *
 * ## Why this is the athlete's half of the product
 *
 * The coach's screens answer "who needs me today". The athlete's answer a
 * narrower and more personal question — *am I getting better?* — and until now
 * the app could not answer it at all. It could describe today. It could not
 * put today next to a day like it.
 *
 * ## Aligned on distance, not time
 *
 * Two runs of different length do not line up on a time axis: at minute forty
 * one athlete is finishing and the other is two thirds through, and laying the
 * curves side by side compares the wrong points to each other. Aligning on
 * *fraction of the run completed* puts the same part of the effort above the
 * same part of the other, which is the only way the shapes mean anything
 * together.
 *
 * ## The number that actually answers the question
 *
 * The pace curves are what the athlete looks at, but the finding is usually in
 * {@link efficiency}: heart rate at a given pace. Running the same pace at a
 * lower heart rate is the classic, uncontroversial sign of improved aerobic
 * fitness — where "I ran faster" could be a good day, a cool morning or a
 * downhill.
 *
 * Everything here is pure. Runs in, comparison out.
 */

import type { RaceType } from "@/types/database.types";

/** A run as the comparison needs it. */
export interface ComparableRun {
  id: string;
  /** ISO date */
  date: string;
  distanceM: number;
  durationS: number;
  avgHr: number | null;
  /** per-segment pace in seconds per kilometre, as stored on the activity */
  paceShape: (number | null)[] | null;
  /**
   * Beats per minute across the run, on the same points as `paceShape`.
   *
   * Optional because it arrived with migration 0018 and older rows re-derive
   * at their own pace, so a run can honestly have a pace curve and no heart
   * rate one. Everything downstream has to cope with that rather than assume
   * they come in pairs.
   */
  hrShape?: (number | null)[] | null;
  /** the list's own classification: easy / tempo / int / long */
  type: string;
  /**
   * How the list writes this date ("14 Aug"). Optional because the engine
   * never reads it — it exists so the panel can print the same date string
   * the row above it prints, rather than a second format for the same day.
   */
  label?: string;
}

export interface ComparedRun extends ComparableRun {
  /** seconds per kilometre over the whole run */
  paceSec: number;
  /** the pace curve resampled onto the shared axis; nulls where unknown */
  curve: (number | null)[];
  /** the heart-rate curve on the same axis; all nulls when the run has none */
  hrCurve: (number | null)[];
  /** beats per minute per unit speed — lower is fitter. Null without heart rate. */
  efficiency: number | null;
}

export interface RunComparison {
  runs: ComparedRun[];
  /** how many points every curve was resampled to */
  points: number;
  /** the fastest and slowest pace across all curves, for a shared y axis */
  paceRange: { fast: number; slow: number } | null;
  /**
   * The lowest and highest heart rate across all curves, or null when not one
   * of these runs recorded any.
   *
   * A shared axis, like the pace one, and for the same reason: two runs drawn
   * against their own heart-rate ranges look identical however far apart they
   * actually were, which is the exact opposite of what a comparison is for.
   */
  hrRange: { low: number; high: number } | null;
  /**
   * One sentence naming the difference that matters, or "" when the runs are
   * too unlike each other for a comparison to say anything.
   */
  verdict: string;
}

/** How many points every curve is resampled to. */
export const CURVE_POINTS = 40;

/** Runs closer than this in distance are considered the same kind of session. */
export const SIMILAR_DISTANCE = 0.15;

/** How far back a run can be and still count as comparable. */
export const SIMILAR_DAYS = 120;

/** The most runs that can be laid over each other and still be read. */
export const MAX_RUNS = 3;

/**
 * Resample a pace shape onto a fixed number of points.
 *
 * The shape is a series of samples across the run, however many the provider
 * happened to give. Stretching each onto the same axis is what makes a 8 km
 * run and a 12 km one comparable at all.
 */
export function resampleCurve(
  shape: (number | null)[] | null,
  points: number = CURVE_POINTS,
): (number | null)[] {
  if (!shape || shape.length === 0) return new Array(points).fill(null);
  if (shape.length === 1) return new Array(points).fill(shape[0]);

  return Array.from({ length: points }, (_, i) => {
    const at = (i / (points - 1)) * (shape.length - 1);
    const lo = Math.floor(at);
    const hi = Math.min(shape.length - 1, lo + 1);
    const a = shape[lo];
    const b = shape[hi];
    if (a === null || !Number.isFinite(a)) return b ?? null;
    if (b === null || !Number.isFinite(b)) return a;
    return a + (b - a) * (at - lo);
  });
}

/**
 * Beats per minute per metre per second.
 *
 * Deliberately not "heart rate", which says nothing without the pace beside
 * it, and deliberately not a percentage of anything, which would need a
 * maximum this may not have. Lower is fitter: less heart for the same speed.
 */
export function efficiency(run: ComparableRun): number | null {
  if (run.avgHr === null || run.avgHr <= 0) return null;
  if (run.distanceM <= 0 || run.durationS <= 0) return null;
  return run.avgHr / (run.distanceM / run.durationS);
}

/**
 * Past runs worth putting next to this one, best match first.
 *
 * Same kind of session, within {@link SIMILAR_DISTANCE} of the distance, and
 * inside {@link SIMILAR_DAYS}. The athlete can always pick their own instead —
 * this exists because hunting through sixty rows for a comparable run is work
 * the app can do, and because a comparison against a run that is not alike is
 * worse than no comparison.
 */
export function similarRuns(
  subject: ComparableRun,
  history: ComparableRun[],
  limit = MAX_RUNS - 1,
): ComparableRun[] {
  if (subject.distanceM <= 0) return [];
  const cutoff = Date.parse(subject.date) - SIMILAR_DAYS * 86_400_000;

  return history
    .filter((r) => r.id !== subject.id)
    .filter((r) => r.type === subject.type)
    .filter((r) => r.distanceM > 0 && r.durationS > 0)
    .filter((r) => {
      const when = Date.parse(r.date);
      return when < Date.parse(subject.date) && when >= cutoff;
    })
    .filter(
      (r) => Math.abs(r.distanceM - subject.distanceM) / subject.distanceM <= SIMILAR_DISTANCE,
    )
    // Closest in distance first; a run 2% off is a better mirror than one 14% off.
    .sort(
      (a, b) =>
        Math.abs(a.distanceM - subject.distanceM) - Math.abs(b.distanceM - subject.distanceM),
    )
    .slice(0, Math.max(0, limit));
}

/**
 * Lay two or three runs over one another.
 *
 * The first run is the subject; the rest are what it is being measured
 * against. Returns null for fewer than two runs, because one run compared to
 * nothing is just a run.
 */
export function compareRuns(runs: ComparableRun[]): RunComparison | null {
  const usable = runs
    .filter((r) => r.distanceM > 0 && r.durationS > 0)
    .slice(0, MAX_RUNS);
  if (usable.length < 2) return null;

  const compared: ComparedRun[] = usable.map((r) => ({
    ...r,
    paceSec: r.durationS / (r.distanceM / 1000),
    curve: resampleCurve(r.paceShape),
    hrCurve: resampleCurve(r.hrShape ?? null),
    efficiency: efficiency(r),
  }));

  const all = compared.flatMap((r) => r.curve).filter((v): v is number => v !== null && v > 0);
  const paceRange = all.length ? { fast: Math.min(...all), slow: Math.max(...all) } : null;

  const beats = compared.flatMap((r) => r.hrCurve).filter((v): v is number => v !== null && v > 0);
  const hrRange = beats.length ? { low: Math.min(...beats), high: Math.max(...beats) } : null;

  return {
    runs: compared,
    points: CURVE_POINTS,
    paceRange,
    hrRange,
    verdict: verdictFor(compared),
  };
}

/**
 * The one sentence worth reading.
 *
 * Efficiency first, because it is the claim that survives a cool morning and a
 * downhill; pace only when there is no heart rate to compare. Says nothing at
 * all when the difference is inside the noise — a 1% pace change between two
 * runs is weather, not fitness, and calling it progress teaches the athlete to
 * distrust the whole screen.
 */
function verdictFor(runs: ComparedRun[]): string {
  const [subject, ...rest] = runs;
  const reference = rest[rest.length - 1];
  if (!reference) return "";

  const mmss = (sec: number) => {
    const t = Math.round(Math.abs(sec));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  };

  if (subject.efficiency !== null && reference.efficiency !== null) {
    const change = (subject.efficiency - reference.efficiency) / reference.efficiency;
    if (Math.abs(change) < 0.02) {
      return "Same effort for the same pace — holding steady.";
    }
    const pct = Math.round(Math.abs(change) * 100);
    return change < 0
      ? `${pct}% less heart rate for the same speed. That is the shape of getting fitter.`
      : `${pct}% more heart rate for the same speed. One run is not a trend — but worth watching.`;
  }

  const delta = subject.paceSec - reference.paceSec;
  if (Math.abs(delta) < 5) return "Within a few seconds a kilometre of each other.";
  return delta < 0
    ? `${mmss(delta)} a kilometre faster. No heart rate on one of these, so this is pace alone.`
    : `${mmss(delta)} a kilometre slower. No heart rate on one of these, so this is pace alone.`;
}

/** Unused today; kept so the compare screen can label a race-specific set later. */
export type CompareScope = RaceType | "all";

/* ------------------------------------------------------------------ */
/* Splits, the comparison's answer to the kilometre strip               */
/* ------------------------------------------------------------------ */

/** How many parts the run is cut into above the chart. */
export const SPLIT_PARTS = 4;

export interface CompareSplit {
  /** "0–25%" */
  label: string;
  /** average pace in this part, one per run, null where nothing was recorded */
  paces: (number | null)[];
  /** average heart rate in this part, one per run, null without a reading */
  beats: (number | null)[];
}

export interface CompareSplits {
  parts: CompareSplit[];
  /**
   * The part where the subject gained most over the oldest run it is being
   * compared with, or -1 when there is no such part.
   *
   * The kilometre strip on the analysis chart marks the fastest kilometre.
   * The fastest quarter is not the interesting one here — a comparison is
   * asking where the athlete *changed*, and the answer is worth marking the
   * same way.
   */
  bestIndex: number;
}

/**
 * The curves cut into equal parts of the run, averaged.
 *
 * Quarters rather than kilometres, because the axis is fractions of the run:
 * two runs of different lengths share a quarter, and do not share a fourth
 * kilometre in any meaningful way.
 */
export function compareSplits(
  comparison: RunComparison,
  parts: number = SPLIT_PARTS,
): CompareSplits {
  const { runs, points } = comparison;
  const size = points / parts;

  const out: CompareSplit[] = [];
  for (let p = 0; p < parts; p++) {
    const from = Math.round(p * size);
    const to = p === parts - 1 ? points : Math.round((p + 1) * size);

    const slice = (curve: (number | null)[]) =>
      curve
        .slice(from, to)
        .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);

    /**
     * Heart rate over equal-time buckets: a plain mean is already the
     * time-weighted answer, because every bucket is the same length of time.
     */
    const meanOf = (curve: (number | null)[]) => {
      const vals = slice(curve);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    /**
     * Pace is not.
     *
     * The buckets are equal *time*, and pace is seconds per kilometre — an
     * inverse. Averaging the pace values answers "the mean of these numbers",
     * which is not "the pace of this quarter". Five minutes at 4:00/km and five
     * at 6:00/km is 2.08 km in 600 s, which is 4:48/km; the mean of the two
     * figures says 5:00. Twelve seconds a kilometre, wrong in the same
     * direction every time, on exactly the interval sessions this panel exists
     * to compare.
     *
     * Averaging the *speeds* over equal time and inverting gives the real pace.
     */
    const paceOf = (curve: (number | null)[]) => {
      const vals = slice(curve);
      if (!vals.length) return null;
      const meanSpeed = vals.reduce((a, sec) => a + 1 / sec, 0) / vals.length;
      return meanSpeed > 0 ? 1 / meanSpeed : null;
    };

    out.push({
      label: `${Math.round((p / parts) * 100)}\u2013${Math.round(((p + 1) / parts) * 100)}%`,
      paces: runs.map((r) => paceOf(r.curve)),
      beats: runs.map((r) => meanOf(r.hrCurve)),
    });
  }

  // Against the oldest run on the chart, which is the longest span of time
  // the athlete can see here and so the most meaningful "then".
  const oldest = runs.length - 1;
  let bestIndex = -1;
  let bestGain = 0;
  if (oldest > 0) {
    out.forEach((part, i) => {
      const now = part.paces[0];
      const then = part.paces[oldest];
      if (now === null || then === null) return;
      const gain = then - now; // seconds per km faster than back then
      if (gain > bestGain) {
        bestGain = gain;
        bestIndex = i;
      }
    });
  }

  return { parts: out, bestIndex };
}

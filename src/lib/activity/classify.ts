/**
 * What kind of session a run was.
 *
 * ## Why this is inferred rather than read
 *
 * Nothing stores a session type. intervals.icu reports every run as "Run", and
 * the athlete is not asked to label anything — so the type has to be inferred
 * from what the run actually was.
 *
 * The inference is deliberately relative: a pace of 4:20/km is an interval
 * session for one athlete and an easy jog for another, so every threshold is
 * expressed against **this athlete's own median pace** rather than against a
 * table. That is the same principle the readiness score uses, and it is the
 * reason the labels survive being pointed at somebody else's history.
 *
 * ## Why it lived in a page, and why it does not any more
 *
 * This was written inline in `app/activities/page.tsx`, where nothing could
 * test it and nothing else could use it. The audit that found nine arithmetic
 * defects found all nine in exactly that position — maths written in a page or
 * a component — and none in a tested module. Moving it here is that lesson
 * applied rather than repeated.
 *
 * It is honest about its own precision: the list labels these as a **filter**,
 * not as a fact, and `INFERRED_NOTE` is the sentence to show wherever the
 * distinction matters to the reader.
 */

/** The four kinds the app distinguishes. */
export type SessionType = "easy" | "tempo" | "int" | "long";

/** How the athlete sees each one. */
export const SESSION_NAME: Record<SessionType, string> = {
  easy: "Easy Run",
  tempo: "Tempo Run",
  int: "Intervals",
  long: "Long Run",
};

/**
 * A run this far or further is a long run whatever the pace.
 *
 * Distance wins over pace here on purpose: a 20 km run held at threshold is
 * still, in every training plan ever written, the long run of that week.
 */
export const LONG_RUN_KM = 15;

/** At or under this share of the athlete's median pace, the run was hard. */
export const INTERVAL_RATIO = 0.92;

/** At or under this share, it was a tempo. */
export const TEMPO_RATIO = 0.97;

/** Shown wherever a session type is presented to a person. */
export const INFERRED_NOTE =
  "Session types are inferred from distance and pace against your own median — a useful grouping, not a label you set.";

export interface ClassifiableRun {
  distanceKm: number;
  /** seconds per kilometre */
  paceSec: number;
}

/**
 * The athlete's median pace over the runs given, in seconds per kilometre.
 *
 * Median rather than mean: one 3 km sprint or one very slow recovery jog would
 * drag a mean far enough to re-label every other run in the list. Runs without
 * a distance or a duration are excluded rather than counted as zero.
 *
 * Returns null when there is nothing to take a median of, so callers have to
 * decide what to do about it instead of inheriting a made-up number.
 */
export function medianPace(runs: ClassifiableRun[]): number | null {
  const paces = runs
    .filter((r) => r.distanceKm > 0 && r.paceSec > 0)
    .map((r) => r.paceSec)
    .sort((a, b) => a - b);
  if (paces.length === 0) return null;
  const mid = Math.floor(paces.length / 2);
  // Even count: the average of the two middle values, so a two-run history
  // does not silently pick the slower one.
  return paces.length % 2 === 0 ? (paces[mid - 1] + paces[mid]) / 2 : paces[mid];
}

/**
 * The kind of session a run was, judged against the athlete's own median.
 *
 * `median` of null — no history to compare against — makes everything "easy",
 * which is the honest answer: with one run there is no spread to read.
 */
export function classify(run: ClassifiableRun, median: number | null): SessionType {
  if (run.distanceKm >= LONG_RUN_KM) return "long";
  if (median === null || median <= 0) return "easy";
  if (run.paceSec <= median * INTERVAL_RATIO) return "int";
  if (run.paceSec <= median * TEMPO_RATIO) return "tempo";
  return "easy";
}

/** Seconds per kilometre, or null when the run cannot produce one. */
export function paceOf(run: { distanceKm: number; durationSec: number }): number | null {
  if (run.distanceKm <= 0 || run.durationSec <= 0) return null;
  return run.durationSec / run.distanceKm;
}

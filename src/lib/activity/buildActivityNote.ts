/**
 * What the coach card says about one run.
 *
 * ## Templates, not generation
 *
 * Same approach as the dashboard narrative: a fixed set of sentence builders
 * over facts that were measured. Nothing here writes prose it cannot defend,
 * and every clause traces to a number in `RangeSummary`, `Segment[]` or the
 * planned-vs-actual comparison.
 *
 * The output is deliberately an array of sentences as well as a joined string.
 * When a language model is eventually layered on, its job is to *rephrase these
 * sentences*, not to look at the data and invent its own — so it can improve
 * the writing without being able to change the claim.
 */

import { formatMinSec } from "@/lib/format/pace";
import type { Comparison } from "./plannedVsActual";
import type { RangeSummary, Segment } from "./metrics";
import { fastestSegment } from "./metrics";

export interface ActivityNoteInput {
  summary: RangeSummary;
  segments: Segment[];
  /** metres into the run where drift began, null when it never did */
  driftOnsetM: number | null;
  /** aerobic decoupling across the run, as a percentage */
  driftPct: number | null;
  comparison: Comparison | null;
}

export interface ActivityNote {
  sentences: string[];
  text: string;
}

/** How much faster the second half must be before it counts as progression. */
export const PROGRESSION_S = 8;

/** Above this, drift is worth naming as a cost rather than as normal. */
export const HIGH_DRIFT_PCT = 8;

export function buildActivityNote(input: ActivityNoteInput): ActivityNote {
  const sentences = [
    shapeSentence(input),
    fastestSentence(input),
    driftSentence(input),
    planSentence(input),
  ].filter((s): s is string => s !== null);

  return { sentences, text: sentences.join(" ") };
}

/* ------------------------------------------------------------------ */

/**
 * How the run was paced, from the first half against the second.
 *
 * Compares halves by *segment*, not by clock, because the question is whether
 * the athlete ran the back end faster — and a run split by time gives the
 * faster half more distance and flatters itself.
 */
function shapeSentence({ segments }: ActivityNoteInput): string | null {
  if (segments.length < 4) return null;

  const mid = Math.floor(segments.length / 2);

  /*
   * Distance-weighted, and pace inverted before it is averaged.
   *
   * Two things were wrong with the plain mean over `paceSec`. Segments are not
   * all the same length — a trailing part-kilometre is absorbed into the one
   * before it, which can leave a final segment half again as long as the rest
   * carrying equal weight. And pace is seconds *per kilometre*, an inverse, so
   * the mean of two paces is not the pace over the two distances together.
   *
   * Both errors are small, and both push in the same direction on the runs
   * where the verdict is closest: the eight-second threshold below is decided
   * by a few seconds either way.
   */
  const paceOver = (list: Segment[]) => {
    let m = 0;
    let sec = 0;
    for (const x of list) {
      if (x.distanceM > 0 && x.paceSec > 0) {
        m += x.distanceM;
        sec += (x.distanceM / 1000) * x.paceSec;
      }
    }
    return m > 0 ? sec / (m / 1000) : 0;
  };

  const first = paceOver(segments.slice(0, mid));
  const second = paceOver(segments.slice(segments.length - mid));
  if (first <= 0 || second <= 0) return null;
  const delta = Math.round(first - second);

  if (delta >= PROGRESSION_S) {
    return `A progression run — the second half came in ${delta} s/km quicker than the first.`;
  }
  if (delta <= -PROGRESSION_S) {
    return `You faded: the second half was ${-delta} s/km slower than the first.`;
  }
  return "Pace held even from start to finish.";
}

function fastestSentence({ segments }: ActivityNoteInput): string | null {
  const i = fastestSegment(segments);
  if (i === -1 || segments.length < 3) return null;

  const seg = segments[i];
  /*
   * Segments are not always single kilometres — a long run groups them, and a
   * short tail is absorbed into the one before it. So the label may read "6-10"
   * or "10 · 1.42 km", and "kilometre 6-10" is not a sentence. Only a plain
   * number gets the word "kilometre".
   */
  const plainKm = /^\d+$/.test(seg.label.trim());
  const where =
    i === segments.length - 1
      ? "your closing kilometre"
      : i === 0
        ? "your opening kilometre"
        : plainKm
          ? `kilometre ${seg.label}`
          : `the stretch marked ${seg.label}`;

  return `The quickest stretch was ${where}, at ${formatMinSec(seg.paceSec)}/km.`;
}

/**
 * What the heart rate did, and whether it should worry anyone.
 *
 * Three distinct cases, and the difference between them matters: drift that
 * never appeared, drift that appeared late (normal, and a fitness signal), and
 * drift that appeared early or ran high (the session cost more than its pace
 * suggests).
 */
function driftSentence({ driftOnsetM, driftPct, summary }: ActivityNoteInput): string | null {
  const km = summary.distanceM / 1000;

  if (driftOnsetM === null) {
    if (driftPct === null) return null;
    return Math.abs(driftPct) < 3
      ? "Heart rate tracked pace the whole way — no decoupling worth reporting."
      : null;
  }

  const at = (driftOnsetM / 1000).toFixed(1);
  const fraction = km > 0 ? driftOnsetM / 1000 / km : 1;
  const pct = driftPct !== null ? ` Decoupling finished at ${driftPct.toFixed(1)}%.` : "";

  if (driftPct !== null && driftPct >= HIGH_DRIFT_PCT) {
    return `Heart rate began detaching from pace at ${at} km, and kept going.${pct} This run cost more than its splits suggest.`;
  }
  if (fraction >= 0.6) {
    return `Heart rate began drifting from pace at ${at} km — late enough to be ordinary for this effort.${pct}`;
  }
  return `Heart rate began drifting from pace at ${at} km, earlier than you would want on a run this length.${pct}`;
}

/** What it means for the plan. Silent when there was no plan to mean anything for. */
function planSentence({ comparison }: ActivityNoteInput): string | null {
  if (!comparison) return null;
  switch (comparison.verdict) {
    case "toofast":
      return "Against the plan this was too quick — treat the next session as recovery, not as scheduled.";
    case "tooslow":
      return "It came in under the planned pace, which is worth a note if it felt harder than it reads.";
    case "unplanned":
      return "Nothing was scheduled today, so this is load the plan has not accounted for.";
    default:
      return "It landed on plan; nothing to change.";
  }
}

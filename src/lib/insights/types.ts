/**
 * What a question reads, and what it gives back.
 *
 * Kept apart from `questions.ts` so the server action can import the shapes
 * without pulling in the answers, and so a reader can see the contract on one
 * screen.
 */

import type { SessionType } from "@/lib/activity/classify";

/** One run, in the only shape the questions ever see. */
export interface InsightRun {
  id: string;
  /** the athlete's own calendar date, YYYY-MM-DD */
  date: string;
  /** "17 Aug" */
  dateLabel: string;
  distanceKm: number;
  durationSec: number;
  /** seconds per km; null when the run cannot produce one */
  paceSec: number | null;
  avgHr: number | null;
  cardiacDriftPct: number | null;
  /** the inferred session type — see lib/activity/classify.ts */
  type: SessionType;
  /** "10K PB" when this run set a record the day it was run */
  pb: string | null;
}

/** One planned session and what actually happened on that day. */
export interface InsightPlanned {
  date: string;
  workoutType: string;
  plannedKm: number | null;
  actualKm: number | null;
  /** true when the day has passed, so a future session is never "missed" */
  past: boolean;
}

/** One day of the fitness/fatigue model. */
export interface InsightLoad {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number | null;
}

/**
 * Everything the ten questions can read, fetched once.
 *
 * Deliberately one bundle rather than a fetch per question: the panel is opened
 * by a button, so nothing here loads for an athlete who never asks — and once
 * it has loaded, moving between questions costs no round trip at all.
 */
export interface InsightData {
  /** the athlete's today, not the server's */
  today: string;
  /** newest first */
  runs: InsightRun[];
  /** lactate threshold heart rate, measured or estimated; null when unknown */
  lthr: number | null;
  planned: InsightPlanned[];
  load: InsightLoad[];
  race: { label: string; date: string; targetSec: number | null } | null;
}

export type Tone = "positive" | "caution" | "negative" | null;

/** A labelled figure in the answer's small table. */
export interface AnswerRow {
  label: string;
  value: string;
  tone?: Tone;
}

/** One bar in the answer's chart. Values are already in display units. */
export interface AnswerBar {
  label: string;
  value: number;
  /** what to print above or beside the bar */
  caption: string;
  tone?: Tone;
}

/**
 * An answer.
 *
 * `insufficient` is the important field. A question that cannot be answered
 * honestly says so in `headline` and sets this — it never returns a confident
 * figure computed from two runs. Every question is tested for this case.
 */
export interface InsightAnswer {
  headline: string;
  detail: string | null;
  tone: Tone;
  rows: AnswerRow[];
  bars: AnswerBar[] | null;
  /**
   * A line worth drawing across the chart — a threshold, a target.
   *
   * Only meaningful on the tall chart, where the bars are scaled to the range
   * of the data rather than from zero. A ratio that lives between 0.8 and 1.4
   * drawn from zero is fourteen bars of identical height; scaled to its own
   * range it is a shape, and the reference line is what keeps that shape
   * honest by saying where the number that matters actually sits.
   */
  reference?: { value: number; label: string };
  /**
   * Where the bars start.
   *
   * `"zero"` is the default and the honest one for a quantity that can be zero
   * — a share of training time, a distance. `"range"` is for quantities that
   * never go near zero and whose *differences* are the point: four session
   * paces all between 4:50 and 5:56 drawn from zero are four identical bars.
   * In range mode the panel prints the floor, so a short bar is never read as
   * "nearly nothing".
   */
  baseline?: "zero" | "range";
  /** the honest limitation, when there is one worth printing */
  caveat: string | null;
  insufficient: boolean;
}

export interface Question {
  id: string;
  /** as the athlete reads it */
  label: string;
  /** extra words the filter box should match on, beyond the label itself */
  keywords: string[];
  answer(data: InsightData): InsightAnswer;
}

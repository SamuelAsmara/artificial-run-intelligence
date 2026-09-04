/**
 * Activities screen model. Maps to activities (+ activity_streams for the
 * pace sparkline).
 */

import { formatMinSec } from "@/lib/format/pace";

export const fmtPace = formatMinSec;

export interface Act {
  /** the row's own activity id */
  id: string;
  type: string; name: string; date: string; km: string; time: string;
  pace: string; paceSec: number; hr: string; kmN: number;
  spark: string; sparkColor: string;
  /** "10K PB" when this run broke a record on the day it was run */
  pb?: string | null;
}

/**
 * One point on the easy-pace trend, positioned rather than merely ordered.
 *
 * `t` runs 0 (oldest week drawn) to 1 (most recent), so a week with no easy run
 * leaves a gap instead of being closed up as if it had never existed.
 */
export interface PacePoint {
  t: number;
  /** seconds per kilometre */
  v: number;
}

export const ACT_COPY = {
  pbTitle: "This run set a personal best on the day you ran it.",
  brand: "Runi", navHome: "Home", navActivities: "Activities",
  navPlan: "Plan", navSettings: "Settings",
  title: "Activities", subtitle: "Training history · last 4 weeks",
  volTitle: "Weekly distance", paceTitle: "Easy-run pace trend",
  paceSub: "faster ↑ · weekly average",
  /*
   * What the chart is, in one line under the title.
   *
   * The axis hint said "faster ↑ · weekly average" — true, and no answer to
   * "trend of what?". Easy pace is the honest fitness signal in a training
   * log: hard sessions vary with how you felt and what the plan asked for,
   * easy runs are the same effort week after week, so when they get faster at
   * the same heart rate that is aerobic fitness, not a good day.
   */
  paceExplain:
    "Your average pace on easy runs only. Easy effort stays constant week to week, so when the pace drifts faster at the same heart rate, that is fitness \u2014 not a good day.",
  paceEmpty: "Two weeks of easy runs and the trend starts drawing itself here.",
  histTitle: "All runs",
  /* the pager under the list — fifteen runs to a page */
  pagePrev: "Previous page",
  pageNext: "Next page",
  pageOf: (page: number, total: number) => `${page} / ${total}`,
  pageRange: (from: number, to: number, total: number) =>
    `${from}\u2013${to} of ${total}`,
  hDate: "Date", hType: "Session", hDist: "Dist", hTime: "Time",
  hPace: "Pace", hHr: "Avg HR", hSpark: "Pace shape",
  cmpStart: "Compare", cmpExit: "Cancel",
  cmpHint: "Pick 2\u20133 runs",
  cmpAuto: "Auto-pick similar",
  cmpTitle: "Runs compared",
  cmpClose: "Close",
  cmpEff: "eff",
  cmpAxis: "of run",
  cmpStartAxis: "start",
  cmpFinishAxis: "finish",
  cmpDelta: "subject",
  cmpAxisRun: "of run",
  cmpAxisDist: "km",
  cmpBand: "Pace/km",
  cmpBandHr: "Heart rate",
  cmpChartHint: "Pace is inverted \u2014 faster is up \u00b7 aligned on how far through each run \u00b7 hover for the gap",
  cmpBest: "biggest gain",
  cmpNoShape: "Neither run stored a pace shape, so there is no curve to draw \u2014 the numbers below still compare.",
};

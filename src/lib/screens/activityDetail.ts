/**
 * Copy and formatting helpers for the activity-analysis screen.
 */

import { formatMinSec } from "@/lib/format/pace";

/** Seconds -> "m:ss". Re-exported so views keep the short local name. */
export const fmt = formatMinSec;

/** Seconds -> "h:mm:ss" past the hour, "m:ss" below it. */
export function fmtLong(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  if (!h) return fmt(s);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const AD_COPY = {
  targetAbove: "target pace is faster than this run",
  targetBelow: "target pace is slower than this run",
  brand: "Runi",
  pageTitle: "Activity",
  back: "Back to dashboard",
  navHome: "Home",
  navActivities: "Activities",
  navPlan: "Plan",
  navSettings: "Settings",
  coachViewTag: "Coach view",
  coachViewMsg: "You are viewing this athlete's run.",
  coachBack: "Back to roster",

  hPace: "Pace",
  hHr: "Heart rate",
  hMore: "Training",
  kPace: "Pace",
  kGap: "GAP",
  kSpeed: "Speed",
  kClimb: "Climb",
  kAvgHr: "Avg HR",
  kMaxHr: "Max HR",
  kCadence: "Cadence",
  kDrift: "Drift",
  kLoad: "Load",
  kCalories: "Calories",

  chartTitle: "Pace · Power · Heart rate · Cadence · Elevation",
  chartHint: "Pace is inverted — faster is up · hover for detail · drag to select a range",
  bestLbl: "FASTEST KM",
  driftLbl: "DRIFT ONSET",
  axKm: "km",
  axTime: "time",
  clearSel: "Clear",
  selLabel: "Selection",
  kDist: "Distance",
  kTime: "Time",

  segTitle: "Kilometre splits",
  aiTag: "AI Coach",
  btnReason: "Show reasoning",
  noStream: "No second-by-second record for this run.",
  noNote: "Not enough detail in this run to say anything useful about it.",
} as const;

/**
 * Personal records, from what the athlete actually ran.
 *
 * These were hard-coded in the reference data, which is how a marathon best
 * appeared for someone who has never raced one. A record here is the fastest
 * continuous stretch of a distance found inside any run — computed per activity
 * in `bestEfforts`, then reduced across the athlete's history.
 *
 * A distance with no qualifying effort returns null. It shows as a dash. We do
 * not estimate a marathon from a 10 km time: a predicted time is a different
 * claim from a record, and putting one in a row labelled "PB" is a lie however
 * good the formula.
 */

import { formatDuration } from "@/lib/format/pace";

export interface ActivityWithEfforts {
  started_at: string | null;
  best_efforts: Record<string, number> | null;
}

export interface PersonalRecord {
  /** the key used in best_efforts, e.g. "5k" */
  key: string;
  /** how the design labels it */
  label: string;
  /** "21:48", or null when never run */
  time: string | null;
  /** ISO date of the run it came from */
  date: string | null;
  /**
   * True when the run that set this record was on or after `newSince` — thirty
   * days ago, as the dashboard calls it. Not "the most recent activity set it",
   * which is what this comment used to claim and what the tests correctly do
   * not assert.
   */
  isNew: boolean;
}

/** The four the dashboard band shows, in the design's order. */
export const PR_ROWS: { key: string; label: string }[] = [
  { key: "5k", label: "5K" },
  { key: "10k", label: "10K" },
  { key: "half", label: "Half" },
  { key: "marathon", label: "Marathon" },
];

/**
 * @param activities any order; only `best_efforts` and `started_at` are read
 * @param newSince records set on or after this date are flagged as new
 */
export function personalRecords(
  activities: ActivityWithEfforts[],
  newSince?: string,
): PersonalRecord[] {
  return PR_ROWS.map(({ key, label }) => {
    let bestSeconds: number | null = null;
    let bestDate: string | null = null;

    for (const a of activities) {
      const seconds = a.best_efforts?.[key];
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) continue;
      if (bestSeconds === null || seconds < bestSeconds) {
        bestSeconds = seconds;
        bestDate = a.started_at ? a.started_at.slice(0, 10) : null;
      }
    }

    return {
      key,
      label,
      time: bestSeconds === null ? null : formatDuration(bestSeconds),
      date: bestDate,
      isNew: !!(newSince && bestDate && bestDate >= newSince),
    };
  });
}

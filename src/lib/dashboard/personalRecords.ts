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
  /** the run's id, when the caller has it — lets a record link to the run that set it */
  id?: string;
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
  /** the run that set it, so the record can be a link to that run's analysis */
  activityId: string | null;
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
    let bestId: string | null = null;

    for (const a of activities) {
      const seconds = a.best_efforts?.[key];
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) continue;
      if (bestSeconds === null || seconds < bestSeconds) {
        bestSeconds = seconds;
        bestDate = a.started_at ? a.started_at.slice(0, 10) : null;
        bestId = a.id ?? null;
      }
    }

    return {
      key,
      label,
      time: bestSeconds === null ? null : formatDuration(bestSeconds),
      date: bestDate,
      activityId: bestId,
      isNew: !!(newSince && bestDate && bestDate >= newSince),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Which run set the record                                            */
/* ------------------------------------------------------------------ */

export interface ActivityForRecordCheck extends ActivityWithEfforts {
  id: string;
}

/**
 * The runs that broke a record *at the time they were run*.
 *
 * `personalRecords` answers "what is my best 10 km" — one row per distance,
 * reduced over everything. This answers a different question the list needs:
 * standing in front of a run from March, was it a personal best *then*?
 *
 * The distinction matters. A run is not a record because it happens to hold
 * the crown today — that would un-mark a run the moment it was beaten, and a
 * personal best you have since improved on is still the day you ran it. So
 * this walks the history oldest first and marks a run whenever it beat
 * everything before it. A record once set stays marked forever.
 *
 * A run can break more than one distance at once — a fast half marathon
 * usually takes the 10 km with it. The label names the longest one, because
 * that is the achievement the athlete will recognise.
 *
 * @returns activity id -> label, e.g. "10K PB". Runs that set nothing are absent.
 */
export function recordSetters(
  activities: ActivityForRecordCheck[],
): Map<string, string> {
  const oldestFirst = [...activities]
    .filter((a) => a.started_at && a.best_efforts)
    .sort((a, b) => (a.started_at as string).localeCompare(b.started_at as string));

  const best = new Map<string, number>();
  const out = new Map<string, string>();

  for (const activity of oldestFirst) {
    let longest: { label: string; index: number } | null = null;

    PR_ROWS.forEach(({ key, label }, index) => {
      const seconds = activity.best_efforts?.[key];
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return;

      const previous = best.get(key);
      // The first time a distance is ever covered it is a record by definition,
      // which is correct: there was no previous best to beat.
      if (previous === undefined || seconds < previous) {
        best.set(key, seconds);
        if (!longest || index > longest.index) longest = { label, index };
      }
    });

    if (longest) out.set(activity.id, `${(longest as { label: string }).label} PB`);
  }

  return out;
}

/**
 * Reading an athlete's current capacity out of their activity history.
 *
 * `planCapacity` needs two numbers — what they run in a week now, and how far
 * their longest recent run went. This derives both from the `activities` rows,
 * with no database calls of its own so it stays testable.
 *
 * Two deliberate choices:
 *
 *   - Weekly volume is the mean of the **last four weeks**, not the last one. A
 *     single missed week from illness or reserve duty should not halve the plan
 *     the athlete gets, and a single big week should not double it.
 *   - The longest run uses a **thirty-day** window, matching the window
 *     `sessionSpikeVsRecentMax` uses for its "recent maximum". The plan and the
 *     safety check must be looking at the same history or they will disagree.
 */

import type { AthleteCapacity } from "./capacity";

export interface ActivityForCapacity {
  /** ISO date, YYYY-MM-DD */
  date: string;
  distanceM: number;
}

const DAY = 86_400_000;
import { isoDate } from "@/lib/time/week";

/** Local calendar date — see `isoDate`. */
const iso = isoDate;

export const WEEKLY_VOLUME_WINDOW_DAYS = 28;
export const LONGEST_RUN_WINDOW_DAYS = 30;

export function readCapacity(
  activities: ActivityForCapacity[],
  asOf: Date = new Date(),
): AthleteCapacity {
  const asOfIso = iso(asOf);
  const volumeFrom = iso(new Date(asOf.getTime() - WEEKLY_VOLUME_WINDOW_DAYS * DAY));
  const longestFrom = iso(new Date(asOf.getTime() - LONGEST_RUN_WINDOW_DAYS * DAY));

  const usable = activities.filter(
    (a) => a.date && a.date <= asOfIso && Number.isFinite(a.distanceM) && a.distanceM > 0,
  );

  const volumeWindow = usable.filter((a) => a.date > volumeFrom);
  const totalM = volumeWindow.reduce((sum, a) => sum + a.distanceM, 0);
  const currentWeeklyM = Math.round((totalM / WEEKLY_VOLUME_WINDOW_DAYS) * 7);

  const longestWindow = usable.filter((a) => a.date > longestFrom);
  const longestRecentM = longestWindow.length
    ? Math.max(...longestWindow.map((a) => a.distanceM))
    : 0;

  return { currentWeeklyM, longestRecentM };
}

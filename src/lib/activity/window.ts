/**
 * The window a summary actually covers, and the arithmetic for summarising it.
 *
 * The activities page said "Completed · 4 weeks" over figures computed from
 * `getActivities(60)` — a *row* limit with no date filter. For anyone running
 * five times a week that is roughly three months of training under a four-week
 * label: sixty runs and six hundred kilometres where the truth was twenty and
 * two hundred. The weekly bar chart beside it *was* four weeks, so the two
 * halves of one screen disagreed.
 *
 * The rule this file exists to enforce: **a heading is a promise.** If the
 * label says four weeks, the arithmetic filters four weeks.
 */

export const SUMMARY_DAYS = 28;

export interface SummarisableRun {
  /** the athlete's own calendar date, YYYY-MM-DD */
  date: string;
  distanceKm: number;
  durationSec: number;
  avgHr: number | null;
}

export interface RunSummary {
  runs: number;
  totalKm: number;
  /** seconds per km, distance-weighted — never the mean of per-run paces */
  avgPaceSec: number | null;
  /** duration-weighted, over the runs that reported a strap */
  avgHr: number | null;
}

/** the runs inside the window, newest first order preserved */
export function withinDays<T extends { date: string }>(
  runs: T[],
  days: number,
  today: string,
): T[] {
  const from = shiftIso(today, -(days - 1));
  return runs.filter((r) => r.date >= from && r.date <= today);
}

/**
 * Summarise a set of runs.
 *
 * Both averages are weighted, and by different things, because they are
 * different kinds of quantity:
 *
 * - **Pace is an inverse** — seconds per kilometre. The mean of 4:00 and 6:00
 *   is not the pace of the two runs together. Sum the time, sum the distance,
 *   divide.
 * - **Heart rate is a rate over time**, so it weights by duration. Twenty easy
 *   40-minute runs at 138 and four two-hour long runs at 158 average to 146,
 *   not to the 141 an unweighted mean reports.
 *
 * A run with no strap is left out of the heart-rate average entirely rather
 * than counted as zero, which would drag it down by a third.
 */
export function summariseRuns(runs: SummarisableRun[]): RunSummary {
  let km = 0;
  let sec = 0;
  let hrSec = 0;
  let hrWeighted = 0;

  for (const r of runs) {
    if (r.distanceKm > 0) {
      km += r.distanceKm;
      sec += r.durationSec;
    }
    if (r.avgHr !== null && Number.isFinite(r.avgHr) && r.durationSec > 0) {
      hrWeighted += r.avgHr * r.durationSec;
      hrSec += r.durationSec;
    }
  }

  return {
    runs: runs.length,
    totalKm: km,
    avgPaceSec: km > 0 && sec > 0 ? sec / km : null,
    avgHr: hrSec > 0 ? Math.round(hrWeighted / hrSec) : null,
  };
}

/** YYYY-MM-DD shifted by whole calendar days */
export function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The dashboard's right-hand rail, from real data.
 *
 * Weekly volume, the training calendar, the streak and the race countdown were
 * the last invented numbers on the screen. Every appearance decision here comes
 * from `presentation.ts` — this file decides *what is true*, never *how it
 * looks*, so the design survives the swap from placeholder to real.
 *
 * Deliberately free of database calls so it can be tested.
 */

import { addDays, isoDate, weekNumber, weekStart, weekYear, zonedNow } from "@/lib/time/week";
import {
  calendarDotColor, volumeBarAppearance, volumeBarHeight, volumeBarTitle,
  type DayState, type WeekPosition,
} from "./presentation";

const DAY = 86_400_000;

/**
 * Local calendar date, not UTC.
 *
 * This used to be `toISOString().slice(0, 10)` while the cursor beside it was
 * built with `setHours(0,0,0,0)` — local midnight. In Asia/Jerusalem those
 * disagree by a day, every day, so the streak was reported one short and the
 * calendar highlighted yesterday.
 */
const iso = isoDate;

/**
 * ISO 8601 week number.
 *
 * Weeks are numbered against the calendar year, not against the plan, because a
 * calendar week is a thing an athlete and a coach can both name out loud in
 * March and still mean in October. "Week 3" of which plan, started when, is a
 * question; "week 34" is not.
 *
 * ISO's rule is that week 1 is the week containing the first Thursday of the
 * year, which is why this pivots on Thursday rather than counting from 1
 * January — a year can start mid-week, and the naive version puts two different
 * dates in the same numbered week.
 */
/**
 * Week numbering, from the shared definition in `@/lib/time/week`.
 *
 * Re-exported under the old names so callers do not have to care, but note the
 * change of meaning: these are no longer ISO 8601 week numbers. Weeks now start
 * on Sunday because that is where our athletes' week starts, and ISO's numbers
 * are Monday-based by definition. See the note at the top of `time/week.ts`.
 */
export const isoWeekNumber = weekNumber;
export const isoWeekYear = weekYear;
export { weekStart };

export interface RunRow {
  /** ISO date, YYYY-MM-DD */
  date: string;
  distanceM: number;
}

export interface PlannedRow {
  date: string;
  /** rest days are tracked so they are never marked missed */
  isRest: boolean;
}

/* ------------------------------------------------------------------ */
/* Weekly volume                                                       */
/* ------------------------------------------------------------------ */

export const VOLUME_WEEKS = 12;

export interface VolumeBar {
  /** position in the strip, 1..12 — for layout only, never shown */
  weekNumber: number;
  /** ISO week of the year. This is the number the athlete reads. */
  isoWeek: number;
  km: number;
  h: number;
  bg: string;
  border: string;
  title: string;
  /**
   * A week inside the training window with no running at all. Not the same as
   * a week before the athlete started — see `interruptedWeeks`.
   */
  interrupted: boolean;
}


/**
 * The last twelve weeks of running, oldest first.
 *
 * **No week is ever dropped.** A training plan has no notion of skipping a week,
 * and a week where nothing happened is not an absence of data — it is data. An
 * injury, reserve duty or a bad fortnight is precisely the thing a coach needs
 * to see, and compressing it away turns a lay-off into a smooth line that never
 * existed. Empty weeks are marked `interrupted` so the interface can say so
 * rather than leaving a silent notch in the strip.
 */
export function weeklyVolume(runs: RunRow[], asOf: Date = zonedNow()): VolumeBar[] {
  const currentStart = weekStart(asOf);

  // The twelve week-starts, stepped by calendar rather than by milliseconds,
  // and indexed by date string. Floor-dividing a millisecond difference by a
  // week used to shift every bar before a DST change into the wrong week and
  // invent an empty one — which the strip then labelled "no running" for a week
  // the athlete had run 13 km in.
  const starts: Date[] = [];
  const indexOfStart = new Map<string, number>();
  for (let i = 0; i < VOLUME_WEEKS; i++) {
    const start = addDays(currentStart, -(VOLUME_WEEKS - 1 - i) * 7);
    starts.push(start);
    indexOfStart.set(iso(start), i);
  }

  const totals = new Array<number>(VOLUME_WEEKS).fill(0);

  for (const run of runs) {
    if (!run.date || !(run.distanceM > 0)) continue;
    const runDate = new Date(run.date + "T00:00:00");
    const index = indexOfStart.get(iso(weekStart(runDate)));
    if (index !== undefined) totals[index] += run.distanceM / 1000;
  }

  const max = Math.max(...totals, 1);

  // Only weeks after the athlete's first recorded run count as interruptions.
  // Empty weeks before they started are simply weeks we know nothing about.
  const firstActive = totals.findIndex((km) => km > 0);

  return totals.map((km, i) => {
    const position: WeekPosition = i < VOLUME_WEEKS - 1 ? "past" : "current";
    const { bg, border } = volumeBarAppearance(position);
    const isoWeek = isoWeekNumber(starts[i]);
    const interrupted = firstActive >= 0 && i > firstActive && km === 0;
    // Before the first recorded run we know nothing, which is not the same as
    // a completed week of zero kilometres — the tooltip used to say "0 km · done".
    const beforeHistory = firstActive < 0 || i < firstActive;

    return {
      weekNumber: i + 1,
      isoWeek,
      km,
      h: volumeBarHeight(km, max),
      bg,
      border,
      title: interrupted
        ? `Week ${isoWeek} · no running`
        : beforeHistory && km === 0
          ? `Week ${isoWeek} · no data`
          : volumeBarTitle(isoWeek, km, position),
      interrupted,
    };
  });
}

/**
 * This week's distance in km, and the change against the same point last week.
 *
 * The comparison is deliberately like-for-like. Comparing a week that is two
 * days old against a finished one told a 60 km-a-week athlete they were down
 * 87% every Monday, in caution amber, and back to normal by Saturday — a
 * number that says more about the day of the week than about the athlete.
 * Last week is therefore counted only up to the same weekday.
 */
export function weeklyVolumeSummary(
  runs: RunRow[],
  asOf: Date = zonedNow(),
): { km: number; changePct: number | null; partialWeek: boolean } {
  const bars = weeklyVolume(runs, asOf);
  const thisWeek = bars[bars.length - 1]?.km ?? 0;

  const start = weekStart(asOf);
  const dayOfWeek = Math.round((addDays(asOf, 0).getTime() - start.getTime()) / DAY);
  const partialWeek = dayOfWeek < 6;

  // The same slice of last week: its start, up to and including the same day.
  const lastStart = addDays(start, -7);
  const lastCutoff = addDays(lastStart, dayOfWeek);
  let lastWeek = 0;
  for (const run of runs) {
    if (!run.date || !(run.distanceM > 0)) continue;
    if (run.date >= isoDate(lastStart) && run.date <= isoDate(lastCutoff)) {
      lastWeek += run.distanceM / 1000;
    }
  }

  return {
    km: Math.round(thisWeek),
    // A change against a week of nothing is not a percentage anyone can read.
    changePct: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
    partialWeek,
  };
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

/**
 * A dot colour per date, keyed the way the calendar component expects
 * (month * 100 + day).
 *
 * A planned session becomes "done" when a run was recorded that day, "missed"
 * once the day is past with nothing recorded, and stays "planned" while it is
 * still ahead. Days with a run but no plan still get a dot — training you did
 * off-plan is still training you did.
 */
export function calendarDots(
  planned: PlannedRow[],
  runs: RunRow[],
  asOf: Date = zonedNow(),
): Record<number, string> {
  const todayIso = iso(asOf);
  const ran = new Set(runs.filter((r) => r.distanceM > 0).map((r) => r.date));
  const out: Record<number, string> = {};

  // Year included. The key used to be month*100+day, which is the same number
  // for 3 January 2026 and 3 January 2027 — so a calendar paged back a year
  // showed last year's dots as this year's.
  const key = (dateIso: string) => {
    const d = new Date(dateIso + "T00:00:00");
    return d.getFullYear() * 10_000 + d.getMonth() * 100 + d.getDate();
  };

  for (const p of planned) {
    if (p.isRest) continue;
    const state: DayState = ran.has(p.date)
      ? "done"
      : p.date < todayIso
        ? "missed"
        : "planned";
    const colour = calendarDotColor(state);
    if (colour) out[key(p.date)] = colour;
  }

  for (const date of ran) {
    out[key(date)] = calendarDotColor("done") as string;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Streak                                                              */
/* ------------------------------------------------------------------ */

/**
 * Consecutive days ending today or yesterday on which the athlete ran.
 *
 * Yesterday counts as the end of a live streak because a morning runner opening
 * the app before their run has not broken anything yet. Requiring a run today
 * would reset the number every night, which is both wrong and demoralising.
 */
export function runStreak(runs: RunRow[], asOf: Date = zonedNow()): number {
  const ran = new Set(runs.filter((r) => r.distanceM > 0).map((r) => r.date));
  if (ran.size === 0) return 0;

  const today = addDays(asOf, 0);

  let cursor = today;
  if (!ran.has(iso(cursor))) {
    cursor = addDays(today, -1);
    if (!ran.has(iso(cursor))) return 0;
  }

  let streak = 0;
  while (ran.has(iso(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/* ------------------------------------------------------------------ */
/* Race countdown                                                      */
/* ------------------------------------------------------------------ */

export interface RaceCountdown {
  days: number;
  /** ISO week of the year for today, so plan progress can be stated in both */
  isoWeek: number;
  /** ISO date of the race, so callers never parse it back out of the label */
  dateIso: string;
  /** "to race day · Marathon · Oct 11, 2026" */
  label: string;
  /** 0–100, how far through the plan */
  progressPct: number;
  weekNumber: number;
  totalWeeks: number;
}

const RACE_LABEL: Record<string, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "Half marathon",
  full: "Marathon",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function raceCountdown(
  raceType: string,
  raceDateIso: string,
  planStartIso: string | null,
  totalWeeks: number,
  asOf: Date = zonedNow(),
): RaceCountdown | null {
  const race = new Date(raceDateIso + "T00:00:00");
  if (Number.isNaN(race.getTime())) return null;

  const today = new Date(asOf);
  today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((race.getTime() - today.getTime()) / DAY));

  const label =
    `to race day · ${RACE_LABEL[raceType] ?? raceType} · ` +
    `${MONTHS[race.getMonth()]} ${race.getDate()}, ${race.getFullYear()}`;

  let weekNumber = 1;
  if (planStartIso) {
    const start = weekStart(new Date(planStartIso + "T00:00:00"));
    const elapsed = Math.floor((weekStart(today).getTime() - start.getTime()) / (7 * DAY));
    weekNumber = Math.min(Math.max(1, elapsed + 1), Math.max(1, totalWeeks));
  }

  const progressPct = totalWeeks > 0
    ? Math.min(100, Math.round((weekNumber / totalWeeks) * 100))
    : 0;

  return {
    days,
    isoWeek: isoWeekNumber(today),
    dateIso: raceDateIso,
    label,
    progressPct,
    weekNumber,
    totalWeeks,
  };
}

/**
 * Calendar weeks inside the window where nothing was run.
 *
 * A plan that rolls on as though week three happened is lying about the
 * athlete's fitness, and the capacity model that sizes the next block is only
 * as honest as what it is told. Surfacing these is what lets the plan account
 * for the gap rather than average over it.
 */
export function interruptedWeeks(bars: VolumeBar[]): number[] {
  return bars.filter((b) => b.interrupted).map((b) => b.isoWeek);
}

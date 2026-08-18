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

import {
  calendarDotColor, volumeBarAppearance, volumeBarHeight, volumeBarTitle,
  type DayState, type WeekPosition,
} from "./presentation";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

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
export function isoWeekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - dayNum + 3); // the Thursday of this week

  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);

  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * DAY));
}

/** The year an ISO week belongs to, which is not always the calendar year. */
export function isoWeekYear(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  return t.getUTCFullYear();
}

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

/** Monday of the week containing `d`. Weeks start Monday, as the plan does. */
export function weekStart(d: Date): Date {
  const out = new Date(d);
  const shift = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - shift);
  out.setHours(0, 0, 0, 0);
  return out;
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
export function weeklyVolume(runs: RunRow[], asOf: Date = new Date()): VolumeBar[] {
  const currentMonday = weekStart(asOf);
  const firstMonday = new Date(currentMonday.getTime() - (VOLUME_WEEKS - 1) * 7 * DAY);

  const totals = new Array<number>(VOLUME_WEEKS).fill(0);

  for (const run of runs) {
    if (!run.date || !(run.distanceM > 0)) continue;
    const runDate = new Date(run.date + "T00:00:00");
    const index = Math.floor((weekStart(runDate).getTime() - firstMonday.getTime()) / (7 * DAY));
    if (index >= 0 && index < VOLUME_WEEKS) totals[index] += run.distanceM / 1000;
  }

  const max = Math.max(...totals, 1);

  // Only weeks after the athlete's first recorded run count as interruptions.
  // Empty weeks before they started are simply weeks we know nothing about.
  const firstActive = totals.findIndex((km) => km > 0);

  return totals.map((km, i) => {
    const position: WeekPosition = i < VOLUME_WEEKS - 1 ? "past" : "current";
    const { bg, border } = volumeBarAppearance(position);
    const monday = new Date(firstMonday.getTime() + i * 7 * DAY);
    const isoWeek = isoWeekNumber(monday);
    const interrupted = firstActive >= 0 && i > firstActive && km === 0;

    return {
      weekNumber: i + 1,
      isoWeek,
      km,
      h: volumeBarHeight(km, max),
      bg,
      border,
      title: interrupted
        ? `Week ${isoWeek} · no running`
        : volumeBarTitle(isoWeek, km, position),
      interrupted,
    };
  });
}

/** This week's distance in km, and the change against last week in percent. */
export function weeklyVolumeSummary(
  runs: RunRow[],
  asOf: Date = new Date(),
): { km: number; changePct: number | null } {
  const bars = weeklyVolume(runs, asOf);
  const thisWeek = bars[bars.length - 1]?.km ?? 0;
  const lastWeek = bars[bars.length - 2]?.km ?? 0;
  return {
    km: Math.round(thisWeek),
    // A change against a week of nothing is not a percentage anyone can read.
    changePct: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
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
  asOf: Date = new Date(),
): Record<number, string> {
  const todayIso = iso(asOf);
  const ran = new Set(runs.filter((r) => r.distanceM > 0).map((r) => r.date));
  const out: Record<number, string> = {};

  const key = (dateIso: string) => {
    const d = new Date(dateIso + "T00:00:00");
    return d.getMonth() * 100 + d.getDate();
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
export function runStreak(runs: RunRow[], asOf: Date = new Date()): number {
  const ran = new Set(runs.filter((r) => r.distanceM > 0).map((r) => r.date));
  if (ran.size === 0) return 0;

  const today = new Date(asOf);
  today.setHours(0, 0, 0, 0);

  let cursor = new Date(today);
  if (!ran.has(iso(cursor))) {
    cursor = new Date(today.getTime() - DAY);
    if (!ran.has(iso(cursor))) return 0;
  }

  let streak = 0;
  while (ran.has(iso(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY);
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
  asOf: Date = new Date(),
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

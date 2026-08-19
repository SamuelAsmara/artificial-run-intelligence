/**
 * The coach's calendar: a year, a month or a week of everybody's training.
 *
 * The athlete's calendar answers "what am I doing on Thursday". A coach's has
 * to answer something harder — *whose* Thursday, and how much of it — across
 * thirty people at once. So a day is not one session here, it is a set of them,
 * grouped by the race each athlete is preparing for. That grouping is what
 * makes the month view readable: a coach recognises "the marathon block" as a
 * colour long before they read a name.
 *
 * Pure. Dates in, cells out. No queries, no React, and `today` is always a
 * parameter so a test can assert what a Tuesday in March looks like.
 */

import { addDays, isoDate, weekStart, WEEKDAYS } from "@/lib/time/week";
import type { RaceType } from "@/types/database.types";

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

/**
 * The default colour per race distance.
 *
 * Four hues that stay distinguishable next to each other and against the dark
 * surface, drawn from the palette already in `globals.css` rather than invented
 * here. A coach can override any of them — see `coach_preferences.race_colors`
 * in migration 0012 — because a club that calls the marathon group "the reds"
 * should be able to make them red.
 */
export const DEFAULT_RACE_COLORS: Record<RaceType, string> = {
  "5k": "#5a9bf5",
  "10k": "#6fcf87",
  half: "#e3b84e",
  full: "#e0566b",
};

/** Sessions belonging to an athlete with no goal race set. */
export const NO_RACE_COLOR = "#6b7686";

export function colorFor(
  raceType: RaceType | null,
  overrides: Partial<Record<string, string>> = {},
): string {
  if (!raceType) return NO_RACE_COLOR;
  const chosen = overrides[raceType];
  // A stored value has to look like a colour before it reaches an inline style.
  return chosen && /^#[0-9a-f]{6}$/i.test(chosen) ? chosen : DEFAULT_RACE_COLORS[raceType];
}

/* ------------------------------------------------------------------ */
/* What goes on the calendar                                           */
/* ------------------------------------------------------------------ */

export interface CalendarSession {
  /** ISO date */
  date: string;
  athleteId: string;
  athleteName: string;
  raceType: RaceType | null;
  /** "easy" | "long" | "interval" | "rest" */
  workoutType: string;
  plannedDistanceM: number | null;
  /** true when a run was recorded that day */
  done: boolean;
}

export interface DayCell {
  /** ISO date, or null for the padding cells before the 1st */
  date: string | null;
  /** day of the month, blank on padding */
  label: string;
  inMonth: boolean;
  isToday: boolean;
  /** every session that day, in the order given */
  sessions: CalendarSession[];
  /** one entry per race group present that day, for the dots */
  groups: { raceType: RaceType | null; color: string; count: number; done: number }[];
}

const isRest = (s: CalendarSession) => s.workoutType === "rest";

/**
 * Sessions grouped by race, rest days excluded.
 *
 * A rest day is real and belongs in the athlete's own week, but thirty rest
 * days drawn on a month grid say nothing except that it is Sunday.
 */
function groupsOf(
  sessions: CalendarSession[],
  overrides: Partial<Record<string, string>>,
): DayCell["groups"] {
  const by = new Map<string, { raceType: RaceType | null; count: number; done: number }>();
  for (const s of sessions) {
    if (isRest(s)) continue;
    const key = s.raceType ?? "none";
    const entry = by.get(key) ?? { raceType: s.raceType, count: 0, done: 0 };
    entry.count += 1;
    if (s.done) entry.done += 1;
    by.set(key, entry);
  }
  const order: (RaceType | "none")[] = ["5k", "10k", "half", "full", "none"];
  return order
    .filter((k) => by.has(k))
    .map((k) => {
      const e = by.get(k) as { raceType: RaceType | null; count: number; done: number };
      return { ...e, color: colorFor(e.raceType, overrides) };
    });
}

/* ------------------------------------------------------------------ */
/* Month                                                               */
/* ------------------------------------------------------------------ */

export interface MonthView {
  year: number;
  /** 0-11 */
  month: number;
  label: string;
  /** always six rows of seven, so the grid does not jump between months */
  weeks: DayCell[][];
  headers: string[];
}

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Weekday initials, Sunday first — the week this whole app runs on. */
export const DAY_HEADERS = WEEKDAYS.map((d) => d.slice(0, 1));

/**
 * A month as six rows of seven days.
 *
 * Fixed at six rows rather than however many the month needs. A grid that is
 * five rows in February and six in March jumps a centimetre when you page
 * between them, and a calendar you page through constantly should not move.
 */
export function monthView(
  year: number,
  month: number,
  sessions: CalendarSession[],
  today: string,
  overrides: Partial<Record<string, string>> = {},
): MonthView {
  const byDate = new Map<string, CalendarSession[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }

  const first = new Date(year, month, 1);
  const gridStart = weekStart(first);

  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(gridStart, w * 7 + d);
      const iso = isoDate(day);
      const inMonth = day.getMonth() === month && day.getFullYear() === year;
      const daySessions = byDate.get(iso) ?? [];
      row.push({
        date: iso,
        label: String(day.getDate()),
        inMonth,
        isToday: iso === today,
        sessions: daySessions,
        groups: groupsOf(daySessions, overrides),
      });
    }
    weeks.push(row);
  }

  return {
    year,
    month,
    label: `${MONTHS_LONG[month]} ${year}`,
    weeks,
    headers: DAY_HEADERS,
  };
}

/* ------------------------------------------------------------------ */
/* Week                                                                */
/* ------------------------------------------------------------------ */

export interface WeekView {
  /** ISO date of the Sunday this week starts on */
  startsOn: string;
  label: string;
  days: (DayCell & { weekday: string })[];
}

const short = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()].slice(0, 3)}`;
};

export function weekView(
  anchorIso: string,
  sessions: CalendarSession[],
  today: string,
  overrides: Partial<Record<string, string>> = {},
): WeekView {
  const start = weekStart(new Date(anchorIso + "T00:00:00"));
  const byDate = new Map<string, CalendarSession[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i);
    const iso = isoDate(day);
    const daySessions = byDate.get(iso) ?? [];
    return {
      date: iso,
      label: String(day.getDate()),
      inMonth: true,
      isToday: iso === today,
      sessions: daySessions,
      groups: groupsOf(daySessions, overrides),
      weekday: WEEKDAYS[i],
    };
  });

  return {
    startsOn: isoDate(start),
    label: `${short(days[0].date)} – ${short(days[6].date)}`,
    days,
  };
}

/* ------------------------------------------------------------------ */
/* Year                                                                */
/* ------------------------------------------------------------------ */

export interface YearDay {
  date: string;
  /** 0 when nothing was planned, otherwise how many sessions */
  count: number;
  /** the dominant race group that day, for the square's colour */
  color: string | null;
  isToday: boolean;
}

export interface YearMonth {
  month: number;
  label: string;
  days: YearDay[];
  /** sessions in the month, for the caption */
  total: number;
}

/**
 * Twelve months of small squares.
 *
 * One square per day, coloured by whichever race group has the most sessions
 * that day. A year is far too much to read session by session — what it is for
 * is shape: where the blocks are, where the gaps are, when the season peaks.
 * Density carries that, and a legend carries the rest.
 */
export function yearView(
  year: number,
  sessions: CalendarSession[],
  today: string,
  overrides: Partial<Record<string, string>> = {},
): YearMonth[] {
  const byDate = new Map<string, CalendarSession[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }

  return Array.from({ length: 12 }, (_, month) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: YearDay[] = [];
    let total = 0;

    for (let n = 1; n <= daysInMonth; n++) {
      const iso = isoDate(new Date(year, month, n));
      const daySessions = (byDate.get(iso) ?? []).filter((s) => !isRest(s));
      total += daySessions.length;
      const groups = groupsOf(daySessions, overrides);
      const dominant = groups.reduce<DayCell["groups"][number] | null>(
        (best, g) => (best === null || g.count > best.count ? g : best),
        null,
      );
      days.push({
        date: iso,
        count: daySessions.length,
        color: dominant ? dominant.color : null,
        isToday: iso === today,
      });
    }

    return { month, label: MONTHS_LONG[month].slice(0, 3), days, total };
  });
}

/** Opacity for a year square, so a busy day reads darker than a quiet one. */
export function densityOpacity(count: number, busiest: number): number {
  if (count <= 0) return 0;
  if (busiest <= 1) return 1;
  // Floor at 0.28 so a single session is still visible against the surface.
  return 0.28 + 0.72 * Math.min(1, count / busiest);
}

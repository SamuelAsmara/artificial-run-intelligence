/**
 * What a week is.
 *
 * One definition, in one place, because three screens disagree the moment there
 * are two: the coach's week board, the dashboard's weekly volume bars, and the
 * plan's week numbering all have to mean the same seven days.
 *
 * ## Why Sunday, and why that is a setting rather than a fact
 *
 * ISO 8601 says weeks start on Monday, and most international running apps
 * follow it. But a week is a cultural object, not a physical one: in Israel —
 * where this product's athletes are — the working week runs Sunday to Saturday,
 * and a board that puts Sunday on the far right is simply wrong for them.
 *
 * So the start day is a constant rather than an assumption. When Runi reaches
 * users elsewhere this becomes a per-user or per-region setting, and every
 * screen follows it without further work, because every screen asks here.
 *
 * The consequence is stated plainly: our week numbers are *not* ISO week
 * numbers. They are "the Nth week of this year" under our own definition, and
 * for part of the year they will differ by one from what a calendar app shows.
 * That is the correct trade — the number exists so an athlete and a coach can
 * say "week 34" to each other, and both of them live here.
 */

/** 0 = Sunday, 1 = Monday. Locale-dependent; see the note above. */
export const WEEK_STARTS_ON = 0;

export const DAY_MS = 86_400_000;

/** Weekday names in display order, starting on the configured first day. */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  .slice(WEEK_STARTS_ON)
  .concat(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].slice(0, WEEK_STARTS_ON));

/** How many days into its week a date falls. 0 on the first day of the week. */
export function dayOfWeek(d: Date): number {
  return (d.getDay() - WEEK_STARTS_ON + 7) % 7;
}

/** The first day of the week containing `d`, at local midnight. */
export function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - dayOfWeek(out));
  return out;
}

/**
 * The calendar date a `Date` falls on, in the runtime's own timezone.
 *
 * Not `toISOString().slice(0, 10)`, which is UTC. In Israel — two or three
 * hours ahead — local midnight is still *yesterday* in UTC, so the two answers
 * differ every single day between midnight and the offset. Anything comparing a
 * date key against a stored `YYYY-MM-DD` has to use this one.
 */
export const isoDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * `n` calendar days from `d`, at local midnight.
 *
 * Stepping by 86,400,000 ms is wrong twice a year: across a DST boundary a
 * "week" of milliseconds lands an hour early or late, and floor-dividing by it
 * then puts the result in the wrong week entirely.
 */
/**
 * The timezone the app presents dates and times in.
 *
 * Fixed rather than "whatever the server is", which on Vercel is UTC. A run
 * started at 01:00 on Tuesday in Tel Aviv is 22:00 on Monday in UTC, so the
 * activity list headed it "Aug 17" and the detail page said "Monday, 10:00 PM"
 * for a run the athlete did on Tuesday morning.
 *
 * Same trade as `WEEK_STARTS_ON`: right for the athletes this is built for,
 * and the thing to revisit if that changes. It is deliberately one constant so
 * revisiting it is one edit.
 */
export const APP_TIME_ZONE = "Asia/Jerusalem";

/** The locale used for the same reason. Day-month order, 24-hour clock. */
export const APP_LOCALE = "en-GB";

/**
 * Now, expressed as a `Date` whose *local* fields are the wall clock in
 * `APP_TIME_ZONE`.
 *
 * ## The problem this solves
 *
 * `isoDate`, `weekStart`, `dayOfWeek` and `addDays` all read `getFullYear()`,
 * `getMonth()` and `getDate()` — the **runtime's** timezone. Vercel's Node
 * runtime is UTC and nothing sets `TZ`, so in production every one of them was
 * answering in UTC while `APP_TIME_ZONE` said Asia/Jerusalem. The test suite
 * proved the intended behaviour under a timezone production never had, because
 * `railTimezone.test.ts` sets `process.env.TZ` before it runs.
 *
 * The visible cost was three hours every night: between 00:00 and 03:00 Israel
 * time the streak was short by a day, today's calendar dot landed on yesterday,
 * and the plan strip labelled yesterday's session "Today".
 *
 * ## Why shift the Date rather than pass a timezone everywhere
 *
 * Because the alternative is threading a zone through a dozen pure functions
 * and their tests. Reading the wall clock once here and handing the rest of the
 * code a `Date` that already means the right day keeps every one of them
 * unchanged — and they stay correct under any server timezone, including a
 * developer's laptop, which is the property the `TZ` variable does not give.
 *
 * The returned `Date` is *not* the same instant as `now`. It is a carrier for
 * calendar fields and must not be used for durations.
 */
export function zonedNow(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Intl renders midnight as hour 24 in some engines under hourCycle h23/h24.
  const hour = get("hour") % 24;
  return new Date(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

/** Today's calendar date in `APP_TIME_ZONE`, as `YYYY-MM-DD`. */
export const todayIso = (now: Date = new Date()): string => isoDate(zonedNow(now));

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

/** The seven ISO dates of the week containing `date`, first day first. */
export function weekDates(date: string): string[] {
  const start = weekStart(new Date(`${date}T00:00:00`));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return isoDate(day);
  });
}

/**
 * Which week of the year a date falls in.
 *
 * Keeps ISO's *rule* — week 1 is the week containing the year's first Thursday
 * — while using our own first day rather than ISO's Monday. Pivoting on
 * Thursday is what stops a year that begins mid-week from putting 1 January and
 * 3 January in differently numbered weeks.
 *
 * ISO can shortcut this by anchoring on 4 January, which is always in week 1
 * when weeks start on Monday. That guarantee does **not** survive moving the
 * first day, so this finds the first Thursday for real. A test walks every day
 * of a year and asserts the numbers never repeat, skip, or reach zero.
 */
export function weekNumber(d: Date): number {
  const thursday = thursdayOf(d);
  const first = firstThursdayOf(thursday.getUTCFullYear());
  return 1 + Math.round((thursday.getTime() - first.getTime()) / (7 * DAY_MS));
}

/** The year a week belongs to, which at the turn of the year is not always its own. */
export function weekYear(d: Date): number {
  return thursdayOf(d).getUTCFullYear();
}

/** The Thursday of the week containing `d`, in UTC. */
function thursdayOf(d: Date): Date {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const intoWeek = (t.getUTCDay() - WEEK_STARTS_ON + 7) % 7;
  // Thursday's offset from the first day of the week.
  const thursdayOffset = (4 - WEEK_STARTS_ON + 7) % 7;
  t.setUTCDate(t.getUTCDate() - intoWeek + thursdayOffset);
  return t;
}

/** 1 January, walked forward to the year's first Thursday. */
function firstThursdayOf(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  jan1.setUTCDate(jan1.getUTCDate() + ((4 - jan1.getUTCDay() + 7) % 7));
  return jan1;
}

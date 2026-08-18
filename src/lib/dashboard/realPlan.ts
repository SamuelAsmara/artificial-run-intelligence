/**
 * Turning stored `plan_workouts` rows into the shape the dashboard renders.
 *
 * The dashboard's weekly strip was built against `model.ts`, which generates a
 * twelve-week reference plan. This produces the identical `Week[]` structure
 * from real rows so the view does not have to change — the ported Claude Design
 * markup keeps rendering exactly as it did, only the numbers become the
 * athlete's own.
 *
 * ## Where "Done" and "Missed" come from
 *
 * `plan_workouts.status` exists but is only written by the adjustment engine.
 * A workout being *completed* is a fact about the activity history, not about
 * the plan, so it is derived here: a planned session on a past date counts as
 * done when there is a run recorded that day. That way the strip is correct
 * even before any sync job has annotated the plan, and it cannot drift out of
 * agreement with the activity list on the same screen.
 *
 * A rest day is never "missed". Not running on a rest day is the plan working.
 */

import type { WorkoutType as DbWorkoutType } from "@/types/database.types";
import type { Day, Week } from "./model";
import { describeSession, paceLabel } from "@/lib/planning/paces";
import { isoWeekNumber } from "./rail";

/** The dashboard's own workout vocabulary, which is not the database's. */
type ViewWorkoutType = "easy" | "tempo" | "int" | "long" | "rest";

const TO_VIEW: Record<DbWorkoutType, ViewWorkoutType> = {
  easy: "easy",
  interval: "int",
  long: "long",
  rest: "rest",
};

const NAMES: Record<ViewWorkoutType, string> = {
  easy: "Easy Run", tempo: "Tempo Run", int: "Intervals",
  long: "Long Run", rest: "Rest",
};
const TAGS: Record<ViewWorkoutType, string> = {
  easy: "Easy", tempo: "Moderate", int: "Hard", long: "Long", rest: "Rest",
};

const DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export interface PlanWorkoutRow {
  week_number: number;
  day_date: string;
  workout_type: DbWorkoutType;
  planned_distance: number | null;
  planned_pace: string | null;
  status: string | null;
}

export interface CompletedRun {
  /** ISO date, YYYY-MM-DD */
  date: string;
  distanceM: number;
}

export interface RealPlan {
  weeks: Week[];
  /** zero-based index of the week containing today, or the last week */
  currentWeek: number;
  /** the next session at or after today, for the hero card */
  next: NextSession | null;
}

export interface NextSession {
  type: ViewWorkoutType;
  name: string;
  date: string;
  isToday: boolean;
  distanceM: number;
  pace: string | null;
  /** "6.0 km @ 5:49/km" */
  summary: string;
  durationSec: number | null;
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function buildRealPlan(
  rows: PlanWorkoutRow[],
  completed: CompletedRun[],
  thresholdSpeedMps: number | null,
  today: Date = new Date(),
): RealPlan {
  const todayIso = iso(today);
  const ranDates = new Set(completed.filter((c) => c.distanceM > 0).map((c) => c.date));

  const byWeek = new Map<number, PlanWorkoutRow[]>();
  for (const row of rows) {
    const list = byWeek.get(row.week_number) ?? [];
    list.push(row);
    byWeek.set(row.week_number, list);
  }

  const weekNumbers = [...byWeek.keys()].sort((a, b) => a - b);
  const totalWeeks = weekNumbers.length;

  const weeks: Week[] = weekNumbers.map((weekNumber, index) => {
    const dayRows = (byWeek.get(weekNumber) ?? []).sort((a, b) =>
      a.day_date.localeCompare(b.day_date),
    );

    const days: Day[] = dayRows.map((row) => {
      const type = TO_VIEW[row.workout_type];
      const date = new Date(row.day_date + "T00:00:00");
      const isPast = row.day_date < todayIso;
      const isToday = row.day_date === todayIso;
      const ran = ranDates.has(row.day_date);

      let done = false;
      let missed = false;
      let status = "";

      if (type === "rest") {
        status = isToday ? "Today" : "";
      } else if (ran) {
        done = true;
        status = "Done";
      } else if (isPast) {
        missed = true;
        status = "Missed";
      } else if (isToday) {
        status = "Today";
      } else if (row.status === "adjusted") {
        status = "Adjusted";
      }

      return {
        type: type as Day["type"],
        name: NAMES[type],
        tag: TAGS[type],
        dist: row.planned_distance ? Math.round(row.planned_distance / 100) / 10 : 0,
        pace:
          row.planned_pace ??
          (thresholdSpeedMps ? (paceLabel(row.workout_type, thresholdSpeedMps) ?? "") : ""),
        day: DN[(date.getDay() + 6) % 7],
        dateNum: date.getDate(),
        mon: MO[date.getMonth()],
        status,
        done,
        missed,
        today: isToday,
      };
    });

    const first = days[0];
    const last = days[days.length - 1];

    // Named by the calendar week, with the plan week alongside. A coach and an
    // athlete can both say "week 34" and mean the same seven days; "week 2"
    // only means something if you already know which plan started when.
    const monday = dayRows[0] ? new Date(dayRows[0].day_date + "T00:00:00") : null;
    const isoWeek = monday ? isoWeekNumber(monday) : index + 1;

    return {
      days,
      label: `Week ${isoWeek} · ${index + 1} of ${totalWeeks}`,
      range: first && last
        ? `${first.mon} ${first.dateNum} – ${last.mon === first.mon ? "" : last.mon + " "}${last.dateNum}`
        : "",
    };
  });

  const currentWeek = Math.max(
    0,
    weeks.findIndex((w) => w.days.some((d) => d.today)),
  );

  return {
    weeks,
    currentWeek: weeks.some((w) => w.days.some((d) => d.today))
      ? currentWeek
      : Math.max(0, weeks.length - 1),
    next: findNext(rows, todayIso, thresholdSpeedMps),
  };
}

/** The first non-rest session at or after today. */
function findNext(
  rows: PlanWorkoutRow[],
  todayIso: string,
  thresholdSpeedMps: number | null,
): NextSession | null {
  const upcoming = rows
    .filter(
      (r) =>
        r.day_date >= todayIso &&
        r.workout_type !== "rest" &&
        (r.planned_distance ?? 0) > 0,
    )
    .sort((a, b) => a.day_date.localeCompare(b.day_date));

  const row = upcoming[0];
  if (!row) return null;

  const type = TO_VIEW[row.workout_type];
  const distanceM = row.planned_distance as number;
  const pace =
    row.planned_pace ??
    (thresholdSpeedMps ? paceLabel(row.workout_type, thresholdSpeedMps) : null);

  const durationSec = pace ? paceToDuration(pace, distanceM) : null;

  return {
    type,
    name: NAMES[type],
    date: row.day_date,
    isToday: row.day_date === todayIso,
    distanceM,
    pace,
    summary: describeSession(row.workout_type, distanceM, thresholdSpeedMps),
    durationSec,
  };
}

/** "5:49" plus a distance back into seconds, for the "~49 min" line. */
function paceToDuration(pace: string, distanceM: number): number | null {
  const [m, s] = pace.split(":").map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
  return Math.round((distanceM / 1000) * (m * 60 + s));
}

/**
 * The session bar for a real planned workout.
 *
 * Mirrors `nextSessionSegments` in model.ts — same visual vocabulary, same
 * proportional widths — but built from the athlete's own distance and pace
 * rather than the reference session. Intervals get a warm-up, six reps with
 * recoveries and a cool-down; steady sessions are a single block.
 */
export function realSessionSegments(
  next: NextSession,
): { w: string; h: number; bg: string; title: string }[] {
  const paceLabelText = next.pace ? `${next.pace}/km` : "steady";

  if (next.type !== "int") {
    return [
      {
        w: "100.00",
        h: next.type === "long" ? 30 : 22,
        bg: "var(--color-accent)",
        title: `${(next.distanceM / 1000).toFixed(1)} km @ ${paceLabelText}`,
      },
    ];
  }

  // Split an interval session into warm-up, six reps and a cool-down. The reps
  // take roughly half the distance; the rest is warm-up and cool-down.
  const repTotalM = next.distanceM * 0.5;
  const repM = repTotalM / 6;
  const wuM = (next.distanceM - repTotalM) / 2;

  const segs: { min: number; h: number; bg: string; title: string }[] = [
    { min: wuM, h: 24, bg: "var(--color-atl)", title: `Warm-up · ${(wuM / 1000).toFixed(1)} km easy` },
  ];
  for (let i = 0; i < 6; i++) {
    segs.push({
      min: repM,
      h: 52,
      bg: "var(--color-accent)",
      title: `${Math.round(repM)} m @ ${paceLabelText}`,
    });
    if (i < 5) {
      segs.push({ min: repM * 0.4, h: 12, bg: "var(--color-line-strong)", title: "Recovery jog" });
    }
  }
  segs.push({
    min: wuM,
    h: 24,
    bg: "var(--color-atl)",
    title: `Cool-down · ${(wuM / 1000).toFixed(1)} km easy`,
  });

  const total = segs.reduce((s, x) => s + x.min, 0) || 1;
  return segs.map((s) => ({
    w: ((s.min / total) * 100).toFixed(2),
    h: s.h,
    bg: s.bg,
    title: s.title,
  }));
}

/** "Today", "Tomorrow", or "Sat 23 Aug". */
export function relativeDay(dateIso: string, today: Date = new Date()): string {
  const todayIso = iso(today);
  const tomorrowIso = iso(new Date(today.getTime() + DAY));
  if (dateIso === todayIso) return "Today";
  if (dateIso === tomorrowIso) return "Tomorrow";
  const d = new Date(dateIso + "T00:00:00");
  return `${DN[(d.getDay() + 6) % 7]} ${d.getDate()} ${MO[d.getMonth()]}`;
}

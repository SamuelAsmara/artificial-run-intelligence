/**
 * What a coach needs to know, derived from what the athletes did.
 *
 * Everything here is pure: it takes rows and returns the things the coach
 * screens render. No queries, no formatting for a particular layout.
 *
 * ## The idea the whole coach side turns on
 *
 * A coach with twelve athletes opens a week board of eighty-four cells. Nobody
 * reads eighty-four cells. So the board is the background and the *flags* are
 * the foreground: the screen's job is to say where to look, and only then to
 * let you look.
 */

import { weekDates } from "@/lib/time/week";

export type RaceType = "5k" | "10k" | "half" | "full";

export { weekDates };

export interface AthleteRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** today's readiness, 0-100 */
  readiness: number | null;
  /** form, i.e. TSB */
  form: number | null;
  /** acute:chronic load ratio */
  loadRatio: number | null;
  /** ISO date of their most recent run */
  lastRunAt: string | null;
  /** metres in that run */
  lastRunM: number | null;
  raceType: RaceType | null;
  /** ISO date */
  raceDate: string | null;
  /** planned sessions in the current week that have no matching run */
  missedThisWeek: number;
}

/* ------------------------------------------------------------------ */
/* Attention                                                           */
/* ------------------------------------------------------------------ */

export type FlagKind = "silent" | "missed" | "overload" | "underload" | "flat" | "race";

export interface Flag {
  athleteId: string;
  athleteName: string;
  kind: FlagKind;
  /** one sentence, already written for a human */
  text: string;
  /** how loudly to draw it */
  tone: "negative" | "caution" | "accent";
}

/** No run for this many days is worth asking about. */
export const SILENT_DAYS = 5;
/** Above this, the acute:chronic ratio is in the band injuries cluster in. */
export const OVERLOAD_RATIO = 1.5;
/** Below this, they are detraining rather than resting. */
export const UNDERLOAD_RATIO = 0.8;
/** Readiness under this is a body asking for a lighter day. */
export const LOW_READINESS = 55;
/** A race closer than this is near enough to change what you prescribe. */
export const RACE_SOON_DAYS = 21;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * The handful of things worth interrupting a coach for.
 *
 * Ordered by how much they change what the coach should do next, not by
 * severity in the abstract: an athlete who has vanished for a week matters more
 * than one whose readiness dipped this morning.
 */
export function flagsFor(a: AthleteRow, today: string): Flag[] {
  const out: Flag[] = [];
  const add = (kind: FlagKind, tone: Flag["tone"], text: string) =>
    out.push({ athleteId: a.id, athleteName: a.name, kind, tone, text });

  if (a.lastRunAt) {
    const quiet = daysBetween(a.lastRunAt.slice(0, 10), today);
    if (quiet >= SILENT_DAYS) {
      add("silent", "negative", `No run in ${quiet} days.`);
    }
  }

  if (a.missedThisWeek > 0) {
    add(
      "missed",
      "caution",
      a.missedThisWeek === 1
        ? "Missed one session this week."
        : `Missed ${a.missedThisWeek} sessions this week.`,
    );
  }

  if (a.loadRatio !== null && a.loadRatio > OVERLOAD_RATIO) {
    add("overload", "negative", `Load ratio ${a.loadRatio.toFixed(2)} — ramping faster than they have absorbed.`);
  } else if (a.loadRatio !== null && a.loadRatio < UNDERLOAD_RATIO) {
    add("underload", "accent", `Load ratio ${a.loadRatio.toFixed(2)} — losing more fitness than they are building.`);
  }

  if (a.readiness !== null && a.readiness < LOW_READINESS) {
    add("flat", "caution", `Readiness ${a.readiness} — worth an easier day.`);
  }

  if (a.raceDate) {
    const away = daysBetween(today, a.raceDate);
    if (away >= 0 && away <= RACE_SOON_DAYS) {
      add("race", "accent", `Races in ${away} ${away === 1 ? "day" : "days"}.`);
    }
  }

  return out;
}

/** Every flag across the roster, loudest first. */
export function rosterFlags(athletes: AthleteRow[], today: string): Flag[] {
  const order: Record<Flag["tone"], number> = { negative: 0, caution: 1, accent: 2 };
  return athletes
    .flatMap((a) => flagsFor(a, today))
    .sort((x, y) => order[x.tone] - order[y.tone]);
}

/* ------------------------------------------------------------------ */
/* The header summary                                                  */
/* ------------------------------------------------------------------ */

export interface RaceGroup {
  raceType: RaceType;
  count: number;
}

export interface UpcomingRace {
  athleteId: string;
  athleteName: string;
  raceType: RaceType;
  raceDate: string;
  daysAway: number;
}

export interface RosterSummary {
  total: number;
  /** how many are training for each distance, largest group first */
  byRace: RaceGroup[];
  /** how many have no goal race set */
  withoutRace: number;
  /** races ahead, soonest first */
  upcoming: UpcomingRace[];
}

const RACE_ORDER: RaceType[] = ["5k", "10k", "half", "full"];

export function summariseRoster(athletes: AthleteRow[], today: string): RosterSummary {
  const counts = new Map<RaceType, number>();
  const upcoming: UpcomingRace[] = [];

  for (const a of athletes) {
    if (!a.raceType) continue;
    counts.set(a.raceType, (counts.get(a.raceType) ?? 0) + 1);
    if (a.raceDate && daysBetween(today, a.raceDate) >= 0) {
      upcoming.push({
        athleteId: a.id,
        athleteName: a.name,
        raceType: a.raceType,
        raceDate: a.raceDate,
        daysAway: daysBetween(today, a.raceDate),
      });
    }
  }

  const byRace = RACE_ORDER
    .filter((r) => counts.has(r))
    .map((r) => ({ raceType: r, count: counts.get(r) as number }))
    .sort((x, y) => y.count - x.count);

  return {
    total: athletes.length,
    byRace,
    withoutRace: athletes.filter((a) => !a.raceType).length,
    upcoming: upcoming.sort((x, y) => x.daysAway - y.daysAway),
  };
}

/* ------------------------------------------------------------------ */
/* The week board                                                      */
/* ------------------------------------------------------------------ */

export type CellState = "done" | "missed" | "planned" | "rest" | "extra" | "empty";

export interface BoardCell {
  /** ISO date */
  date: string;
  state: CellState;
  /** "Easy 8 km", "Rest", or null when nothing was planned or run */
  planned: string | null;
  /** what actually happened, when something did */
  actualKm: number | null;
}

export interface BoardRow {
  athleteId: string;
  athleteName: string;
  avatarUrl: string | null;
  cells: BoardCell[];
}

export interface PlannedSession {
  athleteId: string;
  /** ISO date */
  date: string;
  workoutType: string;
  distanceM: number | null;
}

export interface RunRecord {
  athleteId: string;
  /** ISO date */
  date: string;
  distanceM: number;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How a planned session reads in a cell. */
function describe(session: PlannedSession): string {
  if (session.workoutType === "rest") return "Rest";
  const km = session.distanceM ? ` ${(session.distanceM / 1000).toFixed(0)} km` : "";
  return titleCase(session.workoutType) + km;
}

/**
 * One row per athlete, seven cells each.
 *
 * A cell reports both halves — what was asked for and what happened — because
 * a coach reading only the plan learns nothing they did not already know. The
 * states carry the difference: `done` and `missed` both had a session planned;
 * `extra` is a run on a day that had none, which is the case worth noticing.
 */
export function weekBoard(
  athletes: AthleteRow[],
  sessions: PlannedSession[],
  runs: RunRecord[],
  today: string,
): BoardRow[] {
  const dates = weekDates(today);

  const plannedBy = new Map<string, PlannedSession>();
  for (const s of sessions) plannedBy.set(`${s.athleteId}|${s.date}`, s);

  const ranBy = new Map<string, number>();
  for (const r of runs) {
    const key = `${r.athleteId}|${r.date}`;
    ranBy.set(key, (ranBy.get(key) ?? 0) + r.distanceM);
  }

  return athletes.map((a) => ({
    athleteId: a.id,
    athleteName: a.name,
    avatarUrl: a.avatarUrl,
    cells: dates.map((date) => {
      const key = `${a.id}|${date}`;
      const session = plannedBy.get(key);
      const ranM = ranBy.get(key) ?? null;
      const planned = session ? describe(session) : null;
      const actualKm = ranM ? Math.round((ranM / 1000) * 10) / 10 : null;

      let state: CellState;
      if (session && session.workoutType === "rest") {
        // A run on a rest day is still a run, and a coach should see it.
        state = ranM ? "extra" : "rest";
      } else if (session) {
        state = ranM ? "done" : date < today ? "missed" : "planned";
      } else {
        state = ranM ? "extra" : "empty";
      }

      return { date, state, planned, actualKm };
    }),
  }));
}

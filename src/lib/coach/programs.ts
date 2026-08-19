/**
 * Preparation cycles — the coach's real unit of work.
 *
 * A coach with thirty athletes does not think in thirty names. They think in
 * blocks: *the ten-K group*, *whoever is running the October marathon*. The
 * roster is how the data is stored; a cycle is how the work is organised, and
 * until now the coaching side only offered the first.
 *
 * ## Why there is no `cycles` table
 *
 * A cycle is already fully described by what we store: the athletes sharing a
 * race distance and a race date are, by definition, preparing together. Adding
 * a table would mean a coach maintaining membership by hand — and getting it
 * wrong — to express something the data already says. So this is derived, and
 * the moment an athlete's goal race changes their cycle changes with it.
 *
 * The cost of that choice is real and worth naming: two athletes running
 * different marathons a week apart are two cycles, not one, and a coach cannot
 * merge them. If that turns out to matter, the fix is a nullable `cycle_id`
 * that overrides the derivation — not a table that replaces it.
 */

import { RACE_LABEL } from "@/lib/coach/templates";
import type { AthleteRow } from "@/lib/coach/roster";
import type { RaceType } from "@/types/database.types";

export interface Cycle {
  /** stable across renders: race type and date identify the cycle */
  id: string;
  raceType: RaceType;
  /** ISO date */
  raceDate: string;
  label: string;
  athletes: AthleteRow[];
  /** how many days until race day; negative once it has been run */
  daysAway: number;
  /** weeks remaining, rounded up — the number a coach counts in */
  weeksAway: number;
  /** mean readiness across the group, or null when nobody has a score */
  meanReadiness: number | null;
  /** how many are carrying at least one attention flag */
  needAttention: number;
}

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY);

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

/**
 * Groups a roster into cycles, soonest race first.
 *
 * Athletes with no goal race are not a cycle — they are the thing a coach needs
 * to fix — so they come back separately rather than being bundled into a
 * pretend group called "other".
 */
export function buildCycles(
  athletes: AthleteRow[],
  today: string,
  flaggedIds: ReadonlySet<string> = new Set(),
): { cycles: Cycle[]; withoutRace: AthleteRow[] } {
  const byKey = new Map<string, AthleteRow[]>();
  const withoutRace: AthleteRow[] = [];

  for (const a of athletes) {
    if (!a.raceType || !a.raceDate) {
      withoutRace.push(a);
      continue;
    }
    const key = `${a.raceType}|${a.raceDate}`;
    const list = byKey.get(key);
    if (list) list.push(a);
    else byKey.set(key, [a]);
  }

  const cycles: Cycle[] = [...byKey.entries()].map(([key, members]) => {
    const [raceType, raceDate] = key.split("|") as [RaceType, string];
    const daysAway = daysBetween(today, raceDate);
    return {
      id: key,
      raceType,
      raceDate,
      label: `${RACE_LABEL[raceType]} · ${raceDate}`,
      athletes: [...members].sort((x, y) => x.name.localeCompare(y.name)),
      daysAway,
      weeksAway: Math.ceil(daysAway / 7),
      meanReadiness: mean(
        members.map((m) => m.readiness).filter((v): v is number => v !== null),
      ),
      needAttention: members.filter((m) => flaggedIds.has(m.id)).length,
    };
  });

  // Races already run sink below races still ahead, and each half is ordered by
  // how soon: a coach reads down from "this weekend", not up from last month.
  cycles.sort((a, b) => {
    const aPast = a.daysAway < 0;
    const bPast = b.daysAway < 0;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return aPast ? b.daysAway - a.daysAway : a.daysAway - b.daysAway;
  });

  return { cycles, withoutRace: withoutRace.sort((x, y) => x.name.localeCompare(y.name)) };
}

/* ------------------------------------------------------------------ */
/* Filtering the roster                                                */
/* ------------------------------------------------------------------ */

export interface RosterFilter {
  /** cycle ids; empty means every cycle */
  cycles: string[];
  /** "male" | "female"; null means either */
  sex: string | null;
  /** seconds per kilometre; null means unbounded on that side */
  paceFrom: number | null;
  paceTo: number | null;
}

export const EMPTY_FILTER: RosterFilter = {
  cycles: [],
  sex: null,
  paceFrom: null,
  paceTo: null,
};

export interface FilterableAthlete extends AthleteRow {
  sex?: string | null;
  /** target pace in seconds per kilometre, from their goal time and distance */
  targetPaceSec?: number | null;
}

/**
 * Applies the roster filters.
 *
 * Every clause is a narrowing, and an empty clause narrows nothing — so the
 * default filter returns the roster untouched. That is deliberate: a filter
 * panel where clearing everything shows nothing is a filter panel people learn
 * to distrust.
 */
export function applyFilter<T extends FilterableAthlete>(
  athletes: T[],
  filter: RosterFilter,
  cycleOf: (a: T) => string | null,
): T[] {
  return athletes.filter((a) => {
    if (filter.cycles.length > 0) {
      const cycle = cycleOf(a);
      if (!cycle || !filter.cycles.includes(cycle)) return false;
    }
    if (filter.sex && a.sex !== filter.sex) return false;
    if (filter.paceFrom !== null) {
      if (a.targetPaceSec === null || a.targetPaceSec === undefined) return false;
      if (a.targetPaceSec < filter.paceFrom) return false;
    }
    if (filter.paceTo !== null) {
      if (a.targetPaceSec === null || a.targetPaceSec === undefined) return false;
      if (a.targetPaceSec > filter.paceTo) return false;
    }
    return true;
  });
}

/** "12 athletes · 3 cycles · 2 without a race" */
export function cyclesSummary(cycles: Cycle[], withoutRace: number): string {
  const total = cycles.reduce((n, c) => n + c.athletes.length, 0) + withoutRace;
  const parts = [`${total} ${total === 1 ? "athlete" : "athletes"}`];
  if (cycles.length > 0) parts.push(`${cycles.length} ${cycles.length === 1 ? "cycle" : "cycles"}`);
  if (withoutRace > 0) parts.push(`${withoutRace} without a race`);
  return parts.join(" · ");
}

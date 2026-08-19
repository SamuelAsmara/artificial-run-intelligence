/**
 * Coach screens — copy and appearance.
 *
 * The coach's home is not a smaller version of the athlete's home. An athlete
 * opens ARI to be told what to do today; a coach opens it to find out which of
 * thirty people needs them. Those are different questions, so this file holds
 * different words and a different visual grammar from `lib/screens/*` for the
 * athlete side.
 *
 * Everything here is pure. No queries, no React, no dates read from the clock —
 * `today` is always passed in, so a test can assert what a Tuesday looks like
 * without waiting for one.
 */

import type { CellState, Flag, RosterSummary } from "@/lib/coach/roster";
import { RACE_LABEL } from "@/lib/coach/templates";
import type { RaceType } from "@/types/database.types";

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export const COACH_COPY = {
  brand: "ARI",
  coachTag: "Coach",
  navHome: "Home",
  navAthletes: "Athletes",
  navTemplates: "Templates",
  navSettings: "Settings",

  homeTitle: "This week",
  homeSub: "What you asked for, and what actually happened.",

  attentionTitle: "Needs you",
  attentionEmpty: "Nothing to flag today.",

  boardEmptyTitle: "No athletes yet",
  boardEmptyBody:
    "Share your coach code. Anyone who enters it joins your roster, and their runs start appearing here the next time they sync.",

  codeLabel: "Your coach code",
  codeHint: "An athlete enters this in Settings to join you.",
  copyCode: "Copy",
  copied: "Copied",
  rosterEmpty:
    "No athletes yet. Share your join code — they enter it in Settings and appear here.",
  rosterFiltered: "Nobody matches those filters.",
  removeTitle: "Remove from roster",
  removeBody:
    "They keep their own training and history — you stop seeing it, and they stop having a coach. They can join you again with your code.",
  remove: "Remove",
  removeConfirm: "Yes, remove",
  removeCancel: "Keep",
  removing: "Removing…",
  issueCode: "Create a code",
  issuing: "Creating…",
  codeHintNone: "You don't have a join code yet. Create one and share it with the athletes you coach.",

  athletesTitle: "Athletes",
  athletesSub: "Everyone you coach, and what their numbers say today.",
  racesTitle: "Races ahead",
  racesEmpty: "Nobody has a goal race set.",
  noRace: "No race set",

  hAthlete: "Athlete",
  hReadiness: "Readiness",
  hForm: "Form",
  hLoad: "Load",
  hLastRun: "Last run",
  hRace: "Race",
  hWhen: "When",

  never: "Never",
  today: "Today",
  yesterday: "Yesterday",

  trendTitle: "Fitness and fatigue",
  trendSub: "Last six weeks",
  planTitle: "The weeks ahead",
  planSub: "Change a session and it changes for them.",
  planPast: "Behind us",
  planEmpty: "No active plan. They need a goal race before one can be generated.",
  runsTitle: "Recent runs",
  runsEmpty: "No runs recorded yet.",

  change: "Change",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",

  templatesTitle: "Your plan templates",
  templatesSub:
    "How you prepare somebody for each distance. Applied to whoever is training for it.",
  tWeeks: "Weeks",
  tName: "Name",
  tPhases: "Phases",
  tMix: "Week shape",
  tRunningDays: "running days",
  usingDefault: "ARI default",
  yourOwn: "Yours",
  resetDefault: "Reset to default",
  templateSaved: "Saved — future plans will use this.",

  navCycles: "Cycles",
  navMine: "My training",

  hello: "Hello",
  highlightsTitle: "Worth knowing",
  highlightsEmpty: "Nothing to raise this morning.",

  cyclesTitle: "Preparation cycles",
  cyclesSub: "Everyone sharing a race and a date is preparing together.",
  cycleEmpty: "No cycles yet — a cycle appears once an athlete sets a goal race.",
  noRaceGroup: "No goal race",
  selectAll: "All",
  clearAll: "Clear",

  fSex: "Sex",
  fPace: "Target pace",
  fCycle: "Cycle",
  anyOption: "Any",

  hAge: "Age",
  hTarget: "Target",
  hPace: "Pace",
  hPlan: "Cycle",

  prefsTitle: "Calendar colours",
  prefsSub: "How each distance is drawn on your calendar.",
  thresholdsTitle: "When to flag an athlete",
  thresholdsSub:
    "The defaults are defensible, not universal. A coach working with beginners wants different numbers from one working with a club.",
  tSilent: "Days without a run",
  tOverload: "Load ratio above",
  tUnderload: "Load ratio below",
  tReadiness: "Readiness below",
  tRaceSoon: "Race within (days)",
  restoreDefaults: "Restore defaults",
} as const;

/**
 * The two or three things a coach should read before anything else.
 *
 * Not a feed and not a log — a short list that earns its place at the top of
 * the screen. Anything that is merely true rather than actionable belongs in
 * the panels below it.
 */
export interface Highlight {
  text: string;
  tone: "negative" | "caution" | "accent" | "muted";
}

export function buildHighlights(input: {
  athleteCount: number;
  flagCount: number;
  needAttention: number;
  nextRace: { name: string; daysAway: number } | null;
  thisWeekPlanned: number;
  thisWeekDone: number;
  withoutRace: number;
}): Highlight[] {
  const out: Highlight[] = [];

  if (input.athleteCount === 0) {
    return [{ text: "No athletes yet — share your coach code to get started.", tone: "accent" }];
  }

  if (input.needAttention > 0) {
    out.push({
      text:
        input.needAttention === 1
          ? "One athlete needs a look today."
          : `${input.needAttention} athletes need a look today.`,
      tone: "negative",
    });
  }

  if (input.nextRace) {
    const { name, daysAway } = input.nextRace;
    out.push({
      text:
        daysAway === 0
          ? `${name} races today.`
          : daysAway === 1
            ? `${name} races tomorrow.`
            : `${name} races in ${daysAway} days.`,
      tone: daysAway <= 7 ? "caution" : "accent",
    });
  }

  if (input.thisWeekPlanned > 0) {
    const pct = Math.round((input.thisWeekDone / input.thisWeekPlanned) * 100);
    out.push({
      text: `${input.thisWeekDone} of ${input.thisWeekPlanned} sessions done this week — ${pct}%.`,
      tone: pct >= 70 ? "muted" : "caution",
    });
  }

  if (input.withoutRace > 0) {
    out.push({
      text:
        input.withoutRace === 1
          ? "One athlete has no goal race, so no plan can be built for them."
          : `${input.withoutRace} athletes have no goal race, so no plan can be built for them.`,
      tone: "caution",
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* The week board                                                      */
/* ------------------------------------------------------------------ */

export interface CellLook {
  /** the block's fill */
  bg: string;
  /** the text on it */
  ink: string;
  /** a left edge, when the state deserves one */
  edge: string;
  /** what the state is called, for the title attribute and the legend */
  name: string;
}

/**
 * How each cell state looks.
 *
 * `extra` — a run on a day nothing was planned — is deliberately drawn in the
 * caution colour rather than the positive one. It is not a failure, but it is
 * the cell a coach most needs to notice: somebody is training off-plan, and
 * whether that is enthusiasm or a misread plan is a conversation, not a colour.
 */
export function cellLook(state: CellState): CellLook {
  switch (state) {
    case "done":
      return { bg: "var(--color-positive-soft, rgba(127,200,135,.14))", ink: "var(--color-positive)", edge: "var(--color-positive)", name: "Completed" };
    case "missed":
      return { bg: "rgba(240,112,92,.12)", ink: "var(--color-negative)", edge: "var(--color-negative)", name: "Missed" };
    case "planned":
      return { bg: "var(--color-elevated)", ink: "var(--color-muted)", edge: "transparent", name: "Planned" };
    case "rest":
      return { bg: "transparent", ink: "var(--color-faint)", edge: "transparent", name: "Rest" };
    case "extra":
      return { bg: "rgba(224,163,60,.12)", ink: "var(--color-caution)", edge: "var(--color-caution)", name: "Unplanned run" };
    case "empty":
      return { bg: "transparent", ink: "var(--color-faint)", edge: "transparent", name: "Nothing planned" };
  }
}

/** The order the legend reads in — loudest states first. */
export const LEGEND: CellState[] = ["done", "missed", "extra", "planned", "rest"];

/* ------------------------------------------------------------------ */
/* Attention                                                           */
/* ------------------------------------------------------------------ */

export const toneColor = (tone: Flag["tone"]): string =>
  tone === "negative"
    ? "var(--color-negative)"
    : tone === "caution"
      ? "var(--color-caution)"
      : "var(--color-accent)";

/** What the flag is called, in two words, above the sentence. */
export const KIND_LABEL: Record<Flag["kind"], string> = {
  silent: "Gone quiet",
  missed: "Missed work",
  overload: "Ramping fast",
  underload: "Detraining",
  flat: "Low readiness",
  race: "Race close",
};

/**
 * At most this many flags on the home screen.
 *
 * A list of forty is not attention, it is wallpaper. The rest stay reachable on
 * the athlete's own page; what matters here is that the top of the list is the
 * thing to do next.
 */
export const FLAG_LIMIT = 6;

/* ------------------------------------------------------------------ */
/* Small formatting                                                    */
/* ------------------------------------------------------------------ */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const DAY_MS = 86_400_000;

/** "Today", "Yesterday", "4 days ago", or "Never". */
export function sinceLabel(iso: string | null, today: string): string {
  if (!iso) return COACH_COPY.never;
  const days = Math.round((Date.parse(today) - Date.parse(iso.slice(0, 10))) / DAY_MS);
  if (days <= 0) return COACH_COPY.today;
  if (days === 1) return COACH_COPY.yesterday;
  return `${days} days ago`;
}

/** "in 12 d", "today", or "12 d ago" for a race already run. */
export function untilLabel(iso: string | null, today: string): string {
  if (!iso) return "—";
  const days = Math.round((Date.parse(iso) - Date.parse(today)) / DAY_MS);
  if (days === 0) return "today";
  return days > 0 ? `in ${days} d` : `${-days} d ago`;
}

/** Readiness reads as a colour before it reads as a number. */
export const readinessColor = (v: number | null): string =>
  v === null
    ? "var(--color-faint)"
    : v >= 70
      ? "var(--color-positive)"
      : v >= 55
        ? "var(--color-caution)"
        : "var(--color-negative)";

/** The acute:chronic ratio, coloured at the thresholds the flags use. */
export const loadColor = (v: number | null): string =>
  v === null
    ? "var(--color-faint)"
    : v > 1.5
      ? "var(--color-negative)"
      : v > 1.3 || v < 0.8
        ? "var(--color-caution)"
        : "var(--color-muted)";

/** Form is TSB: positive is fresh, deeply negative is buried. */
export const formColor = (v: number | null): string =>
  v === null
    ? "var(--color-faint)"
    : v < -25
      ? "var(--color-negative)"
      : v < -10
        ? "var(--color-caution)"
        : "var(--color-positive)";

export const raceLabel = (r: RaceType | null): string =>
  r ? RACE_LABEL[r] : COACH_COPY.noRace;

/**
 * "12 athletes · 5 marathon · 4 half · 3 without a race".
 *
 * Written as one sentence rather than four counters because a coach reads it
 * once at the top of the page and then stops looking at it.
 */
export function summaryLine(s: RosterSummary): string {
  if (s.total === 0) return "No athletes yet";
  const parts = [`${s.total} ${s.total === 1 ? "athlete" : "athletes"}`];
  for (const g of s.byRace) parts.push(`${g.count} ${RACE_LABEL[g.raceType].toLowerCase()}`);
  if (s.withoutRace > 0) parts.push(`${s.withoutRace} without a race`);
  return parts.join(" · ");
}

/** Sunday-first initials for the board header. */
export const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/** "18 Aug" — the date under the day letter. */
export function dayNumber(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

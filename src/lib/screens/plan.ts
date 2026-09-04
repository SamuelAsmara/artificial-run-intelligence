/**
 * Training plan screen model. Maps to plan_workouts + goal_races.
 */

import type { Week as ModelWeek } from "@/lib/dashboard/model";

export type WType = "easy" | "tempo" | "int" | "long" | "rest";

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export interface PlanDay {
  type: WType; name: string; dist: number; pace: string;
  day: string; dateNum: number; mon: string; monIdx: number;
  /** ISO date, YYYY-MM-DD — what the month grid places the cell by */
  date: string;
  status: string; done: boolean; missed: boolean; today: boolean;
  /** why Runi reduced this session — see `Day.reason` in dashboard/model.ts */
  reason?: string | null;
  /** true when a coach or the athlete set these numbers, not the generator */
  byPerson?: boolean;
  /** base / build / peak / taper — null before migration 0020 stored it */
  phase?: string | null;
}
export interface PlanWeek {
  days: PlanDay[]; km: number; phase: string; monIdx: number; monName: string;
  label: string; range: string;
}

/**
 * Why each kind of session exists.
 *
 * Rewritten to describe the *intent* rather than a structure we never
 * prescribed. The previous copy specified "20 minutes at comfortably-hard
 * effort", "6 × 800 m at 5K effort with 90 s jog recovery" and "fuelling every
 * 40 minutes" — details of the prototype athlete's sessions, printed under
 * whatever the plan actually said. `plan_workouts` stores a type, a distance
 * and a target pace; anything more specific than that is invention.
 */
export const PURPOSE: Record<WType, string> = {
  easy: "Aerobic maintenance — conversational pace, heart rate zone 2. These runs build the engine without adding stress.",
  tempo: "Threshold development — sustained comfortably-hard effort, to raise the pace you can hold.",
  int: "VO2max work — hard repetitions with recovery between them, at an effort you could not hold for the whole session. Quality over quantity.",
  long: "Long endurance run — steady zone 2, fuelling as you go. The cornerstone of endurance training.",
  rest: "Full rest. Recovery is where adaptation happens — no cross-training needed.",
};

export const PLAN_COPY = {
  brand: "Runi", navHome: "Home", navActivities: "Activities",
  navPlan: "Plan", navSettings: "Settings",
  raceTag: "Race day",
};

/**
 * Turns the athlete's plan into the shape this screen renders.
 *
 * `phase` comes from the stored rows. The generator has always known its
 * phases and, as of migration 0020, they are saved with each workout — so a
 * week's label is read back, never guessed from where the week sits in the
 * list. Plans built before the migration have none, and stay unlabelled.
 */
export function realPlanWeeks(weeks: ModelWeek[]): PlanWeek[] {
  return weeks.map((wk, i) => {
    const days: PlanDay[] = wk.days.map((d) => ({
      type: (["easy", "tempo", "int", "long", "rest"] as WType[]).includes(d.type as WType)
        ? (d.type as WType)
        : "easy",
      name: d.name,
      dist: d.dist,
      pace: d.pace,
      day: d.day,
      dateNum: d.dateNum,
      mon: d.mon,
      monIdx: Math.max(0, MO.indexOf(d.mon)),
      date: d.date ?? "",
      status: d.status,
      done: d.done,
      missed: d.missed,
      reason: d.reason ?? null,
      byPerson: d.byPerson ?? false,
      phase: d.phase ?? null,
      today: d.today,
    }));

    const first = days[0];
    const last = days[days.length - 1];

    // The week's phase is whatever its stored days agree on — and a generated
    // week is uniform by construction. "base" becomes "Base" for display.
    const stored = days.find((d) => d.phase)?.phase ?? "";

    return {
      days,
      km: Math.round(days.reduce((s, d) => s + d.dist, 0)),
      phase: stored ? stored.charAt(0).toUpperCase() + stored.slice(1) : "",
      monIdx: first?.monIdx ?? 0,
      monName: first ? MO[first.monIdx] : "",
      label: wk.label || `Week ${i + 1}`,
      range:
        first && last
          ? `${first.mon} ${first.dateNum} – ${last.mon === first.mon ? "" : last.mon + " "}${last.dateNum}`
          : "",
    };
  });
}

export const PLAN_EMPTY = {
  title: "No plan yet",
  body:
    "A training plan needs a goal race — the distance and the date. Set one in Settings and Runi will build the weeks between now and then from what you are already running.",
  /** Shown once the race exists, when the only thing left to do is press build. */
  bodyWithRace:
    "Runi will build the weeks between today and race day from what you are already running — the long run grows from your current long run, not from a table.",
  cta: "Go to Settings",
  build: "Build my plan",
  building: "Building\u2026",

  /*
   * The goal race, set here rather than in Settings.
   *
   * An athlete with no coach arrives on /plan wanting a plan, and used to be
   * sent to a settings screen to fill in a field before anything could happen.
   * The distance and the date are the whole input, so they are asked for on
   * the screen that needs them.
   */
  raceHeading: "What are you training for?",
  raceBody:
    "A plan is built backwards from a race. Pick the distance and the day, and Runi sizes the weeks between now and then from what you are already running.",
  raceDistance: "Distance",
  raceDate: "Race day",
  raceTarget: "Target time",
  raceTargetHint: "optional",
  raceTargetPlaceholder: "3:45:00",
  raceSubmit: "Build my plan",
  raceSubmitting: "Building\u2026",
  raceDateMissing: "Pick a race date first.",
  /** the four distances the generator knows how to build for */
  raceTypes: [
    { id: "5k", label: "5K", km: "5 km" },
    { id: "10k", label: "10K", km: "10 km" },
    { id: "half", label: "Half", km: "21.1 km" },
    { id: "full", label: "Marathon", km: "42.2 km" },
  ],
} as const;

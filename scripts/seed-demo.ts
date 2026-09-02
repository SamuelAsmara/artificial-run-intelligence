/**
 * Demo dataset: two coaches, twenty athletes each, four race groups apiece.
 *
 *   npx tsx scripts/seed-demo.ts --dry-run  # generate and check, write nothing
 *   npx tsx scripts/seed-demo.ts            # create anything missing
 *   npx tsx scripts/seed-demo.ts --reset    # rebuild the demo athletes' training data
 *   npx tsx scripts/seed-demo.ts --purge    # delete the demo accounts entirely
 *
 * ## What this is for
 *
 * Every screen in ARI is downstream of two things: a history of runs and a
 * plan. Until now the only real account had 130 runs and no plan at all, so the
 * plan engine, the coach board and half the dashboard had never been seen with
 * data in them. This builds a population big enough to look at: two coaches
 * with twenty athletes each, four race groups per coach, every athlete with a
 * real training history behind them and a real plan in front of them.
 *
 * The plan was built weeks ago, so every athlete is caught mid-programme with
 * completed and missed sessions behind them. A plan that starts today
 * exercises none of the plan-versus-actual code.
 *
 * ## Why it does not invent the numbers
 *
 * The load, the fitness/fatigue curves, the readiness scores, the thresholds
 * and the plan are all produced by importing the application's own modules --
 * `recomputeForUser`, `readCapacity`, `estimateThresholds`, `generatePlan`.
 * This script writes only the raw inputs a watch would have produced: distance,
 * duration, heart rate, sleep. Everything derived is derived by the code that
 * derives it in production.
 *
 * That is the whole point. A demo built from hand-tuned CTL values proves
 * nothing; this one is a live test of the engine over twenty athletes at once,
 * and any figure that looks wrong on screen is a real defect rather than a
 * seeding artefact.
 *
 * ## Required environment (all read from your own .env.local -- this file
 * contains no secrets and no passwords)
 *
 *   NEXT_PUBLIC_SUPABASE_URL     project URL
 *   SUPABASE_SERVICE_ROLE_KEY    service role key (server-side only, never ships)
 *   DEMO_PASSWORD                the shared password for the demo logins
 *
 * The two coach accounts are created by this script (coach1@, coach2@); your
 * own account is never touched, and --purge only ever removes @demo addresses.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { addDays, startOfWeek } from "date-fns";
import type { Database, RaceType } from "../src/types/database.types";
import { isoDate, zonedNow, WEEK_STARTS_ON } from "../src/lib/time/week";
import { estimateThresholds, type HistoryActivity } from "../src/lib/planning/thresholds";
import { readCapacity } from "../src/lib/planning/readCapacity";
import { generatePlan, RaceTooSoonError } from "../src/lib/planning/generatePlan";
import { paceLabel } from "../src/lib/planning/paces";
import { recomputeForUser } from "../src/lib/readiness/recompute";
import { buildSnapshots, type ActivityRow } from "../src/lib/readiness/pipeline";
import { sessionSpikeVsRecentMax } from "../src/lib/planning/acwr";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/**
 * How much history each athlete gets.
 *
 * Sixteen weeks rather than four, deliberately. CTL is a 42-day exponential
 * average: with only a month of runs behind it, every athlete's fitness curve
 * is still climbing out of its seed value and the dashboard shows a ramp that
 * is an artefact of the window rather than of the training. Sixteen weeks is
 * the shortest history that produces a settled, honest-looking curve.
 *
 * Set this to 4 if you specifically want to see what a brand-new athlete's
 * first month looks like -- that is a legitimate thing to demo, just a
 * different one.
 */
const HISTORY_WEEKS = 16;

const DEMO_DOMAIN = "demo.ari-coach.app";

/**
 * Two coaches rather than one.
 *
 * A single coach proves the roster renders. Two prove it is *isolated*: coach1
 * must not see one row belonging to coach2, and the RLS policies that
 * guarantee that have never once been exercised against real rows. The pair is
 * the test, not the decoration.
 */
interface Coach {
  key: string;
  email: string;
  name: string;
  code: string;
  id?: string;
}

const COACHES: Coach[] = [
  { key: "coach1", email: `coach1@${DEMO_DOMAIN}`, name: "Coach1", code: "COACH1" },
  { key: "coach2", email: `coach2@${DEMO_DOMAIN}`, name: "Coach2", code: "COACH2" },
];

/** The four race groups, and what training in each one looks like. */
interface Group {
  key: string;
  label: string;
  raceType: RaceType;
  /** weeks from today to race day */
  weeksToRace: number;
  /**
   * How long ago the plan was built, i.e. how far into it the athlete already
   * is. Everything before today carries a completed or missed status.
   */
  elapsedWeeks: number;
  level: "beginner" | "intermediate" | "advanced";
  /** threshold speed in km/h, before per-athlete variation */
  thresholdKmh: number;
  /** current weekly volume in km, before per-athlete variation */
  weeklyKm: number;
}

const GROUPS: Group[] = [
  { key: "A", label: "5 ק\"מ — מתקדמים",   raceType: "5k",   weeksToRace: 9,  elapsedWeeks: 5,  level: "advanced",     thresholdKmh: 16.4, weeklyKm: 48 },
  { key: "B", label: "10 ק\"מ — ביניים",   raceType: "10k",  weeksToRace: 11, elapsedWeeks: 6,  level: "intermediate", thresholdKmh: 14.6, weeklyKm: 40 },
  { key: "C", label: "חצי מרתון — ביניים", raceType: "half", weeksToRace: 14, elapsedWeeks: 8,  level: "intermediate", thresholdKmh: 13.2, weeklyKm: 46 },
  { key: "D", label: "מרתון — מתחילים",    raceType: "full", weeksToRace: 24, elapsedWeeks: 10, level: "beginner",     thresholdKmh: 11.4, weeklyKm: 34 },
];

/**
 * Five training characters per group, so the coach board is not twenty copies
 * of the same athlete. These are the situations a coach actually has to tell
 * apart, and each one should look different on screen.
 */
type Character = "steady" | "ramping" | "returning" | "consistent" | "erratic";

const CHARACTERS: { kind: Character; note: string }[] = [
  { kind: "steady",     note: "מתאמן יציב, עומס עולה בהדרגה" },
  { kind: "ramping",    note: "מעלה נפח מהר מדי — קפיצה בריצה הארוכה" },
  { kind: "returning",  note: "חוזר מהפסקה, בסיס נמוך ועולה" },
  { kind: "consistent", note: "נפח קבוע, טופס מאוזן" },
  { kind: "erratic",    note: "מפספס אימונים, שינה גרועה" },
];


type SlotType = "easy" | "interval" | "long" | "rest";

/**
 * The week the plan generator itself lays out -- Sunday easy, Tuesday
 * intervals, Thursday easy, Friday long -- so an athlete's history and their
 * plan have the same shape and the plan does not read as a stranger's week.
 *
 * The shares differ by race distance, which matters more than it looks: a
 * 5 km specialist running 48 km a week does not run a 19 km long run, and a
 * single fixed 40% share was giving them one. The long run's share of the week
 * is one of the few numbers a coach would notice immediately if it were wrong.
 */
const LONG_SHARE: Record<RaceType, number> = { "5k": 0.30, "10k": 0.33, half: 0.38, full: 0.42 };
const INTERVAL_SHARE: Record<RaceType, number> = { "5k": 0.26, "10k": 0.25, half: 0.22, full: 0.19 };

function weekPattern(raceType: RaceType): { type: SlotType; share: number }[] {
  const long = LONG_SHARE[raceType];
  const interval = INTERVAL_SHARE[raceType];
  const easy = (1 - long - interval) / 2;
  return [
    { type: "easy", share: easy },       // Sunday
    { type: "rest", share: 0 },
    { type: "interval", share: interval },
    { type: "rest", share: 0 },
    { type: "easy", share: easy },
    { type: "long", share: long },       // Friday
    { type: "rest", share: 0 },
  ];
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Seeded RNG. The demo has to be reproducible: if a chart looks wrong you need
 * to be able to rebuild the exact same data and look again.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const jitter = (r: () => number, spread: number) => 1 + (r() * 2 - 1) * spread;
const round = (n: number, dp = 0) => Number(n.toFixed(dp));

/**
 * Reads .env.local without adding a dependency. Values already present in the
 * real environment win, so CI or a shell export overrides the file.
 */
function loadEnv(): void {
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(
      `\nMissing ${name}.\n` +
        `Put it in .env.local or export it before running. This script never ` +
        `contains credentials of its own.\n`,
    );
    process.exit(1);
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* The athlete roster                                                  */
/* ------------------------------------------------------------------ */

interface Athlete {
  index: number;
  email: string;
  /** display name, e.g. "Runner7-Coach2" -- the scheme asked for by the tester */
  name: string;
  coach: Coach;
  /** 1..20 within this coach's roster */
  runnerNumber: number;
  group: Group;
  character: Character;
  characterNote: string;
  age: number;
  sex: "male" | "female";
  heightCm: number;
  weightKg: number;
  /** the "true" physiology this athlete's runs are generated from */
  thresholdMps: number;
  hrMax: number;
  weeklyM: number;
  userId?: string;
}

function buildRoster(): Athlete[] {
  const out: Athlete[] = [];
  let n = 0;

  for (const coach of COACHES) {
    let runnerNumber = 0;
    for (const group of GROUPS) {
      for (let i = 0; i < CHARACTERS.length; i++) {
        runnerNumber++;
        // Seeded per athlete, so the two coaches get different rosters and
        // re-running the script reproduces both exactly.
        const r = rng(1000 + n);
        const character = CHARACTERS[i];
        const age = Math.round(24 + r() * 26);
        const sex: "male" | "female" = r() < 0.45 ? "female" : "male";
        const speedFactor =
          (sex === "female" ? 0.94 : 1) *
          (character.kind === "returning" ? 0.92 : 1) *
          jitter(r, 0.05);
        const volumeFactor =
          (character.kind === "returning" ? 0.65 : 1) *
          (character.kind === "erratic" ? 0.8 : 1) *
          jitter(r, 0.12);

        out.push({
          index: n,
          email: `runner${runnerNumber}-${coach.key}@${DEMO_DOMAIN}`,
          name: `Runner${runnerNumber}-${coach.name}`,
          coach,
          runnerNumber,
          group,
          character: character.kind,
          characterNote: character.note,
          age,
          sex,
          heightCm: Math.round((sex === "female" ? 165 : 177) + (r() * 2 - 1) * 8),
          weightKg: round((sex === "female" ? 58 : 72) + (r() * 2 - 1) * 8, 1),
          thresholdMps: round((group.thresholdKmh * speedFactor) / 3.6, 3),
          hrMax: Math.round((208 - 0.7 * age) * jitter(r, 0.03)),
          weeklyM: Math.round(group.weeklyKm * 1000 * volumeFactor),
        });
        n++;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Generating one athlete's history                                    */
/* ------------------------------------------------------------------ */

interface GeneratedRun {
  dateIso: string;
  startedAt: string;
  distanceM: number;
  durationS: number;
  avgHr: number;
  maxHr: number;
  cadence: number;
  driftPct: number;
  calories: number;
  /** per-segment pace in s/km, what the sparkline and the run chart draw */
  paceShape: number[];
  /** beats per minute on the same points, what the chart's heart-rate lane draws */
  hrShape: number[];
  /** fastest continuous stretch of each distance, in seconds */
  bestEfforts: Record<string, number>;
}

interface GeneratedDay {
  dateIso: string;
  sleepHours: number;
  restingHr: number;
  hrv: number;
}

/**
 * How hard the athlete's weekly volume was in a given week, as a fraction of
 * where they are now. Each character ramps differently -- that difference is
 * the only reason the twenty dashboards will not look identical.
 */
function weekFraction(character: Character, weeksAgo: number, r: () => number): number {
  const progress = (HISTORY_WEEKS - weeksAgo) / HISTORY_WEEKS; // 0 -> 1, oldest to newest
  const stepBack = weeksAgo > 0 && (HISTORY_WEEKS - weeksAgo) % 4 === 0 ? 0.75 : 1;

  switch (character) {
    case "steady":
      return (0.80 + 0.20 * progress) * stepBack * jitter(r, 0.05);
    case "ramping":
      /*
       * Flat for the whole block, then one enormous week.
       *
       * The first attempt spread the increase over three weeks and produced an
       * acute:chronic ratio of 1.03 -- because the 28-day chronic window
       * absorbs a gradual climb, which is exactly why gradual climbs are the
       * safe way to train. To land in the elevated band the last seven days
       * have to be roughly double the preceding month's average, and that is
       * what this does: 0.72 for weeks, then 1.5.
       */
      if (weeksAgo === 0) return 1.5 * jitter(r, 0.04);
      if (weeksAgo === 1) return 1.05 * jitter(r, 0.05);
      return 0.72 * jitter(r, 0.06);
    case "returning":
      // nothing for the first five weeks, then a careful rebuild
      return progress < 0.32 ? 0 : (0.35 + 0.9 * (progress - 0.32)) * stepBack * jitter(r, 0.07);
    case "consistent":
      return (0.95 + 0.05 * progress) * stepBack * jitter(r, 0.03);
    case "erratic":
      return (0.7 + 0.4 * r()) * stepBack;
  }
}

/**
 * A plausible pace profile across the run, in seconds per kilometre.
 *
 * Twenty-four points, which is what the sparkline samples. The shape is what
 * separates one session from another to the eye: an easy run drifts slowly
 * slower, a long run fades harder in its last third, and an interval session
 * oscillates between hard and float around a warm-up and a cool-down.
 *
 * This is generated rather than measured, and it is the one place in this
 * script where that is true of something the athlete sees directly. It exists
 * so the chart and the sparkline have something to draw; nothing is computed
 * from it.
 */
function paceShapeFor(
  type: SlotType,
  distanceM: number,
  durationS: number,
  r: () => number,
): number[] {
  const n = 24;
  const mean = durationS / (distanceM / 1000);
  const out: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let factor: number;

    if (type === "interval") {
      // Warm-up, then alternating reps and floats, then a cool-down.
      if (t < 0.2) factor = 1.16;
      else if (t > 0.85) factor = 1.2;
      else factor = i % 2 === 0 ? 0.86 : 1.08;
    } else if (type === "long") {
      factor = 0.97 + (t > 0.6 ? (t - 0.6) * 0.28 : 0);
    } else {
      factor = 0.99 + t * 0.05;
    }

    out.push(Math.round(mean * factor * jitter(r, 0.02)));
  }

  // Re-centre so the shape averages back to the pace actually run, otherwise
  // the picture and the number under it disagree.
  const avg = out.reduce((sum, v) => sum + v, 0) / n;
  return out.map((v) => Math.round((v * mean) / avg));
}

/** Race distances in metres, the same figures the app's own tables use. */
const RACE_M: Record<RaceType, number> = {
  "5k": 5000, "10k": 10_000, half: 21_097.5, full: 42_195,
};

/**
 * A goal time worth training towards, derived from the athlete's own fitness.
 *
 * The seed used to insert a goal race with a date and no target, so the TARGET
 * and PACE columns on the coach's board were a full column of dashes for every
 * athlete — a promise the product makes and the demo could not keep. The
 * feature was never missing; the data was.
 *
 * Threshold speed is roughly what an athlete can hold for an hour, which makes
 * it a one-hour time trial: from there Riegel's exponent scales to any other
 * distance. Then 2.5% is taken off, because a goal set at exactly today's
 * fitness is not a goal — the athlete is entering a training block precisely
 * to beat it. Rounded to the nearest half minute, the way people actually say
 * their targets out loud.
 */
function targetTimeFor(raceType: RaceType, thresholdMps: number): string {
  const hourM = thresholdMps * 3600;
  const seconds = 3600 * Math.pow(RACE_M[raceType] / hourM, 1.06) * 0.975;
  const rounded = Math.round(seconds / 30) * 30;
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const sec = rounded % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Heart rate across the run, on the same points as the pace shape.
 *
 * Two things it has to get right or the chart teaches the wrong lesson:
 *
 * **Heart rate lags pace.** Beats do not jump the instant the legs do — they
 * climb over roughly a minute. So each point is pulled towards the previous
 * one rather than tracking the pace curve exactly, which is why an interval
 * session's heart-rate line is a rolling swell where its pace line is a comb.
 *
 * **It drifts upward.** At a steady pace, heart rate rises through a long run
 * as the athlete warms and tires. That drift is the whole basis of the
 * decoupling number this app computes, so a generated run that lacked it
 * would make the demo contradict its own analysis.
 */
function hrShapeFor(
  paceShape: number[],
  avgHr: number,
  maxHr: number,
  driftPct: number,
  r: () => number,
): number[] {
  const n = paceShape.length;
  const meanPace = paceShape.reduce((sum, v) => sum + v, 0) / n;

  const out: number[] = [];
  let current = avgHr * 0.86; // starts below its average and climbs into it
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Faster than the run's own average pulls the target up, and by less than
    // the pace moved: a 10% faster stretch is not a 10% higher heart rate.
    const effort = 1 + (meanPace - paceShape[i]) / meanPace * 0.42;
    const drift = 1 + (driftPct / 100) * t;
    const target = avgHr * effort * drift;
    // A first-order lag: about a minute to close most of a gap.
    current += (target - current) * 0.35;
    out.push(Math.round(Math.min(maxHr, Math.max(80, current * jitter(r, 0.012)))));
  }

  // Re-centre on the average the row reports, for the same reason the pace
  // shape is re-centred: the picture and the figure beside it must agree.
  const avg = out.reduce((sum, v) => sum + v, 0) / n;
  return out.map((v) => Math.round(Math.min(maxHr, (v * avgHr) / avg)));
}

/**
 * Fastest continuous stretch of each standard distance, in seconds.
 *
 * Only distances the run was long enough to contain. Scaled with Riegel's
 * exponent (1.06), which is how a shorter split inside a longer run relates to
 * the whole — a 5 km inside a 15 km run is meaningfully faster than the run's
 * average, and using the average would make every long run a 5 km record.
 */
function bestEffortsFor(
  distanceM: number,
  durationS: number,
  type: SlotType,
): Record<string, number> {
  const DISTANCES: [string, number][] = [
    ["5k", 5000], ["10k", 10_000], ["half", 21_097], ["marathon", 42_195],
  ];
  // An interval session's best 5 km is much faster than its average; an easy
  // run's is barely faster.
  const sharpness = type === "interval" ? 0.94 : type === "long" ? 0.985 : 0.97;
  const out: Record<string, number> = {};

  for (const [key, meters] of DISTANCES) {
    if (distanceM < meters) continue;
    const riegel = durationS * Math.pow(meters / distanceM, 1.06);
    out[key] = Math.round(riegel * sharpness);
  }
  return out;
}

function generateHistory(a: Athlete, today: Date): { runs: GeneratedRun[]; days: GeneratedDay[] } {
  const r = rng(7000 + a.index);
  const runs: GeneratedRun[] = [];
  const days: GeneratedDay[] = [];
  const thisWeekStart = startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });

  const pattern = weekPattern(a.group.raceType);
  const missRate = a.character === "erratic" ? 0.28 : a.character === "returning" ? 0.1 : 0.06;

  for (let weeksAgo = HISTORY_WEEKS; weeksAgo >= 0; weeksAgo--) {
    const weekStart = addDays(thisWeekStart, -weeksAgo * 7);
    const weekM = a.weeklyM * weekFraction(a.character, weeksAgo, r);

    for (let offset = 0; offset < 7; offset++) {
      const day = addDays(weekStart, offset);
      if (day > today) continue;
      const dateIso = isoDate(day);

      // Recovery is logged every day, including rest days -- that is what a
      // wellness feed looks like and the readiness engine expects the gaps.
      const sleepBase =
        a.character === "erratic" ? 5.7 : a.character === "ramping" ? 6.5 : 7.4;
      days.push({
        dateIso,
        sleepHours: round(Math.min(9.2, Math.max(4.6, sleepBase + (r() * 2 - 1) * 1.1)), 1),
        restingHr: Math.round(
          (a.character === "ramping" ? 56 : 50) + (r() * 2 - 1) * 4 + (weeksAgo < 2 && a.character === "ramping" ? 4 : 0),
        ),
        hrv: Math.round((a.character === "ramping" ? 52 : 66) + (r() * 2 - 1) * 12),
      });

      const slot = pattern[offset];
      if (slot.type === "rest" || weekM <= 0) continue;
      if (r() < missRate) continue;

      /*
       * A floor on the session, expressed in minutes rather than kilometres.
       *
       * Without one, a beginner running 17 km a week gets a 3 km "interval
       * session" and `estimateThresholdSpeed` — which only accepts sustained
       * efforts of 35–75 minutes — finds no qualifying effort at all. It then
       * falls back to shading down the best run of 20+ minutes, which for these
       * athletes is an easy long run, and prescribes an easy pace *slower* than
       * the pace they already run easily. The dry run printed 8:18, 8:15,
       * 10:29 and 8:30 per kilometre before this floor existed.
       *
       * Minutes are the right unit because that is the unit the estimator gates
       * on, and because it is how sessions actually work: a track session is
       * warm-up, intervals and cool-down, and it is three quarters of an hour
       * whether you are fast or slow.
       *
       * (The underlying fallback is still wrong for a genuinely low-volume
       * athlete — see the note handed over with this script.)
       */
      const paceRatio = slot.type === "easy" ? 0.78 : slot.type === "long" ? 0.76 : 1.02;
      const speed = a.thresholdMps * paceRatio * jitter(r, 0.03);
      const minSeconds = slot.type === "interval" ? 2400 : slot.type === "long" ? 2700 : 1500;
      const distanceM = Math.max(
        Math.round(speed * minSeconds),
        Math.round(weekM * slot.share * jitter(r, 0.08)),
      );
      if (weekM * slot.share < 800) continue;
      const durationS = Math.round(distanceM / speed);

      const hrFraction =
        slot.type === "interval" ? 0.89 : slot.type === "long" ? 0.79 : 0.745;
      const avgHr = Math.round(a.hrMax * hrFraction * jitter(r, 0.025));

      /*
       * The two derived columns the app reads but nothing was writing.
       *
       * `pace_shape` drives the sparkline in the run list and the pace band on
       * the activity chart; `best_efforts` drives personal records and the
       * gold marking in the list. Leaving them null while setting
       * `streams_fetched_at` was worse than leaving both unset: the app
       * concluded the streams had already been fetched and there was simply
       * nothing in them, so every chart said "no second-by-second detail" and
       * every personal best showed a dash.
       */
      const shape = paceShapeFor(slot.type, distanceM, durationS, r);
      const maxHr = Math.round(
        Math.min(a.hrMax, avgHr * (slot.type === "interval" ? 1.09 : 1.06)),
      );
      // Drift climbs on long runs and on the athlete who is over-reaching.
      const driftPct = round(
        (slot.type === "long" ? 4.2 : 2.0) +
          (a.character === "ramping" ? 2.4 : 0) +
          r() * 2.5,
        1,
      );

      runs.push({
        paceShape: shape,
        // Generated from the pace shape it will be drawn beside, so the two
        // lanes of the chart tell one story rather than two unrelated ones.
        hrShape: hrShapeFor(shape, avgHr, maxHr, driftPct, r),
        bestEfforts: bestEffortsFor(distanceM, durationS, slot.type),
        dateIso,
        startedAt: new Date(`${dateIso}T06:30:00+03:00`).toISOString(),
        distanceM,
        durationS,
        avgHr,
        maxHr,
        cadence: Math.round(168 + r() * 12),
        driftPct,
        calories: Math.round((distanceM / 1000) * a.weightKg * 0.95),
      });
    }
  }

  return { runs, days };
}

/* ------------------------------------------------------------------ */
/* Writing one athlete                                                 */
/* ------------------------------------------------------------------ */

type Client = SupabaseClient<Database>;

async function findUserByEmail(admin: Client, email: string): Promise<string | null> {
  // listUsers is paginated; the demo project is small enough to walk it.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser(admin: Client, a: Athlete, password: string): Promise<string> {
  const existing = await findUserByEmail(admin, a.email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: a.email,
    password,
    email_confirm: true,
    user_metadata: { role: "athlete", username: a.name },
  });
  if (error || !data.user) throw new Error(`createUser ${a.email}: ${error?.message}`);
  return data.user.id;
}

async function writeAthlete(admin: Client, a: Athlete, coachId: string, today: Date) {
  const userId = a.userId as string;
  const { runs, days } = generateHistory(a, today);

  await admin
    .from("profiles")
    .update({
      full_name: a.name,
      age: a.age,
      sex: a.sex,
      height_cm: a.heightCm,
      weight_kg: a.weightKg,
      running_level: a.group.level,
      bio: `${a.group.label} · ${a.characterNote}`,
    })
    .eq("id", userId);

  // Activities. `strava_activity_id` is the dedup key, so demo rows get their
  // own numeric block and re-running the script updates rather than duplicates.
  const activityRows = runs.map((run, i) => ({
    user_id: userId,
    strava_activity_id: 900_000_000_000 + a.index * 1_000 + i,
    type: "Run",
    distance_m: run.distanceM,
    duration_s: run.durationS,
    avg_hr: run.avgHr,
    avg_pace: null,
    started_at: run.startedAt,
    // 'manual' rather than a new 'demo' value: the column carries a check
    // constraint of ('strava','intervals_icu','manual') and inventing a fourth
    // source would mean a migration to make fake data expressible. The
    // external_id prefix is what marks these rows as the seed's.
    source: "manual" as const,
    external_id: `demo-${a.index}-${i}`,
    pace_shape: run.paceShape,
    hr_shape: run.hrShape,
    best_efforts: run.bestEfforts,
    max_hr: run.maxHr,
    avg_cadence: run.cadence,
    calories: run.calories,
    cardiac_drift_pct: run.driftPct,
    streams_fetched_at: run.startedAt,
    streams_derived_version: 1,
    source_updated_at: run.startedAt,
  }));

  for (let i = 0; i < activityRows.length; i += 200) {
    const { error } = await admin
      .from("activities")
      .upsert(activityRows.slice(i, i + 200), { onConflict: "user_id,strava_activity_id" });
    if (error) throw new Error(`activities ${a.email}: ${error.message}`);
  }

  const recoveryRows = days.map((d) => ({
    user_id: userId,
    date: d.dateIso,
    source: "derived" as const,
    sleep_hours: d.sleepHours,
    resting_hr: d.restingHr,
    hrv: d.hrv,
  }));
  for (let i = 0; i < recoveryRows.length; i += 200) {
    const { error } = await admin
      .from("recovery_signals")
      .upsert(recoveryRows.slice(i, i + 200), { onConflict: "user_id,date" });
    if (error) throw new Error(`recovery ${a.email}: ${error.message}`);
  }

  // The readiness engine, unmodified. This is what writes ctl/atl/tsb/acwr,
  // the narrative, and the athlete's measured thresholds back to the profile.
  const readiness = await recomputeForUser(admin, userId, 120);
  if (!readiness.ok) throw new Error(`readiness ${a.email}: ${readiness.error}`);

  // ---- goal race + plan, following actions/plan.ts step for step ----------
  const raceDate = isoDate(addDays(today, a.group.weeksToRace * 7));

  const { data: existingRace } = await admin
    .from("goal_races")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  let raceId = existingRace?.id;
  if (!raceId) {
    const { data, error } = await admin
      .from("goal_races")
      .insert({
        user_id: userId,
        race_type: a.group.raceType,
        race_date: raceDate,
        target_time: targetTimeFor(a.group.raceType, a.thresholdMps),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`goal_race ${a.email}: ${error?.message}`);
    raceId = data.id;
  }

  const { data: existingPlan } = await admin
    .from("training_plans")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  let planWorkouts = 0;
  if (!existingPlan) {
    const history: HistoryActivity[] = runs.map((run) => ({
      durationSec: run.durationS,
      distanceM: run.distanceM,
      avgHr: run.avgHr,
      date: run.dateIso,
    }));

    /*
     * The plan is built as of the day it would really have been built --
     * `elapsedWeeks` ago -- not today.
     *
     * That is what puts the athlete mid-programme, and it matters for more
     * than appearances: capacity is read from the history available *then*, so
     * the volume ramp starts where the athlete actually was, and every session
     * between that date and today gets a real completed/missed outcome. A plan
     * generated as of today has no past, and the entire plan-versus-actual
     * surface -- the coach's board, the week strip, the adherence figures --
     * renders empty.
     */
    const planStart = addDays(today, -a.group.elapsedWeeks * 7);

    const capacity = readCapacity(
      history
        .filter((h) => h.date <= isoDate(planStart))
        .map((h) => ({ date: h.date, distanceM: h.distanceM })),
      planStart,
    );
    const thresholds = estimateThresholds(history, { age: a.age, sex: a.sex });

    let generated;
    try {
      generated = generatePlan(a.group.raceType, new Date(raceDate), planStart, capacity);
    } catch (err) {
      if (err instanceof RaceTooSoonError) {
        console.warn(`  ${a.email}: ${err.message}`);
        return { runs: runs.length, readiness: readiness.data.days, workouts: 0 };
      }
      throw err;
    }

    const { data: plan, error: planError } = await admin
      .from("training_plans")
      .insert({ user_id: userId, goal_race_id: raceId })
      .select("id")
      .single();
    if (planError || !plan) throw new Error(`plan ${a.email}: ${planError?.message}`);

    /*
     * Outcomes for everything already in the past.
     *
     * A session is `completed` when a generated run exists on that date, and
     * `missed` when it does not -- which is why the "erratic" character, who
     * skips 28% of sessions, produces a visibly patchier board than the
     * "consistent" one. Rest days in the past are completed by definition:
     * resting is the session.
     */
    const todayIso = isoDate(today);
    const ranOn = new Set(runs.map((run) => run.dateIso));
    const outcomeFor = (w: { dayDate: string; workoutType: string }) => {
      if (w.dayDate >= todayIso) return "planned" as const;
      if (w.workoutType === "rest") return "completed" as const;
      return ranOn.has(w.dayDate) ? ("completed" as const) : ("missed" as const);
    };

    /*
     * A couple of coach edits on the athletes who are over-reaching.
     *
     * `origin`, `planned_distance_original`, `adjusted_reason` and
     * `adjusted_at` were added in migration 0014 and nothing has ever written
     * to them, so the coach-edit trail is untested. The athlete whose acute
     * load has spiked is exactly who a coach would cut back, which makes this
     * realistic rather than decorative.
     */
    const cutBack = a.character === "ramping";

    const workoutRows = generated.workouts.map((w) => {
      const status = outcomeFor(w);
      const trim =
        cutBack &&
        status === "planned" &&
        w.workoutType === "long" &&
        w.dayDate <= isoDate(addDays(today, 14));

      return {
        plan_id: plan.id,
        week_number: w.weekNumber,
        day_date: w.dayDate,
        workout_type: w.workoutType,
        planned_distance:
          trim && w.plannedDistance ? Math.round(w.plannedDistance * 0.8) : w.plannedDistance,
        planned_pace: paceLabel(w.workoutType, thresholds.thresholdSpeedMps),
        status,
        origin: trim ? ("coach" as const) : ("generated" as const),
        planned_distance_original: trim ? w.plannedDistance : null,
        adjusted_reason: trim ? "עומס השבוע האחרון קפץ — מקצרים את הריצה הארוכה" : null,
        adjusted_at: trim ? new Date(`${todayIso}T09:00:00+03:00`).toISOString() : null,
      };
    });

    for (let i = 0; i < workoutRows.length; i += 200) {
      const { error } = await admin.from("plan_workouts").insert(workoutRows.slice(i, i + 200));
      if (error) throw new Error(`plan_workouts ${a.email}: ${error.message}`);
    }
    planWorkouts = workoutRows.length;
  }

  // ---- attach to the coach ------------------------------------------------
  const { error: linkError } = await admin
    .from("coach_athletes")
    .upsert(
      { coach_id: coachId, athlete_id: userId, status: "active" },
      { onConflict: "coach_id,athlete_id" },
    );
  if (linkError) throw new Error(`coach link ${a.email}: ${linkError.message}`);

  return { runs: runs.length, readiness: readiness.data.days, workouts: planWorkouts };
}

/* ------------------------------------------------------------------ */
/* Destructive modes                                                   */
/* ------------------------------------------------------------------ */

/** Clears the training data of the demo athletes, keeping their accounts. */
async function reset(admin: Client, roster: Athlete[]) {
  for (const a of roster) {
    if (!a.userId) continue;
    await admin.from("plan_workouts").delete().in(
      "plan_id",
      ((await admin.from("training_plans").select("id").eq("user_id", a.userId)).data ?? []).map(
        (p) => p.id,
      ),
    );
    await admin.from("training_plans").delete().eq("user_id", a.userId);
    await admin.from("goal_races").delete().eq("user_id", a.userId);
    await admin.from("readiness_snapshots").delete().eq("user_id", a.userId);
    await admin.from("recovery_signals").delete().eq("user_id", a.userId);
    await admin.from("activities").delete().eq("user_id", a.userId).like("external_id", "demo-%");
    console.log(`  reset ${a.email}`);
  }
}

/**
 * Removes the demo accounts -- athletes *and* both coaches.
 *
 * The address check is not a formality. This runs with the service-role key,
 * which bypasses row-level security entirely, so a wrong id here deletes a real
 * person's account and every row that cascades from it. Refusing anything that
 * is not @demo.ari-coach.app is the one thing standing between a typo and that.
 */
async function purge(admin: Client, roster: Athlete[], coaches: Coach[]) {
  const targets: { email: string; id?: string }[] = [
    ...roster.map((a) => ({ email: a.email, id: a.userId })),
    ...coaches.map((c) => ({ email: c.email, id: c.id })),
  ];

  for (const t of targets) {
    if (!t.id) continue;
    if (!t.email.endsWith(`@${DEMO_DOMAIN}`)) {
      throw new Error(`refusing to delete a non-demo user: ${t.email}`);
    }
    const { error } = await admin.auth.admin.deleteUser(t.id);
    console.log(`  purge ${t.email}${error ? ` -- ${error.message}` : ""}`);
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Generate the whole population and run the engine over it locally, writing
 * nothing anywhere and needing no credentials.
 *
 * Worth having on its own terms: it is the cheapest way to see whether the
 * generated histories actually produce the fitness curves and warnings they
 * are supposed to, before twenty athletes' worth of rows go into the database.
 */
function dryRun(): void {
  const roster = buildRoster();
  const today = zonedNow();
  console.log(
    `\nDry run · ${COACHES.length} coaches × ${roster.length / COACHES.length} athletes ` +
      `· ${HISTORY_WEEKS} weeks of history · plans already under way\n`,
  );
  console.log(
    "athlete           grp  runs  wk-km  long   CTL   ATL   TSB  ACWR  ready  spike     plan",
  );

  for (const a of roster) {
    const { runs, days } = generateHistory(a, today);
    const activities: ActivityRow[] = runs.map((run) => ({
      started_at: run.startedAt,
      distance_m: run.distanceM,
      duration_s: run.durationS,
      avg_hr: run.avgHr,
      cardiac_drift_pct: run.driftPct,
    }));
    const recovery = days.map((d) => ({
      date: d.dateIso,
      sleepHours: d.sleepHours,
      restingHr: d.restingHr,
      hrv: d.hrv,
      source: "derived" as const,
    }));

    const result = buildSnapshots(activities, recovery, { age: a.age, sex: a.sex }, today, 120);
    const last = result.snapshots[result.snapshots.length - 1];
    const capacity = readCapacity(
      runs.map((run) => ({ date: run.dateIso, distanceM: run.distanceM })),
      today,
    );

    // The safety signal the app actually acts on -- ACWR is descriptive only,
    // see the header of lib/planning/acwr.ts. Checking the most recent long run
    // against the preceding thirty days is what the plan generator and the
    // dashboard both warn from, so it is what the demo has to exercise.
    const weekAgo = isoDate(addDays(today, -7));
    const thisWeek = runs.filter((run) => run.dateIso > weekAgo);
    const biggest = thisWeek.reduce<GeneratedRun | null>(
      (best, run) => (best === null || run.distanceM > best.distanceM ? run : best),
      null,
    );
    const spike = sessionSpikeVsRecentMax(
      biggest?.distanceM ?? 0,
      runs
        .filter((run) => run.dateIso < (biggest?.dateIso ?? weekAgo))
        .map((run) => ({ date: run.dateIso, distanceM: run.distanceM })),
      today,
    );

    // The plan too, so the dry run proves the whole chain and not just the
    // history: capacity -> thresholds -> periodisation -> prescribed paces.
    const thresholds = estimateThresholds(
      runs.map((run) => ({
        durationSec: run.durationS, distanceM: run.distanceM,
        avgHr: run.avgHr, date: run.dateIso,
      })),
      { age: a.age, sex: a.sex },
    );
    let planSummary = "plan failed";
    try {
      const plan = generatePlan(
        a.group.raceType,
        addDays(today, a.group.weeksToRace * 7),
        addDays(today, -a.group.elapsedWeeks * 7),
        capacity,
      );
      planSummary =
        `${String(plan.totalWeeks).padStart(2)}w ${String(plan.workouts.length).padStart(3)}wk ` +
        `peak ${((plan.capacity?.peakWeeklyM ?? 0) / 1000).toFixed(0).padStart(2)}km ` +
        `long ${((plan.capacity?.peakLongRunM ?? 0) / 1000).toFixed(0).padStart(2)}km ` +
        `${plan.capacity?.achievable === false ? "NOT-ACHIEVABLE" : "ok"} ` +
        `@${paceLabel("easy", thresholds.thresholdSpeedMps)}`;
    } catch (err) {
      planSummary = err instanceof RaceTooSoonError ? "race too soon" : String(err);
    }

    console.log(
      `${a.name.padEnd(17)} ${a.group.key}   ${String(runs.length).padStart(4)}  ` +
        `${(capacity.currentWeeklyM / 1000).toFixed(1).padStart(5)}  ` +
        `${(capacity.longestRecentM / 1000).toFixed(1).padStart(4)}  ` +
        `${(last?.ctl ?? 0).toFixed(0).padStart(4)}  ${(last?.atl ?? 0).toFixed(0).padStart(4)}  ` +
        `${(last?.tsb ?? 0).toFixed(0).padStart(4)}  ${(last?.acwr ?? 0).toFixed(2).padStart(4)}  ` +
        `${String(last?.readiness_score ?? "-").padStart(5)}  ` +
        `${spike.band.padEnd(8)}  ${planSummary}`,
    );
  }
  console.log("");
}

/**
 * Create (or find) a coach account and put it in a state a coach can work from:
 * the coach role, a fixed join code, and enough seats for twenty athletes.
 *
 * The seat limit matters. `subscriptions.seat_limit` defaults to 3, and a coach
 * with twenty athletes on a three-seat plan is a state the billing screen has
 * never been shown.
 */
async function ensureCoach(admin: Client, coach: Coach, password: string): Promise<string> {
  let id = await findUserByEmail(admin, coach.email);

  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({
      email: coach.email,
      password,
      email_confirm: true,
      user_metadata: { role: "coach", username: coach.name },
    });
    if (error || !data.user) throw new Error(`createUser ${coach.email}: ${error?.message}`);
    id = data.user.id;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "coach", full_name: coach.name, coach_code: coach.code })
    .eq("id", id);
  if (profileError) throw new Error(`coach profile ${coach.email}: ${profileError.message}`);

  await admin
    .from("subscriptions")
    .upsert({ user_id: id, scope: "coach", plan: "pro", seat_limit: 25 }, { onConflict: "user_id,scope" });

  return id;
}

async function main() {
  if (process.argv.includes("--dry-run")) {
    dryRun();
    return;
  }

  loadEnv();
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const mode = process.argv.includes("--purge")
    ? "purge"
    : process.argv.includes("--reset")
      ? "reset"
      : "seed";
  const password = mode === "purge" ? "" : required("DEMO_PASSWORD");

  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const roster = buildRoster();
  const today = zonedNow();

  if (mode !== "seed") {
    for (const c of COACHES) c.id = (await findUserByEmail(admin, c.email)) ?? undefined;
    for (const a of roster) a.userId = (await findUserByEmail(admin, a.email)) ?? undefined;
    if (mode === "reset") await reset(admin, roster);
    else await purge(admin, roster, COACHES);
    if (mode === "purge") {
      console.log("\nDemo accounts removed.\n");
      return;
    }
  }

  for (const coach of COACHES) {
    coach.id = await ensureCoach(admin, coach, password);
    console.log(`  coach ${coach.email.padEnd(28)} code ${coach.code}`);
  }

  console.log(
    `\nSeeding ${COACHES.length} coaches × ${roster.length / COACHES.length} athletes`,
  );
  console.log(
    `History: ${HISTORY_WEEKS} weeks back · plans already ` +
      `${GROUPS.map((g) => g.elapsedWeeks).join("/")} weeks under way\n`,
  );

  let totalRuns = 0;
  let totalWorkouts = 0;
  for (const a of roster) {
    a.userId = await ensureUser(admin, a, password);
    const result = await writeAthlete(admin, a, a.coach.id as string, today);
    totalRuns += result.runs;
    totalWorkouts += result.workouts;
    console.log(
      `  ${a.name.padEnd(17)} ${a.group.key}  ${a.email.padEnd(30)} ` +
        `${String(result.runs).padStart(3)} runs · ${String(result.readiness).padStart(3)} days · ` +
        `${String(result.workouts).padStart(3)} workouts · ${a.characterNote}`,
    );
  }

  /*
   * Report what is in the database, not what this run happened to create.
   *
   * `--reset` clears and then re-seeds, so running `--reset` followed by a
   * plain seed leaves the second run with nothing to create: it finds the
   * plans already there, skips them, and used to print "0 planned workouts" at
   * the end of a database holding six thousand. The number was true and the
   * sentence was a lie.
   */
  const { count: planCount } = await admin
    .from("training_plans")
    .select("*", { count: "exact", head: true });
  const { count: workoutCount } = await admin
    .from("plan_workouts")
    .select("*", { count: "exact", head: true });

  console.log(
    `\nDone. ${COACHES.length} coaches · ${roster.length} athletes · ` +
      `${totalRuns} runs written this run.`,
  );
  console.log(
    `In the database now: ${planCount ?? "?"} plans · ${workoutCount ?? "?"} planned workouts` +
      `${totalWorkouts === 0 ? " (already present, nothing created this run)" : ""}.`,
  );
  console.log(`Coaches:  coach1@${DEMO_DOMAIN} · coach2@${DEMO_DOMAIN}`);
  console.log(`Athletes: runner1-coach1@${DEMO_DOMAIN} … runner20-coach2@${DEMO_DOMAIN}`);
  console.log(`Password: whatever you set in DEMO_PASSWORD.\n`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});

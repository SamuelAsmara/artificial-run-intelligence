/**
 * Training plan screen model — ported from
 * design_handoff_ari_athlete_app/ARI Plan.dc.html.
 * Maps to plan_workouts + goal_races.
 */

import type { Week as ModelWeek } from "@/lib/dashboard/model";

export type WType = "easy" | "tempo" | "int" | "long" | "rest";

const NAMES: Record<WType, string> = {
  easy: "Easy Run", tempo: "Tempo Run", int: "Intervals",
  long: "Long Run", rest: "Rest",
};
const PACES: Partial<Record<WType, string>> = {
  easy: "5:30", tempo: "4:45", int: "4:15", long: "5:40",
};
const BASE: [WType, number][] = [
  ["easy", 5], ["tempo", 7], ["int", 9.6], ["easy", 6],
  ["easy", 8], ["rest", 0], ["long", 26],
];
const MULT = [0.82, 0.88, 0.61, 1.0, 1.05, 1.1, 0.66, 1.15, 1.2, 0.7, 0.95, 0.55];
const PHASES = ["Base","Base","Recovery","Build","Build","Build","Recovery","Peak","Peak","Recovery","Sharpen","Taper"];
const DN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export interface PlanDay {
  type: WType; name: string; dist: number; pace: string;
  day: string; dateNum: number; mon: string; monIdx: number;
  status: string; done: boolean; missed: boolean; today: boolean;
}
export interface PlanWeek {
  days: PlanDay[]; km: number; phase: string; monIdx: number; monName: string;
  label: string; range: string;
}

let _w: PlanWeek[] | null = null;
export function planWeeks(): PlanWeek[] {
  if (_w) return _w;
  const start = new Date(2026, 6, 19);
  const W: PlanWeek[] = [];
  for (let w = 0; w < 12; w++) {
    const days: PlanDay[] = BASE.map(([type, km], d) => {
      const dt = new Date(start.getTime() + (w * 7 + d) * 86400000);
      const dist = type === "rest" ? 0 : Math.round(km * MULT[w] * 10) / 10;
      let status = "", done = false, missed = false;
      if (w < 3) {
        done = true; status = "Done";
        if (w === 1 && d === 1) { done = false; missed = true; status = "Missed"; }
      } else if (w === 3) {
        if (d === 0) { done = true; status = "Done"; }
        else if (d === 1) { missed = true; status = "Missed"; }
        else if (d === 2) status = "Today";
        else if (d === 3) status = "Adjusted";
      }
      if (type === "rest" && !done) status = status === "Today" ? status : "";
      return {
        type, name: NAMES[type], dist, pace: PACES[type] ?? "",
        day: DN[d], dateNum: dt.getDate(), mon: MO[dt.getMonth()], monIdx: dt.getMonth(),
        status, done, missed, today: w === 3 && d === 2,
      };
    });
    const km = days.reduce((s, d) => s + d.dist, 0);
    const s = days[0], e = days[6];
    W.push({
      days, km: Math.round(km), phase: PHASES[w], monIdx: s.monIdx, monName: MO[s.monIdx],
      label: "Week " + (w + 1),
      range: s.mon + " " + s.dateNum + " – " + (e.mon === s.mon ? "" : e.mon + " ") + e.dateNum,
    });
  }
  _w = W;
  return W;
}

export function planSegsFor(type: WType) {
  if (type === "easy") return [{ m: 1, h: 20, t: "Steady easy pace" }];
  if (type === "long") return [{ m: 1, h: 28, t: "Steady long-run pace" }];
  if (type === "tempo")
    return [
      { m: 10, h: 14, t: "Warm-up 10 min" },
      { m: 20, h: 40, t: "Tempo 20 min" },
      { m: 10, h: 14, t: "Cool-down 10 min" },
    ];
  if (type === "int") {
    const s = [{ m: 10, h: 14, t: "Warm-up 10 min" }];
    for (let i = 0; i < 6; i++) {
      s.push({ m: 3.4, h: 44, t: "800 m rep @ 4:15" });
      if (i < 5) s.push({ m: 1.5, h: 9, t: "90 s jog" });
    }
    s.push({ m: 10, h: 14, t: "Cool-down 10 min" });
    return s;
  }
  return [];
}

export const PURPOSE: Record<WType, string> = {
  easy: "Aerobic maintenance — conversational pace, heart rate zone 2. These runs build the engine without adding stress.",
  tempo: "Threshold development — 20 minutes at comfortably-hard effort to raise the pace you can sustain.",
  int: "VO2max intervals — 6 × 800 m at 5K effort with 90 s jog recovery. Quality over quantity.",
  long: "Long endurance run — steady zone 2, practice fueling every 40 minutes. The cornerstone of marathon training.",
  rest: "Full rest. Recovery is where adaptation happens — no cross-training needed.",
};

export const MONTH_NAMES: Record<number, string> = {
  6: "July", 7: "August", 8: "September", 9: "October",
};

export const PLAN_COPY = {
  brand: "ARI", navHome: "Home", navActivities: "Activities",
  navPlan: "Plan", navSettings: "Settings",
  title: "Marathon Plan", subtitle: "Oct 11, 2026 · Target 3:45:00",
  raceTag: "Race day", raceLine: "Sun Oct 11, 2026 · Marathon · 42.2 km",
  raceTarget: "Target 3:45:00 · 5:20/km",
};

/* ------------------------------------------------------------------ */
/* Real plans                                                          */
/* ------------------------------------------------------------------ */


/** Full month names, for any month rather than only July to October. */
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Turns the athlete's real plan into the shape this screen renders.
 *
 * The screen was a direct port of the prototype, which meant `planWeeks()` —
 * twelve weeks of invented distances, paces, Done/Missed history and a "today"
 * frozen on 11 August 2026 — was what every signed-in athlete saw when they
 * clicked Plan. The data to do this properly already existed and was already
 * being used by the dashboard.
 *
 * `phase` is left blank rather than guessed. The generator knows its phases but
 * does not store them per week, and labelling a week "Peak" because of where it
 * sits in the list would be a claim we cannot support.
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
      status: d.status,
      done: d.done,
      missed: d.missed,
      today: d.today,
    }));

    const first = days[0];
    const last = days[days.length - 1];

    return {
      days,
      km: Math.round(days.reduce((s, d) => s + d.dist, 0)),
      phase: "",
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
    "A training plan needs a goal race — the distance and the date. Set one in Settings and ARI will build the weeks between now and then from what you are already running.",
  cta: "Go to Settings",
} as const;

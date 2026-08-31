/**
 * The Numbers board — every figure in Runi as a tile with the athlete's own
 * value on it, arranged as the pipeline they actually form:
 *
 *   inputs  →  load  →  fitness & fatigue  →  form & ratio  →  readiness
 *   (heart rate, pace, volume, recovery)                       + per-run:
 *                                                                GAP, drift, Riegel
 *
 * This module is pure: it takes the live values the page loader gathered and
 * returns tiles with a display value, a status band and four short
 * explanation blocks — the letters, *your* numbers substituted into the
 * arithmetic, the formula in one line, and why that formula. The prose is
 * deliberately short; the long methodology page this replaced explained
 * everything and was read by nobody.
 *
 * Every band here mirrors the one the product actually uses (readiness
 * subscores in lib/planning/readiness.ts, zones in lib/activity/zones.ts,
 * the ACWR threshold shared with the safety checker), so a tile never says
 * "fresh" when the dashboard says otherwise.
 */

import { zoneFor } from "@/lib/activity/zones";
import { formatDuration, formatPace } from "@/lib/format/pace";

/* ------------------------------------------------------------------ */
/* input                                                               */
/* ------------------------------------------------------------------ */

export interface NumbersLive {
  /** latest readiness snapshot, or null when there is none yet */
  snapshot: {
    date: string;
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    acwr: number | null;
    readiness: number | null;
  } | null;
  /** the snapshot from ~7 days earlier, for the trend chips */
  weekAgo: { ctl: number | null; atl: number | null } | null;
  /** the most recent run */
  lastRun: {
    date: string;
    distanceM: number | null;
    durationS: number | null;
    avgHr: number | null;
    avgPace: string | null;
    driftPct: number | null;
    /** load for this run from lib/planning/load (HR-based when possible) */
    load: number | null;
    loadMethod: "hrss" | "rtss" | "none" | null;
  } | null;
  /** the athlete's thresholds as the pipeline currently holds them */
  thresholds: { hrMax: number; hrRest: number; lthr: number; measured: boolean; thresholdPaceSecPerKm: number | null } | null;
  /** kilometres this week (Sunday-start) and last week */
  volume: { thisWeekKm: number; lastWeekKm: number; runsThisWeek: number } | null;
  /** last night */
  recovery: { date: string; sleepHours: number | null; restingHr: number | null; hrv: number | null } | null;
  /** goal race + the best effort the prediction is built from */
  race: {
    label: string;
    distanceM: number;
    targetSec: number | null;
    /** the longest personal best on file, as the base for Riegel */
    baseLabel: string;
    baseDistanceM: number;
    baseSec: number;
  } | null;
  /**
   * The past, for the history chart in each panel. Optional: the board works
   * without it (no chart, no toggles), which is also how the tests build it.
   * Dates are ISO `YYYY-MM-DD`; every list is oldest first.
   */
  series?: {
    /** one row per day the readiness job ran — the pipeline keeps 90 days */
    snapshots: { date: string; ctl: number | null; atl: number | null; tsb: number | null; acwr: number | null; readiness: number | null }[];
    /** one row per run, up to a year back */
    runs: { date: string; avgHr: number | null; paceSecPerKm: number | null; distanceM: number | null; load: number | null; driftPct: number | null }[];
    /** one row per night, up to a year back */
    nights: { date: string; sleepHours: number | null }[];
    /** "today" in the product's time zone, so the range cut-offs are stable */
    today: string;
  };
}

/* ------------------------------------------------------------------ */
/* output                                                              */
/* ------------------------------------------------------------------ */

export type Lane = "inputs" | "load" | "fitness" | "form" | "readiness" | "perRun";
export type Tone = "positive" | "caution" | "negative" | "neutral";

export interface NumberTile {
  id: string;
  lane: Lane;
  /** the short label on the tile — "CTL", "TSB", "HR" */
  abbr: string;
  name: string;
  /** what is printed large; "—" when the athlete has no data for it yet */
  value: string;
  unit?: string;
  status: { label: string; tone: Tone };
  /** the four blocks of the explanation */
  letters: string;
  yours: string;
  formula: string;
  why: string;
  seenOn: string;
  /** 24×24 lucide-style path */
  icon: string;
  /**
   * The bar in the panel: the metric's bands, coloured by what they mean,
   * with the athlete's value marked on it. Serialisable — the tiles cross
   * from the server page to the client view — so formatting is a key, not a
   * function.
   */
  scale?: Scale;
  /** the metric over time, in the ranges the data can honestly fill */
  history?: History;
}

export type HistoryRange = "w" | "m" | "3m" | "y";

export interface History {
  /** how a value on the y-axis reads — "pace" is seconds per km shown as m:ss */
  format: ScaleFormat | "pace";
  /** bars for things that are sums (kilometres per week); a line for everything else */
  kind: "line" | "bars";
  /** for pace: a lower number is the better one, so the axis is drawn the other way up */
  lowerIsBetter?: boolean;
  /** what one point is — "one point per run", "one point per night" */
  grain: string;
  /** shown after the values — "bpm", "km" — when the format alone does not say it */
  unit?: string;
  ranges: { key: HistoryRange; label: string; points: { d: string; v: number }[] }[];
}

export type ScaleFormat = "int" | "signed" | "ratio" | "pct" | "pct1" | "hours" | "time" | "paceRatio";

export interface Scale {
  min: number;
  max: number;
  format: ScaleFormat;
  segments: { from: number; to: number; label: string; tone: Tone }[];
  /** the athlete's value(s); more than one when the point is the relation between them */
  markers: { value: number; label: string; tone?: Tone }[];
  /** what the axis is, in three words */
  axis: string;
}

/*
 * One hue per figure, shared by every screen that shows it: the heart is the
 * red thing that beats on the board and on the home screen alike. Used on
 * icons, small labels, selection rings and history lines — never on a value
 * or a band, which wear status colours. Checked against the dark surface
 * (all ≥ 5:1) and kept at least ΔE 9 from the three status colours; the
 * heart red is a blue-leaning blood red, ΔE 10 from the orange-leaning coral
 * that means "negative". Fitness, fatigue and form reuse the dashboard
 * chart's tokens. Cardiac drift shares the heart's red — it is a heart
 * figure, and its icon is the monitor trace. Readiness has no hue: its colour
 * *is* its status.
 */
export const NUMBERS_HUE: Record<string, string> = {
  hr: "#ff2d55",
  pace: "#5ec2e8",
  volume: "#2bb3a3",
  recovery: "#a78bfa",
  trimp: "#c6d05a",
  ctl: "var(--color-ctl)",
  atl: "var(--color-atl)",
  tsb: "var(--color-tsb)",
  acwr: "#8fa3c8",
  gap: "#b07d52",
  drift: "#ff2d55",
  riegel: "var(--color-gold)",
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const n0 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x));
const n1 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const n2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const signed = (x: number) => (x > 0 ? `+${x}` : String(x));
const NA = { label: "No data yet", tone: "neutral" as Tone };

/** "5:08" → 308 seconds; null for anything else. */
export function paceToSec(p: string | null | undefined): number | null {
  if (!p) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(p.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Riegel (1981): T₂ = T₁ × (D₂/D₁)^1.06 */
export function riegel(baseSec: number, baseDistanceM: number, targetDistanceM: number, exponent = 1.06): number {
  return baseSec * Math.pow(targetDistanceM / baseDistanceM, exponent);
}

/** The form band the product uses (lib/planning/readiness.ts formSubscore). */
export function formBand(tsb: number): { label: string; tone: Tone } {
  if (tsb > 20) return { label: "Detraining", tone: "caution" };
  if (tsb >= 5) return { label: "Fresh", tone: "positive" };
  if (tsb >= -10) return { label: "Neutral", tone: "neutral" };
  if (tsb >= -30) return { label: "Loaded", tone: "caution" };
  return { label: "Heavily loaded", tone: "negative" };
}

/** The ratio band — 1.5 is the threshold the safety checker acts on. */
export function ratioBand(r: number): { label: string; tone: Tone } {
  if (r > 1.5) return { label: "Ramping fast", tone: "negative" };
  if (r > 1.2) return { label: "Above usual", tone: "caution" };
  if (r >= 0.9) return { label: "Usual level", tone: "positive" };
  if (r >= 0.8) return { label: "A little low", tone: "neutral" };
  return { label: "Detraining", tone: "caution" };
}

export function driftBand(pct: number): { label: string; tone: Tone } {
  if (pct <= 3) return { label: "Low — good", tone: "positive" };
  if (pct <= 8) return { label: "Elevated", tone: "caution" };
  return { label: "High", tone: "negative" };
}

export function readinessBand(score: number): { label: string; tone: Tone } {
  if (score >= 70) return { label: "Ready to load", tone: "positive" };
  if (score >= 40) return { label: "Go easy", tone: "caution" };
  return { label: "Rest", tone: "negative" };
}

export function loadBand(load: number): { label: string; tone: Tone } {
  if (load < 50) return { label: "Short & easy", tone: "neutral" };
  if (load <= 120) return { label: "Normal day", tone: "positive" };
  if (load <= 200) return { label: "Solid session", tone: "caution" };
  return { label: "Big day", tone: "negative" };
}

function trend(now: number | null, before: number | null, unit = ""): { label: string; tone: Tone } {
  if (now == null || before == null) return { label: "Settled", tone: "neutral" };
  const d = now - before;
  if (Math.abs(d) < 1) return { label: "Settled", tone: "neutral" };
  return d > 0 ? { label: `Rising +${Math.round(d)}${unit}`, tone: "positive" } : { label: `Falling ${Math.round(d)}${unit}`, tone: "neutral" };
}

export const ICON = {
  heart: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  pace: "M4 20h16M6 16l4-8 3 5 3-9 2 6",
  volume: "M3 20V10M9 20V4M15 20v-7M21 20v-3",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
  load: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8",
  fitness: "M3 17l6-6 4 4 8-8M14 7h7v7",
  fatigue: "M3 7l6 6 4-4 8 8M14 17h7v-7",
  form: "M12 3v18M3 12h18M7 7l10 10M17 7 7 17",
  ratio: "M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12l4-6",
  ready: "M20 6 9 17l-5-5",
  gap: "M3 18l6-9 4 5 3-3 5 7",
  // an ECG trace — flat, a spike, flat — the monitor-line for the heart figure
  drift: "M2 12h4l2-5 3 10 3-8 2 3h6",
  flag: "M4 22V4h12l-2 4 2 4H4",
} as const;

/* ------------------------------------------------------------------ */
/* the board                                                           */
/* ------------------------------------------------------------------ */

export function buildNumbersTiles(live: NumbersLive): NumberTile[] {
  const s = live.snapshot;
  const run = live.lastRun;
  const th = live.thresholds;

  /* ---- inputs ---- */
  const hrZone = run?.avgHr != null && th ? zoneFor(run.avgHr, th.lthr) : null;
  const hr: NumberTile = {
    id: "hr", lane: "inputs", abbr: "HR", name: "Heart rate", icon: ICON.heart,
    value: run?.avgHr != null ? String(Math.round(run.avgHr)) : "—", unit: "bpm",
    status: hrZone ? { label: `${hrZone.zone.id} · ${hrZone.zone.name}`, tone: hrZone.zone.id <= "Z2" ? "positive" : hrZone.zone.id <= "Z4" ? "caution" : "negative" } : NA,
    letters: "Your average heart rate on the last run, and the zone it sat in. Zones are percentages of your threshold heart rate (LTHR), not of your maximum.",
    yours: th
      ? `Your threshold is ${th.lthr} bpm${th.measured ? " (measured from your runs)" : " (estimated until a hard 20–75 min effort measures it)"}. ${run?.avgHr != null && hrZone ? `Last run averaged ${Math.round(run.avgHr)} bpm = ${hrZone.pct}% of threshold → ${hrZone.zone.id} ${hrZone.zone.name}.` : "No heart-rate run yet."}`
      : "No thresholds yet — they appear after your first synced runs.",
    formula: "zone = avg HR ÷ LTHR × 100 → Z1 <85 · Z2 85–90 · Z3 90–95 · Z4 95–100 · Z5 100–103 · Z6 >103",
    why: "Threshold-based zones follow the athlete as fitness changes; max-based zones assume a maximum most people have never actually measured. (Friel's LTHR zones.)",
    seenOn: "Every run · the run page",
  };
  hr.scale = {
    min: 70, max: 110, format: "pct", axis: "% of threshold heart rate",
    segments: [
      { from: 70, to: 85, label: "Z1 recovery", tone: "positive" },
      { from: 85, to: 90, label: "Z2 endurance", tone: "positive" },
      { from: 90, to: 95, label: "Z3 tempo", tone: "caution" },
      { from: 95, to: 100, label: "Z4 threshold", tone: "caution" },
      { from: 100, to: 103, label: "Z5 VO₂", tone: "negative" },
      { from: 103, to: 110, label: "Z6", tone: "negative" },
    ],
    markers: hrZone ? [{ value: hrZone.pct, label: `last run · ${hrZone.pct}%` }] : [],
  };

  const pace: NumberTile = {
    id: "pace", lane: "inputs", abbr: "PACE", name: "Pace", icon: ICON.pace,
    value: run?.avgPace ?? "—", unit: "/km",
    status: run ? { label: `Last run · ${run.distanceM != null ? (run.distanceM / 1000).toFixed(1) : "—"} km`, tone: "neutral" } : NA,
    letters: "Minutes per kilometre on the last run — the plain number from the watch, before any correction for hills.",
    yours: run?.avgPace && run.durationS != null && run.distanceM
      ? `${formatDuration(run.durationS)} over ${(run.distanceM / 1000).toFixed(2)} km = ${run.avgPace} /km.`
      : "No run with pace yet.",
    formula: "pace = moving time ÷ distance",
    why: "It is what every runner already thinks in. Runi keeps it raw here and does the hill correction separately (GAP), so you always know which one you are looking at.",
    seenOn: "Every run · the plan",
  };
  {
    const lastSec = paceToSec(run?.avgPace);
    const thSec = th?.thresholdPaceSecPerKm ?? null;
    const rel = lastSec != null && thSec ? lastSec / thSec : null; // > 1 = slower than threshold
    pace.scale = {
      min: 0.9, max: 1.4, format: "paceRatio", axis: "pace relative to your threshold pace",
      segments: [
        { from: 0.9, to: 0.97, label: "intervals", tone: "negative" },
        { from: 0.97, to: 1.05, label: "threshold", tone: "caution" },
        { from: 1.05, to: 1.15, label: "steady", tone: "caution" },
        { from: 1.15, to: 1.28, label: "easy", tone: "positive" },
        { from: 1.28, to: 1.4, label: "recovery", tone: "positive" },
      ],
      markers: rel != null ? [{ value: rel, label: `last run · ${run?.avgPace}` }] : [],
    };
    if (thSec) pace.yours += ` Your threshold pace is about ${formatPace(thSec)}; the plan's easy runs sit near ${formatPace(thSec / 0.78)} and intervals near ${formatPace(thSec / 1.06)}.`;
  }

  const vol = live.volume;
  const volDelta = vol ? (vol.lastWeekKm > 0 ? Math.round(((vol.thisWeekKm - vol.lastWeekKm) / vol.lastWeekKm) * 100) : null) : null;
  const volume: NumberTile = {
    id: "volume", lane: "inputs", abbr: "KM", name: "Weekly volume", icon: ICON.volume,
    value: vol ? vol.thisWeekKm.toFixed(0) : "—", unit: "km",
    status: vol
      ? volDelta == null
        ? { label: `${vol.runsThisWeek} runs so far`, tone: "neutral" }
        : volDelta > 10 ? { label: `${signed(volDelta)}% vs last week`, tone: "caution" } : { label: `${signed(volDelta)}% vs last week`, tone: "positive" }
      : NA,
    letters: "Kilometres run since Sunday. The week starts on Sunday everywhere in Runi — the plan, the calendar, this number.",
    yours: vol ? `${vol.thisWeekKm.toFixed(1)} km this week across ${vol.runsThisWeek} runs, against ${vol.lastWeekKm.toFixed(1)} km last week${volDelta != null ? ` (${signed(volDelta)}%)` : ""}.` : "No runs this week yet.",
    formula: "weekly km = Σ distance of runs, Sunday → Saturday · plan ramps ≤ 7–9% per week, every 4th week −25%",
    why: "Volume is the input you control most directly, and the one most injuries trace back to. The 7–9% ramp and the step-back week are the same rules the plan generator uses, so what you see here is what it enforces.",
    seenOn: "Your home screen · the plan",
  };
  volume.scale = {
    min: -40, max: 40, format: "signed", axis: "% change vs last week",
    segments: [
      { from: -40, to: -20, label: "step-back", tone: "neutral" },
      { from: -20, to: 7, label: "steady", tone: "positive" },
      { from: 7, to: 10, label: "limit", tone: "caution" },
      { from: 10, to: 40, label: "too fast", tone: "negative" },
    ],
    markers: volDelta != null ? [{ value: Math.max(-40, Math.min(40, volDelta)), label: `this week · ${signed(volDelta)}%` }] : [],
  };

  const rec = live.recovery;
  const recovery: NumberTile = {
    id: "recovery", lane: "inputs", abbr: "SLEEP", name: "Recovery", icon: ICON.moon,
    value: rec?.sleepHours != null ? rec.sleepHours.toFixed(1) : "—", unit: "h",
    status: rec?.sleepHours != null
      ? rec.sleepHours >= 7 ? { label: "Slept enough", tone: "positive" } : rec.sleepHours >= 6 ? { label: "A little short", tone: "caution" } : { label: "Short night", tone: "negative" }
      : NA,
    letters: "Last night: hours slept, resting heart rate and HRV, from your wellness source. They nudge readiness — they do not drive it.",
    yours: rec
      ? `Last night: ${rec.sleepHours != null ? `${rec.sleepHours.toFixed(1)} h sleep` : "no sleep data"}${rec.restingHr != null ? ` · resting HR ${Math.round(rec.restingHr)}` : ""}${rec.hrv != null ? ` · HRV ${Math.round(rec.hrv)}` : ""}.`
      : "No wellness source connected yet — readiness is computed from training load alone.",
    formula: "sleep subscore: 100 at ≥ 8 h, falling below 7 h · HRV: vs your own 7-day baseline · with recovery the weights are form 35 · ratio 20 · drift 15 · sleep 20 · HRV 10",
    why: "Sleep loss costs about 7.6% of performance on average (Craven et al. 2022). HRV is compared with your own baseline, never with other people's, because the absolute number means nothing across athletes.",
    seenOn: "Your home screen · the reasoning panel",
  };

  /* ---- load ---- */
  recovery.scale = {
    min: 4, max: 10, format: "hours", axis: "hours slept last night",
    segments: [
      { from: 4, to: 6, label: "short", tone: "negative" },
      { from: 6, to: 7, label: "a little short", tone: "caution" },
      { from: 7, to: 9, label: "enough", tone: "positive" },
      { from: 9, to: 10, label: "long", tone: "neutral" },
    ],
    markers: rec?.sleepHours != null ? [{ value: Math.max(4, Math.min(10, rec.sleepHours)), label: `${rec.sleepHours.toFixed(1)} h` }] : [],
  };
  const trimp: NumberTile = {
    id: "trimp", lane: "load", abbr: "LOAD", name: "Training load", icon: ICON.load,
    value: run?.load != null && run.loadMethod !== "none" ? String(Math.round(run.load)) : "—",
    status: run?.load != null && run.loadMethod !== "none" ? loadBand(run.load) : NA,
    letters: "One number for how hard the last run was, from how long you ran and how high your heart rate sat while you ran it. Banister's TRIMP, normalised so 100 = an hour at threshold.",
    yours: run && run.load != null && run.loadMethod !== "none"
      ? run.loadMethod === "hrss" && th && run.avgHr != null && run.durationS != null
        ? `${formatDuration(run.durationS)} at ${Math.round(run.avgHr)} bpm (rest ${th.hrRest}, max ${th.hrMax}) → load ${Math.round(run.load)}. An easy hour and a hard twenty minutes can score the same.`
        : `No heart rate on that run, so it was scored from pace instead → load ${Math.round(run.load)} (a hilly run reads easier than it was).`
      : "No scored run yet.",
    formula: "TRIMP = min × HRr × 0.64 × e^(1.92·HRr), HRr = (HR − rest) ÷ (max − rest)",
    why: "Heart rate is the only signal that knows the difference between a flat 5:00/km and the same pace into a headwind. The exponential term is Banister (1991); it is why hard minutes count so much more than easy ones.",
    seenOn: "Every run · the fitness chart",
  };
  trimp.scale = {
    min: 0, max: 300, format: "int", axis: "load of the last run",
    segments: [
      { from: 0, to: 50, label: "short & easy", tone: "neutral" },
      { from: 50, to: 120, label: "normal day", tone: "positive" },
      { from: 120, to: 200, label: "solid session", tone: "caution" },
      { from: 200, to: 300, label: "big day", tone: "negative" },
    ],
    markers: run?.load != null && run.loadMethod !== "none" ? [{ value: Math.min(300, run.load), label: `last run · ${Math.round(run.load)}` }] : [],
  };

  /* ---- fitness & fatigue ---- */
  const ctl: NumberTile = {
    id: "ctl", lane: "fitness", abbr: "CTL", name: "Fitness", icon: ICON.fitness,
    value: n0(s?.ctl) != null ? String(n0(s?.ctl)) : "—",
    status: s?.ctl != null ? trend(s.ctl, live.weekAgo?.ctl ?? null) : NA,
    letters: "Chronic Training Load. Your training load averaged over the last 42 days, with recent days counting more. The slow line.",
    yours: s?.ctl != null ? `Your 42-day average load is ${n0(s.ctl)}${live.weekAgo?.ctl != null ? `, up from ${n0(live.weekAgo.ctl)} a week ago` : ""}. It moves a point or two a week — that is fitness being built, not a bad day.` : "Appears after about two weeks of synced runs.",
    formula: "CTL_today = CTL_yesterday + (load_today − CTL_yesterday) ÷ 42",
    why: "An exponentially weighted average is the simplest model of adaptation that fits the data: what you did six weeks ago still counts, just less. 42 days is the Coggan/Banister convention.",
    seenOn: "The fitness · fatigue · form chart",
  };


  const pmcTop = Math.max(60, Math.ceil(Math.max(s?.ctl ?? 0, s?.atl ?? 0) * 1.3 / 10) * 10);
  const pmcScale: Scale = {
    min: 0, max: pmcTop, format: "int", axis: "training load, daily-weighted average",
    segments: [{ from: 0, to: pmcTop, label: "fitness and fatigue on one axis — the gap between them is your form", tone: "neutral" }],
    markers: [
      ...(s?.ctl != null ? [{ value: s.ctl, label: `fitness ${n0(s.ctl)}`, tone: "positive" as Tone }] : []),
      ...(s?.atl != null ? [{ value: s.atl, label: `fatigue ${n0(s.atl)}`, tone: "caution" as Tone }] : []),
    ],
  };
  ctl.scale = pmcScale;

  const atl: NumberTile = {
    id: "atl", lane: "fitness", abbr: "ATL", name: "Fatigue", icon: ICON.fatigue,
    value: n0(s?.atl) != null ? String(n0(s?.atl)) : "—",
    status: s?.atl != null ? trend(s.atl, live.weekAgo?.atl ?? null) : NA,
    letters: "Acute Training Load. The same average over 7 days. The fast line — it jumps after a hard week and falls within days of rest.",
    yours: s?.atl != null ? `Your 7-day average load is ${n0(s.atl)}${s.ctl != null ? `, against a fitness of ${n0(s.ctl)}` : ""}. When this sits above fitness for long, form goes negative.` : "Appears after your first synced week.",
    formula: "ATL_today = ATL_yesterday + (load_today − ATL_yesterday) ÷ 7",
    why: "Same arithmetic as fitness, faster clock. Two views of one number at two speeds is what lets the model tell 'trained' from 'tired'.",
    seenOn: "The fitness · fatigue · form chart",
  };

  /* ---- form & ratio ---- */
  atl.scale = pmcScale;
  const tsb: NumberTile = {
    id: "tsb", lane: "form", abbr: "TSB", name: "Form", icon: ICON.form,
    value: n0(s?.tsb) != null ? signed(n0(s?.tsb) as number) : "—",
    status: s?.tsb != null ? formBand(s.tsb) : NA,
    letters: "Training Stress Balance: fitness minus fatigue. How much of your fitness is actually available today.",
    yours: s?.tsb != null && s.ctl != null && s.atl != null ? `${n0(s.ctl)} − ${n0(s.atl)} = ${signed(n0(s.tsb) as number)}. ${formBand(s.tsb).label}: ${s.tsb >= 5 && s.tsb <= 20 ? "the race-day window." : s.tsb > 20 ? "rested past the point of gain — time to train." : s.tsb >= -10 ? "normal training." : "you are absorbing work; expect legs to feel heavy."}` : "Needs fitness and fatigue first.",
    formula: "TSB = CTL − ATL   ·   +5…+20 fresh · −10…+5 neutral · −30…−10 loaded",
    why: "Banister's impulse-response model, forty years in use. The bands are where readiness scores it: 100 points between +5 and +20, falling either side.",
    seenOn: "The chart · your home screen",
  };
  tsb.scale = {
    min: -40, max: 30, format: "signed", axis: "form = fitness − fatigue",
    segments: [
      { from: -40, to: -30, label: "heavily loaded", tone: "negative" },
      { from: -30, to: -10, label: "loaded", tone: "caution" },
      { from: -10, to: 5, label: "neutral", tone: "neutral" },
      { from: 5, to: 20, label: "fresh", tone: "positive" },
      { from: 20, to: 30, label: "detraining", tone: "caution" },
    ],
    markers: s?.tsb != null ? [{ value: Math.max(-40, Math.min(30, s.tsb)), label: `today · ${signed(n0(s.tsb) as number)}` }] : [],
  };

  const acwr: NumberTile = {
    id: "acwr", lane: "form", abbr: "ACWR", name: "Load ratio", icon: ICON.ratio,
    value: n2(s?.acwr) != null ? (n2(s?.acwr) as number).toFixed(2) : "—",
    status: s?.acwr != null ? ratioBand(s.acwr) : NA,
    letters: "Acute:Chronic Workload Ratio. This week's load divided by your usual four-week load. 1.0 means a normal week for you.",
    yours: s?.acwr != null ? `Your ratio is ${(n2(s.acwr) as number).toFixed(2)}: ${ratioBand(s.acwr).label.toLowerCase()}. ${s.acwr > 1.5 ? "Above 1.5 the plan eases tomorrow's session and tells you why." : "Below 1.5 the plan leaves your sessions alone."}` : "Needs about four weeks of history.",
    formula: "ACWR = 7-day load ÷ 28-day load   ·   plan acts above 1.5",
    why: "The ratio catches 'too much, too soon' before the injury does. 1.5 is the threshold shared with the safety checker — one number, one rule, in both places. (Gabbett; the 2025 BJSM review is why it is descriptive here, not a risk claim.)",
    seenOn: "Your home screen",
  };

  /* ---- readiness ---- */
  acwr.scale = {
    min: 0.5, max: 2.0, format: "ratio", axis: "this week ÷ your usual four weeks",
    segments: [
      { from: 0.5, to: 0.8, label: "detraining", tone: "caution" },
      { from: 0.8, to: 0.9, label: "a little low", tone: "neutral" },
      { from: 0.9, to: 1.2, label: "usual level", tone: "positive" },
      { from: 1.2, to: 1.5, label: "above usual", tone: "caution" },
      { from: 1.5, to: 2.0, label: "ramping fast", tone: "negative" },
    ],
    markers: s?.acwr != null ? [{ value: Math.max(0.5, Math.min(2, s.acwr)), label: `today · ${(n2(s.acwr) as number).toFixed(2)}` }] : [],
  };
  const readiness: NumberTile = {
    id: "readiness", lane: "readiness", abbr: "READINESS", name: "Readiness", icon: ICON.ready,
    value: n0(s?.readiness) != null ? String(n0(s?.readiness)) : "—",
    status: s?.readiness != null ? readinessBand(s.readiness) : NA,
    letters: "Today's score, 0–100: how ready your body is to take on load. Everything before it on the board feeds it.",
    yours: s?.readiness != null
      ? rec
        ? `Today: ${n0(s.readiness)}. Form ${s.tsb != null ? signed(n0(s.tsb) as number) : "—"} carries 35% of it, load ratio ${s.acwr != null ? (n2(s.acwr) as number).toFixed(2) : "—"} 20%, cardiac drift 15%, last night's sleep 20% and HRV 10%.`
        : `Today: ${n0(s.readiness)}. Form ${s.tsb != null ? signed(n0(s.tsb) as number) : "—"} carries 45% of it, load ratio ${s.acwr != null ? (n2(s.acwr) as number).toFixed(2) : "—"} 30% and cardiac drift 25% — connect a wellness source and sleep and HRV join in.`
      : "Needs 7 days of data. Until then Runi shows dashes rather than a guess.",
    formula: "readiness = Σ weight × subscore   ·   load only: form 45 · ratio 30 · drift 25   ·   with recovery: 35 · 20 · 15 · sleep 20 · HRV 10",
    why: "A weighted sum is deliberately boring: every point can be traced back to one input, which is what the reasoning panel does. A model nobody can explain is not a coach.",
    seenOn: "Your home screen · the reasoning panel",
  };

  /* ---- per run ---- */
  readiness.scale = {
    min: 0, max: 100, format: "int", axis: "readiness, 0–100",
    segments: [
      { from: 0, to: 40, label: "rest", tone: "negative" },
      { from: 40, to: 70, label: "go easy", tone: "caution" },
      { from: 70, to: 100, label: "ready to load", tone: "positive" },
    ],
    markers: s?.readiness != null ? [{ value: s.readiness, label: `today · ${n0(s.readiness)}` }] : [],
  };
  const gap: NumberTile = {
    id: "gap", lane: "perRun", abbr: "GAP", name: "Grade-adjusted pace", icon: ICON.gap,
    value: "—", unit: "/km",
    status: { label: "On each run with elevation", tone: "neutral" },
    letters: "Your pace as if the run had been flat. Uphill minutes are credited, downhill ones discounted.",
    yours: "Computed per run from its elevation stream, so it lives on the run page rather than here — open any hilly run to see raw pace and GAP side by side.",
    formula: "GAP = pace ÷ cost(grade), cost from Minetti's energy curve for running on slopes",
    why: "Without it a hilly 5:30 looks slower than a flat 5:15 when it was harder. Minetti et al. (2002) measured the oxygen cost of running at each grade; GAP uses that curve.",
    seenOn: "Every run with elevation",
  };

  const drift: NumberTile = {
    id: "drift", lane: "perRun", abbr: "DRIFT", name: "Cardiac drift", icon: ICON.drift,
    value: n1(run?.driftPct) != null ? (n1(run?.driftPct) as number).toFixed(1) : "—", unit: "%",
    status: run?.driftPct != null ? driftBand(run.driftPct) : { label: "Needs a steady run ≥ 30 min", tone: "neutral" },
    letters: "How much your heart rate rose during the last run relative to your pace. Same pace, higher heart rate = drift.",
    yours: run?.driftPct != null ? `Last run: ${(n1(run.driftPct) as number).toFixed(1)}% — ${driftBand(run.driftPct).label.toLowerCase()}. ${run.driftPct <= 3 ? "Your aerobic system held the pace comfortably." : run.driftPct <= 8 ? "Heat, dehydration or fatigue made the second half cost more." : "That run cost far more than its pace suggests; readiness will reflect it."}` : "Drift needs a steady run of at least 30 minutes with heart rate.",
    formula: "drift = (HR/pace 2nd half ÷ HR/pace 1st half − 1) × 100   ·   ≤ 3% normal · > 8% high",
    why: "It is the cheapest honest measure of aerobic fitness there is: no lab, no test, just a run you were doing anyway. (Maffetone's MAF test, formalised.)",
    seenOn: "Every run with heart rate",
  };
  drift.scale = {
    min: 0, max: 15, format: "pct1", axis: "heart-rate drift over the run",
    segments: [
      { from: 0, to: 3, label: "low — good", tone: "positive" },
      { from: 3, to: 8, label: "elevated", tone: "caution" },
      { from: 8, to: 15, label: "high", tone: "negative" },
    ],
    markers: run?.driftPct != null ? [{ value: Math.max(0, Math.min(15, run.driftPct)), label: `last run · ${(n1(run.driftPct) as number).toFixed(1)}%` }] : [],
  };

  const race = live.race;
  const predicted = race && race.baseSec > 0 && race.baseDistanceM > 0 ? riegel(race.baseSec, race.baseDistanceM, race.distanceM) : null;
  const riegelTile: NumberTile = {
    id: "riegel", lane: "perRun", abbr: "RIEGEL", name: "Race prediction", icon: ICON.flag,
    value: predicted != null ? formatDuration(predicted) : "—",
    status: race && predicted != null
      ? race.targetSec != null
        ? predicted <= race.targetSec ? { label: "On target", tone: "positive" } : predicted - race.targetSec < 300 ? { label: "Closing", tone: "caution" } : { label: `${formatDuration(predicted - race.targetSec)} off target`, tone: "negative" }
        : { label: race.label, tone: "neutral" }
      : { label: race ? "Needs a personal best" : "Set a goal race", tone: "neutral" },
    letters: `What your best recent effort says you could run over the race distance${race ? ` — your ${race.label}` : ""}.`,
    yours: race && predicted != null
      ? `Your ${race.baseLabel} best is ${formatDuration(race.baseSec)}. ${formatDuration(race.baseSec)} × (${(race.distanceM / 1000).toFixed(1)} ÷ ${(race.baseDistanceM / 1000).toFixed(1)})^1.06 = ${formatDuration(predicted)}${race.targetSec != null ? ` against a target of ${formatDuration(race.targetSec)}` : ""}.`
      : race ? "Once Runi has a timed best effort on file (5K, 10K, half), the prediction appears here." : "Set a goal race in Settings and the prediction appears here.",
    formula: "T₂ = T₁ × (D₂ ÷ D₁)^1.06",
    why: "Riegel (1981) — one exponent fits trained runners across distances remarkably well. It is a projection from what you have already run, not a promise; the further the race is from your best distance, the softer it gets.",
    seenOn: "Your goal race",
  };
  if (race && predicted != null) {
    const anchor = race.targetSec ?? predicted;
    const lo = Math.max(0, anchor - 600), hi = anchor + 1500;
    riegelTile.scale = {
      min: lo, max: hi, format: "time", axis: race.targetSec != null ? "finish time against your target" : "predicted finish time",
      segments: race.targetSec != null
        ? [
            { from: lo, to: race.targetSec, label: "on target", tone: "positive" },
            { from: race.targetSec, to: race.targetSec + 300, label: "closing", tone: "caution" },
            { from: race.targetSec + 300, to: hi, label: "off target", tone: "negative" },
          ]
        : [{ from: lo, to: hi, label: "predicted", tone: "neutral" }],
      markers: [
        { value: Math.max(lo, Math.min(hi, predicted)), label: `predicted · ${formatDuration(predicted)}` },
        ...(race.targetSec != null ? [{ value: race.targetSec, label: `target · ${formatDuration(race.targetSec)}`, tone: "neutral" as Tone }] : []),
      ],
    };
  }

  const tiles = [hr, pace, volume, recovery, trimp, ctl, atl, tsb, acwr, readiness, gap, drift, riegelTile];
  if (live.series) for (const t of tiles) t.history = buildHistory(t.id, live.series);
  return tiles;
}

/* ------------------------------------------------------------------ */
/* history                                                             */
/* ------------------------------------------------------------------ */

const RANGE_DAYS: Record<HistoryRange, number> = { w: 7, m: 30, "3m": 91, y: 365 };
const RANGE_LABEL: Record<HistoryRange, string> = { w: "W", m: "M", "3m": "3M", y: "Y" };

/** ISO date `days` before `today` (both `YYYY-MM-DD`, UTC arithmetic is fine at day grain). */
function daysBefore(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Sunday-start week of an ISO date, as the ISO date of that Sunday. */
function weekOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function pick<T>(rows: T[], date: (r: T) => string, value: (r: T) => number | null, from: string): { d: string; v: number }[] {
  const out: { d: string; v: number }[] = [];
  for (const r of rows) {
    const d = date(r);
    if (d < from) continue;
    const v = value(r);
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ d, v: Math.round(v * 100) / 100 });
  }
  return out;
}

/** kilometres per Sunday-start week, one bar per week, weeks with no run included as 0 */
function weeklyKm(runs: NonNullable<NumbersLive["series"]>["runs"], from: string, today: string): { d: string; v: number }[] {
  const sums = new Map<string, number>();
  for (let w = weekOf(from); w <= today; w = daysBefore(w, -7)) sums.set(w, 0);
  for (const r of runs) {
    if (r.date < from || r.distanceM == null) continue;
    const w = weekOf(r.date);
    sums.set(w, (sums.get(w) ?? 0) + r.distanceM / 1000);
  }
  return [...sums.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, v]) => ({ d, v: Math.round(v * 10) / 10 }));
}

/** kilometres per day for the last week, one bar per day */
function dailyKm(runs: NonNullable<NumbersLive["series"]>["runs"], from: string, today: string): { d: string; v: number }[] {
  const sums = new Map<string, number>();
  for (let d = from; d <= today; d = daysBefore(d, -1)) sums.set(d, 0);
  for (const r of runs) if (r.date >= from && r.distanceM != null) sums.set(r.date, (sums.get(r.date) ?? 0) + r.distanceM / 1000);
  return [...sums.entries()].map(([d, v]) => ({ d, v: Math.round(v * 10) / 10 }));
}

/**
 * The history behind one tile, in the ranges its data can fill.
 *
 * Snapshot metrics (fitness, fatigue, form, ratio, readiness) stop at three
 * months because the pipeline keeps 90 days of snapshots. Anything read off a
 * run or a night goes back a year. GAP and the race prediction have no
 * history of their own — GAP is a per-run correction and the prediction moves
 * only when a personal best does — so they get none, rather than a chart that
 * would be flat by construction.
 *
 * A range with fewer than two points is left out: a chart of one dot says
 * nothing, and a toggle that shows nothing is worse than no toggle.
 */
export function buildHistory(id: string, s: NonNullable<NumbersLive["series"]>): History | undefined {
  const { today } = s;
  const line = (
    format: History["format"], grain: string, keys: HistoryRange[],
    points: (from: string) => { d: string; v: number }[], opts: { lowerIsBetter?: boolean; unit?: string } = {},
  ): History | undefined => {
    const ranges = keys
      .map((key) => ({ key, label: RANGE_LABEL[key], points: points(daysBefore(today, RANGE_DAYS[key])) }))
      .filter((r) => r.points.length >= 2);
    return ranges.length ? { format, kind: "line", grain, ranges, ...opts } : undefined;
  };
  const SNAP: HistoryRange[] = ["w", "m", "3m"];
  const LONG: HistoryRange[] = ["w", "m", "3m", "y"];
  const snap = (v: (r: (typeof s.snapshots)[number]) => number | null) => (from: string) => pick(s.snapshots, (r) => r.date, v, from);
  const run = (v: (r: (typeof s.runs)[number]) => number | null) => (from: string) => pick(s.runs, (r) => r.date, v, from);

  switch (id) {
    case "hr": return line("int", "one point per run · average heart rate", LONG, run((r) => r.avgHr), { unit: "bpm" });
    case "pace": return line("pace", "one point per run · average pace · up is faster", LONG, run((r) => r.paceSecPerKm), { lowerIsBetter: true, unit: "/km" });
    case "recovery": return line("hours", "one point per night", LONG, (from) => pick(s.nights, (r) => r.date, (r) => r.sleepHours, from));
    case "trimp": return line("int", "one point per run", LONG, run((r) => r.load));
    case "drift": return line("pct1", "one point per run", LONG, run((r) => r.driftPct));
    case "ctl": return line("int", "one point per day", SNAP, snap((r) => r.ctl));
    case "atl": return line("int", "one point per day", SNAP, snap((r) => r.atl));
    case "tsb": return line("signed", "one point per day", SNAP, snap((r) => r.tsb));
    case "acwr": return line("ratio", "one point per day", SNAP, snap((r) => r.acwr));
    case "readiness": return line("int", "one point per day", SNAP, snap((r) => r.readiness));
    case "volume": {
      if (s.runs.length === 0) return undefined;
      const ranges: History["ranges"] = [
        { key: "w", label: "W", points: dailyKm(s.runs, daysBefore(today, 6), today) },
        { key: "m", label: "M", points: weeklyKm(s.runs, daysBefore(today, 30), today) },
        { key: "3m", label: "3M", points: weeklyKm(s.runs, daysBefore(today, 91), today) },
        { key: "y", label: "Y", points: weeklyKm(s.runs, daysBefore(today, 365), today) },
      ];
      return { format: "int", kind: "bars", grain: "a bar per day this week, per week beyond", unit: "km", ranges };
    }
    default: return undefined;
  }
}

export const NUMBERS_COPY = {
  title: "Your numbers",
  subtitle: "Every figure in Runi, on your data, and why it is computed the way it is",
  lanes: {
    inputs: "What comes in",
    load: "Load",
    fitness: "Fitness & fatigue",
    form: "Form & ratio",
    readiness: "Readiness",
    perRun: "Per run",
  } satisfies Record<Lane, string>,
  blocks: { letters: "The letters", yours: "Your numbers", formula: "The formula", why: "Why this one" },
  hint: "Click any tile.",
  nav: { home: "Home", plan: "Plan", activities: "Activities", numbers: "Numbers", settings: "Settings" },
};

/** Convenience for the formatter tests and the page. */
export { formatPace };

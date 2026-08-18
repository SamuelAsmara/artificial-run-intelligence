/**
 * Activity detail model — ported from
 * design_handoff_ari_athlete_app/ARI Activity Detail.dc.html.
 *
 * Generates a realistic ~205-sample run (10 s cadence): noisy pace, hills,
 * heart rate lagging effort by ~25 s, and a second-half fade. In production
 * these arrays come from activity_streams.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import { formatMinSec } from "@/lib/format/pace";

/** Seconds -> "m:ss". Re-exported so the view keeps its short local name. */
export const fmt = formatMinSec;

export interface Streams {
  n: number; dist: number[]; vel: number[]; hr: number[];
  alt: number[]; time: number[];
}

let _s: Streams | null = null;
let _splits: number[] | null = null;

export function buildStreams(): { s: Streams; splits: number[] } {
  if (_s && _splits) return { s: _s, splits: _splits };

  const r = rng(7);
  const n = 205, dt = 10;
  const dist: number[] = [], vel: number[] = [], hr: number[] = [],
    alt: number[] = [], time: number[] = [];
  let d = 0, a = 42;

  const grade: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    grade.push(Math.sin(t * Math.PI * 3.2) * 1.4 + Math.sin(t * Math.PI * 7.3 + 1.2) * 0.5);
  }

  const effortHist: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let paceSec = 324;                          // 5:24 base
    if (t < 0.04) paceSec = 360 - t * 900;      // rolling start
    paceSec += grade[i] * 9;                    // hills
    paceSec += (r() - 0.5) * 18;                // noise
    paceSec += t > 0.6 ? (t - 0.6) * 70 : 0;    // second-half fade
    paceSec -= t > 0.3 && t < 0.48 ? 8 : 0;     // best patch mid-run
    paceSec = Math.max(280, Math.min(400, paceSec));

    const v = 1000 / paceSec;
    vel.push(v);
    d += v * dt;
    dist.push(d);
    time.push(i * dt);
    a += grade[i] * 0.55 + (r() - 0.5) * 0.3;
    alt.push(a);

    const effort = v * (1 + grade[i] * 0.06);
    effortHist.push(effort);
    const lag = Math.max(0, i - 2);             // ~25 s lag
    const eff = effortHist.slice(Math.max(0, lag - 3), lag + 1);
    const em = eff.reduce((s, x) => s + x, 0) / eff.length;
    const target = 118 + (em - 2.9) * 95 + t * 9;
    const prev = hr.length ? hr[hr.length - 1] : 118;
    hr.push(prev + (target - prev) * 0.25 + (r() - 0.5) * 1.6);
  }

  const splits: number[] = [];
  let k = 1, prevT = 0, prevD = 0;
  for (let i = 0; i < n; i++) {
    if (dist[i] >= k * 1000 || i === n - 1) {
      const m = dist[i] - prevD, seg = time[i] - prevT;
      if (m > 150) splits.push(seg / (m / 1000));
      prevT = time[i];
      prevD = dist[i];
      k++;
    }
  }

  _s = { n, dist, vel, hr, alt, time };
  _splits = splits;
  return { s: _s, splits };
}

/** Chart geometry. Pace axis is inverted: faster is up. */
export const GEOM = { X0: 44, X1: 1136, Y0: 20, Y1: 284, PACE_MIN: 270, PACE_MAX: 400 };

export function buildPaths(s: Streams, xMode: "dist" | "time") {
  const { n, dist, vel, hr, alt, time } = s;
  const { X0, X1, Y0, Y1, PACE_MIN, PACE_MAX } = GEOM;
  const xr = xMode === "dist" ? dist : time;
  const xmax = xr[n - 1];
  const X = (i: number) => X0 + (xr[i] / xmax) * (X1 - X0);
  const pY = (v: number) => Y0 + ((1000 / v - PACE_MIN) / (PACE_MAX - PACE_MIN)) * (Y1 - Y0);
  const hY = (v: number) => Y0 + (1 - (v - 100) / (185 - 100)) * (Y1 - Y0);
  const aLo = Math.min(...alt), aHi = Math.max(...alt);
  const aY = (v: number) => Y1 - ((v - aLo) / (aHi - aLo || 1)) * 70;

  const P = (f: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + f(i).toFixed(1)).join("");

  const pacePath = P((i) => pY(vel[i]));
  const hrPath = P((i) => hY(hr[i]));
  const elevArea =
    "M" + X0 + " " + Y1 +
    Array.from({ length: n }, (_, i) => "L" + X(i).toFixed(1) + " " + aY(alt[i]).toFixed(1)).join("") +
    "L" + X1 + " " + Y1 + "Z";

  const gridY = [290, 320, 350, 380].map((p) => {
    const y = Y0 + ((p - PACE_MIN) / 130) * (Y1 - Y0);
    return {
      y: y.toFixed(1), ty: (y + 3).toFixed(1), pace: fmt(p),
      hr: String(Math.round(185 - ((p - PACE_MIN) / 130) * 85)),
    };
  });

  const gridX: { x: string; label: string }[] = [];
  const steps = 6;
  for (let st = 1; st <= steps; st++) {
    const frac = st / steps;
    gridX.push({
      x: (X0 + frac * (X1 - X0)).toFixed(0),
      label: xMode === "dist" ? ((xmax * frac) / 1000).toFixed(1) + " km" : fmt(xmax * frac),
    });
  }

  return { pacePath, hrPath, elevArea, gridY, gridX, X, pY, hY };
}

export const PLANNED_PACE = 330; // 5:30/km

export const PVA_STATES = {
  ontarget: {
    pvaLabel: "On target", pvaColor: "var(--color-positive)",
    pvaBg: "var(--color-elevated)",
    pvaNote: "Pace, heart rate and duration all landed inside the planned window.",
  },
  toofast: {
    pvaLabel: "Too fast", pvaColor: "var(--color-caution)",
    pvaBg: "var(--color-elevated)",
    pvaNote: "You ran 18 s/km faster than planned on an easy day. That costs recovery — tomorrow’s session assumes you kept this easy.",
  },
  tooslow: {
    pvaLabel: "Below target", pvaColor: "var(--color-caution)",
    pvaBg: "var(--color-elevated)",
    pvaNote: "Pace came in 20 s/km slower than planned. If you felt heavy, that’s worth logging — fatigue may be higher than the model estimates.",
  },
} as const;

export const AD_COPY = {
  brand: "ARI", back: "Back to dashboard",
  navHome: "Home", navActivities: "Activities", navPlan: "Plan", navSettings: "Settings",
  runTitle: "Wednesday Easy Run", runDate: "Aug 12, 2026 · 6:42 AM", runType: "Easy Run",
  pvaTitle: "Planned vs actual",
  pvaPlanned: "Planned · Easy run, 6 km @ 5:30/km",
  pvaActual: "Actual · 6.2 km @ 5:24/km",
  chartTitle: "Pace · Heart rate · Elevation",
  chartSub: "Pace axis is inverted — faster is up. Shaded band = planned pace window (5:30 ± 10 s).",
  planLine: "PLAN 5:30 /km",
  coachViewTag: "Coach view",
  coachViewMsg: "You are viewing Samuel Cohen’s run — planned vs actual highlighted below.",
  coachBack: "Back to roster",
  legPace: "Pace", legHr: "Heart rate", legElev: "Elevation",
  xDist: "Distance", xTime: "Time",
  paceAxis: "min/km ↑ faster", hrAxis: "bpm",
  splitsTitle: "Splits",
  splitsNote: "Your last 2 km were 18 s/km slower — that’s the cardiac drift showing up.",
  aiTag: "AI Coach",
  aiNote: "Solid easy run. Heart rate stayed in zone 2 for 86% of the session, and the fade over the final 2 km matches your current 2.4% cardiac drift — nothing unusual for a warm morning. No change to the plan.",
  btnReason: "Show reasoning",
};

export const SUMMARY = [
  { v: "6.21", unit: "km", name: "Distance" },
  { v: "33:31", unit: "", name: "Moving time" },
  { v: "5:24", unit: "/km", name: "Avg pace" },
  { v: "148", unit: "bpm", name: "Avg heart rate" },
  { v: "64", unit: "m", name: "Elevation gain" },
];

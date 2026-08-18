/**
 * Copy and the reference run for the activity-analysis screen.
 *
 * Ported from design_handoff_ari_athlete_app/ARI Activity Detail.dc.html (v2);
 * the implementation spec is README_activity_chart_v2.md beside it.
 *
 * The synthetic run exists for one reason: `/activities/demo` has to render the
 * screen before any data is synced, for the walkthrough and for screenshots.
 * Real runs never come through here.
 */

import { formatMinSec } from "@/lib/format/pace";
import type { ChartStreams } from "@/lib/activity/resample";

/** Seconds -> "m:ss". Re-exported so views keep the short local name. */
export const fmt = formatMinSec;

/** Seconds -> "h:mm:ss" past the hour, "m:ss" below it. */
export function fmtLong(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  if (!h) return fmt(s);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

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

let cached: ChartStreams | null = null;

/**
 * A 10 km progression run, 295 samples at ten-second spacing.
 *
 * Built to the handoff's shape: pace improving from 5:55 to 4:12, heart rate
 * lagging effort and topping out near 181, cadence rising with effort, and
 * power derived from speed and gradient the way a watch derives it.
 */
export function buildStreams(): ChartStreams {
  if (cached) return cached;

  const r = rng(11);
  const n = 295;
  const dt = 10;
  const dist: number[] = [], vel: number[] = [], hr: number[] = [];
  const cad: number[] = [], alt: number[] = [], time: number[] = [], pow: number[] = [];

  let d = 0, a = 11, prevHr = 122;

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const hill = Math.sin(t * Math.PI * 4.6) * 0.9 + Math.sin(t * Math.PI * 9.3 + 1.1) * 0.35;

    let p = 356 - 104 * t;
    if (i < 4) p = 380 - i * 8;
    p += hill * 11 + (r() - 0.5) * 16;
    p = Math.max(240, Math.min(392, p));

    vel.push(1000 / p);
    d += vel[i] * dt;
    dist.push(d);
    time.push(i * dt);

    a += hill * 0.28 + (r() - 0.5) * 0.25;
    alt.push(a);
    cad.push(Math.max(162, Math.min(188, 166 + 15 * t - hill * 1.2 + (r() - 0.5) * 2.4)));

    const target = 120 + 42 * t + (vel[i] - 2.9) * 16;
    prevHr = prevHr + (target - prevHr) * 0.22 + (r() - 0.5) * 2.2;
    hr.push(Math.max(108, Math.min(181, prevHr)));
  }

  // Normalise to exactly 10.00 km, so the figures on screen are round.
  const scale = 10_000 / d;
  d = 0;
  for (let i = 0; i < n; i++) {
    vel[i] *= scale;
    d += vel[i] * dt;
    dist[i] = d;
  }

  const r2 = rng(23);
  for (let i = 0; i < n; i++) {
    const grade = i ? alt[i] - alt[i - 1] : 0;
    pow.push(Math.max(120, Math.min(580, 70 * vel[i] * 1.32 + grade * 90 + (r2() - 0.5) * 26)));
  }

  // The reference run never stops, so every sample is moving time.
  const moving = time.map((t, i) => (i ? t - time[i - 1] : 0));

  cached = { n, dist, time, vel, hr, alt, cad, pow, moving, hasPower: true, hasCadence: true };
  return cached;
}

export const AD_COPY = {
  brand: "ARI",
  back: "Back to dashboard",
  navHome: "Home",
  navActivities: "Activities",
  navPlan: "Plan",
  navSettings: "Settings",
  coachViewTag: "Coach view",
  coachViewMsg: "You are viewing this athlete's run.",
  coachBack: "Back to roster",

  hPace: "Pace",
  hHr: "Heart rate",
  hMore: "Training",
  kPace: "Pace",
  kGap: "GAP",
  kSpeed: "Speed",
  kClimb: "Climb",
  kAvgHr: "Avg HR",
  kMaxHr: "Max HR",
  kCadence: "Cadence",
  kDrift: "Drift",
  kLoad: "Load",
  kCalories: "Calories",

  chartTitle: "Pace · Power · Heart rate · Cadence · Elevation",
  chartHint: "Pace is inverted — faster is up · hover for detail · drag to select a range",
  bestLbl: "FASTEST KM",
  driftLbl: "DRIFT ONSET",
  axKm: "km",
  axTime: "time",
  clearSel: "click the chart to clear",

  segTitle: "Kilometre splits",
  aiTag: "AI Coach",
  btnReason: "Show reasoning",
  noStream: "No second-by-second record for this run.",
  noNote: "Not enough detail in this run to say anything useful about it.",
} as const;

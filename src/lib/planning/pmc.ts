/**
 * Performance Management Chart — fitness, fatigue and form.
 *
 * Two exponentially-weighted averages of daily load: a slow one (42 days) that
 * behaves like fitness, and a fast one (7 days) that behaves like fatigue.
 * Their difference is "form".
 *
 * This is the TrainingPeaks simplification of Banister's impulse-response
 * model. Three things worth knowing, all documented in
 * docs/הגשה סופית/8 - המספרים של Runi.docx §4.3:
 *
 *  1. We use the exact decay `1 − e^(−1/τ)`, not the `1/τ` approximation
 *     TrainingPeaks publishes. The difference is 7.3% on the fatigue series.
 *  2. Form uses *yesterday's* fitness and fatigue, so today's session doesn't
 *     instantly tank the number the athlete is reading this morning.
 *  3. Setting both gain terms to 1 contradicts every fitted Banister parameter
 *     set, where fatigue gain exceeds fitness gain. Form is therefore a
 *     balance indicator, **not** a performance prediction. Do not present it
 *     as one.
 */

import type { DatedLoad } from "./load";

export const CTL_TAU = 42;
export const ATL_TAU = 7;

const decay = (tau: number) => Math.exp(-1 / tau);
const alpha = (tau: number) => 1 - Math.exp(-1 / tau);

export interface PmcPoint {
  date: string;
  /** fitness — chronic training load */
  ctl: number;
  /** fatigue — acute training load */
  atl: number;
  /** form — yesterday's ctl minus yesterday's atl */
  tsb: number;
  /** change in fitness over the last 7 days */
  rampRate: number;
}

export interface PmcOptions {
  /**
   * Fitness needs about 3τ ≈ 126 days to settle. Seeding from the athlete's
   * mean daily load makes the first months usable; starting from zero is more
   * honest but shows a fake ramp. We seed and mark it — see {@link isSettled}.
   */
  seedCtl?: number;
  seedAtl?: number;
}

/**
 * @param series MUST be gap-filled — one entry per calendar day, load 0 on
 *               rest days. Use `toDailySeries` from ./load. Without it the
 *               decays never run on rest days and fitness inflates forever.
 */
export function computePmc(series: DatedLoad[], opts: PmcOptions = {}): PmcPoint[] {
  const aC = alpha(CTL_TAU);
  const dC = decay(CTL_TAU);
  const aA = alpha(ATL_TAU);
  const dA = decay(ATL_TAU);

  let ctl = opts.seedCtl ?? 0;
  let atl = opts.seedAtl ?? 0;
  const out: PmcPoint[] = [];

  for (const { date, load } of series) {
    const tsb = ctl - atl; // yesterday's values, before today's load lands
    ctl = ctl * dC + load * aC;
    atl = atl * dA + load * aA;
    const ctl7ago = out.length >= 7 ? out[out.length - 7].ctl : (opts.seedCtl ?? 0);
    out.push({ date, ctl, atl, tsb, rampRate: ctl - ctl7ago });
  }
  return out;
}

/** Mean daily load over the series — a reasonable seed for both curves. */
export function seedFromHistory(series: DatedLoad[]): number {
  if (series.length === 0) return 0;
  return series.reduce((s, d) => s + d.load, 0) / series.length;
}

/** Fitness is only trustworthy after roughly 3 time constants. */
export const isSettled = (daysOfHistory: number) => daysOfHistory >= CTL_TAU * 3;

/* ------------------------------------------------------------------ */
/* Interpretation                                                      */
/* ------------------------------------------------------------------ */

export type FormZone = "high-risk" | "optimal" | "grey" | "fresh" | "transition";

/**
 * Friel's form bands.
 *
 * ⚠️ These are coaching heuristics from cycling, not research findings. No
 * trial establishes that form below −30 causes injury. They are reasonable
 * defaults; the UI must not present them as evidence.
 */
export function formZone(tsb: number): FormZone {
  if (tsb < -30) return "high-risk";
  if (tsb < -10) return "optimal";
  if (tsb <= 5) return "grey";
  if (tsb <= 25) return "fresh";
  return "transition";
}

export const FORM_ZONE_LABEL: Record<FormZone, string> = {
  "high-risk": "Heavily loaded",
  optimal: "Productive training",
  grey: "Neither loaded nor fresh",
  fresh: "Fresh — race ready",
  transition: "Detrained",
};

/**
 * Weekly change in fitness. 5–8 points/week is the widely-quoted guide —
 * again coaching opinion, and note it is scale-dependent: the same absolute
 * ramp is far harder on a beginner at fitness 25 than on an athlete at 110.
 */
export type RampVerdict = "maintaining" | "productive" | "aggressive";

export function rampVerdict(rampRate: number): RampVerdict {
  if (rampRate < 3) return "maintaining";
  if (rampRate <= 8) return "productive";
  return "aggressive";
}

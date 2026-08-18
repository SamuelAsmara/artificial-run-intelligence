/**
 * Daily readiness score, 0–100.
 *
 * ## What this is, and what it is not
 *
 * Garmin, WHOOP and Oura build readiness from overnight physiology — sleep,
 * heart-rate variability, resting heart rate, skin temperature. **The Strava
 * API exposes none of that.** Four of Garmin's six published inputs are
 * structurally unavailable to us.
 *
 * So by default this score is built from *training load* alone, the way COROS
 * does it — and COROS say so out loud: "other factors such as Sleep, HRV,
 * Daily Stress, or muscular fatigue are not part of the Recovery calculation."
 * We follow that example.
 *
 * When a wellness source *is* connected (intervals.icu, or a daily check-in),
 * recovery joins the mix and the weights redistribute. `inputs` on the result
 * records exactly which components contributed, so the UI can be honest about
 * what the number is made of.
 *
 * ## Why publish the weights at all
 *
 * A 2025 review of 14 composite scores across 10 manufacturers found that no
 * manufacturer disclosed its formula and few offered any validation. Publishing
 * ours makes this score *methodologically* stronger than any commercial one,
 * even with fewer inputs. It also means it can be argued with — which is the
 * point.
 *
 * ## What it is not
 *
 * It is not validated. We have no injury or next-day-performance outcomes to
 * test it against. It is a transparent combination of published metrics, and
 * the UI should say so.
 */

import { formZone, type PmcPoint } from "./pmc";

export type ReadinessComponent = "form" | "loadRatio" | "cardiacDrift" | "sleep" | "hrv";

/** Weights when no wellness source is connected — load only. */
export const WEIGHTS_LOAD_ONLY: Record<string, number> = {
  form: 0.45,
  loadRatio: 0.3,
  cardiacDrift: 0.25,
};

/** Weights once sleep and heart-rate variability are available. */
export const WEIGHTS_WITH_RECOVERY: Record<string, number> = {
  form: 0.35,
  loadRatio: 0.2,
  cardiacDrift: 0.15,
  sleep: 0.2,
  hrv: 0.1,
};

export interface ReadinessInput {
  /** today's PMC point — form is the dominant term */
  pmc: Pick<PmcPoint, "ctl" | "atl" | "tsb">;
  /** acute:chronic load ratio, or null when history is too short */
  loadRatio: number | null;
  /** percentage HR drift on the most recent qualifying run, or null */
  cardiacDriftPct: number | null;
  /** hours slept last night, if a wellness source is connected */
  sleepHours?: number | null;
  /** last night's HRV as a percentage of the athlete's own 7-day baseline */
  hrvVsBaselinePct?: number | null;
}

export interface ReadinessResult {
  score: number;
  label: "Ready to load" | "Ease off today" | "Rest day";
  /** which components actually contributed, and what each scored out of 100 */
  contributions: { component: ReadinessComponent; sub: number; weight: number }[];
  /** one line the UI can show under "how is this calculated" */
  basis: string;
}

const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));

/**
 * Form → 0–100.
 *
 * Peak readiness sits slightly fresh rather than maximally fresh: form above
 * about +25 means detrained, not ready. So the curve rises to a plateau around
 * +5 to +20 and falls away on both sides.
 */
export function formSubscore(tsb: number): number | null {
  // A non-finite form value means the PMC series is unusable for this athlete
  // (no history, or a division that went wrong upstream). Drop the component
  // rather than letting NaN propagate into the score.
  if (!Number.isFinite(tsb)) return null;
  if (tsb >= 5 && tsb <= 20) return 100;
  if (tsb > 20) return clamp(100 - (tsb - 20) * 2); // drifting into detrained
  if (tsb >= -10) return clamp(70 + ((tsb + 10) / 15) * 30); // grey zone
  if (tsb >= -30) return clamp(30 + ((tsb + 30) / 20) * 40); // productive but loaded
  return clamp(30 + (tsb + 30) * 1.5); // heavily loaded
}

/**
 * Load ratio → 0–100.
 *
 * Descriptive, not a risk claim: being far above *or* far below your usual
 * level both reduce today's readiness, the first through accumulated fatigue,
 * the second because you are detrained.
 */
export function loadRatioSubscore(ratio: number | null): number | null {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  if (ratio >= 0.9 && ratio <= 1.2) return 100;
  if (ratio > 1.2) return clamp(100 - (ratio - 1.2) * 120);
  return clamp(100 - (0.9 - ratio) * 80);
}

/**
 * Cardiac drift → 0–100. Below ~3% is normal; above ~8% suggests the last run
 * cost more than its pace implies.
 */
export function cardiacDriftSubscore(pct: number | null): number | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct <= 3) return 100;
  if (pct >= 12) return 0;
  return clamp(100 - ((pct - 3) / 9) * 100);
}

/**
 * Sleep → 0–100.
 *
 * Acute sleep loss reduces performance by about 7.6% on average, with a
 * dose-response of roughly 0.4% per additional hour awake (Craven et al.,
 * Sports Medicine 2022). We anchor 100 at 8 h and fall away below 7.
 */
export function sleepSubscore(hours: number | null | undefined): number | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return null;
  if (hours >= 8) return 100;
  if (hours <= 4) return 20;
  return clamp(20 + ((hours - 4) / 4) * 80);
}

/**
 * HRV → 0–100, expressed against the athlete's own rolling baseline rather
 * than any absolute value — absolute HRV varies enormously between people and
 * says nothing on its own.
 */
export function hrvSubscore(
  vsBaselinePct: number | null | undefined,
): number | null {
  if (
    vsBaselinePct === null ||
    vsBaselinePct === undefined ||
    !Number.isFinite(vsBaselinePct)
  ) {
    return null;
  }
  if (vsBaselinePct >= 100) return 100;
  if (vsBaselinePct <= 70) return 0;
  return clamp(((vsBaselinePct - 70) / 30) * 100);
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const hasRecovery =
    (input.sleepHours ?? null) !== null || (input.hrvVsBaselinePct ?? null) !== null;
  const weights = hasRecovery ? WEIGHTS_WITH_RECOVERY : WEIGHTS_LOAD_ONLY;

  const subs: { component: ReadinessComponent; sub: number | null }[] = [
    { component: "form", sub: formSubscore(input.pmc.tsb) },
    { component: "loadRatio", sub: loadRatioSubscore(input.loadRatio) },
    { component: "cardiacDrift", sub: cardiacDriftSubscore(input.cardiacDriftPct) },
    { component: "sleep", sub: sleepSubscore(input.sleepHours) },
    { component: "hrv", sub: hrvSubscore(input.hrvVsBaselinePct) },
  ];

  // Components with no data drop out and their weight is redistributed over
  // the rest, so a missing signal never silently drags the score toward zero.
  const present = subs.filter(
    (s) => s.sub !== null && weights[s.component] !== undefined,
  ) as { component: ReadinessComponent; sub: number }[];

  if (present.length === 0) {
    return {
      score: 50,
      label: "Ease off today",
      contributions: [],
      basis: "Not enough data yet — showing a neutral score.",
    };
  }

  const totalWeight = present.reduce((s, p) => s + weights[p.component], 0);
  const score = Math.round(
    present.reduce((s, p) => s + p.sub * (weights[p.component] / totalWeight), 0),
  );

  const label: ReadinessResult["label"] =
    score >= 70 ? "Ready to load" : score >= 40 ? "Ease off today" : "Rest day";

  const contributions = present.map((p) => ({
    component: p.component,
    sub: Math.round(p.sub),
    weight: Math.round((weights[p.component] / totalWeight) * 100) / 100,
  }));

  const basis = hasRecovery
    ? "Built from training load and overnight recovery data."
    : "Built from training load only — no sleep or heart-rate-variability source is connected, " +
      "so this reflects how much training you've absorbed, not how you slept.";

  return { score, label, contributions, basis };
}

/** Convenience: the form band label the dashboard shows next to the chart. */
export const formLabel = (tsb: number) => formZone(tsb);

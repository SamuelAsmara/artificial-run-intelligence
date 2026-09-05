/**
 * Load-ratio and progression signals.
 *
 * ⚠️ Rewritten 17 Aug 2026 after a literature review
 * (docs/הגשה סופית/8 - המספרים של Runi.docx §4.3). The previous version used
 * distance in metres as "load" and exported `isHighInjuryRisk()` on a 1.5
 * threshold. Both are wrong:
 *
 *  - Recomputing ACWR with a **randomly generated** chronic denominator gives
 *    almost the same injury odds ratio as the real one (Impellizzeri et al.,
 *    Sports Medicine 2021). Discrimination is c ≈ 0.57 — near chance.
 *  - The 0.8–1.3 "sweet spot" and the 1.5 "danger zone" come from an
 *    illustrative figure built partly on unpublished data, not from a study.
 *  - The largest running-specific cohort — 5,205 runners, 588,071 sessions
 *    (Frandsen et al., BJSM 2025) — found **no positive relationship** between
 *    ACWR and injury.
 *
 * ACWR stays, because athletes recognise it and it compactly describes "recent
 * versus usual" — but it is **descriptive only**. The safety signal the running
 * evidence does support is {@link sessionSpikeVsRecentMax}.
 */

import type { DatedLoad } from "./load";

/* ------------------------------------------------------------------ */
/* Load ratio — descriptive                                            */
/* ------------------------------------------------------------------ */

const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;

/** λ = 2/(N+1) is the EMA convention Williams et al. 2017 used for ACWR. */
const lambdaEwma = (n: number) => 2 / (n + 1);

export interface LoadRatioResult {
  /** exponentially-weighted mean daily load over ~7 days */
  acute: number;
  /** exponentially-weighted mean daily load over ~28 days */
  chronic: number;
  /** null when there is not enough history for the denominator to mean anything */
  ratio: number | null;
  /** plain-language description — never a risk claim */
  description: string;
}

/**
 * @param series gap-filled daily loads, oldest first (see toDailySeries)
 *
 * Note this smoothing runs on a different clock from CTL/ATL: λ=2/(N+1) gives
 * an effective time constant of ~3.5 days for the acute window, roughly half
 * of ATL's 7. That is the convention the ACWR literature uses, so we keep it —
 * but the two numbers are not directly comparable.
 */
export function loadRatio(series: DatedLoad[]): LoadRatioResult {
  const la = lambdaEwma(ACUTE_DAYS);
  const lc = lambdaEwma(CHRONIC_DAYS);
  let acute = 0;
  let chronic = 0;

  for (const { load } of series) {
    acute = load * la + (1 - la) * acute;
    chronic = load * lc + (1 - lc) * chronic;
  }

  /*
   * Both averages start from zero, so early in a series they are biased low —
   * and the two are biased by *different* amounts, because they decay at
   * different rates. At exactly 28 days the acute mean has reached 99.97% of
   * its true value and the chronic one only 86.5%, so the ratio of the two came
   * out around 1.16 for an athlete running an identical load every single day.
   * The screen told them they were training 16% above their usual level for
   * more than a month, and the number quietly drifted back to 1.0 as the
   * denominator warmed up.
   *
   * Dividing each by how far it has converged removes the bias exactly. It is
   * the same correction Adam applies to its moment estimates, and for the same
   * reason.
   */
  const n = series.length;
  const acuteWarmup = 1 - Math.pow(1 - la, n);
  const chronicWarmup = 1 - Math.pow(1 - lc, n);
  if (acuteWarmup > 0) acute /= acuteWarmup;
  if (chronicWarmup > 0) chronic /= chronicWarmup;

  // A runner returning from two weeks off has chronic ≈ 0, which makes the
  // ratio explode. Suppress rather than alarm.
  const enoughHistory = series.length >= CHRONIC_DAYS && chronic > 1;
  if (!enoughHistory) {
    return {
      acute,
      chronic,
      ratio: null,
      description: "Building your baseline — needs about four weeks of training history.",
    };
  }

  const ratio = acute / chronic;
  const pct = Math.round((ratio - 1) * 100);
  const description =
    Math.abs(pct) < 10
      ? "You're training at about your usual level."
      : pct > 0
        ? `You're training ${pct}% above your usual four-week level.`
        : `You're training ${Math.abs(pct)}% below your usual four-week level.`;

  return { acute, chronic, ratio, description };
}

/* ------------------------------------------------------------------ */
/* Session spike — the signal the running evidence supports            */
/* ------------------------------------------------------------------ */

export type SpikeBand = "within" | "small" | "moderate" | "large";

export interface SessionSpike {
  /** how much longer than the recent longest run, as a percentage */
  pctAboveMax: number;
  band: SpikeBand;
  /** hazard rate ratio reported by Frandsen et al. for this band */
  hazardRatio: number;
  message: string;
  /** null when there is no meaningful history to compare against */
  recentMaxM: number | null;
}

/**
 * Compare a planned or completed session against the athlete's longest run in
 * the preceding 30 days.
 *
 * Bands and hazard rate ratios from Frandsen et al., BJSM 2025 — 5,205
 * runners, 588,071 Garmin-recorded sessions, 1,820 overuse injuries. This was
 * the only one of the three exposures they compared that showed a
 * relationship; ACWR and week-to-week ratio did not.
 *
 * Caveats to repeat in the UI: observational study, self-reported injury, and
 * the middle bands are not cleanly monotonic — only >100% is unambiguously
 * elevated.
 */
export function sessionSpikeVsRecentMax(
  sessionDistanceM: number,
  recentRuns: { date: string; distanceM: number }[],
  asOf: Date = new Date(),
): SessionSpike {
  const cutoff = asOf.getTime() - 30 * 86400000;
  const window = recentRuns.filter(
    (r) => new Date(r.date).getTime() >= cutoff && r.distanceM > 0,
  );

  if (window.length === 0) {
    return {
      pctAboveMax: 0,
      band: "within",
      hazardRatio: 1,
      recentMaxM: null,
      message: "No runs in the last 30 days to compare against.",
    };
  }

  const recentMaxM = Math.max(...window.map((r) => r.distanceM));
  const pctAboveMax = ((sessionDistanceM - recentMaxM) / recentMaxM) * 100;

  let band: SpikeBand;
  let hazardRatio: number;
  if (pctAboveMax <= 10) {
    band = "within";
    hazardRatio = 1.0;
  } else if (pctAboveMax <= 30) {
    band = "small";
    hazardRatio = 1.64;
  } else if (pctAboveMax <= 100) {
    band = "moderate";
    hazardRatio = 1.52;
  } else {
    band = "large";
    hazardRatio = 2.28;
  }

  const km = (m: number) => (m / 1000).toFixed(1);
  const message =
    band === "within"
      ? `In line with your recent longest run (${km(recentMaxM)} km).`
      : `${Math.round(pctAboveMax)}% longer than your longest run in the last 30 days ` +
        `(${km(recentMaxM)} km). Runs like this are associated with a higher rate of ` +
        `overuse injury.`;

  return { pctAboveMax, band, hazardRatio, recentMaxM, message };
}

/* ------------------------------------------------------------------ */
/* Backwards compatibility — used by adjustPlan.ts until it migrates    */
/* ------------------------------------------------------------------ */

/**
 * @deprecated Use {@link loadRatio}, which takes real training load rather
 * than raw distance.
 */
export interface DailyLoad {
  date: string;
  load: number;
}

/** @deprecated See the module comment — this threshold is not evidence-based. */
export const ACWR_INJURY_RISK_THRESHOLD = 1.5;

export interface AcwrResult {
  acute: number;
  chronic: number;
  acwr: number | null;
}

/** @deprecated Use {@link loadRatio}. */
export function calculateACWR(
  dailyLoads: DailyLoad[],
  asOf: Date = new Date(),
): AcwrResult {
  if (dailyLoads.length === 0) return { acute: 0, chronic: 0, acwr: null };

  const asOfTime = asOf.getTime();
  const msPerDay = 86400000;
  let acuteSum = 0;
  let chronicSum = 0;

  for (const entry of dailyLoads) {
    const daysBack = Math.floor((asOfTime - new Date(entry.date).getTime()) / msPerDay);
    if (daysBack < 0) continue;
    if (daysBack < CHRONIC_DAYS) chronicSum += entry.load;
    if (daysBack < ACUTE_DAYS) acuteSum += entry.load;
  }

  const acute = acuteSum / ACUTE_DAYS;
  const chronic = chronicSum / CHRONIC_DAYS;
  if (chronic === 0) return { acute, chronic, acwr: null };
  return { acute, chronic, acwr: acute / chronic };
}

/**
 * @deprecated Asserts a clinical claim the evidence does not support. Use
 * {@link sessionSpikeVsRecentMax} for a supported safety signal, or
 * {@link loadRatio} for a descriptive one.
 */
export function isHighInjuryRisk(result: AcwrResult): boolean {
  return result.acwr !== null && result.acwr > ACWR_INJURY_RISK_THRESHOLD;
}

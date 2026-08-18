/**
 * Training load for a single session.
 *
 * Primary metric: HRSS — Banister TRIMP normalised so that one hour at the
 * athlete's threshold heart rate scores 100. Fallback when heart rate is
 * missing: rTSS from average speed.
 *
 * Why normalised rather than raw TRIMP: HRmax and HRrest are *estimated* in a
 * consumer app, so the metric has to tolerate error in them. Normalising makes
 * the `a` coefficient cancel algebraically and cuts sensitivity to the
 * estimates from about ±25% down to ±2–8%.
 *
 * Known limitation, disclosed in the UI: every load metric applies a convex
 * function to intensity, so computing from an *average* systematically
 * under-scores variable sessions and never over-scores them. Interval sessions
 * come out roughly 10–20% low. See docs/research/01-training-load-metrics.md.
 */

export type Sex = "male" | "female";

/** Blood-lactate response coefficients (Banister 1991; Green et al.). */
const COEFFS: Record<Sex, { a: number; b: number }> = {
  male: { a: 0.64, b: 1.92 },
  female: { a: 0.86, b: 1.67 },
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface HrProfile {
  /** beats per minute */
  hrMax: number;
  hrRest: number;
  /** lactate threshold heart rate */
  lthr: number;
  sex: Sex;
}

/**
 * Raw Banister TRIMP in arbitrary units.
 * Exported for tests and for the normalisation denominator; the product should
 * use {@link sessionLoad} instead.
 */
export function banisterTrimp(
  durationSec: number,
  hrAvg: number,
  p: Pick<HrProfile, "hrMax" | "hrRest" | "sex">,
): number {
  const { a, b } = COEFFS[p.sex];
  const range = p.hrMax - p.hrRest;
  if (range <= 0 || durationSec <= 0) return 0;
  const dHR = clamp01((hrAvg - p.hrRest) / range);
  return (durationSec / 60) * dHR * a * Math.exp(b * dHR);
}

/** 100 == one hour at threshold heart rate. */
export function hrss(durationSec: number, hrAvg: number, p: HrProfile): number {
  const oneHourAtThreshold = banisterTrimp(3600, p.lthr, p);
  if (oneHourAtThreshold <= 0) return 0;
  return (100 * banisterTrimp(durationSec, hrAvg, p)) / oneHourAtThreshold;
}

/**
 * Pace-based fallback. 100 == one hour at threshold pace.
 *
 * Both speeds must be in m/s. Using pace (s/km) here instead inverts the ratio
 * and silently produces garbage, so the parameter names say `Speed`.
 */
export function rTSS(
  durationSec: number,
  avgSpeedMps: number,
  thresholdSpeedMps: number,
): number {
  if (thresholdSpeedMps <= 0 || durationSec <= 0) return 0;
  const intensityFactor = avgSpeedMps / thresholdSpeedMps;
  return 100 * (durationSec / 3600) * intensityFactor * intensityFactor;
}

export type LoadMethod = "hrss" | "rtss" | "none";

export interface SessionLoad {
  /** load in points; 100 ≈ one hard hour */
  load: number;
  method: LoadMethod;
  /**
   * `high`   — heart rate present and thresholds estimated from real efforts
   * `medium` — pace fallback, or thresholds still seeded from defaults
   * `low`    — neither available; load is 0 and should not drive coaching
   */
  confidence: "high" | "medium" | "low";
}

export interface ActivityInput {
  durationSec: number;
  distanceM: number;
  /** null when the run was recorded without a heart-rate strap or watch */
  avgHr: number | null;
}

export interface LoadProfile extends HrProfile {
  thresholdSpeedMps: number;
  /** false while thresholds are still seeded rather than measured */
  thresholdsMeasured: boolean;
}

/**
 * Load for one activity, preferring heart rate and falling back to pace.
 *
 * Always returns a value — a run with neither usable signal scores 0 with
 * confidence `low` rather than throwing, because a single bad row must not
 * break a whole 84-day series.
 */
export function sessionLoad(a: ActivityInput, p: LoadProfile): SessionLoad {
  const usableHr =
    a.avgHr !== null && a.avgHr > p.hrRest && a.avgHr <= p.hrMax * 1.05;

  if (usableHr && a.durationSec > 0) {
    return {
      load: hrss(a.durationSec, a.avgHr as number, p),
      method: "hrss",
      confidence: p.thresholdsMeasured ? "high" : "medium",
    };
  }

  if (a.durationSec > 0 && a.distanceM > 0 && p.thresholdSpeedMps > 0) {
    return {
      load: rTSS(a.durationSec, a.distanceM / a.durationSec, p.thresholdSpeedMps),
      method: "rtss",
      confidence: "medium",
    };
  }

  return { load: 0, method: "none", confidence: "low" };
}

/* ------------------------------------------------------------------ */
/* Daily aggregation                                                    */
/* ------------------------------------------------------------------ */

export interface DatedLoad {
  /** ISO date, YYYY-MM-DD */
  date: string;
  load: number;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Collapse activities to one row per day and **fill every missing calendar day
 * with zero**.
 *
 * This gap-fill is not cosmetic. CTL and ATL are exponential decays over
 * calendar time; if rest days are absent from the series they never decay and
 * fitness inflates without bound. It is the classic implementation bug in every
 * home-grown PMC.
 */
export function toDailySeries(
  entries: { date: string; load: number }[],
  from: string,
  to: string,
): DatedLoad[] {
  const sums = new Map<string, number>();
  for (const e of entries) {
    sums.set(e.date, (sums.get(e.date) ?? 0) + e.load);
  }

  const out: DatedLoad[] = [];
  const cursor = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (cursor <= end) {
    const key = isoDate(cursor);
    out.push({ date: key, load: sums.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

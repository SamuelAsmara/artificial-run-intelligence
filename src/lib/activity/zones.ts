/**
 * Heart-rate zones, as a percentage of threshold heart rate.
 *
 * ## Why threshold and not maximum
 *
 * Maximum heart rate is a ceiling you are born with and lose slowly with age.
 * It does not move when you get fitter, so zones drawn from it describe your
 * age rather than your training. Threshold heart rate — the highest rate you
 * can hold for about an hour — *does* move with fitness, which is the whole
 * point of measuring it.
 *
 * There is a practical tell that this is the right anchor. On intervals.icu's
 * own reading of this athlete's 17 August run, two kilometres are reported at
 * 101% and 104%. Nothing can exceed 100% of a maximum; those numbers are only
 * possible against a threshold, which you can and do run above.
 *
 * ## The boundaries
 *
 * These are intervals.icu's defaults, folded from seven zones into six by
 * merging everything above 102% — the distinction between "anaerobic" and
 * "neuromuscular" needs a track and a stopwatch to mean anything, and the
 * segment strip has no room to draw it.
 *
 * Checked against the same run: 79/80/81/83% land in Z1, 86/88% in Z2, 90% in
 * Z3, 95/98% in Z4, 101% in Z5 and 104% in Z6 — which is exactly what
 * intervals.icu labelled them.
 */

export interface Zone {
  /** "Z1" … "Z6" */
  id: string;
  name: string;
  /** inclusive lower bound, as a percentage of threshold heart rate */
  from: number;
  /** exclusive upper bound; Infinity for the top zone */
  to: number;
  /** the token this zone is drawn in */
  color: string;
}

export const HR_ZONES: Zone[] = [
  { id: "Z1", name: "Recovery",  from: 0,   to: 85,       color: "var(--color-positive)" },
  { id: "Z2", name: "Endurance", from: 85,  to: 90,       color: "var(--color-positive)" },
  { id: "Z3", name: "Tempo",     from: 90,  to: 95,       color: "var(--color-caution)" },
  { id: "Z4", name: "Threshold", from: 95,  to: 100,      color: "var(--color-caution)" },
  { id: "Z5", name: "VO2 max",   from: 100, to: 103,      color: "var(--color-negative)" },
  { id: "Z6", name: "Anaerobic", from: 103, to: Infinity, color: "var(--color-negative)" },
];

/** The zone a heart rate falls in, given the athlete's threshold. */
export function zoneFor(hr: number, lthr: number): { zone: Zone; pct: number } | null {
  if (!Number.isFinite(hr) || !Number.isFinite(lthr) || lthr <= 0 || hr <= 0) return null;
  const pct = Math.round((hr / lthr) * 100);
  const zone = HR_ZONES.find((z) => pct >= z.from && pct < z.to) ?? HR_ZONES[HR_ZONES.length - 1];
  return { zone, pct };
}

/**
 * Threshold heart rate estimated from maximum, when nothing better is known.
 *
 * The ratio varies between individuals, which is exactly why a measured
 * threshold is worth having. 0.90 is the usual working figure and lands within
 * a beat or two of this athlete's measured 173 against a maximum near 190.
 */
export const LTHR_FROM_MAX = 0.9;

export const estimateLthr = (hrMax: number): number => Math.round(hrMax * LTHR_FROM_MAX);

/**
 * The athlete's maximum heart rate, taken from what has actually been recorded.
 *
 * The age formula (220 − age) is a population mean with a standard deviation of
 * roughly ten beats, so for any given person it is usually wrong and
 * occasionally absurd. This athlete's formula value is 186, and a training run
 * — not a race, not a test — recorded 181. Nobody reaches 97% of their maximum
 * on an ordinary Monday.
 *
 * A single reading is not trusted on its own, because a chest strap picking up
 * interference can report 210 for three seconds. A value counts only if some
 * other activity came within `AGREEMENT` beats of it, which a real maximum
 * always does and an artefact almost never does.
 */
export const AGREEMENT = 10;

export function observedHrMax(perActivityMax: (number | null | undefined)[]): number | null {
  const values = perActivityMax
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 100 && v <= 230)
    .sort((a, b) => b - a);

  if (values.length === 0) return null;
  if (values.length === 1) return values[0];

  for (let i = 0; i < values.length; i++) {
    // Is there a *different* activity that agrees this high?
    const corroborated = values.some((v, j) => j !== i && values[i] - v <= AGREEMENT);
    if (corroborated) return values[i];
  }

  // Nothing agrees with anything — the readings are too scattered to trust the
  // top one, so fall back to the second highest rather than the outlier.
  return values[1];
}

/**
 * The maximum to use, preferring measurement over formula.
 *
 * Order: what the athlete typed, then what their runs recorded, then the age
 * formula as a last resort. The formula is never allowed to overrule an
 * observed value that exceeds it, because you cannot run above your maximum.
 */
export function effectiveHrMax(opts: {
  stated?: number | null;
  observed?: number | null;
  age?: number | null;
}): number | null {
  const { stated, observed, age } = opts;
  if (stated && stated > 0) return Math.max(stated, observed ?? 0);
  if (observed && observed > 0) return observed;
  if (age && age > 0) return Math.round(220 - age);
  return null;
}

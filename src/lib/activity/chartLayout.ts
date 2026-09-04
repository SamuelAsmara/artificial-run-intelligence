/**
 * Geometry for the five-band activity chart.
 *
 * ## Why bands instead of one plot with several axes
 *
 * The previous chart drew pace and heart rate on one frame with an axis on each
 * side. That reads badly for a reason worth stating: when two lines share a
 * frame, the eye reads the distance between them as meaning something, and here
 * it means nothing — they are different units. Separate bands sharing one x axis
 * remove the false comparison and keep the true one, which is vertical: what was
 * my heart doing *at this point in the run*.
 *
 * ## Why the layout is computed rather than fixed
 *
 * The handoff positions five bands at fixed pixel offsets. But a run recorded
 * without a power meter, or logged by hand, has no power and no cadence, and an
 * empty band labelled "Power" is worse than no band. So the bands present are
 * decided per run and the space is divided between them.
 *
 * Everything here is pure arithmetic — no data, no formatting, no React.
 */

export const VIEW = { W: 1180, H: 372 } as const;

/** Plot gutters, from the handoff. */
export const X0 = 64;
export const X1 = 1150;

/** The vertical space the bands share. */
export const BAND_TOP = 8;
export const BAND_BOTTOM = 332;

/** Breathing room inside each band so lines do not touch its edges. */
export const BAND_INSET = 4;

/** Where the two x-axis rows sit. */
export const AXIS_KM_Y = 348;
export const AXIS_TIME_Y = 365;

export type BandId = "pace" | "power" | "hr" | "cadence" | "altitude";

export interface BandSpec {
  id: BandId;
  title: string;
  color: string;
}

/** In the handoff's order, top to bottom. */
export const ALL_BANDS: BandSpec[] = [
  { id: "pace", title: "Pace/km", color: "var(--color-pace)" },
  { id: "power", title: "Power", color: "var(--color-pow)" },
  { id: "hr", title: "Heartrate", color: "var(--color-hr)" },
  { id: "cadence", title: "Cadence", color: "var(--color-cad)" },
  { id: "altitude", title: "Altitude", color: "var(--color-atl)" },
];

export interface Band extends BandSpec {
  /** band boundaries */
  top: number;
  bottom: number;
  /** where the line may actually be drawn */
  plotTop: number;
  plotBottom: number;
  /** the value at plotTop and at plotBottom */
  hi: number;
  lo: number;
  /** true when higher values are drawn lower — pace only */
  inverted: boolean;
  /** y for a value, clamped into the band */
  y: (v: number) => number;
  /** the inverse, for reading a value off a hovered position */
  valueAt: (y: number) => number;
}

export interface BandRange {
  id: BandId;
  lo: number;
  hi: number;
  inverted?: boolean;
}

/**
 * Divides the vertical space between whichever bands this run has.
 *
 * Ranges arrive already derived from the run — this only decides where each one
 * sits and how a value maps to a pixel.
 */
export function layoutBands(ranges: BandRange[]): Band[] {
  const present = ALL_BANDS.filter((b) => ranges.some((r) => r.id === b.id));
  if (present.length === 0) return [];

  const height = (BAND_BOTTOM - BAND_TOP) / present.length;

  return present.map((spec, i) => {
    const range = ranges.find((r) => r.id === spec.id) as BandRange;
    const top = BAND_TOP + i * height;
    const bottom = top + height;
    const plotTop = top + BAND_INSET;
    const plotBottom = bottom - BAND_INSET;

    // A degenerate range (a treadmill run at one exact cadence) would divide by
    // zero and put the line at NaN, so it is opened out instead.
    const span = range.hi - range.lo || 1;
    const inverted = range.inverted ?? false;

    const y = (v: number) => {
      if (!Number.isFinite(v)) return plotBottom;
      const t = (v - range.lo) / span;
      const raw = inverted
        ? plotTop + t * (plotBottom - plotTop)
        : plotBottom - t * (plotBottom - plotTop);
      return Math.min(plotBottom, Math.max(plotTop, raw));
    };

    const valueAt = (py: number) => {
      const clamped = Math.min(plotBottom, Math.max(plotTop, py));
      const t = (clamped - plotTop) / (plotBottom - plotTop);
      return inverted ? range.lo + t * span : range.hi - t * span;
    };

    return {
      ...spec,
      top, bottom, plotTop, plotBottom,
      lo: range.lo, hi: range.hi, inverted, y, valueAt,
    };
  });
}

/** The band a y coordinate falls in, for the hover readout. */
export const bandAt = (bands: Band[], y: number): Band | null =>
  bands.find((b) => y >= b.top && y < b.bottom) ?? null;

/* ------------------------------------------------------------------ */
/* The x axis                                                          */
/* ------------------------------------------------------------------ */

export interface Tick {
  x: number;
  label: string;
  /** major ticks are drawn heavier and always labelled */
  major: boolean;
}

/**
 * Distance ticks at a spacing that suits the run's length.
 *
 * Every 0.5 km reads well over 10 km and turns into a picket fence over a
 * marathon, so the step grows with the distance.
 */
export function distanceTicks(totalM: number, x: (m: number) => number): Tick[] {
  const km = totalM / 1000;
  const step = km <= 12 ? 0.5 : km <= 25 ? 1 : km <= 60 ? 2 : 5;
  const out: Tick[] = [];

  for (let d = step; d < km; d += step) {
    const rounded = Math.round(d * 10) / 10;
    out.push({
      x: x(rounded * 1000),
      label: Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1),
      major: Number.isInteger(rounded),
    });
  }
  /*
   * The finish always gets a tick, whatever the step landed on — unless the
   * step has just placed one on top of it. A 10.04 km run used to emit "10" at
   * 10.0 km and "10" again a few pixels later at the finish.
   */
  const finishLabel = km.toFixed(km < 10 ? 1 : 0);
  const last = out[out.length - 1];
  if (last && last.label === finishLabel) out.pop();
  out.push({ x: x(totalM), label: finishLabel, major: true });
  return out;
}

/**
 * Time ticks, positioned by the distance covered at that moment.
 *
 * They cannot be evenly spaced: the athlete was not going the same speed all
 * the way, so five minutes of a fast finish covers more ground than five
 * minutes of a slow start. Mapping each one through the distance stream is what
 * keeps the two axis rows describing the same run.
 */
export function timeTicks(
  time: number[],
  dist: number[],
  x: (m: number) => number,
  fmt: (s: number) => string,
): Tick[] {
  const total = time[time.length - 1] - time[0];
  if (!(total > 0)) return [];

  const minutes = total / 60;
  const step = minutes <= 25 ? 5 : minutes <= 70 ? 10 : minutes <= 150 ? 20 : 30;
  const out: Tick[] = [];

  for (let m = step; m * 60 < total; m += step) {
    const target = time[0] + m * 60;
    const i = time.findIndex((t) => t >= target);
    if (i < 0) break;
    out.push({ x: x(dist[i] - dist[0]), label: fmt(m * 60), major: false });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The coach's target, drawn on the pace band                          */
/* ------------------------------------------------------------------ */

/**
 * Seconds per kilometre either side of the target that still counts as on it.
 *
 * The same number `comparePlanned` uses for its verdict, deliberately: the
 * shaded band and the sentence underneath it must never disagree.
 *
 * A band rather than a line even when the coach gives a single figure. Nobody
 * holds an exact pace, and a hairline would make every honest run look like a
 * miss — which trains the athlete to ignore it.
 */
export const TARGET_TOLERANCE_S = 10;

export interface TargetBand {
  /** rect top, in the same coordinates as the chart */
  y: number;
  height: number;
  /**
   * Set when the whole run sat outside the target, so the band had to be
   * clamped to the edge of the plot. The caller should draw an edge marker
   * rather than a sliver: a two-pixel bar at the top of the band reads as
   * "your target is up here somewhere", which is the truth, where a squashed
   * rectangle reads as a rendering fault.
   */
  outside: "faster" | "slower" | null;
}

/**
 * Where to shade the pace band so the coach's target is visible against what
 * was actually run.
 *
 * Returns null when there is nothing honest to draw:
 *
 * - **no target** — nothing was prescribed, so nothing is claimed;
 * - **an interval session** — a single band across the whole run is wrong for
 *   a session whose target changes every few minutes. The warm-up and the
 *   floats would sit outside a band built for the reps, and the picture would
 *   report failure on a session run exactly as written. Per-rep targets are a
 *   different shape of data and a later piece of work.
 */
export function targetBand(
  band: Pick<Band, "y" | "plotTop" | "plotBottom" | "hi" | "lo">,
  plannedPaceSec: number | null,
  workoutType: string | null,
  toleranceS: number = TARGET_TOLERANCE_S,
): TargetBand | null {
  if (!plannedPaceSec || !Number.isFinite(plannedPaceSec)) return null;
  if (workoutType === "interval" || workoutType === "intervals") return null;

  const fast = plannedPaceSec - toleranceS;
  const slow = plannedPaceSec + toleranceS;

  // The pace band is inverted — faster is higher — so which end maps to the
  // top is not something to assume. Ask the band and sort.
  const a = band.y(fast);
  const b = band.y(slow);
  const y = Math.min(a, b);
  const height = Math.abs(a - b);

  const plotLo = Math.min(band.lo, band.hi);
  const plotHi = Math.max(band.lo, band.hi);

  let outside: TargetBand["outside"] = null;
  if (slow < plotLo) outside = "faster";
  else if (fast > plotHi) outside = "slower";

  return outside
    ? { y: outside === "faster" ? band.plotTop : band.plotBottom - 2, height: 2, outside }
    : { y, height, outside: null };
}

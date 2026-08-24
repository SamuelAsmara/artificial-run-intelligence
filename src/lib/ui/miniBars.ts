/**
 * Geometry for the small bar chart primitive (kit item 2).
 *
 * Two places in the product show "how much did I run per week": weekly volume
 * on the athlete's home and weekly distance on the activities page. Both used
 * to be flat, fully saturated blue blocks — the most generic thing in the
 * product. The kit replaces them with one shape: a low-opacity gradient body,
 * a track behind it, a glow on the best week, and the in-progress period drawn
 * as an outline rather than a fill, so an incomplete week cannot be misread as
 * a small one.
 *
 * This module is pure geometry. It knows nothing about React or about where
 * the numbers came from, which is what makes it testable.
 */

export type MiniBarInput = {
  /** the value the bar represents, in whatever unit the caller labels */
  value: number;
  /** the label under the bar — "W3", a date, a month */
  label: string;
  /** true for the period still being run; drawn as an outline, never filled */
  current?: boolean;
};

export type BarBox = {
  w: number;
  h: number;
  pad: number;
  trackTop: number;
  baseY: number;
  labelY: number;
  barW: number;
  trackW: number;
  maxH: number;
  minH: number;
};

export const BAR_BOX: BarBox = {
  w: 472,
  h: 140,
  pad: 8,
  /** top of the empty track behind each bar */
  trackTop: 26,
  /** the baseline every bar grows from */
  baseY: 120,
  /** baseline of the label row */
  labelY: 136,
  /** the widest a bar may be; four bars in a wide card grow toward this */
  barW: 11,
  trackW: 5,
  /** the tallest a bar may be — leaves room for the tooltip pill above it */
  maxH: 94,
  /** a bar never disappears entirely, or the row loses its rhythm */
  minH: 10,
};

export type MiniBar = {
  /** centre of the bar — labels and tooltips anchor here */
  cx: number;
  /** left edge of the body rect */
  px: number;
  /** left edge of the track rect */
  gx: number;
  y: number;
  h: number;
  /** corner radius — never more than half the bar's own height */
  rx: number;
  value: number;
  label: string;
  isCurrent: boolean;
  isMax: boolean;
  /** fill opacity of the body: 0 for the in-progress bar, which is outlined */
  bodyOp: number;
  /** opacity of the blurred copy behind the best week */
  glowOp: number;
  stroke: string;
  dash: string;
  labelColor: string;
  tip: { x: number; y: number; ty: number; text: string; opacity: number };
};

export type MiniBarChart = {
  bars: MiniBar[];
  max: number;
  /** the track rect's y and height, shared by every bar */
  track: { y: number; h: number };
  /**
   * Bar and track width, computed from how many bars there are.
   *
   * A fixed 11-unit bar is right for eight weeks and wrong for four: the same
   * chart drawn over four periods left 118 units of air between hairline pills
   * and read as an empty box. Width now follows the spacing, capped so a
   * two-bar chart does not become two slabs.
   */
  barW: number;
  trackW: number;
};

/**
 * @param unit appended to the tooltip figure, e.g. "km"
 */
export function miniBars(
  input: MiniBarInput[],
  unit = "km",
  box: BarBox = BAR_BOX,
): MiniBarChart | null {
  if (input.length === 0) return null;

  const values = input.map((b) => (Number.isFinite(b.value) ? b.value : 0));
  const max = Math.max(...values);

  // Bars are laid out on equal centres inside the padded box, so the row stays
  // symmetric whether the caller passes four bars or twelve.
  const inner = box.w - box.pad * 2;
  const step = inner / input.length;

  // The best week is highlighted, but only among *completed* weeks — a week
  // still being run has not been achieved yet, so it cannot be the record even
  // when its figure is already the highest. If two weeks tie, the later one
  // wins: that is the one the athlete is closer to repeating.
  const completed = values.filter((_, i) => !input[i].current);
  const maxCompleted = completed.length > 0 ? Math.max(...completed) : 0;
  let maxIndex = -1;
  values.forEach((v, i) => {
    if (v === maxCompleted && !input[i].current) maxIndex = i;
  });

  // 0.34 of the step keeps roughly the proportion the eight-week chart was
  // drawn at, and the clamp stops both extremes.
  const barW = Math.round(Math.max(9, Math.min(30, step * 0.34)));
  const trackW = Math.max(4, Math.round(barW * 0.4));

  const bars = input.map((b, i) => {
    const value = values[i];
    const isCurrent = b.current === true;
    const isMax = i === maxIndex && maxCompleted > 0;
    const h = max > 0 ? Math.max(box.minH, (value / max) * box.maxH) : box.minH;
    const cx = Math.round((box.pad + i * step + step / 2) * 10) / 10;
    const y = Math.round((box.baseY - h) * 10) / 10;

    return {
      cx,
      px: Math.round((cx - barW / 2) * 10) / 10,
      gx: Math.round((cx - trackW / 2) * 10) / 10,
      // A short bar with a bar-width radius turns into a lens. The radius is
      // whichever is smaller, so an empty week stays a rounded stub.
      rx: Math.min(barW, h) / 2,
      y,
      h: Math.round(h * 10) / 10,
      value,
      label: b.label,
      isCurrent,
      isMax,
      bodyOp: isCurrent ? 0 : isMax ? 1 : 0.55,
      glowOp: isMax ? 0.7 : 0,
      stroke: isCurrent ? "var(--color-accent)" : "none",
      dash: isCurrent ? "3 3" : "",
      labelColor: isMax
        ? "var(--color-ink)"
        : isCurrent
          ? "var(--color-accent)"
          : "var(--color-faint)",
      tip: {
        x: Math.round((cx - 22) * 10) / 10,
        y: Math.round((y - 26) * 10) / 10,
        ty: Math.round((y - 13.5) * 10) / 10,
        text: `${formatValue(value)}${unit ? ` ${unit}` : ""}`,
        opacity: isMax ? 1 : 0,
      },
    };
  });

  return {
    bars,
    max,
    track: { y: box.trackTop, h: box.baseY - box.trackTop },
    barW,
    trackW,
  };
}

/** whole numbers stay whole; anything else keeps one decimal */
function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

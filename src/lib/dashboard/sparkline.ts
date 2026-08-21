/**
 * Drawing the pace of a run as a small line.
 *
 * The activity list showed a flat line because the data to draw a real one was
 * never fetched. Now that `activities.pace_shape` holds about forty points of
 * seconds-per-kilometre, this turns them into the SVG path the ported design
 * already expects — an 80×24 box, which is the geometry from the Claude Design
 * handoff and must not change.
 *
 * Two decisions worth naming:
 *
 * **Faster is higher.** Pace is inverted — a smaller number is a faster run —
 * so the y axis is flipped. A line that rises means the athlete sped up, which
 * is what anyone glancing at it will assume.
 *
 * **Gaps break the line.** A stretch with no usable speed is a stop, not a pace
 * of zero. Bridging it would invent a slow section that never happened, so the
 * path lifts the pen and starts again.
 *
 * **The scale ignores its own outliers.** Scaling to raw min/max looked correct
 * and drew nonsense: one two-second stumble at 25 min/km owns the whole box and
 * squashes the actual run into a flat smear at the bottom. The same mistake was
 * fixed on the large chart and never here. The bounds are the 10th and 90th
 * percentile, and anything outside them is clamped rather than dropped — a
 * genuine sprint should still reach the top of the box, it just should not
 * define where the top is.
 *
 * **Height means something.** This is the fix for the complaint that the rail
 * looked like nine identical squiggles rather than nine runs. Scaling each run
 * to its own range means every run fills the box from top to bottom, whatever
 * it was: an easy run that never left 5:12–5:20 was drawn with exactly the
 * amplitude of an interval session that swung between 4:05 and 6:10. The
 * shapes were real and the picture was still a lie, because the loudest thing
 * about a sparkline is how tall it is.
 *
 * So the window has a floor — {@link MIN_SPAN_SEC}. A run whose middle 80%
 * fits inside it is drawn against that floor, centred on its own median, and
 * comes out as the nearly flat line it deserves. A session that genuinely
 * swings still fills the box. Amplitude now answers "how varied was this
 * run", which is the question the eye was asking all along.
 */

const W = 80;
const H = 24;
const PAD = 2;

/**
 * Where the scale's ends sit, as a fraction of the sorted values.
 *
 * Wide enough that an ordinary run is not clipped at all, tight enough that a
 * single junk sample cannot set the range.
 */
const LOW_Q = 0.1;
const HIGH_Q = 0.9;

/**
 * The narrowest pace window the box is allowed to represent, in seconds per
 * kilometre.
 *
 * Sixty seconds is about the spread of an honest steady run once the stops are
 * out: below it there is no shape worth a full-height drawing, above it there
 * is. An easy run holding 5:12–5:20 therefore uses a quarter of the height,
 * and an interval session swinging a minute and a half uses all of it.
 */
export const MIN_SPAN_SEC = 60;

/** Linear-interpolated quantile of an already-sorted array. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** A flat mid-line, for a run with no usable shape. */
export const FLAT_PATH = `M1 ${H / 2}L${W - 1} ${H / 2}`;

export function paceShapeToPath(shape: (number | null)[] | null | undefined): string {
  if (!shape || shape.length < 2) return FLAT_PATH;

  const values = shape.filter((v): v is number => typeof v === "number" && v > 0);
  if (values.length < 2) return FLAT_PATH;

  const sorted = [...values].sort((a, b) => a - b);
  let min = quantile(sorted, LOW_Q);
  let max = quantile(sorted, HIGH_Q);

  // A run steady enough that the middle 80% is nearly one number still has a
  // shape worth drawing at the edges; fall back to the full range before
  // giving up on it entirely.
  if (max - min < 1) {
    min = sorted[0];
    max = sorted[sorted.length - 1];
  }

  // A perfectly even run has no shape to show, and dividing by zero would put
  // the whole line off the top of the box. Checked against the *measured*
  // range, before the floor below widens it — otherwise a run with no
  // variation at all would be drawn as a line rather than said to be flat.
  if (max - min < 1) return FLAT_PATH;

  /*
   * Widen a narrow window to the floor, keeping the run in the middle of it.
   *
   * Centring on the midpoint rather than pinning one end is what keeps a
   * steady run drawn as a calm line through the middle of the box instead of
   * a calm line pressed against its top edge.
   */
  if (max - min < MIN_SPAN_SEC) {
    const mid = (min + max) / 2;
    min = mid - MIN_SPAN_SEC / 2;
    max = mid + MIN_SPAN_SEC / 2;
  }

  const span = max - min;

  const stepX = (W - PAD * 2) / (shape.length - 1);

  let path = "";
  let penDown = false;

  shape.forEach((value, i) => {
    if (value === null || value <= 0) {
      penDown = false;
      return;
    }
    const x = PAD + i * stepX;
    // inverted: the fastest point sits at the top of the box
    const y = PAD + ((clamp(value, min, max) - min) / span) * (H - PAD * 2);
    path += `${penDown ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    penDown = true;
  });

  return path || FLAT_PATH;
}

/**
 * Colour for the line: amber when the run faded noticeably, muted otherwise.
 *
 * "Faded" means the second half averaged more than 5% slower than the first,
 * which is the visual cue the design used amber for.
 */
export function paceShapeColor(shape: (number | null)[] | null | undefined): string {
  if (!shape || shape.length < 6) return "var(--color-muted)";

  // Split the *run*, then drop the gaps — not the other way round. Filtering
  // first meant that if the GPS dropped out mostly in one half, "first half"
  // and "second half" covered unequal stretches of the run and the comparison
  // was between two different things.
  const mid = Math.floor(shape.length / 2);
  const usable = (part: (number | null)[]) =>
    part.filter((v): v is number => typeof v === "number" && v > 0);

  const firstHalf = usable(shape.slice(0, mid));
  const secondHalf = usable(shape.slice(mid));
  if (firstHalf.length < 3 || secondHalf.length < 3) return "var(--color-muted)";

  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const first = mean(firstHalf);
  const second = mean(secondHalf);

  return second > first * 1.05 ? "var(--color-caution)" : "var(--color-muted)";
}

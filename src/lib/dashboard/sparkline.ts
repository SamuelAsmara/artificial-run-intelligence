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
 */

const W = 80;
const H = 24;
const PAD = 2;

/** A flat mid-line, for a run with no usable shape. */
export const FLAT_PATH = `M1 ${H / 2}L${W - 1} ${H / 2}`;

export function paceShapeToPath(shape: (number | null)[] | null | undefined): string {
  if (!shape || shape.length < 2) return FLAT_PATH;

  const values = shape.filter((v): v is number => typeof v === "number" && v > 0);
  if (values.length < 2) return FLAT_PATH;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  // A perfectly even run has no shape to show, and dividing by zero would put
  // the whole line off the top of the box.
  if (span < 1) return FLAT_PATH;

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
    const y = PAD + ((value - min) / span) * (H - PAD * 2);
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

  const values = shape.filter((v): v is number => typeof v === "number" && v > 0);
  if (values.length < 6) return "var(--color-muted)";

  const half = Math.floor(values.length / 2);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const first = mean(values.slice(0, half));
  const second = mean(values.slice(half));

  return second > first * 1.05 ? "var(--color-caution)" : "var(--color-muted)";
}

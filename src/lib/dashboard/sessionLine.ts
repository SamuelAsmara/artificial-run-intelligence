/**
 * The next session, drawn as a pace line rather than a row of bars.
 *
 * ## Why the bars had to go
 *
 * A session was drawn as three or nine flat blocks of colour whose heights
 * encoded effort. It was accurate and it told the athlete nothing: blocks do
 * not look like running. Worse, a warm-up and a rep read as two rectangles of
 * different size rather than as *slow then fast*, which is the only thing the
 * picture is for.
 *
 * A stepped line says it directly. The pen holds a level for the length of a
 * segment and jumps when the effort changes, so an interval session comes out
 * as a comb and a long run as one long shelf — the shape of the session, at a
 * glance, before a single number is read.
 *
 * ## Faster is up
 *
 * The same convention as every other chart in the product. The segment model
 * already carries effort as a height, so a taller segment is a harder one and
 * the line rises for it.
 *
 * Pure. Segments in, geometry out.
 */

/** A segment as the dashboard already builds it. */
export interface SessionSegment {
  /** percentage of the session's distance, as a string */
  w: string;
  /** effort, as a bar height in pixels — taller is harder */
  h: number;
  bg: string;
  title: string;
}

export interface SessionLine {
  /** the stepped path */
  path: string;
  /** the same path closed to the baseline, for the fill */
  area: string;
  /** one marker per change of effort */
  dots: { x: number; y: number; ly: number; l: string }[];
}

/** Where the line is allowed to live inside the box. */
export const LINE_BOX = { w: 560, top: 18, bottom: 84, left: 4, right: 556 } as const;

/**
 * The label under a marker.
 *
 * The segment titles read "1.2 km @ 4:05/km"; on a marker eight pixels tall
 * there is room for the pace and nothing else, and the pace is the part that
 * changes between segments.
 */
function shortLabel(title: string): string {
  const at = title.split("@");
  const tail = (at.length > 1 ? at[1] : title).trim();
  return tail.replace(/\/km$/, "").trim();
}

export function sessionLine(
  segments: SessionSegment[],
  box: typeof LINE_BOX = LINE_BOX,
): SessionLine | null {
  const usable = segments.filter((s) => Number.isFinite(Number(s.w)) && Number(s.w) > 0);
  if (usable.length === 0) return null;

  const heights = usable.map((s) => s.h);
  const lo = Math.min(...heights);
  const hi = Math.max(...heights);
  const span = box.bottom - box.top;
  const width = box.right - box.left;

  /*
   * A session with one effort throughout — every long run, every easy run —
   * would divide by zero here. It gets a single shelf two thirds of the way
   * up: high enough to look like running, flat because it was flat.
   */
  const y = (h: number) =>
    hi === lo ? box.top + span * 0.34 : box.bottom - ((h - lo) / (hi - lo)) * span;

  const total = usable.reduce((sum, s) => sum + Number(s.w), 0) || 100;

  let x = box.left;
  let path = "";
  const dots: SessionLine["dots"] = [];

  usable.forEach((s, i) => {
    const w = (Number(s.w) / total) * width;
    const yy = y(s.h);
    // Move to the first point, then step: vertical to the new level, then
    // horizontal for the length of the segment.
    path += i === 0 ? `M${x.toFixed(1)} ${yy.toFixed(1)}` : `L${x.toFixed(1)} ${yy.toFixed(1)}`;
    x += w;
    path += `L${x.toFixed(1)} ${yy.toFixed(1)}`;

    // A marker per segment, unless the segments are too many to label — an
    // interval session with nine reps would print nine overlapping paces.
    if (usable.length <= 5) {
      const cx = x - w / 2;
      dots.push({
        x: Number(cx.toFixed(1)),
        y: Number(yy.toFixed(1)),
        ly: Number((yy - 10).toFixed(1)),
        l: shortLabel(s.title),
      });
    }
  });

  const area = `${path}L${x.toFixed(1)} ${box.bottom}L${box.left.toFixed(1)} ${box.bottom}Z`;
  return { path, area, dots };
}

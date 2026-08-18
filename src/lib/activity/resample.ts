/**
 * Reducing a per-second run to something a chart can draw.
 *
 * ## The problem this solves
 *
 * The activity chart was designed against the prototype's synthetic run: 205
 * samples at ten-second spacing, smooth by construction. A real run from
 * intervals.icu arrives at 1 Hz — three thousand samples for an hour — and the
 * chart drew a vertex for every one of them. Every GPS wobble of a single
 * second became a spike, and the line came out looking like a saw blade.
 *
 * ## What this does, and what it deliberately does not do
 *
 * It averages within buckets rather than picking one sample per bucket. Picking
 * would keep the wobble and just show less of it; averaging cancels it, because
 * GPS error is roughly symmetric while real pace changes are not.
 *
 * It does **not** remove stopped time. An earlier design trimmed pauses so the
 * chart would end where the athlete stopped running, but that rewrites the
 * timeline: 25:00 on the chart would no longer be 25:00 on the watch. A stop is
 * something that happened, and the chart shows the run as the watch recorded
 * it. Stops survive as genuine dips in the pace line — the drawing code bounds
 * them to the axis so they cannot stretch the frame, which is the same thing
 * intervals.icu does.
 *
 * Cumulative channels take the bucket's last value, not its mean, so distance
 * and time stay monotonic and the x-axis stays honest.
 */

/** How many points the detail chart is drawn from. */
export const CHART_POINTS = 300;

/** Below this many metres per second nobody is running. */
export const MOVING_MPS = 1.5;

/** Below this the heart-rate strap is not reading, it is dropping out. */
export const MIN_HR = 60;

export interface RawStreams {
  time: number[];
  distance: number[];
  velocity: (number | null)[];
  heartrate: (number | null)[];
  altitude: (number | null)[];
}

export interface ChartStreams {
  n: number;
  /** cumulative metres */
  dist: number[];
  /** seconds from the start */
  time: number[];
  /** metres per second; 0 means genuinely stopped */
  vel: number[];
  hr: number[];
  alt: number[];
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Buckets a raw stream down to at most `points` samples.
 *
 * Returns null when there is not enough to draw.
 */
export function resampleForChart(raw: RawStreams, points = CHART_POINTS): ChartStreams | null {
  const n = Math.min(raw.time.length, raw.distance.length);
  if (n < 10) return null;

  // Fewer samples than the budget: nothing to reduce, just fill the gaps.
  const size = Math.max(1, Math.ceil(n / points));

  const dist: number[] = [];
  const time: number[] = [];
  const vel: number[] = [];
  const hr: number[] = [];
  const alt: number[] = [];

  for (let start = 0; start < n; start += size) {
    const end = Math.min(start + size, n);

    // Cumulative channels: the value at the end of the bucket.
    dist.push(raw.distance[end - 1]);
    time.push(raw.time[end - 1]);

    // Speed: a real average over the bucket, zeros included. A minute of
    // standing at a crossing *is* a minute at zero, and hiding it would make
    // the chart disagree with the moving time in the header.
    const speeds: number[] = [];
    const beats: number[] = [];
    const heights: number[] = [];
    for (let i = start; i < end; i++) {
      const v = raw.velocity[i];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) speeds.push(v);
      const b = raw.heartrate[i];
      if (typeof b === "number" && Number.isFinite(b) && b >= MIN_HR) beats.push(b);
      const a = raw.altitude[i];
      if (typeof a === "number" && Number.isFinite(a)) heights.push(a);
    }

    vel.push(speeds.length ? mean(speeds) : 0);
    // A dropped heart-rate sample is missing information, not a real zero, so
    // it is carried rather than averaged in as nothing. Speed is the opposite:
    // zero speed is a fact about the run.
    hr.push(beats.length ? mean(beats) : NaN);
    alt.push(heights.length ? mean(heights) : NaN);
  }

  return {
    n: dist.length,
    dist,
    time,
    vel,
    hr: carryGaps(hr),
    alt: carryGaps(alt),
  };
}

/**
 * Fills NaN gaps by holding the last known value, and backfills a leading gap.
 *
 * Used for the channels where a missing sample means the sensor dropped out.
 * Drawing those as zero would put a cliff in the chart that nobody ran.
 */
export function carryGaps(values: number[]): number[] {
  const out = values.slice();
  let last = NaN;
  for (let i = 0; i < out.length; i++) {
    if (Number.isNaN(out[i])) out[i] = last;
    else last = out[i];
  }
  // A run that opened before the strap picked up: reach backwards for the
  // first real reading rather than starting the line at zero.
  const first = out.find((v) => !Number.isNaN(v));
  if (first === undefined) return out.map(() => 0);
  for (let i = 0; i < out.length && Number.isNaN(out[i]); i++) out[i] = first;
  return out;
}

/**
 * The pace axis for one run, in seconds per kilometre.
 *
 * A fixed 4:30–6:40 axis was fine for the prototype and wrong for everyone
 * else: a fast run pressed flat against the top, a slow one against the
 * bottom, and either way a single stop dragged the line off the frame. Taking
 * the run's own 5th and 95th percentile means the line uses the height
 * available, and the outliers that remain get bounded rather than allowed to
 * stretch it.
 *
 * Falls back to the fixed range when there is not enough movement to measure.
 */
export function paceAxisFor(
  vel: number[],
  fallback: { min: number; max: number },
): { min: number; max: number } {
  const paces = vel
    .filter((v) => v >= MOVING_MPS)
    .map((v) => 1000 / v)
    .sort((a, b) => a - b);

  if (paces.length < 10) return fallback;

  const at = (q: number) => paces[Math.min(paces.length - 1, Math.floor(q * paces.length))];
  const lo = at(0.05);
  const hi = at(0.95);

  // A little air either side so the fastest and slowest points are not drawn
  // exactly on the frame.
  const pad = Math.max(10, (hi - lo) * 0.15);
  const min = Math.max(120, Math.floor((lo - pad) / 5) * 5);
  const max = Math.min(900, Math.ceil((hi + pad) / 5) * 5);

  // A metronomic run can produce a range too narrow to read; open it out.
  if (max - min < 60) {
    const mid = (max + min) / 2;
    return { min: Math.max(120, mid - 30), max: Math.min(900, mid + 30) };
  }
  return { min, max };
}

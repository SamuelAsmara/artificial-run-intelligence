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

/**
 * Below this the athlete is stopped, not merely slow.
 *
 * A far lower bar than `MOVING_MPS`, which asks "is this a running pace?" —
 * a different question. This one asks "did they stop?", and a watch answers it
 * close to zero.
 */
export const STOPPED_MPS = 0.8;

/** Below this the heart-rate strap is not reading, it is dropping out. */
export const MIN_HR = 60;

export interface RawStreams {
  time: number[];
  distance: number[];
  velocity: (number | null)[];
  heartrate: (number | null)[];
  altitude: (number | null)[];
  cadence?: (number | null)[];
  power?: (number | null)[];
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
  /**
   * Seconds of actual movement represented by each bucket.
   *
   * Measured at full resolution before the samples were reduced, because that
   * is the only place it can be measured honestly. Deciding whether a
   * ten-second bucket "was moving" from its own average blurs the edge of every
   * stop, and the error compounds: on a real run it read 2:33 of standing
   * against the watch's 2:07, and no choice of threshold fixed it — the
   * resolution was the problem, not the cutoff.
   *
   * Summing this over a range gives moving time for that range exactly, which
   * is what the header needs when a selection is dragged.
   */
  moving: number[];
  /** steps per minute, both feet */
  cad: number[];
  /** watts; all zero when the device supplied none */
  pow: number[];
  /** false when this run carries no power at all, so the band can be hidden */
  hasPower: boolean;
  /** likewise for cadence */
  hasCadence: boolean;
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
  const cad: number[] = [];
  const pow: number[] = [];
  const moving: number[] = [];

  /**
   * A leading boundary sample, so the run starts where the stream starts.
   *
   * Each bucket reports the cumulative value at its *end*, which is right for
   * every bucket but the first: without a point in front of it the chart begins
   * at the end of bucket one and quietly loses the distance covered inside it.
   * On a 10.01 km run that surfaced as 9.98 km in the header — small, wrong,
   * and exactly the kind of number an athlete checks against their watch.
   *
   * Only needed when buckets actually span more than one sample. At size 1 the
   * first bucket already reports the first sample, and prepending would
   * duplicate it.
   */
  const leading = size > 1;
  if (leading) {
    dist.push(raw.distance[0]);
    time.push(raw.time[0]);
    // The derived channels are filled in from bucket one once it exists: this
    // is a boundary, not a measurement, and taking the raw first sample would
    // reintroduce the very per-second noise the bucketing exists to remove.
    vel.push(0);
    hr.push(NaN);
    alt.push(NaN);
    cad.push(NaN);
    pow.push(0);
    // Nothing happened before the first sample.
    moving.push(0);
  }

  for (let start = 0; start < n; start += size) {
    const end = Math.min(start + size, n);

    // Cumulative channels: the value at the end of the bucket.
    dist.push(raw.distance[end - 1]);
    time.push(raw.time[end - 1]);

    // Moving time, counted sample by sample while the resolution still exists.
    // Distance decides it, not the speed channel: intervals.icu serves
    // `velocity_smooth`, and a smoothed speed does not fall to zero when the
    // athlete does. Metres that did not increase cannot lie about standing.
    let movedS = 0;
    for (let i = Math.max(1, start); i < end; i++) {
      const dt = raw.time[i] - raw.time[i - 1];
      const dd = raw.distance[i] - raw.distance[i - 1];
      if (dt > 0 && dd / dt >= STOPPED_MPS) movedS += dt;
    }
    moving.push(movedS);

    // Speed: a real average over the bucket, zeros included. A minute of
    // standing at a crossing *is* a minute at zero, and hiding it would make
    // the chart disagree with the moving time in the header.
    const speeds: number[] = [];
    const beats: number[] = [];
    const heights: number[] = [];
    const steps: number[] = [];
    const watts: number[] = [];
    for (let i = start; i < end; i++) {
      const v = raw.velocity[i];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) speeds.push(v);
      const b = raw.heartrate[i];
      if (typeof b === "number" && Number.isFinite(b) && b >= MIN_HR) beats.push(b);
      const a = raw.altitude[i];
      if (typeof a === "number" && Number.isFinite(a)) heights.push(a);
      const c = raw.cadence?.[i];
      if (typeof c === "number" && Number.isFinite(c) && c > 0) steps.push(c);
      const w = raw.power?.[i];
      if (typeof w === "number" && Number.isFinite(w) && w >= 0) watts.push(w);
    }

    vel.push(speeds.length ? mean(speeds) : 0);
    // A dropped heart-rate sample is missing information, not a real zero, so
    // it is carried rather than averaged in as nothing. Speed is the opposite:
    // zero speed is a fact about the run.
    hr.push(beats.length ? mean(beats) : NaN);
    alt.push(heights.length ? mean(heights) : NaN);
    cad.push(steps.length ? mean(steps) : NaN);
    // Power genuinely reaching zero is meaningful (you stopped), so unlike
    // heart rate it is averaged as recorded rather than carried across gaps.
    pow.push(watts.length ? mean(watts) : 0);
  }

  // Give the boundary sample the first bucket's character.
  if (leading && vel.length > 1) {
    vel[0] = vel[1];
    hr[0] = hr[1];
    alt[0] = alt[1];
    cad[0] = cad[1];
    pow[0] = pow[1];
  }

  const carriedCadence = carryGaps(cad);

  return {
    n: dist.length,
    dist,
    time,
    vel,
    hr: carryGaps(hr),
    alt: carryGaps(alt),
    cad: carriedCadence,
    pow,
    moving,
    // A run with no power at all should not be given an empty band. The same
    // for cadence: a treadmill entry or a manual log has neither.
    hasPower: pow.some((w) => w > 0),
    hasCadence: carriedCadence.some((c) => c > 0),
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

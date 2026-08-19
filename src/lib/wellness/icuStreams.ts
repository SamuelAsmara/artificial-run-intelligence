/**
 * Per-second data for a single run, and the three things we derive from it.
 *
 * `/activities` gives a summary per run — distance, time, average heart rate.
 * The second-by-second record lives at a separate endpoint, one request per
 * activity. Fetching it unlocks three things that were previously faked or
 * missing:
 *
 *   1. **The pace-shape sparkline** in the activity list, which was a flat line.
 *   2. **Personal records** — a 5K best is the fastest continuous 5 km *inside*
 *      any run, not the fastest run that happened to be about 5 km long.
 *   3. **Cardiac drift**, which the readiness engine has always accepted and
 *      never been given.
 *
 * ## Why we throw the raw stream away
 *
 * An hour of running at 1 Hz is 3,600 samples across several fields. Storing
 * that for every activity would be tens of megabytes per athlete for data we
 * only ever read through three summaries. So we fetch once, compute, store the
 * summaries, and discard the stream. Re-deriving means re-fetching, which is
 * fine because it never changes.
 */

import { IntervalsIcuError, type IcuConfig } from "./intervalsIcu";

const BASE = "https://intervals.icu/api/v1";

const authHeader = (apiKey: string) => "Basic " + btoa(`API_KEY:${apiKey}`);

/** The stream types we ask for. Anything else is wasted bandwidth. */
const STREAM_TYPES = "time,distance,heartrate,velocity_smooth,altitude,cadence,watts";

interface RawStream {
  type?: string;
  data?: (number | null)[];
}

export interface ActivityStreams {
  /** seconds from the start */
  time: number[];
  /** cumulative metres */
  distance: number[];
  /** beats per minute, may contain gaps */
  heartrate: (number | null)[];
  /** metres per second */
  velocity: (number | null)[];
  /** metres above sea level */
  altitude: (number | null)[];
  /**
   * Steps per minute, as the device reports it.
   *
   * Garmin counts one foot, so a real 166 spm arrives as 83. The importer
   * doubles it rather than storing the raw value, because every number a coach
   * or an athlete quotes is the two-footed one.
   */
  cadence: (number | null)[];
  /**
   * Watts, estimated by the watch from pace, grade and mass.
   *
   * Running power is modelled, not measured, and the models disagree between
   * brands — the same run reads differently on Garmin, Stryd and Coros. The
   * shape is informative (power rises on a climb at unchanged pace); the
   * absolute number means nothing without a threshold to scale it against.
   */
  power: (number | null)[];
}

export async function fetchStreams(
  cfg: IcuConfig,
  activityId: string,
): Promise<ActivityStreams | null> {
  const url =
    `${BASE}/activity/${encodeURIComponent(activityId)}/streams` +
    `?types=${STREAM_TYPES}`;

  const res = await fetch(url, {
    headers: { Authorization: authHeader(cfg.apiKey), Accept: "application/json" },
    cache: "no-store",
  });

  // A missing stream is normal — manually entered runs have none. That is not
  // an error and must not abort a sync.
  if (res.status === 404 || res.status === 422) return null;
  if (res.status === 401 || res.status === 403) {
    throw new IntervalsIcuError("intervals.icu rejected the API key.", res.status);
  }
  if (!res.ok) return null;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(body)) return null;

  const pick = (type: string): (number | null)[] =>
    (body as RawStream[]).find((s) => s.type === type)?.data ?? [];

  const time = pick("time").map((v) => (typeof v === "number" ? v : 0));
  const distance = pick("distance").map((v) => (typeof v === "number" ? v : 0));
  if (time.length < 10 || distance.length < 10) return null;

  return {
    time,
    distance,
    heartrate: pick("heartrate"),
    velocity: pick("velocity_smooth"),
    altitude: pick("altitude"),
    cadence: pick("cadence").map((v) => (typeof v === "number" ? v * 2 : v)),
    power: pick("watts"),
  };
}

/* ------------------------------------------------------------------ */
/* 1. the sparkline                                                    */
/* ------------------------------------------------------------------ */

/** How many points the activity-list sparkline is drawn from. */
export const SPARK_POINTS = 40;

/**
 * Pace over the run, reduced to a handful of points.
 *
 * Values are seconds per kilometre. Averaging within each bucket rather than
 * sampling means a single GPS glitch cannot become a spike in the drawn line.
 * Buckets with no usable speed become null so the caller can decide whether to
 * bridge or break the line.
 */
export function paceShape(streams: ActivityStreams, points = SPARK_POINTS): (number | null)[] {
  const n = streams.velocity.length;
  if (n === 0) return [];

  const size = Math.max(1, Math.floor(n / points));
  const out: (number | null)[] = [];

  for (let start = 0; start + size <= n && out.length < points; start += size) {
    let sum = 0;
    let count = 0;
    for (let i = start; i < start + size; i++) {
      const v = streams.velocity[i];
      // Below 1 m/s is walking or a stop; including it makes every run look
      // like it fell apart at the traffic lights.
      if (typeof v === "number" && v > 1) {
        sum += v;
        count++;
      }
    }
    out.push(count === 0 ? null : Math.round(1000 / (sum / count)));
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 2. best efforts                                                     */
/* ------------------------------------------------------------------ */

/**
 * Below this, between two samples, the athlete had stopped.
 *
 * The same threshold the chart uses — see `STOPPED_MPS` in lib/activity/resample.
 * Repeated rather than imported to keep this module free of dependencies on the
 * rendering layer; if one changes, change both.
 */
const STOPPED_MPS = 0.8;

/** Distances we look for a personal best over, in metres. */
export const PR_DISTANCES: Record<string, number> = {
  "1k": 1_000,
  "5k": 5_000,
  "10k": 10_000,
  half: 21_097,
  marathon: 42_195,
};

export type BestEfforts = Record<string, number>;

/**
 * Cumulative *moving* seconds at each sample.
 *
 * Stopped time is excluded on the same rule the chart uses — below
 * `STOPPED_MPS` between two samples is a stop, not slow running.
 */
function movingClock(distance: number[], time: number[], n: number): number[] {
  const clock = new Array<number>(n);
  clock[0] = 0;
  for (let i = 1; i < n; i++) {
    const dt = time[i] - time[i - 1];
    const dd = distance[i] - distance[i - 1];
    clock[i] = clock[i - 1] + (dt > 0 && dd / dt >= STOPPED_MPS ? dt : 0);
  }
  return clock;
}

/**
 * The fastest continuous stretch of each distance within this run.
 *
 * This is what a personal best actually means, and it is why a 5K best can come
 * out of a 10 km training run. Implemented as a two-pointer sweep over the
 * cumulative distance array: linear in the number of samples, so scanning a
 * year of running stays cheap.
 *
 * ## Moving time, not elapsed
 *
 * The window used to be measured with `time[hi] - time[lo]`, which is the
 * stream's wall clock — every red light inside the window counted against the
 * effort. That produced a result nobody could reconcile with their own screen:
 *
 *   31 May   10.01 km   moving 49:53   best 10k 50:39
 *   17 Aug   10.01 km   moving 49:10   best 10k 51:14   ← faster run, worse "best"
 *
 * The August run was 43 seconds quicker and had about two minutes of stops in
 * it, so on the wall clock it lost. A personal best measured on a different
 * clock from the duration shown beside it is not a personal best; it is a
 * second, hidden definition of the same word. Both now mean moving time.
 *
 * The remaining imprecision is that a window covers *at least* the target
 * distance rather than exactly it, so an effort is reported a fraction slow.
 * That is conservative and consistent across every run, which is what a record
 * needs — it never flatters.
 */
export function bestEfforts(streams: ActivityStreams): BestEfforts {
  const { distance, time } = streams;
  const n = Math.min(distance.length, time.length);
  const clock = n > 0 ? movingClock(distance, time, n) : [];
  // The span actually covered. A stream does not have to start at zero, and
  // using the last cumulative value would silently drop a run that covered the
  // distance exactly.
  const total = n > 0 ? distance[n - 1] - distance[0] : 0;
  const out: BestEfforts = {};

  for (const [label, target] of Object.entries(PR_DISTANCES)) {
    if (total < target) continue;

    let best = Infinity;
    let lo = 0;

    for (let hi = 0; hi < n; hi++) {
      // advance the trailing pointer while the window still covers the target
      while (lo < hi && distance[hi] - distance[lo + 1] >= target) lo++;
      if (distance[hi] - distance[lo] >= target) {
        const seconds = clock[hi] - clock[lo];
        if (seconds > 0 && seconds < best) best = seconds;
      }
    }

    if (Number.isFinite(best)) out[label] = Math.round(best);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 3. cardiac drift                                                    */
/* ------------------------------------------------------------------ */

/**
 * How much heart rate climbed for the same effort across a run.
 *
 * Compares the heart-rate-to-pace ratio of the first half against the second,
 * which is the standard aerobic-decoupling calculation. Below about 3% is
 * normal; above 8% means the session cost more than its pace suggests.
 *
 * Only meaningful on a steady effort of reasonable length, so intervals and
 * short runs return null rather than a number nobody should read.
 */
export function cardiacDriftPct(streams: ActivityStreams): number | null {
  const { time, heartrate, velocity } = streams;
  const n = Math.min(time.length, heartrate.length, velocity.length);
  if (n < 600) return null; // under ten minutes of samples

  const duration = time[n - 1] - time[0];
  if (duration < 1800) return null; // decoupling is not meaningful under 30 min

  const half = Math.floor(n / 2);

  const ratio = (from: number, to: number): number | null => {
    let hrSum = 0;
    let speedSum = 0;
    let count = 0;
    for (let i = from; i < to; i++) {
      const hr = heartrate[i];
      const v = velocity[i];
      if (typeof hr === "number" && hr > 60 && typeof v === "number" && v > 1) {
        hrSum += hr;
        speedSum += v;
        count++;
      }
    }
    if (count < 60) return null;
    const meanSpeed = speedSum / count;
    if (meanSpeed <= 0) return null;
    return hrSum / count / meanSpeed;
  };

  const first = ratio(0, half);
  const second = ratio(half, n);
  if (first === null || second === null || first <= 0) return null;

  return Math.round(((second - first) / first) * 1000) / 10;
}

/* ------------------------------------------------------------------ */

export interface StreamDerived {
  paceShape: (number | null)[];
  bestEfforts: BestEfforts;
  cardiacDriftPct: number | null;
}

/** Everything we keep from one activity's stream. */
export function deriveFromStreams(streams: ActivityStreams): StreamDerived {
  return {
    paceShape: paceShape(streams),
    bestEfforts: bestEfforts(streams),
    cardiacDriftPct: cardiacDriftPct(streams),
  };
}

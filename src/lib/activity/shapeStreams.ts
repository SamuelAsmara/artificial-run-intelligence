/**
 * Drawing the activity chart when there is no second-by-second record.
 *
 * ## The hole this fills
 *
 * `getActivityDetail` built the chart from one source only: a live stream
 * fetched from intervals.icu at request time. Every other run — a Strava
 * import, a hand-entered session, all 2,209 runs in the demo database — fell
 * through to a sentence saying detail was unavailable, and the whole chart
 * disappeared. With it went the coach's planned pace and the target window,
 * which are drawn inside the pace band.
 *
 * But those runs are not blind. `activities.pace_shape` holds about forty
 * points of seconds-per-kilometre, stored at import precisely so the raw
 * stream could be discarded. Migration 0005 even says it feeds "the pace band
 * on the activity chart". Nothing ever read it there.
 *
 * ## What it can and cannot say
 *
 * Forty points of pace can honestly say how a run was paced: where it was
 * fast, where it faded, whether it sat inside the coach's window. Since
 * migration 0018 the same is true of heart rate, when the run has an
 * `hr_shape` stored beside its pace.
 *
 * Cadence, power and climb are still not kept, so those arrays come back
 * empty rather than filled with a plausible-looking constant — the chart's
 * band layout drops a series with no finite values, which is exactly the
 * behaviour we want. A flat line at the run's average would be an invention,
 * and one the athlete would reasonably read as a measurement. The same goes
 * for heart rate on a run that has no `hr_shape`: no band beats a fake one.
 *
 * ## One deliberate inconsistency
 *
 * `paceShape` buckets the provider's samples by index, and those samples are
 * one a second — so a bucket is a slice of *time*, and a slow bucket covers
 * less ground than a fast one. Reconstructing from that, the distance the
 * curve accumulates rarely lands exactly on the stored total. Rather than
 * bend the pace values to make the arithmetic close, the distances are scaled
 * by a single constant so the axis ends where the run ended. The pace curve
 * is then exactly what was stored, and the x positions are uniformly
 * stretched — which changes nothing about the shape.
 *
 * The consequence: `dist` here is not the integral of `vel`, so this stream
 * must not be handed to {@link summarise}. It is for drawing, and the header
 * figures keep coming from the stored row.
 */

import type { ChartStreams } from "@/lib/activity/resample";

/** Below this many usable points there is no shape worth drawing. */
export const MIN_SHAPE_POINTS = 4;

export function streamsFromShape(
  shape: (number | null)[] | null | undefined,
  totalM: number,
  movingS: number,
  hrShape?: (number | null)[] | null,
): ChartStreams | null {
  if (!Array.isArray(shape) || shape.length < MIN_SHAPE_POINTS) return null;
  if (!(totalM > 0) || !(movingS > 0)) return null;

  // A null bucket is a stretch with no usable speed — a stop at a crossing,
  // not a pace of zero. Zero velocity is how the chart already draws a stop.
  const vel = shape.map((p) =>
    typeof p === "number" && Number.isFinite(p) && p > 0 ? 1000 / p : 0,
  );

  const live = vel.filter((v) => v > 0).length;
  if (live < MIN_SHAPE_POINTS) return null;

  // Moving time is time spent moving, so the buckets that were stopped do not
  // get a share of it.
  const per = movingS / live;

  const dist: number[] = [];
  const time: number[] = [];
  const moving: number[] = [];
  let d = 0;
  let t = 0;
  for (const v of vel) {
    const secs = v > 0 ? per : 0;
    d += v * secs;
    t += secs;
    dist.push(d);
    time.push(t);
    moving.push(secs);
  }

  const scale = d > 0 ? totalM / d : 1;
  const n = vel.length;

  return {
    n,
    dist: dist.map((m) => m * scale),
    time,
    vel,
    /*
     * Zero reads as "no reading" to the band layout, which keeps only finite
     * values above zero — so a run with no stored heart rate simply has no
     * heart-rate band, and one with a dropout has a gap rather than a dip.
     *
     * Read positionally: `hrShape` is bucketed on the same indices and to the
     * same count as the pace shape, which is the whole reason migration 0018
     * insisted on that. A shorter array is padded rather than stretched — if
     * the two ever disagree in length, the honest reading is that we do not
     * know the later beats, not that they can be interpolated.
     */
    hr: Array.from({ length: n }, (_, i) => {
      const v = hrShape?.[i];
      return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
    }),
    cad: new Array(n).fill(0),
    pow: new Array(n).fill(0),
    // NaN rather than zero: zero metres is a reading at sea level, and would
    // draw a flat elevation band nobody measured.
    alt: new Array(n).fill(Number.NaN),
    moving,
    hasPower: false,
    hasCadence: false,
  };
}

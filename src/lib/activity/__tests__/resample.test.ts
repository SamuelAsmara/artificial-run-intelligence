import { describe, expect, it } from "vitest";
import {
  CHART_POINTS, carryGaps, paceAxisFor, resampleForChart, type RawStreams,
} from "../resample";

/**
 * A synthetic run.
 * @param secs duration in seconds, sampled at 1 Hz
 * @param mps  speed, constant or a function of the second
 */
function run(
  secs: number,
  mps: number | ((t: number) => number),
  hr?: number | ((t: number) => number),
): RawStreams {
  const time: number[] = [], distance: number[] = [];
  const velocity: (number | null)[] = [], heartrate: (number | null)[] = [];
  const altitude: (number | null)[] = [];
  let d = 0;
  for (let t = 0; t < secs; t++) {
    const v = typeof mps === "function" ? mps(t) : mps;
    time.push(t);
    distance.push(d);
    d += v;
    velocity.push(v);
    heartrate.push(hr === undefined ? null : typeof hr === "function" ? hr(t) : hr);
    altitude.push(40 + Math.sin((t / secs) * Math.PI * 2) * 10);
  }
  return { time, distance, velocity, heartrate, altitude };
}

describe("resampleForChart", () => {
  it("stays inside the point budget for a long run", () => {
    const s = resampleForChart(run(7200, 3, 150));
    expect(s).not.toBeNull();
    expect(s!.n).toBeLessThanOrEqual(CHART_POINTS);
    expect(s!.n).toBeGreaterThan(100);
  });

  it("leaves a short stream alone rather than padding it", () => {
    const s = resampleForChart(run(120, 3, 150));
    expect(s!.n).toBe(120);
  });

  it("refuses a stream too short to draw", () => {
    expect(resampleForChart(run(5, 3))).toBeNull();
  });

  it("keeps distance and time monotonic", () => {
    const s = resampleForChart(run(3600, (t) => (t % 300 < 20 ? 0 : 3), 150))!;
    for (let i = 1; i < s.n; i++) {
      expect(s.dist[i]).toBeGreaterThanOrEqual(s.dist[i - 1]);
      expect(s.time[i]).toBeGreaterThan(s.time[i - 1]);
    }
  });

  it("reaches the end of the run", () => {
    // The last bucket must carry the final cumulative values, or the chart
    // silently ends short of where the athlete finished.
    const raw = run(3600, 3, 150);
    const s = resampleForChart(raw)!;
    expect(s.time[s.n - 1]).toBe(raw.time[raw.time.length - 1]);
    expect(s.dist[s.n - 1]).toBe(raw.distance[raw.distance.length - 1]);
  });

  it("cancels per-second GPS wobble instead of drawing it", () => {
    // steady 3 m/s with alternating ±1 m/s of noise
    const noisy = resampleForChart(run(3600, (t) => (t % 2 ? 4 : 2)))!;
    for (const v of noisy.vel) expect(Math.abs(v - 3)).toBeLessThan(0.2);
  });

  it("keeps a real stop as a real stop", () => {
    // Five minutes standing still in the middle. This is the behaviour the
    // athlete asked for: show the run as the watch recorded it.
    const s = resampleForChart(run(3600, (t) => (t >= 1200 && t < 1500 ? 0 : 3), 150))!;
    const stopped = s.vel.filter((v) => v < 0.5);
    expect(stopped.length).toBeGreaterThan(0);
  });

  it("does not let a dropped heart-rate sample become a zero", () => {
    const s = resampleForChart(run(3600, 3, (t) => (t % 600 < 30 ? 0 : 150)))!;
    for (const b of s.hr) expect(b).toBeGreaterThan(100);
  });

  it("never emits NaN", () => {
    const s = resampleForChart(run(3600, (t) => (t % 100 === 0 ? 0 : 3), 150))!;
    for (const key of ["dist", "time", "vel", "hr", "alt"] as const) {
      for (const v of s[key]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("survives a run with no heart rate at all", () => {
    const s = resampleForChart(run(1800, 3))!;
    for (const b of s.hr) expect(Number.isFinite(b)).toBe(true);
  });
});

describe("carryGaps", () => {
  it("holds the last known value across a gap", () => {
    expect(carryGaps([1, NaN, NaN, 4])).toEqual([1, 1, 1, 4]);
  });

  it("backfills a gap at the start", () => {
    expect(carryGaps([NaN, NaN, 3, 4])).toEqual([3, 3, 3, 4]);
  });

  it("returns zeros when there is nothing to carry", () => {
    expect(carryGaps([NaN, NaN])).toEqual([0, 0]);
  });
});

describe("paceAxisFor", () => {
  const FALLBACK = { min: 270, max: 400 };

  it("brackets the pace the run was actually run at", () => {
    // a steady 5:00/km run
    const axis = paceAxisFor(Array(200).fill(1000 / 300), FALLBACK);
    expect(axis.min).toBeLessThan(300);
    expect(axis.max).toBeGreaterThan(300);
  });

  it("moves with the run rather than staying fixed", () => {
    const fast = paceAxisFor(Array(200).fill(1000 / 240), FALLBACK);
    const slow = paceAxisFor(Array(200).fill(1000 / 400), FALLBACK);
    expect(fast.max).toBeLessThan(slow.min);
  });

  it("is not dragged out of shape by a stop", () => {
    // 195 samples running, 5 standing still
    const vel = [...Array(195).fill(1000 / 300), ...Array(5).fill(0)];
    const axis = paceAxisFor(vel, FALLBACK);
    // without the percentile the max would run to infinity
    expect(axis.max).toBeLessThan(420);
  });

  it("opens out an axis too narrow to read", () => {
    const axis = paceAxisFor(Array(200).fill(1000 / 300), FALLBACK);
    expect(axis.max - axis.min).toBeGreaterThanOrEqual(60);
  });

  it("falls back when there is not enough movement to measure", () => {
    expect(paceAxisFor([], FALLBACK)).toEqual(FALLBACK);
    expect(paceAxisFor(Array(200).fill(0), FALLBACK)).toEqual(FALLBACK);
  });

  it("always returns a usable range", () => {
    for (const pace of [180, 240, 300, 360, 420, 500, 600]) {
      const axis = paceAxisFor(Array(200).fill(1000 / pace), FALLBACK);
      expect(axis.min).toBeLessThan(axis.max);
      expect(axis.min).toBeGreaterThanOrEqual(120);
      expect(axis.max).toBeLessThanOrEqual(900);
    }
  });
});

import { describe, expect, it } from "vitest";
import { streamsFromShape } from "@/lib/activity/shapeStreams";

const flat = (sec: number, n = 40) => new Array(n).fill(sec);

describe("streamsFromShape", () => {
  it("returns null without a shape", () => {
    expect(streamsFromShape(null, 10_000, 3000)).toBeNull();
    expect(streamsFromShape(undefined, 10_000, 3000)).toBeNull();
  });

  it("returns null for a shape too short to draw", () => {
    expect(streamsFromShape([300, 300, 300], 10_000, 3000)).toBeNull();
  });

  it("returns null without a distance or a duration", () => {
    expect(streamsFromShape(flat(300), 0, 3000)).toBeNull();
    expect(streamsFromShape(flat(300), 10_000, 0)).toBeNull();
  });

  it("returns null when almost every bucket is a stop", () => {
    const shape = [300, 300, null, null, null, null, null, null];
    expect(streamsFromShape(shape, 2000, 600)).toBeNull();
  });

  it("ends exactly on the stored distance", () => {
    const s = streamsFromShape(flat(300), 12_345, 3703)!;
    expect(s.dist[s.n - 1]).toBeCloseTo(12_345, 6);
    expect(s.dist[0]).toBeGreaterThan(0);
  });

  it("keeps the stored pace values untouched", () => {
    const shape = [300, 280, 320, 300, 260, 340];
    const s = streamsFromShape(shape, 5000, 1500)!;
    const paces = s.vel.map((v) => Math.round(1000 / v));
    expect(paces).toEqual(shape);
  });

  it("rises monotonically in distance", () => {
    const s = streamsFromShape([300, 280, 320, 300, 260, 340], 5000, 1500)!;
    for (let i = 1; i < s.n; i++) expect(s.dist[i]).toBeGreaterThan(s.dist[i - 1]);
  });

  it("draws a stop as zero speed that covers no ground", () => {
    const shape = [300, 300, null, 300, 300, 300];
    const s = streamsFromShape(shape, 3000, 900)!;
    expect(s.vel[2]).toBe(0);
    expect(s.dist[2]).toBe(s.dist[1]);
    expect(s.moving[2]).toBe(0);
  });

  it("shares moving time only between the buckets that moved", () => {
    const shape = [300, 300, null, 300, 300];
    const s = streamsFromShape(shape, 3000, 800)!;
    expect(s.moving.reduce((a, b) => a + b, 0)).toBeCloseTo(800, 6);
    expect(s.time[s.n - 1]).toBeCloseTo(800, 6);
  });

  it("reports no heart rate, cadence, power or altitude", () => {
    const s = streamsFromShape(flat(300), 10_000, 3000)!;
    expect(s.hr.every((v) => v === 0)).toBe(true);
    expect(s.cad.every((v) => v === 0)).toBe(true);
    expect(s.pow.every((v) => v === 0)).toBe(true);
    expect(s.alt.every((v) => Number.isNaN(v))).toBe(true);
    expect(s.hasPower).toBe(false);
    expect(s.hasCadence).toBe(false);
  });

  it("keeps one point per stored point", () => {
    const s = streamsFromShape(flat(300, 24), 8000, 2400)!;
    expect(s.n).toBe(24);
    expect(s.dist).toHaveLength(24);
    expect(s.vel).toHaveLength(24);
  });

  it("puts a faster stretch further along than a slower one of equal time", () => {
    // Equal-time buckets: the fast bucket must cover more ground.
    const s = streamsFromShape([600, 300, 600, 300], 4000, 1200)!;
    const step = [s.dist[0], s.dist[1] - s.dist[0], s.dist[2] - s.dist[1], s.dist[3] - s.dist[2]];
    expect(step[1]).toBeCloseTo(step[0] * 2, 6);
    expect(step[3]).toBeCloseTo(step[2] * 2, 6);
  });
});

/*
 * Heart rate on a reconstructed stream — migration 0018.
 *
 * The point of the column: a Strava import, a hand-entered run and a coach
 * looking at an athlete's session all get a heart-rate band now, where before
 * only a live intervals.icu stream could draw one.
 */
describe("streamsFromShape with a heart-rate shape", () => {
  const pace = [312, 300, 288, 305, 330, 296, 284, 318];
  const beats = [138, 142, 149, 151, 147, 152, 158, 155];

  it("carries the stored beats through, point for point", () => {
    const s = streamsFromShape(pace, 8000, 2440, beats)!;
    expect(s.hr).toEqual(beats);
  });

  it("still reports nothing when the run has no heart rate", () => {
    const s = streamsFromShape(pace, 8000, 2440)!;
    expect(s.hr.every((v) => v === 0)).toBe(true);
    expect(streamsFromShape(pace, 8000, 2440, null)!.hr.every((v) => v === 0)).toBe(true);
  });

  it("reads a dropout as no reading rather than as a heart rate of zero", () => {
    const withGap = [138, 142, null, null, 147, 152, 158, 155];
    const s = streamsFromShape(pace, 8000, 2440, withGap)!;
    expect(s.hr[2]).toBe(0);
    expect(s.hr[4]).toBe(147);
    // Which is what the band layout drops, so the line breaks rather than dives.
    expect(s.hr.filter((v) => Number.isFinite(v) && v > 0)).toHaveLength(6);
  });

  it("pads rather than stretches when the two shapes disagree in length", () => {
    const s = streamsFromShape(pace, 8000, 2440, [138, 142, 149])!;
    expect(s.hr).toHaveLength(pace.length);
    expect(s.hr.slice(0, 3)).toEqual([138, 142, 149]);
    expect(s.hr.slice(3).every((v) => v === 0)).toBe(true);
  });

  it("ignores an impossible reading", () => {
    const s = streamsFromShape(pace, 8000, 2440, [0, -5, 149, 151, 147, 152, 158, 155])!;
    expect(s.hr[0]).toBe(0);
    expect(s.hr[1]).toBe(0);
    expect(s.hr[2]).toBe(149);
  });
});

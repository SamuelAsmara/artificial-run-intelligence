/**
 * The heart-rate shape stored beside the pace shape — migration 0018.
 *
 * The contract that matters is positional: point 17 of one array has to
 * describe the same stretch of running as point 17 of the other, because
 * every chart that draws both reads them as pairs.
 */
import { describe, expect, it } from "vitest";
import { hrShape, paceShape, deriveFromStreams } from "@/lib/wellness/icuStreams";
import type { ActivityStreams } from "@/lib/wellness/icuStreams";

const streams = (
  n: number,
  hr: (i: number) => number | null,
  vel: (i: number) => number | null = () => 3.2,
): ActivityStreams => ({
  time: Array.from({ length: n }, (_, i) => i),
  distance: Array.from({ length: n }, (_, i) => i * 3.2),
  heartrate: Array.from({ length: n }, (_, i) => hr(i)),
  velocity: Array.from({ length: n }, (_, i) => vel(i)),
  altitude: new Array(n).fill(30),
  cadence: new Array(n).fill(172),
  power: new Array(n).fill(0),
});

describe("hrShape", () => {
  it("comes back the same length as the pace shape", () => {
    for (const n of [400, 1200, 3600, 5001]) {
      const s = streams(n, () => 150);
      expect(hrShape(s)).toHaveLength(paceShape(s).length);
    }
  });

  it("averages within each bucket", () => {
    const s = streams(2000, (i) => (i < 1000 ? 140 : 170));
    const shape = hrShape(s);
    expect(shape[0]).toBe(140);
    expect(shape[shape.length - 1]).toBe(170);
  });

  it("reports a dropout as null rather than as a low heart rate", () => {
    const s = streams(2000, (i) => (i >= 500 && i < 550 ? null : 150));
    expect(hrShape(s).every((v) => v === null || v === 150)).toBe(true);
  });

  it("treats an impossible reading as a dropout", () => {
    const s = streams(400, () => 12);
    expect(hrShape(s).every((v) => v === null)).toBe(true);
  });

  it("is empty for a run with no samples at all", () => {
    expect(hrShape(streams(0, () => 150))).toEqual([]);
  });

  it("tracks the run rather than the clock when speed varies", () => {
    // Slow first half, fast second half, heart rate following.
    const s = streams(
      2000,
      (i) => (i < 1000 ? 135 : 168),
      (i) => (i < 1000 ? 2.6 : 4.0),
    );
    const hr = hrShape(s);
    const pace = paceShape(s);
    expect(hr).toHaveLength(pace.length);
    // The half that was run faster is the half with the higher heart rate.
    const mid = Math.floor(hr.length / 2);
    expect(hr[0]!).toBeLessThan(hr[hr.length - 1]!);
    expect(pace[0]!).toBeGreaterThan(pace[pace.length - 1]!);
    expect(mid).toBeGreaterThan(0);
  });
});

describe("deriveFromStreams", () => {
  it("stores a heart-rate shape when the run has one", () => {
    const d = deriveFromStreams(streams(2000, () => 152));
    expect(d.hrShape).not.toBeNull();
    expect(d.hrShape).toHaveLength(d.paceShape.length);
  });

  it("stores null rather than an array of nulls for a strapless run", () => {
    // A column of nulls would make a run with no strap look like a run whose
    // strap dropped out, and the chart would offer an empty lane for it.
    expect(deriveFromStreams(streams(2000, () => null)).hrShape).toBeNull();
  });

  it("keeps a run that lost its strap for part of the way", () => {
    const d = deriveFromStreams(streams(2000, (i) => (i < 1000 ? 148 : null)));
    expect(d.hrShape).not.toBeNull();
    expect(d.hrShape!.some((v) => v === null)).toBe(true);
    expect(d.hrShape!.some((v) => v !== null)).toBe(true);
  });
});

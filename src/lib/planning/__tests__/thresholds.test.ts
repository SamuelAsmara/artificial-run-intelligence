import { describe, expect, it } from "vitest";
import {
  durationDiscount,
  estimateThresholdSpeed,
  estimateThresholds,
  type HistoryActivity,
} from "@/lib/planning/thresholds";
import { paceLabel } from "@/lib/planning/paces";

/** A run at a given pace, in seconds per kilometre. */
const run = (
  date: string,
  minutes: number,
  paceSecPerKm: number,
  avgHr: number | null,
): HistoryActivity => {
  const durationSec = minutes * 60;
  return { date, durationSec, distanceM: (durationSec / paceSecPerKm) * 1000, avgHr };
};

/** Sixteen weeks of nothing but easy running — the case that broke. */
const easyOnly = (): HistoryActivity[] =>
  Array.from({ length: 48 }, (_, i) =>
    run(`2026-0${(i % 9) + 1}-01`, 50, 439, 128),
  );

describe("estimateThresholdSpeed", () => {
  it("declines to give a threshold when nothing hard was ever run", () => {
    // The whole point: an easy pace is not a threshold pace, and shading it
    // down does not turn it into one.
    const result = estimateThresholdSpeed(easyOnly(), 165);
    expect(result.thresholdSpeedMps).toBe(0);
    expect(result.measured).toBe(false);
  });

  it("prescribes no pace at all rather than one slower than the athlete runs easily", () => {
    const { thresholdSpeedMps } = estimateThresholdSpeed(easyOnly(), 165);
    expect(paceLabel("easy", thresholdSpeedMps)).toBeNull();
    expect(paceLabel("long", thresholdSpeedMps)).toBeNull();
    expect(paceLabel("interval", thresholdSpeedMps)).toBeNull();
  });

  it("accepts a 20 minute hard effort, which the 35 minute window rejected", () => {
    const history = [...easyOnly(), run("2026-08-01", 22, 250, 158)];
    const result = estimateThresholdSpeed(history, 165);
    expect(result.measured).toBe(true);
    expect(result.thresholdSpeedMps).toBeGreaterThan(0);
  });

  it("shades a short effort down, because it was run above threshold", () => {
    const short = estimateThresholdSpeed([run("2026-08-01", 20, 250, 158)], 165);
    const long = estimateThresholdSpeed([run("2026-08-01", 40, 250, 158)], 165);
    // Same pace, shorter effort: the shorter one must not claim the faster
    // threshold, or every prescribed pace comes out too hard.
    expect(short.thresholdSpeedMps).toBeLessThan(long.thresholdSpeedMps);
    expect(short.thresholdSpeedMps).toBeCloseTo(long.thresholdSpeedMps * 0.95, 3);
  });

  it("ignores a long run even when it is the fastest thing on record", () => {
    // Fast, long, and easy-hearted: not a threshold effort.
    const result = estimateThresholdSpeed([run("2026-08-01", 90, 240, 130)], 165);
    expect(result.thresholdSpeedMps).toBe(0);
  });

  it("ignores an effort with no heart rate", () => {
    expect(estimateThresholdSpeed([run("2026-08-01", 30, 250, null)], 165).thresholdSpeedMps).toBe(0);
  });
});

describe("durationDiscount", () => {
  it("takes a 35 minute effort at face value", () => {
    expect(durationDiscount(2100)).toBe(1);
    expect(durationDiscount(4000)).toBe(1);
  });

  it("applies the 95%-of-20-minutes convention at the short end", () => {
    expect(durationDiscount(1200)).toBeCloseTo(0.95, 5);
  });

  it("interpolates between them without ever exceeding one", () => {
    const mid = durationDiscount(1650);
    expect(mid).toBeGreaterThan(0.95);
    expect(mid).toBeLessThan(1);
  });
});

describe("estimateThresholds", () => {
  it("explains itself when it has no pace to give", () => {
    const { thresholdSpeedMps, notes } = estimateThresholds(easyOnly(), {
      age: 30,
      sex: "male",
    });
    expect(thresholdSpeedMps).toBe(0);
    expect(notes.join(" ")).toMatch(/No threshold pace yet/);
  });

  it("reports the pace once there is a real effort behind it", () => {
    const history = [...easyOnly(), run("2026-08-01", 30, 250, 160)];
    const { thresholdSpeedMps, notes } = estimateThresholds(history, { age: 30, sex: "male" });
    expect(thresholdSpeedMps).toBeGreaterThan(0);
    expect(notes.join(" ")).toMatch(/Threshold pace .*from your fastest sustained run/);
  });
});

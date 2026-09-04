import { describe, expect, it } from "vitest";
import { calculateACWR, isHighInjuryRisk, ACWR_INJURY_RISK_THRESHOLD, loadRatio } from "../acwr";

// Test plan §1: calculateACWR — given 28 days of load history, returns an
// arithmetically correct acute:chronic ratio.

function daysAgo(n: number, from = new Date("2026-08-06")): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("calculateACWR", () => {
  it("returns a ratio of 1 when load is steady (acute == chronic)", () => {
    const asOf = new Date("2026-08-06");
    const loads = Array.from({ length: 28 }, (_, i) => ({ date: daysAgo(i, asOf), load: 1000 }));
    const result = calculateACWR(loads, asOf);
    expect(result.acwr).toBeCloseTo(1, 5);
  });

  it("detects a sharp rise in load (ACWR above the threshold)", () => {
    const asOf = new Date("2026-08-06");
    const loads = [
      ...Array.from({ length: 21 }, (_, i) => ({ date: daysAgo(i + 7, asOf), load: 500 })), // low chronic load
      ...Array.from({ length: 7 }, (_, i) => ({ date: daysAgo(i, asOf), load: 3000 })), // high acute load
    ];
    const result = calculateACWR(loads, asOf);
    expect(result.acwr).toBeGreaterThan(ACWR_INJURY_RISK_THRESHOLD);
    expect(isHighInjuryRisk(result)).toBe(true);
  });

  it('returns acwr=null ("not enough data") without history', () => {
    const result = calculateACWR([]);
    expect(result.acwr).toBeNull();
  });

  it("ignores loads dated after asOf", () => {
    const asOf = new Date("2026-08-06");
    const loads = [
      { date: daysAgo(1, asOf), load: 1000 },
      { date: "2026-08-10", load: 999999 }, // in the future — must not count
    ];
    const result = calculateACWR(loads, asOf);
    expect(result.acute).toBeCloseTo(1000 / 7, 5);
  });
});

describe("loadRatio warm-up bias", () => {
  const steady = (days: number, load = 60) =>
    Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      load,
    }));

  /**
   * The bug: both averages start at zero and converge at different speeds, so
   * an athlete running exactly the same load every day was told they were
   * ramping — hardest right at the moment the ratio first became visible.
   */
  it("reports ~1.0 for a perfectly steady athlete as soon as it answers at all", () => {
    for (const days of [28, 30, 35, 42, 60, 84]) {
      const { ratio } = loadRatio(steady(days));
      expect(ratio).not.toBeNull();
      expect(ratio as number).toBeGreaterThan(0.98);
      expect(ratio as number).toBeLessThan(1.02);
    }
  });

  it("still sees a genuine ramp", () => {
    // four steady weeks, then a week at double
    const series = [...steady(28, 50), ...steady(7, 100).map((d, i) => ({
      date: new Date(Date.UTC(2026, 0, 29 + i)).toISOString().slice(0, 10),
      load: 100,
    }))];
    const { ratio } = loadRatio(series);
    expect(ratio as number).toBeGreaterThan(1.3);
  });

  it("still sees a genuine drop", () => {
    const series = [...steady(28, 80), ...Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 29 + i)).toISOString().slice(0, 10),
      load: 20,
    }))];
    const { ratio } = loadRatio(series);
    expect(ratio as number).toBeLessThan(0.8);
  });

  it("still withholds an answer before four weeks", () => {
    expect(loadRatio(steady(20)).ratio).toBeNull();
  });
});

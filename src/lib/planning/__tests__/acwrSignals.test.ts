import { describe, expect, it } from "vitest";
import { toDailySeries } from "../load";
import { loadRatio, sessionSpikeVsRecentMax } from "../acwr";

const series = (days: number, load: number) =>
  Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    load,
  }));

describe("loadRatio", () => {
  it("is about 1 for steady training", () => {
    const r = loadRatio(series(120, 60));
    expect(r.ratio).not.toBeNull();
    expect(r.ratio as number).toBeCloseTo(1, 1);
    expect(r.description).toMatch(/usual level/);
  });

  it("rises when the last week is heavier", () => {
    const s = [...series(90, 50), ...series(7, 120)];
    const r = loadRatio(s);
    expect(r.ratio as number).toBeGreaterThan(1.2);
    expect(r.description).toMatch(/above your usual/);
  });

  it("returns null rather than exploding after a layoff", () => {
    const s = toDailySeries([], "2026-01-01", "2026-02-15");
    expect(loadRatio(s).ratio).toBeNull();
    expect(loadRatio(s).description).toMatch(/Building your baseline/);
  });

  it("returns null when history is shorter than the chronic window", () => {
    expect(loadRatio(series(10, 60)).ratio).toBeNull();
  });

  it("never claims injury risk", () => {
    const r = loadRatio([...series(90, 50), ...series(7, 200)]);
    expect(r.description.toLowerCase()).not.toMatch(/injur|risk|danger/);
  });
});

describe("sessionSpikeVsRecentMax", () => {
  const asOf = new Date("2026-02-01T00:00:00Z");
  const runs = [
    { date: "2026-01-10", distanceM: 10000 },
    { date: "2026-01-20", distanceM: 12000 },
    { date: "2026-01-28", distanceM: 8000 },
  ];

  it("is within range for a normal session", () => {
    const r = sessionSpikeVsRecentMax(12500, runs, asOf);
    expect(r.band).toBe("within");
    expect(r.hazardRatio).toBe(1);
  });

  it("flags the bands from Frandsen et al. 2025", () => {
    expect(sessionSpikeVsRecentMax(14000, runs, asOf).band).toBe("small");
    expect(sessionSpikeVsRecentMax(20000, runs, asOf).band).toBe("moderate");
    expect(sessionSpikeVsRecentMax(30000, runs, asOf).band).toBe("large");
    expect(sessionSpikeVsRecentMax(30000, runs, asOf).hazardRatio).toBe(2.28);
  });

  it("ignores runs older than 30 days", () => {
    const old = [{ date: "2025-11-01", distanceM: 30000 }, ...runs];
    expect(sessionSpikeVsRecentMax(14000, old, asOf).band).toBe("small");
  });

  it("handles having no recent runs at all", () => {
    const r = sessionSpikeVsRecentMax(10000, [], asOf);
    expect(r.recentMaxM).toBeNull();
    expect(r.band).toBe("within");
  });
});

import { describe, expect, it } from "vitest";
import { personalRecords, type ActivityWithEfforts } from "../personalRecords";
import { paceShapeToPath, paceShapeColor, FLAT_PATH } from "../sparkline";

describe("personalRecords", () => {
  const history: ActivityWithEfforts[] = [
    { started_at: "2026-03-29T07:00:00Z", best_efforts: { "5k": 1350, "10k": 2880, half: 6440 } },
    { started_at: "2026-06-14T07:00:00Z", best_efforts: { "5k": 1308, "10k": 2900 } },
    { started_at: "2026-08-13T07:00:00Z", best_efforts: { "5k": 1400, "10k": 2832 } },
  ];

  it("takes the best across the whole history, not the most recent", () => {
    const prs = personalRecords(history);
    expect(prs.find((p) => p.key === "5k")?.time).toBe("21:48");
    expect(prs.find((p) => p.key === "10k")?.time).toBe("47:12");
  });

  it("remembers which run set each record", () => {
    const prs = personalRecords(history);
    expect(prs.find((p) => p.key === "5k")?.date).toBe("2026-06-14");
    expect(prs.find((p) => p.key === "10k")?.date).toBe("2026-08-13");
  });

  it("shows a dash for a distance never run — no marathon that never happened", () => {
    const prs = personalRecords(history);
    const marathon = prs.find((p) => p.key === "marathon");
    expect(marathon?.time).toBeNull();
    expect(marathon?.date).toBeNull();
  });

  it("does not estimate one distance from another", () => {
    // a 10 km time exists; the half and marathon rows must stay empty
    const prs = personalRecords([{ started_at: "2026-08-01T00:00:00Z", best_efforts: { "10k": 2832 } }]);
    expect(prs.find((p) => p.key === "half")?.time).toBeNull();
    expect(prs.find((p) => p.key === "marathon")?.time).toBeNull();
  });

  it("flags a record set recently as new", () => {
    const prs = personalRecords(history, "2026-08-01");
    expect(prs.find((p) => p.key === "10k")?.isNew).toBe(true);
    expect(prs.find((p) => p.key === "5k")?.isNew).toBe(false);
  });

  it("returns every row even with no history at all", () => {
    const prs = personalRecords([]);
    expect(prs).toHaveLength(4);
    for (const p of prs) expect(p.time).toBeNull();
  });

  it("ignores nonsense values rather than treating them as records", () => {
    const prs = personalRecords([
      { started_at: "2026-08-01T00:00:00Z", best_efforts: { "5k": 0 } },
      { started_at: "2026-08-02T00:00:00Z", best_efforts: { "5k": Number.NaN } },
      { started_at: "2026-08-03T00:00:00Z", best_efforts: { "5k": 1308 } },
    ]);
    expect(prs.find((p) => p.key === "5k")?.time).toBe("21:48");
  });
});

describe("paceShapeToPath", () => {
  it("falls back to a flat line when there is nothing to draw", () => {
    expect(paceShapeToPath(null)).toBe(FLAT_PATH);
    expect(paceShapeToPath([])).toBe(FLAT_PATH);
    expect(paceShapeToPath([300])).toBe(FLAT_PATH);
    expect(paceShapeToPath([300, 300, 300])).toBe(FLAT_PATH);
  });

  it("draws faster stretches higher in the box", () => {
    // second point is faster (smaller pace) so its y must be smaller
    const path = paceShapeToPath([330, 240]);
    const ys = [...path.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys[1]).toBeLessThan(ys[0]);
  });

  it("lifts the pen across a stop instead of inventing a slow section", () => {
    const path = paceShapeToPath([300, 320, null, 300, 290]);
    // two pen-downs means the line is broken, not bridged
    expect((path.match(/M/g) || []).length).toBe(2);
  });

  it("stays inside the 80x24 box the design uses", () => {
    const path = paceShapeToPath([200, 400, 250, 380, 210]);
    for (const m of path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(0);
      expect(Number(m[1])).toBeLessThanOrEqual(80);
      expect(Number(m[2])).toBeGreaterThanOrEqual(0);
      expect(Number(m[2])).toBeLessThanOrEqual(24);
    }
  });
});

describe("paceShapeColor", () => {
  it("warns when the run faded", () => {
    expect(paceShapeColor([280, 285, 290, 330, 340, 350])).toBe("var(--color-caution)");
  });

  it("stays neutral for an even run", () => {
    expect(paceShapeColor([300, 302, 298, 301, 299, 300])).toBe("var(--color-muted)");
  });

  it("stays neutral when there is too little to judge", () => {
    expect(paceShapeColor([300, 400])).toBe("var(--color-muted)");
  });
});

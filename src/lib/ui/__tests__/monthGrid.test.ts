import { describe, expect, it } from "vitest";
import { monthGrid, monthsOf } from "../monthGrid";

const day = (date: string, name = "Easy Run") => ({ date, name });

describe("monthGrid", () => {
  it("always returns whole weeks", () => {
    for (const m of ["2026-01", "2026-02", "2026-08", "2026-11"]) {
      const g = monthGrid(m, []);
      expect(g.cells.length % 7).toBe(0);
      expect(g.cells.length).toBe(g.rows * 7);
    }
  });

  it("starts every grid on a Sunday", () => {
    for (const m of ["2026-01", "2026-05", "2026-08", "2026-12"]) {
      const g = monthGrid(m, []);
      const d = new Date(g.cells[0].iso + "T00:00:00");
      expect(d.getDay()).toBe(0);
    }
  });

  it("holds every day of the month exactly once", () => {
    const g = monthGrid("2026-08", []);
    const inMonth = g.cells.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(new Set(inMonth.map((c) => c.iso)).size).toBe(31);
    expect(inMonth[0].dayOfMonth).toBe(1);
    expect(inMonth[30].dayOfMonth).toBe(31);
  });

  it("gets February right, leap year included", () => {
    expect(monthGrid("2026-02", []).cells.filter((c) => c.inMonth)).toHaveLength(28);
    expect(monthGrid("2028-02", []).cells.filter((c) => c.inMonth)).toHaveLength(29);
  });

  it("marks the borrowed days from either side as out of month", () => {
    const g = monthGrid("2026-08", []);
    // 1 Aug 2026 is a Saturday, so a Sunday-first grid leads in six days from July.
    expect(g.cells[0].inMonth).toBe(false);
    expect(g.cells[0].iso).toBe("2026-07-26");
    expect(g.cells[g.cells.length - 1].inMonth).toBe(false);
  });

  it("keeps the dates continuous across the whole grid", () => {
    const g = monthGrid("2026-03", []);
    for (let i = 1; i < g.cells.length; i++) {
      const prev = new Date(g.cells[i - 1].iso + "T00:00:00");
      const cur = new Date(g.cells[i].iso + "T00:00:00");
      expect((cur.getTime() - prev.getTime()) / 86_400_000).toBeCloseTo(1, 5);
    }
  });

  it("places a session on its own date and nowhere else", () => {
    const g = monthGrid("2026-08", [day("2026-08-14", "Long Run")]);
    const hit = g.cells.filter((c) => c.item !== null);
    expect(hit).toHaveLength(1);
    expect(hit[0].iso).toBe("2026-08-14");
    expect(hit[0].item?.name).toBe("Long Run");
  });

  it("shows a session that falls on a borrowed day, since the cell is a real date", () => {
    const g = monthGrid("2026-08", [day("2026-07-31", "Tempo Run")]);
    const hit = g.cells.find((c) => c.item !== null);
    expect(hit?.iso).toBe("2026-07-31");
    expect(hit?.inMonth).toBe(false);
  });

  it("ignores dates outside the grid entirely", () => {
    const g = monthGrid("2026-08", [day("2026-12-01")]);
    expect(g.cells.every((c) => c.item === null)).toBe(true);
  });

  it("survives a month with no sessions at all", () => {
    const g = monthGrid("2026-08", []);
    expect(g.cells.every((c) => c.item === null)).toBe(true);
  });

  it("does not shift a date across a month boundary", () => {
    // The bug this guards: parsing to a Date and reading getMonth() back.
    const g = monthGrid("2026-11", [day("2026-11-01"), day("2026-11-30")]);
    const hits = g.cells.filter((c) => c.item).map((c) => c.iso);
    expect(hits).toEqual(["2026-11-01", "2026-11-30"]);
  });
});

describe("monthsOf", () => {
  it("returns each month once, in order", () => {
    expect(monthsOf([day("2026-09-02"), day("2026-08-31"), day("2026-08-01")]))
      .toEqual(["2026-08", "2026-09"]);
  });

  it("returns nothing for nothing", () => {
    expect(monthsOf([])).toEqual([]);
  });
});

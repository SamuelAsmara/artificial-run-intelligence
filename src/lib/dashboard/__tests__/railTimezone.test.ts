import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runStreak, weeklyVolume } from "../rail";

/**
 * The rail's date handling, run in the timezone the app is actually for.
 *
 * These two bugs were invisible in UTC and unconditional in Israel, which is
 * exactly the shape of defect a test suite pinned to UTC will never catch. The
 * process timezone is set before the module under test does any date work.
 */

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "Asia/Jerusalem";
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const run = (date: string, km = 10) => ({ date, distanceM: km * 1000 });

describe("runStreak in Asia/Jerusalem", () => {
  it("counts today when the athlete ran today", () => {
    // 09:00 local. Under the old UTC date key this resolved to the 18th and
    // returned 2 for a three-day streak.
    const asOf = new Date(2026, 7, 19, 9, 0, 0);
    expect(runStreak([run("2026-08-17"), run("2026-08-18"), run("2026-08-19")], asOf)).toBe(3);
  });

  it("is right just after local midnight, when UTC is still yesterday", () => {
    const asOf = new Date(2026, 7, 19, 0, 30, 0);
    // No run yet today; yesterday and the day before count.
    expect(runStreak([run("2026-08-17"), run("2026-08-18")], asOf)).toBe(2);
  });

  it("still returns zero when the last run is too old", () => {
    const asOf = new Date(2026, 7, 19, 9, 0, 0);
    expect(runStreak([run("2026-08-10")], asOf)).toBe(0);
  });

  it("does not count a gap as continuous", () => {
    const asOf = new Date(2026, 7, 19, 9, 0, 0);
    expect(runStreak([run("2026-08-19"), run("2026-08-17"), run("2026-08-16")], asOf)).toBe(1);
  });
});

describe("weeklyVolume across a DST change", () => {
  /**
   * Israel ends DST in late October. A window ending in November therefore
   * spans the transition, and week arithmetic done in milliseconds lands a week
   * early for every bar before it.
   */
  it("keeps each run in its own calendar week", () => {
    const asOf = new Date(2026, 10, 18, 12, 0, 0); // Wed 18 Nov 2026
    // One run every Sunday for twelve weeks, distances 21 down to 10.
    const runs = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(2026, 7, 30); // Sun 30 Aug 2026
      d.setDate(d.getDate() + i * 7);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return run(iso, 21 - i);
    });

    const bars = weeklyVolume(runs, asOf);

    expect(bars).toHaveLength(12);
    // Every week has exactly its own run — no bar swallowed two, none left empty.
    expect(bars.map((b) => Math.round(b.km))).toEqual([21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10]);
    // And therefore nothing is reported as an interruption.
    expect(bars.filter((b) => b.interrupted)).toHaveLength(0);
  });

  it("still reports a genuine lay-off as interrupted", () => {
    const asOf = new Date(2026, 10, 18, 12, 0, 0);
    const runs = [run("2026-08-30", 20), run("2026-11-15", 10)];
    const bars = weeklyVolume(runs, asOf);
    expect(bars[0].km).toBeCloseTo(20, 5);
    expect(bars[11].km).toBeCloseTo(10, 5);
    // The weeks between the first run and the last are real interruptions.
    expect(bars.filter((b) => b.interrupted).length).toBeGreaterThan(8);
  });
});

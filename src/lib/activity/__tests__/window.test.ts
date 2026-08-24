import { describe, expect, it } from "vitest";
import { shiftIso, summariseRuns, withinDays, SUMMARY_DAYS } from "../window";

const TODAY = "2026-08-24";
const run = (date: string, km: number, sec: number, hr: number | null = null) =>
  ({ date, distanceKm: km, durationSec: sec, avgHr: hr });

describe("withinDays", () => {
  it("keeps the window inclusive of today and of the first day", () => {
    const rows = [run("2026-08-24", 5, 1500), run("2026-07-28", 5, 1500)];
    // 28 days back from 24 Aug is 28 July
    expect(withinDays(rows, SUMMARY_DAYS, TODAY)).toHaveLength(2);
  });

  it("drops anything older than the window", () => {
    const rows = [run("2026-07-27", 5, 1500)];
    expect(withinDays(rows, SUMMARY_DAYS, TODAY)).toHaveLength(0);
  });

  it("drops anything in the future", () => {
    expect(withinDays([run("2026-08-25", 5, 1500)], SUMMARY_DAYS, TODAY)).toHaveLength(0);
  });

  it("does not care how many rows it was handed", () => {
    const many = Array.from({ length: 200 }, (_, i) => run(shiftIso(TODAY, -i), 5, 1500));
    expect(withinDays(many, SUMMARY_DAYS, TODAY)).toHaveLength(28);
  });
});

describe("summariseRuns", () => {
  it("averages pace over the combined distance, not over the runs", () => {
    // 1 km at 4:00 and 1 km at 6:00 → 2 km in 600 s → 5:00
    const s = summariseRuns([run("2026-08-24", 1, 240), run("2026-08-23", 1, 360)]);
    expect(s.avgPaceSec).toBeCloseTo(300, 5);
  });

  it("gets the inverse right when the distances differ", () => {
    // 1 km at 4:00 (240 s) + 3 km at 6:00 (1080 s) = 4 km in 1320 s = 5:30
    const s = summariseRuns([run("2026-08-24", 1, 240), run("2026-08-23", 3, 1080)]);
    expect(s.avgPaceSec).toBeCloseTo(330, 5);
    // the naive mean of the two paces would be 5:00 — wrong by 30 s/km
    expect(s.avgPaceSec).not.toBeCloseTo(300, 1);
  });

  it("weights heart rate by duration, not by run", () => {
    // 20 runs of 40 min at 138, 4 runs of 120 min at 158
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => run(shiftIso(TODAY, -i), 8, 2400, 138)),
      ...Array.from({ length: 4 }, (_, i) => run(shiftIso(TODAY, -i), 24, 7200, 158)),
    ];
    const s = summariseRuns(rows);
    expect(s.avgHr).toBe(146);
    // the unweighted mean would report 141
    expect(s.avgHr).not.toBe(141);
  });

  it("leaves a strapless run out of the heart-rate average rather than scoring it zero", () => {
    const s = summariseRuns([run("2026-08-24", 5, 1500, 150), run("2026-08-23", 5, 1500, null)]);
    expect(s.avgHr).toBe(150);
  });

  it("reports no heart rate at all when nothing had a strap", () => {
    expect(summariseRuns([run("2026-08-24", 5, 1500)]).avgHr).toBeNull();
  });

  it("reports no pace rather than zero when nothing was run", () => {
    const s = summariseRuns([]);
    expect(s.avgPaceSec).toBeNull();
    expect(s.totalKm).toBe(0);
    expect(s.runs).toBe(0);
  });

  it("ignores a zero-distance row in the distance and pace, but still counts it", () => {
    const s = summariseRuns([run("2026-08-24", 0, 600), run("2026-08-23", 2, 600)]);
    expect(s.runs).toBe(2);
    expect(s.totalKm).toBe(2);
    expect(s.avgPaceSec).toBeCloseTo(300, 5);
  });

  it("ignores a non-finite heart rate instead of poisoning the sum", () => {
    const s = summariseRuns([run("2026-08-24", 5, 1500, Number.NaN), run("2026-08-23", 5, 1500, 150)]);
    expect(s.avgHr).toBe(150);
  });
});

describe("shiftIso", () => {
  it("steps by calendar days across a month boundary", () => {
    expect(shiftIso("2026-09-01", -1)).toBe("2026-08-31");
    expect(shiftIso("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("steps across a year boundary", () => {
    expect(shiftIso("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles February in a leap year", () => {
    expect(shiftIso("2028-02-28", 1)).toBe("2028-02-29");
  });
});

/*
 * The two other places the audit flagged, guarded here rather than in their own
 * files so the whole class of defect has one home to look in.
 */
describe("weighted means elsewhere", () => {
  it("climb is null when nothing measured it, and a number when something did", async () => {
    const { summarise } = await import("../metrics");
    const flat = (v: number, n: number) => Array.from({ length: n }, () => v);
    const streams = {
      n: 4,
      time: [0, 100, 200, 300],
      dist: [0, 250, 500, 750],
      vel: flat(2.5, 4),
      hr: flat(150, 4),
      cad: flat(170, 4),
      pow: flat(0, 4),
      alt: [Number.NaN, Number.NaN, Number.NaN, Number.NaN],
      moving: flat(100, 4),
      hasPower: false,
      hasCadence: true,
    };
    // No altitude channel at all: "we never looked", not "it was flat".
    expect(summarise(streams).climbM).toBeNull();

    // A real, genuinely flat run still reports zero.
    expect(summarise({ ...streams, alt: flat(100, 4) }).climbM).toBe(0);
  });
});

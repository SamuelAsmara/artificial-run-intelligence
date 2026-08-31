import { describe, expect, it } from "vitest";
import {
  buildHistory, buildNumbersTiles, driftBand, formBand, ratioBand, readinessBand, riegel, type NumbersLive,
} from "../numbers";

const LIVE: NumbersLive = {
  snapshot: { date: "2026-08-31", ctl: 47.2, atl: 39.1, tsb: 8.1, acwr: 1.08, readiness: 82 },
  weekAgo: { ctl: 44.9, atl: 41.3 },
  lastRun: { date: "2026-08-30", distanceM: 9600, durationS: 2960, avgHr: 151, avgPace: "5:08", driftPct: 2.4, load: 86, loadMethod: "hrss" },
  thresholds: { hrMax: 189, hrRest: 52, lthr: 170, measured: true, thresholdPaceSecPerKm: 262 },
  volume: { thisWeekKm: 42.3, lastWeekKm: 37.8, runsThisWeek: 5 },
  recovery: { date: "2026-08-31", sleepHours: 7.4, restingHr: 52, hrv: 68 },
  race: { label: "Half marathon", distanceM: 21097, targetSec: 5520, baseLabel: "10K", baseDistanceM: 10000, baseSec: 2832 },
};

const EMPTY: NumbersLive = {
  snapshot: null, weekAgo: null, lastRun: null, thresholds: null, volume: null, recovery: null, race: null,
};

describe("the Numbers board", () => {
  it("builds thirteen tiles, one per figure, in pipeline order", () => {
    const ids = buildNumbersTiles(LIVE).map((t) => t.id);
    expect(ids).toEqual(["hr", "pace", "volume", "recovery", "trimp", "ctl", "atl", "tsb", "acwr", "readiness", "gap", "drift", "riegel"]);
  });

  it("prints the athlete's own values, not placeholders", () => {
    const by = Object.fromEntries(buildNumbersTiles(LIVE).map((t) => [t.id, t]));
    expect(by.ctl.value).toBe("47");
    expect(by.tsb.value).toBe("+8");
    expect(by.acwr.value).toBe("1.08");
    expect(by.readiness.value).toBe("82");
    expect(by.hr.value).toBe("151");
    expect(by.volume.value).toBe("42");
    expect(by.drift.value).toBe("2.4");
  });

  it("substitutes the numbers into the arithmetic it explains", () => {
    const by = Object.fromEntries(buildNumbersTiles(LIVE).map((t) => [t.id, t]));
    expect(by.tsb.yours).toContain("47 − 39 = +8");
    expect(by.hr.yours).toContain("89% of threshold");     // 151 / 170
    expect(by.hr.status.label).toBe("Z2 · Endurance");
    expect(by.volume.status.label).toBe("+12% vs last week");
  });

  it("predicts the race with Riegel from the best effort on file", () => {
    const by = Object.fromEntries(buildNumbersTiles(LIVE).map((t) => [t.id, t]));
    const predicted = riegel(2832, 10000, 21097);
    expect(Math.round(predicted)).toBe(6248);                // 1:44:08
    expect(by.riegel.value).toBe("1:44:08");
    expect(by.riegel.status.label).toMatch(/off target/);
  });

  it("shows dashes and honest states when there is no data yet", () => {
    const tiles = buildNumbersTiles(EMPTY);
    expect(tiles).toHaveLength(13);
    const by = Object.fromEntries(tiles.map((t) => [t.id, t]));
    expect(by.readiness.value).toBe("—");
    expect(by.readiness.status.label).toBe("No data yet");
    expect(by.riegel.status.label).toBe("Set a goal race");
    // nothing throws and no tile prints NaN
    for (const t of tiles) expect(t.value).not.toMatch(/NaN/);
  });

  it("does not predict without a personal best", () => {
    const by = Object.fromEntries(
      buildNumbersTiles({ ...EMPTY, race: { label: "10K", distanceM: 10000, targetSec: null, baseLabel: "", baseDistanceM: 0, baseSec: 0 } })
        .map((t) => [t.id, t]),
    );
    expect(by.riegel.value).toBe("—");
    expect(by.riegel.status.label).toBe("Needs a personal best");
  });

  it("uses the product's own bands", () => {
    expect(formBand(8).label).toBe("Fresh");
    expect(formBand(-15).label).toBe("Loaded");
    expect(ratioBand(1.6).tone).toBe("negative");   // the 1.5 threshold the safety checker acts on
    expect(ratioBand(1.0).label).toBe("Usual level");
    expect(driftBand(2.4).tone).toBe("positive");
    expect(driftBand(9).tone).toBe("negative");
    expect(readinessBand(82).label).toBe("Ready to load");
    expect(readinessBand(35).label).toBe("Rest");
  });
});

describe("the band scales", () => {
  it("gives every measured tile a scale with the athlete marked on it", () => {
    const by = Object.fromEntries(buildNumbersTiles(LIVE).map((t) => [t.id, t]));
    for (const id of ["hr", "pace", "volume", "recovery", "trimp", "ctl", "atl", "tsb", "acwr", "readiness", "drift", "riegel"]) {
      const sc = by[id].scale;
      expect(sc, id).toBeDefined();
      expect(sc!.markers.length, id).toBeGreaterThan(0);
      for (const m of sc!.markers) {
        expect(m.value, `${id} marker in range`).toBeGreaterThanOrEqual(sc!.min);
        expect(m.value, `${id} marker in range`).toBeLessThanOrEqual(sc!.max);
      }
      // segments tile the axis with no gaps
      const segs = sc!.segments;
      expect(segs[0].from).toBe(sc!.min);
      expect(segs[segs.length - 1].to).toBe(sc!.max);
      for (let i = 1; i < segs.length; i++) expect(segs[i].from).toBe(segs[i - 1].to);
    }
  });

  it("puts fitness and fatigue on one bar, and the prediction against the target", () => {
    const by = Object.fromEntries(buildNumbersTiles(LIVE).map((t) => [t.id, t]));
    expect(by.ctl.scale!.markers.map((m) => m.label)).toEqual(["fitness 47", "fatigue 39"]);
    expect(by.riegel.scale!.markers[1].label).toBe("target · 1:32:00");
    expect(by.pace.scale!.markers[0].value).toBeCloseTo(308 / 262, 3);
  });

  it("leaves the marker off when there is nothing to mark", () => {
    const by = Object.fromEntries(buildNumbersTiles(EMPTY).map((t) => [t.id, t]));
    expect(by.readiness.scale!.markers).toEqual([]);
    expect(by.riegel.scale).toBeUndefined();
  });
});

describe("buildHistory", () => {
  const day = (n: number) => { const d = new Date("2026-08-31T00:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const series: NonNullable<NumbersLive["series"]> = {
    today: "2026-08-31",
    snapshots: Array.from({ length: 90 }, (_, i) => ({ date: day(89 - i), ctl: 30 + i / 10, atl: 28 + (i % 7), tsb: 2 - (i % 7), acwr: 1 + (i % 5) / 10, readiness: 60 + (i % 30) })),
    runs: Array.from({ length: 120 }, (_, i) => ({ date: day(360 - i * 3), avgHr: 150, paceSecPerKm: 310 - i / 4, distanceM: 8000, load: 60, driftPct: 3 })),
    nights: Array.from({ length: 200 }, (_, i) => ({ date: day(199 - i), sleepHours: 7 })),
  };

  it("gives snapshot metrics three ranges and run metrics four", () => {
    expect(buildHistory("ctl", series)!.ranges.map((r) => r.key)).toEqual(["w", "m", "3m"]);
    expect(buildHistory("readiness", series)!.ranges.map((r) => r.key)).toEqual(["w", "m", "3m"]);
    expect(buildHistory("hr", series)!.ranges.map((r) => r.key)).toEqual(["w", "m", "3m", "y"]);
    expect(buildHistory("recovery", series)!.ranges.map((r) => r.key)).toEqual(["w", "m", "3m", "y"]);
  });

  it("cuts each range at its own horizon", () => {
    const h = buildHistory("ctl", series)!;
    expect(h.ranges.find((r) => r.key === "w")!.points).toHaveLength(8);
    expect(h.ranges.find((r) => r.key === "3m")!.points).toHaveLength(90);
    const hr = buildHistory("hr", series)!;
    for (const r of hr.ranges) for (const p of r.points) expect(p.d >= day(365)).toBe(true);
  });

  it("draws pace the other way up and sums volume by week", () => {
    expect(buildHistory("pace", series)!.lowerIsBetter).toBe(true);
    const v = buildHistory("volume", series)!;
    expect(v.kind).toBe("bars");
    expect(v.ranges.find((r) => r.key === "w")!.points).toHaveLength(7);
    const month = v.ranges.find((r) => r.key === "m")!.points;
    expect(month.every((p) => new Date(`${p.d}T00:00:00Z`).getUTCDay() === 0)).toBe(true);
  });

  it("drops a range with fewer than two points and gives GAP and Riegel none", () => {
    const thin = { ...series, runs: series.runs.slice(0, 2) };  // two runs, both about a year ago
    expect(buildHistory("hr", thin)!.ranges.map((r) => r.key)).toEqual(["y"]);
    expect(buildHistory("hr", { ...series, runs: series.runs.slice(0, 1) })).toBeUndefined();
    expect(buildHistory("gap", series)).toBeUndefined();
    expect(buildHistory("riegel", series)).toBeUndefined();
  });

  it("attaches history to the tiles only when a series is given", () => {
    const withS = buildNumbersTiles({ ...LIVE, series });
    expect(withS.find((t) => t.id === "tsb")!.history).toBeDefined();
    expect(buildNumbersTiles(LIVE).find((t) => t.id === "tsb")!.history).toBeUndefined();
  });
});

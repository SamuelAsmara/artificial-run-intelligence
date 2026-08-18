import { describe, expect, it } from "vitest";
import {
  banisterTrimp, hrss, rTSS, sessionLoad, toDailySeries,
  type LoadProfile,
} from "../load";

const P: LoadProfile = {
  hrMax: 190, hrRest: 50, lthr: 168, sex: "male",
  thresholdSpeedMps: 1000 / 300, // 5:00/km
  thresholdsMeasured: true,
};

describe("banisterTrimp", () => {
  it("scales with duration", () => {
    const a = banisterTrimp(1800, 150, P);
    const b = banisterTrimp(3600, 150, P);
    expect(b).toBeCloseTo(a * 2, 5);
  });

  it("rises steeply with intensity — the function is convex", () => {
    const easy = banisterTrimp(3600, 130, P);
    const mid = banisterTrimp(3600, 150, P);
    const hard = banisterTrimp(3600, 170, P);
    expect(mid - easy).toBeLessThan(hard - mid);
  });

  it("returns 0 for nonsense input rather than NaN", () => {
    expect(banisterTrimp(0, 150, P)).toBe(0);
    expect(banisterTrimp(3600, 150, { ...P, hrMax: 50, hrRest: 50 })).toBe(0);
  });
});

describe("hrss", () => {
  it("scores exactly 100 for one hour at threshold", () => {
    expect(hrss(3600, P.lthr, P)).toBeCloseTo(100, 6);
  });

  it("is far less sensitive to HRmax error than raw TRIMP", () => {
    const spread = (f: (p: LoadProfile) => number) => {
      const vals = [180, 190, 200].map((hrMax) => f({ ...P, hrMax }));
      return (Math.max(...vals) - Math.min(...vals)) / (vals[1] || 1);
    };
    const trimpSpread = spread((p) => banisterTrimp(2640, 152, p));
    const hrssSpread = spread((p) => hrss(2640, 152, p));
    expect(hrssSpread).toBeLessThan(trimpSpread / 3);
  });
});

describe("rTSS", () => {
  it("scores 100 for one hour at threshold speed", () => {
    expect(rTSS(3600, P.thresholdSpeedMps, P.thresholdSpeedMps)).toBeCloseTo(100, 6);
  });

  it("is quadratic in intensity", () => {
    // twice the speed for the same time is four times the load
    const base = rTSS(3600, P.thresholdSpeedMps, P.thresholdSpeedMps);
    const fast = rTSS(3600, P.thresholdSpeedMps * 2, P.thresholdSpeedMps);
    expect(fast).toBeCloseTo(base * 4, 4);
  });
});

describe("sessionLoad", () => {
  it("prefers heart rate when present", () => {
    const r = sessionLoad({ durationSec: 2640, distanceM: 8000, avgHr: 152 }, P);
    expect(r.method).toBe("hrss");
    expect(r.confidence).toBe("high");
    expect(r.load).toBeGreaterThan(0);
  });

  it("falls back to pace when heart rate is missing", () => {
    const r = sessionLoad({ durationSec: 2640, distanceM: 8000, avgHr: null }, P);
    expect(r.method).toBe("rtss");
    expect(r.confidence).toBe("medium");
  });

  it("rejects an implausible heart rate rather than trusting it", () => {
    const r = sessionLoad({ durationSec: 2640, distanceM: 8000, avgHr: 240 }, P);
    expect(r.method).toBe("rtss");
  });

  it("returns zero with low confidence when nothing is usable", () => {
    const r = sessionLoad({ durationSec: 0, distanceM: 0, avgHr: null }, P);
    expect(r).toEqual({ load: 0, method: "none", confidence: "low" });
  });

  it("marks confidence medium while thresholds are only seeded", () => {
    const r = sessionLoad(
      { durationSec: 2640, distanceM: 8000, avgHr: 152 },
      { ...P, thresholdsMeasured: false },
    );
    expect(r.confidence).toBe("medium");
  });
});

describe("toDailySeries", () => {
  it("fills rest days with zero — the classic PMC bug", () => {
    const s = toDailySeries(
      [{ date: "2026-08-01", load: 50 }, { date: "2026-08-04", load: 70 }],
      "2026-08-01",
      "2026-08-05",
    );
    expect(s).toHaveLength(5);
    expect(s.map((d) => d.load)).toEqual([50, 0, 0, 70, 0]);
  });

  it("sums two runs on the same day", () => {
    const s = toDailySeries(
      [{ date: "2026-08-01", load: 30 }, { date: "2026-08-01", load: 25 }],
      "2026-08-01",
      "2026-08-01",
    );
    expect(s[0].load).toBe(55);
  });
});

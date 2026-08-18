import { describe, expect, it } from "vitest";
import { toDailySeries } from "../load";
import { ATL_TAU, computePmc, CTL_TAU, formZone, rampVerdict, seedFromHistory } from "../pmc";

const steady = (days: number, load: number) =>
  Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    load,
  }));

describe("computePmc", () => {
  it("converges to the mean daily load", () => {
    const out = computePmc(steady(400, 60));
    expect(out[out.length - 1].ctl).toBeCloseTo(60, 1);
    expect(out[out.length - 1].atl).toBeCloseTo(60, 1);
  });

  it("moves fatigue much faster than fitness", () => {
    const out = computePmc(steady(30, 100));
    expect(out[29].atl).toBeGreaterThan(out[29].ctl);
  });

  it("uses yesterday's values for form, so today's session doesn't tank it", () => {
    const out = computePmc(steady(3, 100));
    // first day's form is computed before any load has landed
    expect(out[0].tsb).toBe(0);
    expect(out[1].tsb).toBeCloseTo(out[0].ctl - out[0].atl, 10);
  });

  it("decays on rest days — requires a gap-filled series", () => {
    const withRest = toDailySeries(
      [{ date: "2026-01-01", load: 300 }],
      "2026-01-01",
      "2026-01-31",
    );
    const out = computePmc(withRest);
    const peak = out[0].atl;
    expect(out[30].atl).toBeLessThan(peak * 0.05);
  });

  it("inflates without gap-fill — documents why the fill matters", () => {
    const trainingDaysOnly = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-01-${String(i * 3 + 1).padStart(2, "0")}`,
      load: 100,
    }));
    const wrong = computePmc(trainingDaysOnly);
    const right = computePmc(toDailySeries(trainingDaysOnly, "2026-01-01", "2026-01-28"));
    expect(wrong[wrong.length - 1].ctl).toBeGreaterThan(right[right.length - 1].ctl);
  });

  it("uses the exact exponential, not TrainingPeaks' 1/tau approximation", () => {
    const out = computePmc([{ date: "2026-01-01", load: 100 }]);
    expect(out[0].atl).toBeCloseTo(100 * (1 - Math.exp(-1 / ATL_TAU)), 9);
    expect(out[0].ctl).toBeCloseTo(100 * (1 - Math.exp(-1 / CTL_TAU)), 9);
    // and that this differs meaningfully from the published approximation
    expect(Math.abs(out[0].atl - 100 / ATL_TAU)).toBeGreaterThan(0.5);
  });

  it("reports a positive ramp rate while fitness is building", () => {
    const out = computePmc(steady(30, 80));
    expect(out[29].rampRate).toBeGreaterThan(0);
  });
});

describe("seedFromHistory", () => {
  it("returns the mean daily load", () => {
    expect(seedFromHistory(steady(10, 42))).toBeCloseTo(42, 10);
  });
  it("handles an empty series", () => {
    expect(seedFromHistory([])).toBe(0);
  });
});

describe("interpretation bands", () => {
  it("maps form to the documented zones", () => {
    expect(formZone(-40)).toBe("high-risk");
    expect(formZone(-20)).toBe("optimal");
    expect(formZone(0)).toBe("grey");
    expect(formZone(15)).toBe("fresh");
    expect(formZone(30)).toBe("transition");
  });

  it("maps ramp rate to a verdict", () => {
    expect(rampVerdict(1)).toBe("maintaining");
    expect(rampVerdict(6)).toBe("productive");
    expect(rampVerdict(12)).toBe("aggressive");
  });
});

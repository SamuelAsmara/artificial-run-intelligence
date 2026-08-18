import { describe, expect, it } from "vitest";
import {
  cardiacDriftSubscore, computeReadiness, formSubscore, hrvSubscore,
  loadRatioSubscore, sleepSubscore, WEIGHTS_LOAD_ONLY, WEIGHTS_WITH_RECOVERY,
} from "../readiness";

const pmc = (tsb: number) => ({ ctl: 50, atl: 50 - tsb, tsb });

describe("subscores", () => {
  it("peaks form when slightly fresh, not maximally fresh", () => {
    expect(formSubscore(10)).toBe(100);
    expect(formSubscore(40)).toBeLessThan(100); // detrained
    expect(formSubscore(-35)).toBeLessThan(40); // heavily loaded
  });

  it("penalises load ratio in both directions", () => {
    expect(loadRatioSubscore(1.0)).toBe(100);
    expect(loadRatioSubscore(1.8)).toBeLessThan(50);
    expect(loadRatioSubscore(0.3)).toBeLessThan(60);
    expect(loadRatioSubscore(null)).toBeNull();
  });

  it("treats low cardiac drift as good", () => {
    expect(cardiacDriftSubscore(2)).toBe(100);
    expect(cardiacDriftSubscore(12)).toBe(0);
    expect(cardiacDriftSubscore(null)).toBeNull();
  });

  it("anchors sleep at 8 hours", () => {
    expect(sleepSubscore(8)).toBe(100);
    expect(sleepSubscore(4)).toBe(20);
    expect(sleepSubscore(undefined)).toBeNull();
  });

  it("scores HRV against the athlete's own baseline", () => {
    expect(hrvSubscore(100)).toBe(100);
    expect(hrvSubscore(70)).toBe(0);
    expect(hrvSubscore(null)).toBeNull();
  });
});

describe("computeReadiness", () => {
  it("labels by the thresholds the design defines", () => {
    const fresh = computeReadiness({ pmc: pmc(10), loadRatio: 1.0, cardiacDriftPct: 2 });
    expect(fresh.score).toBeGreaterThanOrEqual(70);
    expect(fresh.label).toBe("Ready to load");

    const wrecked = computeReadiness({ pmc: pmc(-45), loadRatio: 2.0, cardiacDriftPct: 11 });
    expect(wrecked.label).toBe("Rest day");
  });

  it("uses load-only weights when no wellness data is present", () => {
    const r = computeReadiness({ pmc: pmc(5), loadRatio: 1.0, cardiacDriftPct: 2 });
    expect(r.contributions.map((c) => c.component).sort())
      .toEqual(["cardiacDrift", "form", "loadRatio"]);
    expect(r.basis).toMatch(/training load only/);
  });

  it("switches weights and wording once recovery data arrives", () => {
    const r = computeReadiness({
      pmc: pmc(5), loadRatio: 1.0, cardiacDriftPct: 2,
      sleepHours: 7.5, hrvVsBaselinePct: 95,
    });
    expect(r.contributions.map((c) => c.component)).toContain("sleep");
    expect(r.basis).toMatch(/overnight recovery/);
  });

  it("redistributes weight instead of penalising missing components", () => {
    const full = computeReadiness({ pmc: pmc(10), loadRatio: 1.0, cardiacDriftPct: 2 });
    const partial = computeReadiness({ pmc: pmc(10), loadRatio: null, cardiacDriftPct: null });
    expect(partial.contributions).toHaveLength(1);
    expect(partial.score).toBe(100);
    expect(full.score).toBe(100);
  });

  it("returns a neutral score when there is nothing to go on", () => {
    const r = computeReadiness({
      pmc: { ctl: 0, atl: 0, tsb: NaN }, loadRatio: null, cardiacDriftPct: null,
    });
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it("publishes weights that sum to 1", () => {
    const sum = (w: Record<string, number>) =>
      Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum(WEIGHTS_LOAD_ONLY)).toBeCloseTo(1, 10);
    expect(sum(WEIGHTS_WITH_RECOVERY)).toBeCloseTo(1, 10);
  });
});

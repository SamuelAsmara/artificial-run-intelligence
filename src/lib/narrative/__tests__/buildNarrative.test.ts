import { describe, expect, it } from "vitest";
import { buildNarrative, type NarrativeInput } from "../buildNarrative";
import { computeReadiness } from "@/lib/planning/readiness";

/** Builds a full input from a partial one, so each test states only what it cares about. */
function make(overrides: Partial<NarrativeInput> = {}): NarrativeInput {
  const pmc = { ctl: 40, atl: 35, tsb: 5, rampRate: 1, ...(overrides.pmc ?? {}) };
  const loadRatio = overrides.loadRatio !== undefined ? overrides.loadRatio : 1.0;
  const readiness =
    overrides.readiness ??
    computeReadiness({
      pmc,
      loadRatio,
      cardiacDriftPct: null,
      sleepHours: overrides.sleepHours ?? null,
      hrvVsBaselinePct: overrides.hrvVsBaselinePct ?? null,
    });
  return { ...overrides, pmc, loadRatio, readiness };
}

describe("the hero sentence", () => {
  it("stays inside the space the design budgets for it", () => {
    // The Claude Design hero holds about two lines at 16px in a 640px column.
    // The reference copy is 160 characters; 260 is the practical ceiling.
    const cases = [
      make({ pmc: { ctl: 34, atl: 30, tsb: 0.6, rampRate: -1.5 }, loadRatio: 0.67, sleepHours: 5.9, hrvVsBaselinePct: 103, restingHr: 49, longestRecentM: 10300 }),
      make({ pmc: { ctl: 70, atl: 95, tsb: -35, rampRate: 9 }, loadRatio: 1.6 }),
      make({ pmc: { ctl: 20, atl: 8, tsb: 30, rampRate: -6 }, loadRatio: 0.4 }),
      make({ pmc: { ctl: 50, atl: 45, tsb: 10, rampRate: 5 }, loadRatio: 1.05, sleepHours: 8.2 }),
    ];
    for (const c of cases) {
      expect(buildNarrative(c).body.length).toBeLessThanOrEqual(260);
    }
  });

  it("always ends with a recommendation", () => {
    const n = buildNarrative(make({ loadRatio: 1.0 }));
    expect(n.body).toMatch(/today\.?$/i);
  });

  it("leads with what is unusual rather than with context", () => {
    const n = buildNarrative(make({ loadRatio: 0.6 }));
    expect(n.body).toMatch(/winding down/);
    expect(n.body).not.toMatch(/^You're neither/);
  });

  it("falls back to context when nothing stands out", () => {
    const n = buildNarrative(make({ pmc: { ctl: 40, atl: 36, tsb: 4, rampRate: 1 }, loadRatio: 1.0 }));
    expect(n.body).toMatch(/form is/);
  });
});

describe("what stands out", () => {
  it("names the shortfall when load has dropped below the athlete's normal", () => {
    const n = buildNarrative(make({ loadRatio: 0.67 }));
    expect(n.full).toContain("33% below your usual four-week level");
  });

  it("names the climb when load has jumped", () => {
    const n = buildNarrative(make({ loadRatio: 1.45 }));
    expect(n.full).toContain("45% above your usual four-week level");
  });

  it("says nothing about load balance when there isn't enough history", () => {
    const n = buildNarrative(make({ loadRatio: null }));
    expect(n.full).not.toMatch(/four-week level/);
  });

  it("flags fitness falling quickly", () => {
    const n = buildNarrative(make({ pmc: { ctl: 30, atl: 20, tsb: 10, rampRate: -5 }, loadRatio: 1.0 }));
    expect(n.full).toMatch(/falling at 5 points a week/);
  });
});

describe("the recovery sentence", () => {
  it("separates a weak input from a weak body", () => {
    // Sleeping badly once with a resting heart rate of 49 is not the same as
    // being unrecovered, and the text must not imply that it is.
    const n = buildNarrative(
      make({ loadRatio: 1.0, sleepHours: 5.5, hrvVsBaselinePct: 104, restingHr: 49 }),
    );
    expect(n.limiter).toBe("sleep");
    expect(n.full).toContain("Recovery capacity isn't the problem");
    expect(n.full).toContain("resting heart rate is 49");
  });

  it("is omitted entirely when no wellness source is connected", () => {
    const n = buildNarrative(make({ loadRatio: 1.0 }));
    expect(n.full).not.toMatch(/slept|heart-rate variability/i);
  });

  it("calls out heart-rate variability when that is the weak link", () => {
    const n = buildNarrative(
      make({ loadRatio: 1.0, sleepHours: 8.5, hrvVsBaselinePct: 74 }),
    );
    expect(n.limiter).toBe("hrv");
    expect(n.full).toMatch(/74% of your baseline/);
  });
});

describe("the limiter", () => {
  it("picks the component that cost the most points, not the lowest score", () => {
    // sleep 58 at 24% loses 10.1; hrv 40 at 12% loses only 7.2
    const n = buildNarrative(
      make({ loadRatio: 1.0, sleepHours: 5.9, hrvVsBaselinePct: 82 }),
    );
    expect(n.limiter).toBe("sleep");
  });

  it("is null when everything scored well", () => {
    const n = buildNarrative(
      make({ pmc: { ctl: 50, atl: 40, tsb: 10, rampRate: 2 }, loadRatio: 1.0, sleepHours: 8.5, hrvVsBaselinePct: 105 }),
    );
    expect(n.limiter).toBeNull();
  });
});

describe("the verdict", () => {
  it("tells a depleted athlete to rest", () => {
    const readiness = { score: 30, label: "Rest day" as const, contributions: [] };
    const n = buildNarrative(make({ readiness, pmc: { ctl: 60, atl: 100, tsb: -40, rampRate: 8 }, loadRatio: 1.5 }));
    expect(n.body).toMatch(/rest/i);
    expect(n.tone).toBe("negative");
  });

  it("tells an under-loaded but ready athlete they have room", () => {
    const n = buildNarrative(make({ pmc: { ctl: 34, atl: 30, tsb: 0.6, rampRate: -1.5 }, loadRatio: 0.67 }));
    expect(n.headline).toBe("Ready to load");
    expect(n.body).toMatch(/room to take real work on/);
  });
});

describe("the reasoning panel", () => {
  it("has one line per component that fed the score", () => {
    const input = make({ loadRatio: 0.67, sleepHours: 5.9, hrvVsBaselinePct: 103 });
    const n = buildNarrative(input);
    expect(n.reasoning.map((r) => r.component)).toEqual(
      input.readiness.contributions.map((c) => c.component),
    );
  });

  it("shows the reading, the score and the weight for each", () => {
    const n = buildNarrative(make({ loadRatio: 0.67, sleepHours: 5.9, hrvVsBaselinePct: 103 }));
    const sleep = n.reasoning.find((r) => r.component === "sleep");
    expect(sleep?.reading).toBe("5.9 hours");
    expect(sleep?.subscore).toBe(58);
    expect(sleep?.weightPct).toBeGreaterThan(0);
    expect(sleep?.note.length).toBeGreaterThan(20);
  });

  it("weights add up to roughly 100 percent", () => {
    const n = buildNarrative(make({ loadRatio: 0.9, sleepHours: 7, hrvVsBaselinePct: 100 }));
    const total = n.reasoning.reduce((s, r) => s + r.weightPct, 0);
    expect(total).toBeGreaterThanOrEqual(98);
    expect(total).toBeLessThanOrEqual(102);
  });
});

describe("determinism", () => {
  it("returns identical text for identical input", () => {
    const input = make({ loadRatio: 0.67, sleepHours: 5.9, hrvVsBaselinePct: 103, restingHr: 49 });
    expect(buildNarrative(input)).toEqual(buildNarrative(input));
  });

  it("never leaves a placeholder or a NaN in the output", () => {
    const awkward = [
      make({ loadRatio: null, pmc: { ctl: 0, atl: 0, tsb: 0, rampRate: 0 } }),
      make({ loadRatio: 0, pmc: { ctl: 0.04, atl: 0.02, tsb: 0.02, rampRate: 0 } }),
      make({ loadRatio: 3, pmc: { ctl: 120, atl: 200, tsb: -80, rampRate: 20 }, sleepHours: 0 }),
    ];
    for (const c of awkward) {
      const n = buildNarrative(c);
      expect(n.full).not.toMatch(/NaN|undefined|null|\{\{/);
      expect(n.body.length).toBeGreaterThan(10);
    }
  });
});

import { describe, expect, it } from "vitest";
import { generatePlan, RaceTooSoonError } from "../generatePlan";

// Test plan §1 + §6: generatePlan — the right number of weeks, four phases in
// sensible proportion, and an explicit error (not a crash) when the race is too close.

const TODAY = new Date("2026-08-06");

describe("generatePlan", () => {
  it("splits a marathon plan into four phases that cover every week in order", () => {
    const raceDate = new Date("2026-12-06"); // ~17 weeks ahead
    const plan = generatePlan("full", raceDate, TODAY);

    expect(plan.phases.base.startWeek).toBe(1);
    expect(plan.phases.taper.endWeek).toBe(plan.totalWeeks);
    expect(plan.phases.build.startWeek).toBe(plan.phases.base.endWeek + 1);
    expect(plan.phases.peak.startWeek).toBe(plan.phases.build.endWeek + 1);
    expect(plan.phases.taper.startWeek).toBe(plan.phases.peak.endWeek + 1);
  });

  it("generates sessions for every week of the plan", () => {
    const raceDate = new Date("2026-10-01"); // ~8 weeks
    const plan = generatePlan("10k", raceDate, TODAY);
    const weeksWithWorkouts = new Set(plan.workouts.map((w) => w.weekNumber));
    expect(weeksWithWorkouts.size).toBe(plan.totalWeeks);
  });

  it("keeps the taper shorter than build/peak in a long plan (10–20% of the period)", () => {
    const raceDate = new Date("2027-01-10"); // a long plan
    const plan = generatePlan("full", raceDate, TODAY);
    const taperLength = plan.phases.taper.endWeek - plan.phases.taper.startWeek + 1;
    expect(taperLength / plan.totalWeeks).toBeLessThanOrEqual(0.25);
  });

  it("throws RaceTooSoonError instead of building a nonsensical plan when the race is too close", () => {
    const tomorrow = new Date("2026-08-07");
    expect(() => generatePlan("5k", tomorrow, TODAY)).toThrow(RaceTooSoonError);
  });
});

import { describe, expect, it } from "vitest";
import { decideAdjustments, highDriftRate, type WorkoutForAdjustment } from "../adjustPlan";

import type { DailyLoad } from "../acwr";

// Test plan §1: adjustPlan — reduces the coming week when ACWR is above 1.5,
// and recommends shifting the build week when more than one session was missed.

/** A fixed date, so the test does not age out by itself. */
const FIXED_TODAY = "2026-08-06";

function highLoadDailyLoads(): DailyLoad[] {
  const asOf = new Date(FIXED_TODAY);
  const loads: DailyLoad[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(asOf);
    d.setDate(d.getDate() - i);
    loads.push({ date: d.toISOString().slice(0, 10), load: i < 7 ? 3000 : 500 });
  }
  return loads;
}

const plannedWorkout: WorkoutForAdjustment = {
  id: "w1",
  weekNumber: 5,
  status: "planned",
  plannedDistance: 5000,
};

describe("decideAdjustments", () => {
  it("reduces intensity when ACWR is above 1.5", () => {
    const decisions = decideAdjustments([plannedWorkout], highLoadDailyLoads(), 0, new Date(FIXED_TODAY));
    expect(decisions[0].action).toBe("reduce_intensity");
    expect(decisions[0].reductionFactor).toBeLessThan(1);
  });

  it("recommends shifting the week when more than one session was missed (no catching up in one go)", () => {
    const workouts: WorkoutForAdjustment[] = [
      { id: "m1", weekNumber: 3, status: "missed", plannedDistance: 5000 },
      { id: "m2", weekNumber: 3, status: "missed", plannedDistance: 5000 },
      { id: "w2", weekNumber: 3, status: "planned", plannedDistance: 5000 },
    ];
    const decisions = decideAdjustments(workouts, [], 0);
    const forPlanned = decisions.find((d) => d.workoutId === "w2");
    expect(forPlanned?.action).toBe("shift_week");
  });

  it("leaves completed, missed and adjusted sessions alone", () => {
    const workouts: WorkoutForAdjustment[] = [
      { id: "c1", weekNumber: 1, status: "completed", plannedDistance: 5000 },
    ];
    const decisions = decideAdjustments(workouts, [], 0);
    expect(decisions[0].action).toBe("none");
  });

  it("changes nothing when load is steady and nothing was missed", () => {
    const asOf = new Date(FIXED_TODAY);
    const stableLoads: DailyLoad[] = Array.from({ length: 28 }, (_, i) => {
      const d = new Date(asOf);
      d.setDate(d.getDate() - i);
      return { date: d.toISOString().slice(0, 10), load: 1000 };
    });
    const decisions = decideAdjustments([plannedWorkout], stableLoads, 0, new Date(FIXED_TODAY));
    expect(decisions[0].action).toBe("none");
  });
});

describe("highDriftRate", () => {
  it("is the share of scored runs above the drift threshold", () => {
    expect(highDriftRate([2, 7, 8, 1])).toBe(0.5);
  });

  it("ignores runs without a drift figure", () => {
    expect(highDriftRate([null, undefined, 9, 9, 1])).toBeCloseTo(2 / 3);
  });

  it("needs at least three scored runs before it calls a pattern", () => {
    expect(highDriftRate([9, 9])).toBe(0);
  });

  it("reduces the coming week when the rate crosses the threshold", () => {
    const decisions = decideAdjustments([plannedWorkout], [], 0.5, new Date(FIXED_TODAY));
    expect(decisions[0].action).toBe("reduce_intensity");
    expect(decisions[0].reason).toMatch(/cardiac drift/);
  });
});

import { describe, expect, it } from "vitest";
import { decideAdjustments, type WorkoutForAdjustment } from "../adjustPlan";
import type { DailyLoad } from "../acwr";

/**
 * The two failures migration 0014 exists to prevent.
 *
 * 1. A coach sets Thursday to 18 km at 20:00 and finds 14.4 km there in the
 *    morning, because `updateWorkout` left the status at 'planned' — exactly
 *    the state the adjustment job hunts for.
 * 2. ACWR touches 1.6, the coming week is cut to 80%, ACWR is back to 1.05 two
 *    days later, and the sessions stay reduced for ever with no marker and no
 *    explanation.
 */

const TODAY = "2026-08-06";

/** Twenty-eight days ending today, the last seven of them six times as hard. */
function spikedLoad(): DailyLoad[] {
  const asOf = new Date(TODAY);
  return Array.from({ length: 28 }, (_, i) => {
    const d = new Date(asOf);
    d.setDate(d.getDate() - i);
    return { date: d.toISOString().slice(0, 10), load: i < 7 ? 3000 : 500 };
  });
}

/** The same four weeks, run evenly — nothing for the engine to react to. */
function steadyLoad(): DailyLoad[] {
  const asOf = new Date(TODAY);
  return Array.from({ length: 28 }, (_, i) => {
    const d = new Date(asOf);
    d.setDate(d.getDate() - i);
    return { date: d.toISOString().slice(0, 10), load: 800 };
  });
}

const decide = (w: WorkoutForAdjustment[], loads: DailyLoad[]) =>
  decideAdjustments(w, loads, 0, new Date(TODAY));

describe("the engine does not overrule a person", () => {
  const coachSet: WorkoutForAdjustment = {
    id: "w1",
    weekNumber: 5,
    status: "planned",
    plannedDistance: 18_000,
    origin: "coach",
  };

  it("leaves a session the coach set alone, even under a load spike", () => {
    const [decision] = decide([coachSet], spikedLoad());
    expect(decision.action).toBe("none");
  });

  it("leaves a session the athlete set alone", () => {
    const [decision] = decide([{ ...coachSet, origin: "athlete" }], spikedLoad());
    expect(decision.action).toBe("none");
  });

  it("still adjusts what it generated itself", () => {
    const [decision] = decide([{ ...coachSet, origin: "generated" }], spikedLoad());
    expect(decision.action).toBe("reduce_intensity");
  });

  it("treats a row with no origin as generated, so existing plans keep working", () => {
    const noOrigin = { ...coachSet };
    delete noOrigin.origin;
    const [decision] = decide([noOrigin], spikedLoad());
    expect(decision.action).toBe("reduce_intensity");
  });
});

describe("an adjustment is undone when its reason passes", () => {
  const adjusted: WorkoutForAdjustment = {
    id: "w2",
    weekNumber: 5,
    status: "adjusted",
    plannedDistance: 8_000,
    plannedDistanceOriginal: 10_000,
    origin: "generated",
  };

  it("restores the original distance once the load is back in range", () => {
    const [decision] = decide([adjusted], steadyLoad());
    expect(decision.action).toBe("restore");
  });

  it("holds the reduction while the load is still high", () => {
    const [decision] = decide([adjusted], spikedLoad());
    expect(decision.action).toBe("none");
  });

  it("does not deepen a reduction that is already in force", () => {
    // The whole point of the original 'skip anything not planned' rule: without
    // it, 80% of 80% of 80% is a session a third of what the plan called for.
    const [decision] = decide([adjusted], spikedLoad());
    expect(decision.action).not.toBe("reduce_intensity");
  });

  it("leaves an adjusted session with no recorded original alone", () => {
    // Rows written before migration 0014 have nothing to restore to. Guessing
    // one would invent a number.
    const [decision] = decide(
      [{ ...adjusted, plannedDistanceOriginal: null }],
      steadyLoad(),
    );
    expect(decision.action).toBe("none");
  });
});

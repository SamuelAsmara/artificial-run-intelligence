import { describe, expect, it } from "vitest";
import { decideAdjustments, type WorkoutForAdjustment } from "../adjustPlan";
import type { DailyLoad } from "../acwr";

// מסמך אפיון בדיקות §1: adjustPlan — מוריד עצימות שבוע קדימה כאשר ACWR
// מחושב מעל 1.5; ומזיז את שבוע הבנייה כשיותר מאימון אחד פוספס.

/** תאריך קבוע — כך שהטסט לא נשבר מעצמו כשעובר הזמן. */
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
  it("מוריד עצימות כאשר ACWR מחושב מעל 1.5", () => {
    const decisions = decideAdjustments([plannedWorkout], highLoadDailyLoads(), 0, new Date(FIXED_TODAY));
    expect(decisions[0].action).toBe("reduce_intensity");
    expect(decisions[0].reductionFactor).toBeLessThan(1);
  });

  it("מזיז שבוע קדימה כשיותר מאימון אחד פוספס באותו שבוע (לא מדביק פער בבת אחת)", () => {
    const workouts: WorkoutForAdjustment[] = [
      { id: "m1", weekNumber: 3, status: "missed", plannedDistance: 5000 },
      { id: "m2", weekNumber: 3, status: "missed", plannedDistance: 5000 },
      { id: "w2", weekNumber: 3, status: "planned", plannedDistance: 5000 },
    ];
    const decisions = decideAdjustments(workouts, [], 0);
    const forPlanned = decisions.find((d) => d.workoutId === "w2");
    expect(forPlanned?.action).toBe("shift_week");
  });

  it("לא נוגע באימונים שכבר הושלמו/פוספסו/הותאמו", () => {
    const workouts: WorkoutForAdjustment[] = [
      { id: "c1", weekNumber: 1, status: "completed", plannedDistance: 5000 },
    ];
    const decisions = decideAdjustments(workouts, [], 0);
    expect(decisions[0].action).toBe("none");
  });

  it("לא משנה כלום כשהעומס יציב ואין פספוסים", () => {
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

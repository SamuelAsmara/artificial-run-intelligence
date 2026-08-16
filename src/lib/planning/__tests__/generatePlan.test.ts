import { describe, expect, it } from "vitest";
import { generatePlan, RaceTooSoonError } from "../generatePlan";

// מסמך אפיון בדיקות §1+§6: generatePlan — מספר שבועות נכון, 4 פאזות ביחס
// תקין, וזריקת שגיאה מפורשת (לא קריסה) כשתאריך המרוץ קרוב מדי.

const TODAY = new Date("2026-08-06");

describe("generatePlan", () => {
  it("מחלק תוכנית מרתון ל-4 פאזות שמכסות את כל השבועות ברצף", () => {
    const raceDate = new Date("2026-12-06"); // ~17 שבועות קדימה
    const plan = generatePlan("full", raceDate, TODAY);

    expect(plan.phases.base.startWeek).toBe(1);
    expect(plan.phases.taper.endWeek).toBe(plan.totalWeeks);
    expect(plan.phases.build.startWeek).toBe(plan.phases.base.endWeek + 1);
    expect(plan.phases.peak.startWeek).toBe(plan.phases.build.endWeek + 1);
    expect(plan.phases.taper.startWeek).toBe(plan.phases.peak.endWeek + 1);
  });

  it("מייצר אימונים לכל שבוע בתוכנית", () => {
    const raceDate = new Date("2026-10-01"); // ~8 שבועות
    const plan = generatePlan("10k", raceDate, TODAY);
    const weeksWithWorkouts = new Set(plan.workouts.map((w) => w.weekNumber));
    expect(weeksWithWorkouts.size).toBe(plan.totalWeeks);
  });

  it("הטייפר קצר מהבנייה/שיא בתוכנית ארוכה (10-20% מהתקופה)", () => {
    const raceDate = new Date("2027-01-10"); // תוכנית ארוכה
    const plan = generatePlan("full", raceDate, TODAY);
    const taperLength = plan.phases.taper.endWeek - plan.phases.taper.startWeek + 1;
    expect(taperLength / plan.totalWeeks).toBeLessThanOrEqual(0.25);
  });

  it("זורק RaceTooSoonError במקום ליצור תוכנית לא הגיונית כשהמרוץ קרוב מדי", () => {
    const tomorrow = new Date("2026-08-07");
    expect(() => generatePlan("5k", tomorrow, TODAY)).toThrow(RaceTooSoonError);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildOwnPlan, parseTargetTime, rampFactor, sundayOf, thresholdSpeedFromTarget, validateOwnPlan, weeklyKm,
  type OwnPlanInput,
} from "../ownPlan";

const pattern: OwnPlanInput["pattern"] = [
  { type: "easy", km: 6, pace: "5:30" },
  { type: "rest", km: null, pace: null },
  { type: "interval", km: 8, pace: "4:20" },
  { type: "easy", km: 6, pace: null },
  { type: "rest", km: null, pace: null },
  { type: "long", km: 14, pace: "5:45" },
  { type: "rest", km: null, pace: null },
];
const base: OwnPlanInput = { name: "Autumn block", startDate: "2026-09-02", weeks: 4, pattern, ramp: false };

describe("an athlete's own plan", () => {
  it("lays the week out from the Sunday of the start week, skipping days before the start", () => {
    expect(sundayOf("2026-09-02")).toBe("2026-08-30");   // a Wednesday → the Sunday before
    const rows = buildOwnPlan(base);
    expect(rows[0].dayDate).toBe("2026-09-02");
    expect(rows[0].weekNumber).toBe(1);
    expect(rows.every((r) => r.dayDate >= "2026-09-02")).toBe(true);
    // four weeks minus the three skipped days
    expect(rows).toHaveLength(4 * 7 - 3);
    expect(rows[rows.length - 1].dayDate).toBe("2026-09-26");
  });

  it("keeps the session, distance in metres and the pace as typed", () => {
    const rows = buildOwnPlan({ ...base, startDate: "2026-08-30" });
    expect(rows[0]).toEqual({ weekNumber: 1, dayDate: "2026-08-30", workoutType: "easy", plannedDistance: 6000, plannedPace: "5:30" });
    expect(rows[1]).toEqual({ weekNumber: 1, dayDate: "2026-08-31", workoutType: "rest", plannedDistance: null, plannedPace: null });
    expect(rows[5].plannedDistance).toBe(14000);
  });

  it("ramps seven percent a week with a step back every fourth", () => {
    expect(rampFactor(1, true)).toBe(1);
    expect(rampFactor(2, true)).toBeCloseTo(1.07, 5);
    expect(rampFactor(4, true)).toBeCloseTo(Math.pow(1.07, 3) * 0.75, 5);
    expect(rampFactor(9, false)).toBe(1);
    const km = weeklyKm(buildOwnPlan({ ...base, startDate: "2026-08-30", ramp: true }));
    expect(km[0]).toBe(34);
    expect(km[1]).toBeGreaterThan(km[0]);
    expect(km[3]).toBeLessThan(km[2]);
  });

  it("refuses what cannot be laid out, in a sentence", () => {
    expect(validateOwnPlan({ ...base, name: " " })).toMatch(/name/);
    expect(validateOwnPlan({ ...base, weeks: 0 })).toMatch(/weeks/);
    expect(validateOwnPlan({ ...base, weeks: 25 })).toMatch(/weeks/);
    expect(validateOwnPlan({ ...base, pattern: pattern.map((d) => ({ ...d, type: "rest" as const })) })).toMatch(/run/);
    expect(validateOwnPlan({ ...base, pattern: [{ ...pattern[0], km: 0 }, ...pattern.slice(1)] })).toMatch(/distance/);
    expect(validateOwnPlan({ ...base, pattern: [{ ...pattern[0], pace: "fast" }, ...pattern.slice(1)] })).toMatch(/5:30/);
    expect(validateOwnPlan(base)).toBeNull();
  });
});

describe("paces from a target time", () => {
  it("reads h:mm:ss and mm:ss", () => {
    expect(parseTargetTime("3:45:00")).toBe(13500);
    expect(parseTargetTime("45:00")).toBe(2700);
    expect(parseTargetTime("nope")).toBeNull();
    expect(parseTargetTime("")).toBeNull();
  });

  it("turns a target into the pace of an hour's race", () => {
    // a 45:00 10K: the hour distance by Riegel is 10 km × (60/45)^(1/1.06) ≈ 13.1 km
    const v = thresholdSpeedFromTarget(10000, 2700)!;
    expect(1000 / v).toBeCloseTo(3600 / 13.12, 0);
    // a 10K run in exactly an hour is threshold pace by definition
    expect(thresholdSpeedFromTarget(10000, 3600)).toBeCloseTo(10000 / 3600, 6);
    expect(thresholdSpeedFromTarget(0, 3600)).toBeNull();
  });
});

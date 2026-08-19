import { describe, expect, it } from "vitest";
import { plannedMinutes, sessionShape } from "@/lib/planning/sessionShape";

describe("sessionShape", () => {
  it("says nothing for a rest day", () => {
    expect(sessionShape({ type: "rest", distanceKm: 0, pace: null })).toEqual([]);
  });

  it("says nothing for a session with no distance rather than drawing an empty shape", () => {
    expect(sessionShape({ type: "int", distanceKm: 0, pace: "4:15" })).toEqual([]);
  });

  it("describes an easy run with its own distance and pace", () => {
    const [only] = sessionShape({ type: "easy", distanceKm: 6.2, pace: "5:49" });
    expect(only.t).toBe("6.2 km easy @ 5:49/km");
  });

  it("omits the pace when the plan has none, rather than inventing one", () => {
    const [only] = sessionShape({ type: "long", distanceKm: 18, pace: null });
    expect(only.t).toBe("18.0 km steady");
  });

  /**
   * The bug: every interval session was drawn as "800 m rep @ 4:15" — the
   * prototype athlete's track workout — whatever the athlete's plan said.
   */
  it("sizes interval reps from the session's own distance", () => {
    const segs = sessionShape({ type: "int", distanceKm: 12, pace: "4:02" });
    const reps = segs.filter((s) => s.h === 48);
    expect(reps).toHaveLength(6);
    // Half of 12 km across six reps is 1000 m each.
    expect(reps[0].t).toBe("1000 m @ 4:02/km");
    expect(segs.every((s) => !s.t.includes("800 m"))).toBe(true);
  });

  it("keeps the total proportional to the session", () => {
    const segs = sessionShape({ type: "tempo", distanceKm: 10, pace: "4:45" });
    expect(segs.reduce((sum, s) => sum + s.m, 0)).toBeCloseTo(10_000, 5);
  });
});

describe("plannedMinutes", () => {
  it("uses the session's own target pace", () => {
    // 6:20/km over 10 km is 63.3 minutes — not the 56 the old 5.6 constant gave.
    expect(plannedMinutes(10, "6:20")).toBe(63);
  });

  it("returns nothing when there is no pace to work from", () => {
    expect(plannedMinutes(10, null)).toBeNull();
    expect(plannedMinutes(10, "")).toBeNull();
    expect(plannedMinutes(10, "not a pace")).toBeNull();
  });
});

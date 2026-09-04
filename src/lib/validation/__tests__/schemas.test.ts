import { describe, expect, it } from "vitest";
import { goalRaceSchema, healthWebhookSchema, workoutPatchSchema } from "../schemas";

// Test plan §2: invalid inputs.

describe("goalRaceSchema", () => {
  it("rejects a race date in the past", () => {
    const result = goalRaceSchema.safeParse({ raceType: "10k", raceDate: "2020-01-01" });
    expect(result.success).toBe(false);
  });

  it("rejects a race date too far out (more than two years ahead)", () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 5);
    const result = goalRaceSchema.safeParse({
      raceType: "10k",
      raceDate: farFuture.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a race_type outside 5k/10k/half/full", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 3);
    const result = goalRaceSchema.safeParse({
      raceType: "marathon-ultra",
      raceDate: future.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid input", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 4);
    const result = goalRaceSchema.safeParse({
      raceType: "half",
      raceDate: future.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(true);
  });
});

describe("healthWebhookSchema", () => {
  it("rejects a negative heart rate", () => {
    const result = healthWebhookSchema.safeParse({ date: "2026-08-05", restingHr: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects 40 hours of sleep (outside the physiological range)", () => {
    const result = healthWebhookSchema.safeParse({ date: "2026-08-05", sleepHours: 40 });
    expect(result.success).toBe(false);
  });

  it("accepts a valid payload with optional fields missing", () => {
    const result = healthWebhookSchema.safeParse({ date: "2026-08-05", sleepHours: 7.2 });
    expect(result.success).toBe(true);
  });
});

describe("workoutPatchSchema", () => {
  it("accepts the four session types, a metre distance and an m:ss pace", () => {
    const r = workoutPatchSchema.safeParse({ workoutType: "long", plannedDistanceM: 18000, plannedPace: "5:20" });
    expect(r.success).toBe(true);
  });

  it("lets a field be cleared with null and left alone when absent", () => {
    expect(workoutPatchSchema.safeParse({ plannedPace: null }).success).toBe(true);
    expect(workoutPatchSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown type, a negative distance and a malformed pace", () => {
    expect(workoutPatchSchema.safeParse({ workoutType: "tempo" }).success).toBe(false);
    expect(workoutPatchSchema.safeParse({ plannedDistanceM: -5 }).success).toBe(false);
    expect(workoutPatchSchema.safeParse({ plannedDistanceM: 250_000 }).success).toBe(false);
    expect(workoutPatchSchema.safeParse({ plannedPace: "fast" }).success).toBe(false);
  });
});

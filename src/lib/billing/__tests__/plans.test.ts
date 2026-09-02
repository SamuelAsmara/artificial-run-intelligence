import { describe, expect, it } from "vitest";
import { COACH_PLANS, hasSeat, seatLimitFor, seatsLabel, tierOf } from "../plans";

describe("coach plans", () => {
  it("maps the database values to the two tiers and back", () => {
    expect(tierOf("free")).toBe("basic");
    expect(tierOf("pro")).toBe("premium");
    expect(tierOf(null)).toBeNull();
    expect(COACH_PLANS.basic.dbPlan).toBe("free");
    expect(COACH_PLANS.premium.dbPlan).toBe("pro");
  });

  it("Basic stops at five seats, Premium does not stop", () => {
    expect(seatLimitFor("basic")).toBe(5);
    expect(hasSeat("basic", 4)).toBe(true);
    expect(hasSeat("basic", 5)).toBe(false);
    expect(hasSeat("premium", 5000)).toBe(true);
  });

  it("an account without a package is never blocked", () => {
    expect(hasSeat(null, 40)).toBe(true);
  });

  it("labels the roster against the limit only when there is one", () => {
    expect(seatsLabel("basic", 3)).toBe("3 of 5 athletes");
    expect(seatsLabel("premium", 1)).toBe("1 athlete");
    expect(seatsLabel("premium", 12)).toBe("12 athletes");
  });
});

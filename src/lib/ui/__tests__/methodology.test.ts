import { describe, expect, it } from "vitest";
import { METHODS } from "@/lib/screens/methodology";

describe("METHODS", () => {
  it("covers every figure the product actually shows", () => {
    const ids = METHODS.map((m) => m.id);
    for (const required of ["trimp", "ctl", "atl", "tsb", "acwr", "gap", "drift", "riegel", "readiness"]) {
      expect(ids).toContain(required);
    }
  });

  it("has no duplicate ids", () => {
    const ids = METHODS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every method a plain-language sentence before any formula", () => {
    for (const m of METHODS) {
      expect(m.plain.length).toBeGreaterThan(40);
      expect(m.formula.length).toBeGreaterThan(5);
    }
  });

  it("states a limit for every method — this is the point of the page", () => {
    for (const m of METHODS) {
      expect(m.limit.length).toBeGreaterThan(40);
    }
  });

  it("cites a source for every method", () => {
    for (const m of METHODS) {
      expect(m.source.length).toBeGreaterThan(10);
    }
  });

  it("gives every method at least two bands to read the figure against", () => {
    for (const m of METHODS) {
      expect(m.scale.length).toBeGreaterThanOrEqual(2);
      for (const band of m.scale) {
        expect(band.value.length).toBeGreaterThan(0);
        expect(band.meaning.length).toBeGreaterThan(3);
      }
    }
  });

  it("says where in the app each number is met", () => {
    for (const m of METHODS) expect(m.seenOn.length).toBeGreaterThan(3);
  });
});

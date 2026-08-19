import { describe, expect, it } from "vitest";
import { initialsOf } from "@/components/ui/Avatar";

/**
 * The fallback when there is no photo. It has to look deliberate: before the
 * shared component, one screen printed the athlete's initials as loose text
 * with no circle around it, which read as a caption rather than a portrait.
 */
describe("initialsOf", () => {
  it("takes the first and last name", () => {
    expect(initialsOf("Sami Asmara")).toBe("SA");
    expect(initialsOf("Samuel Ben David Asmara")).toBe("SA");
  });

  it("takes two letters from a single name", () => {
    expect(initialsOf("Sami")).toBe("SA");
  });

  it("survives the absence of a name rather than rendering nothing", () => {
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf(undefined)).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });

  it("ignores stray whitespace", () => {
    expect(initialsOf("  Sami   Asmara  ")).toBe("SA");
  });
});

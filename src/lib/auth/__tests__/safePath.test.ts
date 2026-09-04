import { describe, expect, it } from "vitest";
import { safePath } from "../safePath";

describe("safePath", () => {
  it("keeps plain same-origin paths, with query and hash", () => {
    expect(safePath("/plan")).toBe("/plan");
    expect(safePath("/activities/abc?tab=hr#top")).toBe("/activities/abc?tab=hr#top");
  });

  it("falls back when the target is missing or not a path", () => {
    expect(safePath(null)).toBe("/dashboard");
    expect(safePath("")).toBe("/dashboard");
    expect(safePath("plan")).toBe("/dashboard");
    expect(safePath("https://evil.example/")).toBe("/dashboard");
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safePath("//evil.example/")).toBe("/dashboard");
    expect(safePath("/\\evil.example/")).toBe("/dashboard");
    expect(safePath("/\\\\evil.example")).toBe("/dashboard");
    expect(safePath("/%5Cevil.example")).toBe("/%5Cevil.example");
  });

  it("honours a custom fallback", () => {
    expect(safePath(undefined, "/coach")).toBe("/coach");
  });
});

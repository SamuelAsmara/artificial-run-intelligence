import { describe, expect, it } from "vitest";
import { targetBand, TARGET_TOLERANCE_S } from "@/lib/activity/chartLayout";

/**
 * A stand-in for the pace band: 300 s/km at the top, 400 at the bottom,
 * drawn between y=100 and y=200. Inverted, like the real one — faster is up.
 */
const band = {
  plotTop: 100,
  plotBottom: 200,
  hi: 400,
  lo: 300,
  y: (v: number) => {
    const clamped = Math.max(300, Math.min(400, v));
    return 100 + ((clamped - 300) / 100) * 100;
  },
};

describe("targetBand", () => {
  it("shades the tolerance either side of the target", () => {
    const t = targetBand(band, 350, "easy");
    // 340 -> y 140, 360 -> y 160
    expect(t).toEqual({ y: 140, height: 20, outside: null });
  });

  it("draws nothing when no pace was prescribed", () => {
    expect(targetBand(band, null, "easy")).toBeNull();
    expect(targetBand(band, 0, "easy")).toBeNull();
    expect(targetBand(band, Number.NaN, "easy")).toBeNull();
  });

  it("refuses to draw one band across an interval session", () => {
    // A single target across warm-up, reps and floats would mark a session run
    // exactly as written as a failure.
    expect(targetBand(band, 350, "interval")).toBeNull();
    expect(targetBand(band, 350, "intervals")).toBeNull();
  });

  it("marks the edge instead of a sliver when the whole run was slower", () => {
    const t = targetBand(band, 280, "easy");
    expect(t?.outside).toBe("faster");
    expect(t?.height).toBe(2);
    expect(t?.y).toBe(band.plotTop);
  });

  it("marks the other edge when the whole run was faster than target", () => {
    const t = targetBand(band, 430, "easy");
    expect(t?.outside).toBe("slower");
    expect(t?.y).toBe(band.plotBottom - 2);
  });

  it("honours a coach's own tolerance", () => {
    const wide = targetBand(band, 350, "long", 20);
    const narrow = targetBand(band, 350, "long", 5);
    expect(wide!.height).toBeGreaterThan(narrow!.height);
  });

  it("uses the same tolerance the verdict does", () => {
    expect(TARGET_TOLERANCE_S).toBe(10);
  });
});

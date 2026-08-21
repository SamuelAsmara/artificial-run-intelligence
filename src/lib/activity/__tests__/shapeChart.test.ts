/**
 * The reconstructed stream has to survive the real chart code, not just look
 * right in isolation — NaN altitudes and all-zero heart rates are exactly the
 * kind of thing a layout routine divides by.
 */
import { describe, expect, it } from "vitest";
import { streamsFromShape } from "@/lib/activity/shapeStreams";
import { paceAxisFor } from "@/lib/activity/resample";
import { layoutBands, targetBand } from "@/lib/activity/chartLayout";

const shape = [312, 300, 288, 305, 330, 296, 284, 318, 342, 301, 295, 310];

describe("a chart built from a stored pace shape", () => {
  const s = streamsFromShape(shape, 10_000, 3060)!;

  it("produces a usable pace axis", () => {
    const axis = paceAxisFor(s.vel, { min: 240, max: 392 });
    expect(Number.isFinite(axis.min)).toBe(true);
    expect(Number.isFinite(axis.max)).toBe(true);
    expect(axis.max).toBeGreaterThan(axis.min);
  });

  it("lays out the pace band and nothing else", () => {
    const axis = paceAxisFor(s.vel, { min: 240, max: 392 });
    const hrs = s.hr.filter((v) => Number.isFinite(v) && v > 0);
    const alts = s.alt.filter(Number.isFinite);
    expect(hrs).toHaveLength(0);
    expect(alts).toHaveLength(0);

    const bands = layoutBands([{ id: "pace", lo: axis.min, hi: axis.max, inverted: true }]);
    expect(bands.map((b) => b.id)).toEqual(["pace"]);
    expect(Number.isFinite(bands[0].y(300))).toBe(true);
  });

  it("still places the coach's target window on that band", () => {
    const axis = paceAxisFor(s.vel, { min: 240, max: 392 });
    const [band] = layoutBands([{ id: "pace", lo: axis.min, hi: axis.max, inverted: true }]);
    const target = targetBand(band, 300, "easy");
    expect(target).not.toBeNull();
    expect(Number.isFinite(target!.y)).toBe(true);
    expect(target!.height).toBeGreaterThan(0);
  });
});

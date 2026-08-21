import { describe, expect, it } from "vitest";
import { FLAT_PATH, paceShapeColor, paceShapeToPath } from "../sparkline";

/** Every y coordinate in a path, in order. */
function ys(path: string): number[] {
  return [...path.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
}

const steady = (n: number, v = 300) => Array.from({ length: n }, () => v);

describe("paceShapeToPath", () => {
  it("falls back to a flat line without enough data", () => {
    expect(paceShapeToPath(null)).toBe(FLAT_PATH);
    expect(paceShapeToPath([])).toBe(FLAT_PATH);
    expect(paceShapeToPath([300])).toBe(FLAT_PATH);
    expect(paceShapeToPath([null, null, null])).toBe(FLAT_PATH);
  });

  it("puts the faster point higher in the box", () => {
    // second half faster (smaller seconds per km)
    const path = paceShapeToPath([340, 340, 340, 300, 300, 300]);
    const y = ys(path);
    expect(y[0]).toBeGreaterThan(y[y.length - 1]);
  });

  it("lifts the pen over a stop instead of drawing through it", () => {
    const path = paceShapeToPath([300, 310, null, null, 305, 300]);
    // one M at the start, and a second where the line resumes
    expect((path.match(/M/g) ?? []).length).toBe(2);
  });

  it("stays inside the 24px box", () => {
    const path = paceShapeToPath([280, 300, 320, 340, 360, 300, 290]);
    for (const y of ys(path)) {
      expect(y).toBeGreaterThanOrEqual(2);
      expect(y).toBeLessThanOrEqual(22);
    }
  });

  /**
   * The bug this file was written for. A single junk sample used to set the
   * top of the scale, flattening the whole run into a smear at the bottom.
   */
  it("does not let one stopped sample flatten the whole run", () => {
    const clean = [300, 310, 305, 315, 300, 320, 308, 312, 302, 318];
    const withSpike = [...clean.slice(0, 5), 2400, ...clean.slice(5)];

    const spread = (p: string) => {
      const y = ys(p);
      return Math.max(...y) - Math.min(...y);
    };

    // Without clamping the spike consumed the range and the real variation
    // collapsed to well under a pixel.
    expect(spread(paceShapeToPath(withSpike))).toBeGreaterThan(spread(paceShapeToPath(clean)) * 0.6);
  });

  it("clamps the outlier rather than dropping it", () => {
    const path = paceShapeToPath([300, 305, 310, 2400, 302, 308, 300, 312, 306, 304]);
    // the spike is still drawn — at the bottom of the box, not off it
    expect(Math.max(...ys(path))).toBeLessThanOrEqual(22);
    expect(ys(path).length).toBe(10);
  });

  it("draws a flat line for a run with no variation at all", () => {
    expect(paceShapeToPath(steady(20))).toBe(FLAT_PATH);
  });

  it("still shows the shape of an almost-steady run", () => {
    // middle 80% identical, the ends differ — the fallback to full range
    const shape = [280, ...steady(18, 300), 320];
    expect(paceShapeToPath(shape)).not.toBe(FLAT_PATH);
  });
});

describe("paceShapeColor", () => {
  it("is muted for a run held together", () => {
    expect(paceShapeColor(steady(20))).toBe("var(--color-muted)");
  });

  it("warns when the second half faded", () => {
    const faded = [...steady(10, 300), ...steady(10, 340)];
    expect(paceShapeColor(faded)).toBe("var(--color-caution)");
  });

  it("says nothing about a run too short to judge", () => {
    expect(paceShapeColor([300, 400])).toBe("var(--color-muted)");
    expect(paceShapeColor(null)).toBe("var(--color-muted)");
  });
});

/*
 * Amplitude has to mean something.
 *
 * The rail read as nine identical squiggles because every run was scaled to
 * its own range, so a steady easy run was drawn exactly as tall as an
 * interval session. These pin the fix: height now tracks how varied the run
 * actually was.
 */
describe("paceShapeToPath — height means variation", () => {
  const height = (path: string) => Math.max(...ys(path)) - Math.min(...ys(path));

  // 5:12 to 5:20 — a genuinely steady easy run.
  const easy = [312, 314, 316, 318, 320, 318, 316, 314, 312, 315, 317, 319];
  // 4:05 to 6:10 — reps and floats.
  const intervals = [245, 370, 246, 368, 248, 372, 250, 366, 247, 370, 249, 369];

  it("draws a steady run as a calm line, not a full-height one", () => {
    const h = height(paceShapeToPath(easy));
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(8); // the box is 24 tall with 2 of padding
  });

  it("lets an interval session fill the box", () => {
    expect(height(paceShapeToPath(intervals))).toBeGreaterThan(15);
  });

  it("draws the varied run taller than the steady one", () => {
    expect(height(paceShapeToPath(intervals))).toBeGreaterThan(
      height(paceShapeToPath(easy)) * 2,
    );
  });

  it("keeps a steady run centred rather than pinned to an edge", () => {
    const v = ys(paceShapeToPath(easy));
    const mid = (Math.max(...v) + Math.min(...v)) / 2;
    expect(mid).toBeGreaterThan(9);
    expect(mid).toBeLessThan(15);
  });

  it("still puts the fastest point above the slowest", () => {
    const path = paceShapeToPath([400, 300, 400]);
    const v = ys(path);
    expect(v[1]).toBeLessThan(v[0]); // 300 s/km is faster, so higher on screen
  });
});

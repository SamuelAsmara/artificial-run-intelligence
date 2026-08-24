import { describe, expect, it } from "vitest";
import { sessionLine, LINE_BOX, type SessionSegment } from "@/lib/dashboard/sessionLine";

const seg = (w: number, h: number, title = "1.0 km @ 5:10/km"): SessionSegment => ({
  w: w.toFixed(2), h, bg: "var(--color-accent)", title,
});

const ys = (path: string) => [...path.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
const xs = (path: string) => [...path.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]));

describe("sessionLine", () => {
  it("returns null when there is nothing to draw", () => {
    expect(sessionLine([])).toBeNull();
    expect(sessionLine([seg(0, 22)])).toBeNull();
  });

  it("spans the box from edge to edge", () => {
    const l = sessionLine([seg(50, 22), seg(50, 30)])!;
    const x = xs(l.path);
    expect(Math.min(...x)).toBeCloseTo(LINE_BOX.left, 1);
    expect(Math.max(...x)).toBeCloseTo(LINE_BOX.right, 1);
  });

  it("draws a flat shelf for a session of one effort", () => {
    const l = sessionLine([seg(100, 22)])!;
    const y = ys(l.path);
    expect(new Set(y).size).toBe(1);
    // Not pinned to the floor — a long run should still look like running.
    expect(y[0]).toBeLessThan(LINE_BOX.bottom - 10);
  });

  it("puts the harder segment higher on screen", () => {
    // Warm-up, rep, cool-down: the rep is the tall one.
    const l = sessionLine([seg(25, 18), seg(50, 34), seg(25, 18)])!;
    const y = ys(l.path);
    expect(Math.min(...y)).toBeLessThan(Math.max(...y)); // smaller y = higher
    // the middle of the path is the top
    expect(y[2]).toBeLessThan(y[0]);
  });

  it("steps rather than slopes — each level is held twice", () => {
    const l = sessionLine([seg(50, 20), seg(50, 40)])!;
    const y = ys(l.path);
    expect(y[0]).toBe(y[1]);
    expect(y[2]).toBe(y[3]);
    expect(y[1]).not.toBe(y[2]);
  });

  it("closes the area back to the baseline", () => {
    const l = sessionLine([seg(100, 22)])!;
    expect(l.area.endsWith("Z")).toBe(true);
    expect(l.area).toContain(`${LINE_BOX.bottom}`);
  });

  it("labels each segment with its pace, not its distance", () => {
    const l = sessionLine([seg(50, 20, "2.0 km @ 5:30/km"), seg(50, 40, "2.0 km @ 4:05/km")])!;
    expect(l.dots.map((d) => d.l)).toEqual(["5:30", "4:05"]);
  });

  it("stops labelling once there are too many segments to read", () => {
    const many = Array.from({ length: 9 }, (_, i) => seg(100 / 9, i % 2 ? 34 : 18));
    expect(sessionLine(many)!.dots).toHaveLength(0);
    // the line itself is still drawn
    expect(sessionLine(many)!.path.length).toBeGreaterThan(0);
  });

  it("keeps every marker inside the box", () => {
    const l = sessionLine([seg(25, 18), seg(50, 34), seg(25, 18)])!;
    for (const d of l.dots) {
      expect(d.x).toBeGreaterThanOrEqual(LINE_BOX.left);
      expect(d.x).toBeLessThanOrEqual(LINE_BOX.right);
      expect(d.y).toBeGreaterThanOrEqual(LINE_BOX.top);
      expect(d.y).toBeLessThanOrEqual(LINE_BOX.bottom);
    }
  });
});

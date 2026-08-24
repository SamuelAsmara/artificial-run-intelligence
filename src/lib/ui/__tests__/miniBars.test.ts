import { describe, expect, it } from "vitest";
import { BAR_BOX, miniBars, type MiniBarInput } from "../miniBars";

const weeks = (vals: number[], currentLast = false): MiniBarInput[] =>
  vals.map((value, i) => ({
    value,
    label: currentLast && i === vals.length - 1 ? "now" : `W${i + 1}`,
    current: currentLast && i === vals.length - 1,
  }));

describe("miniBars", () => {
  it("returns null for no data rather than an empty chart", () => {
    expect(miniBars([])).toBeNull();
  });

  it("gives the tallest bar the full height and the baseline", () => {
    const c = miniBars(weeks([20, 40]))!;
    expect(c.max).toBe(40);
    expect(c.bars[1].h).toBe(BAR_BOX.maxH);
    expect(c.bars[1].y + c.bars[1].h).toBeCloseTo(BAR_BOX.baseY, 5);
  });

  it("scales the others in proportion", () => {
    const c = miniBars(weeks([20, 40]))!;
    expect(c.bars[0].h).toBeCloseTo(BAR_BOX.maxH / 2, 1);
  });

  it("never lets a bar vanish", () => {
    const c = miniBars(weeks([0, 60]))!;
    expect(c.bars[0].h).toBe(BAR_BOX.minH);
  });

  it("survives an all-zero week block", () => {
    const c = miniBars(weeks([0, 0, 0]))!;
    expect(c.max).toBe(0);
    expect(c.bars.every((b) => b.h === BAR_BOX.minH)).toBe(true);
    // nothing is "best" when nothing was run
    expect(c.bars.some((b) => b.isMax)).toBe(false);
  });

  it("draws the in-progress bar as an outline, not a fill", () => {
    const c = miniBars(weeks([30, 34, 12], true))!;
    const now = c.bars[2];
    expect(now.isCurrent).toBe(true);
    expect(now.bodyOp).toBe(0);
    expect(now.stroke).toBe("var(--color-accent)");
    expect(now.dash).toBe("3 3");
  });

  it("never calls the in-progress bar the best week, even when it is highest", () => {
    const c = miniBars(weeks([30, 34, 99], true))!;
    expect(c.bars[2].isMax).toBe(false);
    expect(c.bars[1].isMax).toBe(true);
  });

  it("marks exactly one best week, the later one on a tie", () => {
    const c = miniBars(weeks([42, 30, 42, 20]))!;
    expect(c.bars.filter((b) => b.isMax)).toHaveLength(1);
    expect(c.bars[2].isMax).toBe(true);
  });

  it("shows a tooltip only on the best week", () => {
    const c = miniBars(weeks([20, 40]))!;
    expect(c.bars[1].tip.opacity).toBe(1);
    expect(c.bars[0].tip.opacity).toBe(0);
    expect(c.bars[1].tip.text).toBe("40 km");
  });

  it("keeps one decimal on fractional values and none on whole ones", () => {
    const c = miniBars(weeks([41.25, 40]))!;
    expect(c.bars[0].tip.text).toBe("41.3 km");
    expect(c.bars[1].tip.text).toBe("40 km");
  });

  it("accepts a different unit and an empty one", () => {
    expect(miniBars(weeks([5]), "mi")!.bars[0].tip.text).toBe("5 mi");
    expect(miniBars(weeks([5]), "")!.bars[0].tip.text).toBe("5");
  });

  it("stays inside the box and symmetric for any bar count", () => {
    for (const n of [4, 8, 12]) {
      const c = miniBars(weeks(Array.from({ length: n }, () => 30)))!;
      const first = c.bars[0];
      const last = c.bars[n - 1];
      expect(first.px).toBeGreaterThanOrEqual(0);
      expect(last.px + c.barW).toBeLessThanOrEqual(BAR_BOX.w);
      // equal air on both sides
      expect(first.cx - 0).toBeCloseTo(BAR_BOX.w - last.cx, 1);
    }
  });

  it("keeps bars in ascending x order", () => {
    const c = miniBars(weeks([10, 20, 30, 40, 50]))!;
    const xs = c.bars.map((b) => b.cx);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("leaves room above the tallest bar for its tooltip", () => {
    const c = miniBars(weeks([40]))!;
    expect(c.bars[0].tip.y).toBeGreaterThanOrEqual(0);
  });

  it("centres the tooltip pill on the bar", () => {
    const c = miniBars(weeks([40]))!;
    expect(c.bars[0].tip.x + 22).toBeCloseTo(c.bars[0].cx, 5);
  });

  it("treats a non-finite value as zero instead of collapsing the chart", () => {
    const c = miniBars([
      { value: Number.NaN, label: "W1" },
      { value: 30, label: "W2" },
    ])!;
    expect(c.max).toBe(30);
    expect(c.bars[0].h).toBe(BAR_BOX.minH);
  });

  it("shares one track behind every bar", () => {
    const c = miniBars(weeks([10, 20]))!;
    expect(c.track).toEqual({ y: BAR_BOX.trackTop, h: BAR_BOX.baseY - BAR_BOX.trackTop });
  });

  it("widens the bars when there are few of them, and caps the width", () => {
    const four = miniBars(weeks([30, 34, 38, 36]))!;
    const twelve = miniBars(weeks(Array.from({ length: 12 }, () => 30)))!;
    expect(four.barW).toBeGreaterThan(twelve.barW);
    expect(four.barW).toBeLessThanOrEqual(30);
    expect(twelve.barW).toBeGreaterThanOrEqual(9);
  });

  it("keeps the track narrower than the bar at every count", () => {
    for (const n of [2, 4, 8, 12]) {
      const c = miniBars(weeks(Array.from({ length: n }, () => 30)))!;
      expect(c.trackW).toBeLessThan(c.barW);
    }
  });

  it("never gives a bar a radius taller than the bar itself", () => {
    const c = miniBars(weeks([0, 60, 30, 45]))!;
    for (const b of c.bars) expect(b.rx * 2).toBeLessThanOrEqual(b.h + 0.001);
  });
});

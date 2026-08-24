import { describe, expect, it } from "vitest";
import {
  CURVE_POINTS,
  compareRuns,
  compareSplits,
  efficiency,
  resampleCurve,
  similarRuns,
  type ComparableRun,
} from "@/lib/activity/compareRuns";

const run = (over: Partial<ComparableRun> = {}): ComparableRun => ({
  id: "a",
  date: "2026-08-20",
  distanceM: 10_000,
  durationS: 3000,
  avgHr: 150,
  paceShape: [300, 300, 300, 300],
  type: "easy",
  ...over,
});

describe("resampleCurve", () => {
  it("stretches any shape onto the shared axis", () => {
    expect(resampleCurve([300, 400]).length).toBe(CURVE_POINTS);
    expect(resampleCurve(new Array(120).fill(320)).length).toBe(CURVE_POINTS);
  });

  it("keeps the ends exactly", () => {
    const c = resampleCurve([300, 350, 400]);
    expect(c[0]).toBe(300);
    expect(c[c.length - 1]).toBe(400);
  });

  it("interpolates between samples rather than stepping", () => {
    const c = resampleCurve([300, 400], 3);
    expect(c[1]).toBe(350);
  });

  it("survives a run with no shape at all", () => {
    expect(resampleCurve(null).every((v) => v === null)).toBe(true);
    expect(resampleCurve([]).every((v) => v === null)).toBe(true);
  });

  it("carries a value across a gap instead of breaking the line", () => {
    const c = resampleCurve([300, null, 320], 3);
    expect(c[1]).not.toBeNull();
  });
});

describe("efficiency", () => {
  it("is beats per unit of speed, so lower is fitter", () => {
    const slowHeart = efficiency(run({ avgHr: 140 }))!;
    const fastHeart = efficiency(run({ avgHr: 165 }))!;
    expect(slowHeart).toBeLessThan(fastHeart);
  });

  it("is null without a heart rate, rather than a number that means nothing", () => {
    expect(efficiency(run({ avgHr: null }))).toBeNull();
    expect(efficiency(run({ avgHr: 0 }))).toBeNull();
  });

  it("is null for a run with no distance or duration", () => {
    expect(efficiency(run({ distanceM: 0 }))).toBeNull();
    expect(efficiency(run({ durationS: 0 }))).toBeNull();
  });
});

describe("similarRuns", () => {
  const subject = run({ id: "today", date: "2026-08-20", distanceM: 10_000 });

  it("finds the same kind of session at about the same distance", () => {
    const found = similarRuns(subject, [
      run({ id: "close", date: "2026-08-06", distanceM: 10_400 }),
      run({ id: "far", date: "2026-08-06", distanceM: 21_000 }),
    ]);
    expect(found.map((r) => r.id)).toEqual(["close"]);
  });

  it("will not compare an easy run to an interval session", () => {
    const found = similarRuns(subject, [
      run({ id: "intervals", date: "2026-08-06", distanceM: 10_100, type: "int" }),
    ]);
    expect(found).toHaveLength(0);
  });

  it("ignores runs from the future and from too long ago", () => {
    const found = similarRuns(subject, [
      run({ id: "later", date: "2026-09-01", distanceM: 10_000 }),
      run({ id: "ancient", date: "2025-01-01", distanceM: 10_000 }),
    ]);
    expect(found).toHaveLength(0);
  });

  it("puts the closest match in distance first", () => {
    const found = similarRuns(
      subject,
      [
        run({ id: "loose", date: "2026-08-01", distanceM: 11_300 }),
        run({ id: "tight", date: "2026-08-02", distanceM: 10_050 }),
      ],
      2,
    );
    expect(found[0].id).toBe("tight");
  });

  it("never returns the run being compared", () => {
    expect(similarRuns(subject, [subject])).toHaveLength(0);
  });
});

describe("compareRuns", () => {
  it("says nothing about a single run", () => {
    expect(compareRuns([run()])).toBeNull();
    expect(compareRuns([])).toBeNull();
  });

  it("puts every curve on the same axis", () => {
    const c = compareRuns([run({ id: "a" }), run({ id: "b", paceShape: [280, 290] })])!;
    expect(c.runs.every((r) => r.curve.length === CURVE_POINTS)).toBe(true);
    expect(c.paceRange).toEqual({ fast: 280, slow: 300 });
  });

  it("reads a lower heart rate at the same pace as getting fitter", () => {
    const c = compareRuns([
      run({ id: "now", avgHr: 140 }),
      run({ id: "then", date: "2026-06-01", avgHr: 158 }),
    ])!;
    expect(c.verdict).toMatch(/less heart rate/);
    expect(c.verdict).toMatch(/fitter/);
  });

  it("does not call a 1% difference progress", () => {
    const c = compareRuns([
      run({ id: "now", avgHr: 150 }),
      run({ id: "then", date: "2026-06-01", avgHr: 151 }),
    ])!;
    expect(c.verdict).toMatch(/holding steady/);
  });

  it("falls back to pace, and says so, when a run has no heart rate", () => {
    const c = compareRuns([
      run({ id: "now", durationS: 2700, avgHr: null }),
      run({ id: "then", date: "2026-06-01", durationS: 3000, avgHr: null }),
    ])!;
    expect(c.verdict).toMatch(/faster/);
    expect(c.verdict).toMatch(/pace alone/);
  });

  it("takes at most three runs, however many it is handed", () => {
    const c = compareRuns([run({ id: "1" }), run({ id: "2" }), run({ id: "3" }), run({ id: "4" })])!;
    expect(c.runs).toHaveLength(3);
  });
});

describe("compareSplits", () => {
  const mk = (id: string, shape: number[], date: string): ComparableRun => ({
    id, date, distanceM: 10_000, durationS: 3000, avgHr: 150, paceShape: shape, type: "easy",
  });
  const flat = (v: number) => new Array(40).fill(v);

  it("cuts the run into equal parts and averages each", () => {
    const c = compareRuns([mk("a", flat(300), "2026-08-01"), mk("b", flat(320), "2026-07-01")])!;
    const { parts } = compareSplits(c);
    expect(parts).toHaveLength(4);
    expect(parts.map((p) => p.label)).toEqual(["0–25%", "25–50%", "50–75%", "75–100%"]);
    for (const p of parts) {
      expect(p.paces[0]).toBeCloseTo(300, 4);
      expect(p.paces[1]).toBeCloseTo(320, 4);
    }
  });

  it("covers every point, with nothing dropped at the end", () => {
    // 40 points into 3 parts does not divide evenly.
    const c = compareRuns([mk("a", flat(300), "2026-08-01"), mk("b", flat(310), "2026-07-01")])!;
    const { parts } = compareSplits(c, 3);
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => p.paces[0] !== null)).toBe(true);
  });

  it("marks the part where the subject gained most on the oldest run", () => {
    const now = [...new Array(30).fill(300), ...new Array(10).fill(280)];
    const then = new Array(40).fill(320);
    const c = compareRuns([mk("a", now, "2026-08-01"), mk("b", then, "2026-06-01")])!;
    expect(compareSplits(c).bestIndex).toBe(3);
  });

  it("marks nothing when the subject never gained", () => {
    const c = compareRuns([mk("a", flat(330), "2026-08-01"), mk("b", flat(300), "2026-07-01")])!;
    expect(compareSplits(c).bestIndex).toBe(-1);
  });

  it("returns nulls for a run with no shape rather than inventing a pace", () => {
    const c = compareRuns([
      mk("a", flat(300), "2026-08-01"),
      { ...mk("b", flat(310), "2026-07-01"), paceShape: null },
    ])!;
    const { parts } = compareSplits(c);
    expect(parts.every((p) => p.paces[1] === null)).toBe(true);
    expect(parts.every((p) => p.paces[0] !== null)).toBe(true);
  });
});

describe("compareSplits — pace is an inverse", () => {
  const mk2 = (id: string, shape: number[], date: string): ComparableRun => ({
    id, date, distanceM: 10_000, durationS: 3000, avgHr: 150, paceShape: shape, type: "easy",
  });

  it("reports the pace of the quarter, not the mean of its pace figures", () => {
    /*
     * Equal-time buckets: half the run at 4:00/km (240 s), half at 6:00/km.
     * 300 s at 4:00 covers 1.25 km, 300 s at 6:00 covers 0.833 km — so the
     * quarter is 2.083 km in 600 s, which is 288 s/km. The mean of 240 and 360
     * says 300, and is wrong by twelve seconds a kilometre.
     */
    const shape = [
      ...new Array(20).fill(240),
      ...new Array(20).fill(360),
    ];
    const c = compareRuns([mk2("a", shape, "2026-08-01"), mk2("b", shape, "2026-07-01")])!;
    const pace = compareSplits(c, 1).parts[0].paces[0]!;
    expect(pace).toBeCloseTo(288, 0);
    expect(pace).not.toBeCloseTo(300, 0);
  });

  it("is unchanged when the whole quarter was run at one pace", () => {
    const shape = new Array(40).fill(300);
    const c = compareRuns([mk2("a", shape, "2026-08-01"), mk2("b", shape, "2026-07-01")])!;
    expect(compareSplits(c, 1).parts[0].paces[0]).toBeCloseTo(300, 4);
  });
});

import { describe, expect, it } from "vitest";
import { buildActivityNote, type ActivityNoteInput } from "../buildActivityNote";
import type { Segment, RangeSummary } from "../metrics";
import type { Comparison } from "../plannedVsActual";

const seg = (label: string, paceSec: number): Segment => ({
  label, paceSec, distanceM: 1000, durationS: paceSec, elapsedS: paceSec, avgHr: 150, from: 0, to: 1,
});

const summary = (km = 10): RangeSummary => ({
  distanceM: km * 1000, durationS: km * 300, elapsedS: km * 300, stoppedS: 0, paceSec: 300, gapSec: 298,
  speedKmh: 12, climbM: 60, avgHr: 152, maxHr: 181, avgCadence: 166, avgPower: 280,
});

const base = (over: Partial<ActivityNoteInput> = {}): ActivityNoteInput => ({
  summary: summary(),
  segments: [seg("1", 320), seg("2", 315), seg("3", 310), seg("4", 305), seg("5", 300), seg("6", 295)],
  driftOnsetM: null,
  driftPct: null,
  comparison: null,
  ...over,
});

const cmp = (verdict: Comparison["verdict"]): Comparison => ({
  verdict, label: "", color: "", plannedLine: "", actualLine: "", note: "", plannedPaceSec: 330,
});

describe("buildActivityNote", () => {
  it("recognises a progression run", () => {
    expect(buildActivityNote(base()).text).toContain("progression");
  });

  it("recognises a fade", () => {
    const segments = [seg("1", 280), seg("2", 285), seg("3", 290), seg("4", 310), seg("5", 320), seg("6", 330)];
    expect(buildActivityNote(base({ segments })).text).toContain("faded");
  });

  it("calls an even run even", () => {
    const segments = [seg("1", 300), seg("2", 302), seg("3", 299), seg("4", 301), seg("5", 300), seg("6", 298)];
    expect(buildActivityNote(base({ segments })).text).toContain("even");
  });

  it("names the closing kilometre when that was the fastest", () => {
    expect(buildActivityNote(base()).text).toContain("closing kilometre");
  });

  it("treats late drift as ordinary and early drift as not", () => {
    const late = buildActivityNote(base({ driftOnsetM: 8000, driftPct: 3.2 })).text;
    expect(late).toContain("ordinary");

    const early = buildActivityNote(base({ driftOnsetM: 2000, driftPct: 3.2 })).text;
    expect(early).toContain("earlier than you would want");
  });

  it("says the session cost more when decoupling ran high", () => {
    const t = buildActivityNote(base({ driftOnsetM: 6500, driftPct: 11.4 })).text;
    expect(t).toContain("cost more");
  });

  it("says nothing about drift it cannot support", () => {
    // no onset and no percentage — silence, not a reassuring guess
    expect(buildActivityNote(base()).text).not.toMatch(/drift|decoupl/i);
  });

  it("reports a clean run as clean", () => {
    const t = buildActivityNote(base({ driftOnsetM: null, driftPct: 1.2 })).text;
    expect(t).toContain("no decoupling");
  });

  it("stays silent about the plan when there was none", () => {
    expect(buildActivityNote(base()).text).not.toMatch(/plan/i);
  });

  it("tells you to back off after running an easy day too hard", () => {
    const t = buildActivityNote(base({ comparison: cmp("toofast") })).text;
    expect(t).toContain("recovery");
  });

  it("flags a run on a rest day as unaccounted load", () => {
    const t = buildActivityNote(base({ comparison: cmp("unplanned") })).text;
    expect(t).toContain("not accounted");
  });

  it("survives a run too short to say anything about", () => {
    const note = buildActivityNote(base({ segments: [seg("1", 300)] }));
    expect(note.sentences.every((s) => s.length > 0)).toBe(true);
  });

  it("keeps the sentences and the joined text in step", () => {
    // The AI layer rephrases sentences; if the two ever diverge it would
    // rewrite one thing and display another.
    const note = buildActivityNote(base({ driftOnsetM: 6500, driftPct: 4, comparison: cmp("ontarget") }));
    expect(note.text).toBe(note.sentences.join(" "));
    expect(note.sentences.length).toBe(4);
  });

  it("never emits an empty or double-spaced sentence", () => {
    const note = buildActivityNote(base({ segments: [], comparison: cmp("ontarget") }));
    expect(note.text).not.toMatch(/\s{2,}/);
    for (const s of note.sentences) expect(s.trim()).toBe(s);
  });
});

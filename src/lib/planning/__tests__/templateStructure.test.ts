import { describe, expect, it } from "vitest";
import { generatePlan, weekPatternFrom, type PlanStructure } from "../generatePlan";
import { DEFAULT_MIX, DEFAULT_PHASES } from "@/lib/coach/templates";

/**
 * The coach's templates screen wrote to `plan_templates` and nothing read it
 * back. A coach could spend twenty minutes tuning a structure, see "Saved", and
 * change nothing about anybody's training, ever.
 */

const TODAY = new Date(2026, 7, 19); // 19 August 2026
const RACE = new Date(2026, 10, 18); // ~13 weeks later

describe("weekPatternFrom", () => {
  it("reproduces the built-in week for the default mix", () => {
    const pattern = weekPatternFrom(DEFAULT_MIX);
    const byOffset = Object.fromEntries(pattern.map((w) => [w.offset, w.type]));
    // Sunday is 0. Long run Friday, full rest Saturday — the Israeli weekend.
    expect(byOffset[5]).toBe("long");
    expect(byOffset[6]).toBe("rest");
    expect(byOffset[2]).toBe("interval");
    expect(pattern).toHaveLength(7);
  });

  it("honours a coach who wants five running days and two hard sessions", () => {
    const pattern = weekPatternFrom({ easy: 2, long: 1, interval: 2, rest: 2 });
    const types = pattern.map((w) => w.type);
    expect(types.filter((t) => t === "interval")).toHaveLength(2);
    expect(types.filter((t) => t === "rest")).toHaveLength(2);
    expect(types.filter((t) => t === "easy")).toHaveLength(2);
    expect(types.filter((t) => t === "long")).toHaveLength(1);
  });

  it("gives every day a session and never doubles up", () => {
    const pattern = weekPatternFrom({ easy: 4, long: 1, interval: 1, rest: 1 });
    const offsets = pattern.map((w) => w.offset).sort();
    expect(offsets).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("still produces a whole week from a mix that does not add to seven", () => {
    // validateTemplate rejects these now, but rows written before it existed
    // must not produce a four-day week.
    const pattern = weekPatternFrom({ easy: 1, long: 1 });
    expect(pattern).toHaveLength(7);
  });

  it("normalises the shares, so volume is not silently lost or doubled", () => {
    const pattern = weekPatternFrom({ easy: 3, long: 1, interval: 1, rest: 2 });
    expect(pattern.reduce((sum, w) => sum + w.share, 0)).toBeCloseTo(1, 10);
  });
});

describe("generatePlan with a coach's structure", () => {
  const template: PlanStructure = {
    // Deliberately unlike the default: a long base and a two-week taper.
    phaseStructure: { base: 10, build: 4, peak: 1, taper: 2 },
    weeklyMix: { easy: 2, long: 1, interval: 2, rest: 2 },
  };

  it("builds exactly the week the templates screen shows the coach", () => {
    /*
     * The discrepancy this pins down.
     *
     * `DEFAULT_MIX` — the week the templates screen has always displayed — is
     * three easy days, a long run, an interval session and two rest days: five
     * running days. The generator's own hard-coded pattern was two easy days,
     * an interval, a long run and *three* rest days: four running days.
     *
     * So the screen and the plan disagreed about how often the athlete runs,
     * and the coach was editing a description of a plan nobody was building.
     * Wiring the template in settles it in favour of the thing the coach can
     * see and change.
     */
    const plan = generatePlan("half", RACE, TODAY, undefined, {
      phaseStructure: DEFAULT_PHASES.half,
      weeklyMix: DEFAULT_MIX,
    });
    const firstWeek = plan.workouts.filter((w) => w.weekNumber === 1);
    expect(firstWeek.filter((w) => w.workoutType === "easy")).toHaveLength(3);
    expect(firstWeek.filter((w) => w.workoutType === "rest")).toHaveLength(2);
    expect(firstWeek.filter((w) => w.workoutType === "long")).toHaveLength(1);
    expect(firstWeek.filter((w) => w.workoutType === "interval")).toHaveLength(1);
  });

  it("keeps the long run on Friday and a full rest day on Saturday", () => {
    const plan = generatePlan("half", RACE, TODAY, undefined, {
      phaseStructure: DEFAULT_PHASES.half,
      weeklyMix: DEFAULT_MIX,
    });
    const week = plan.workouts.filter((w) => w.weekNumber === 2);
    const friday = week.find((w) => new Date(w.dayDate + "T00:00:00").getDay() === 5);
    const saturday = week.find((w) => new Date(w.dayDate + "T00:00:00").getDay() === 6);
    expect(friday?.workoutType).toBe("long");
    expect(saturday?.workoutType).toBe("rest");
  });

  it("uses the coach's weekly mix", () => {
    const plan = generatePlan("half", RACE, TODAY, undefined, template);
    const firstWeek = plan.workouts.filter((w) => w.weekNumber === 1);
    expect(firstWeek.filter((w) => w.workoutType === "interval")).toHaveLength(2);
    expect(firstWeek.filter((w) => w.workoutType === "rest")).toHaveLength(2);
  });

  it("rescales the coach's phase proportions to the weeks actually available", () => {
    const plan = generatePlan("half", RACE, TODAY, undefined, template);
    // The template nominally runs 17 weeks; this race is about 13 away. The
    // plan must end at the race, keeping the coach's long-base shape.
    expect(plan.phases.taper.endWeek).toBe(plan.totalWeeks);
    const baseWeeks = plan.phases.base.endWeek;
    const defaultPlan = generatePlan("half", RACE, TODAY);
    expect(baseWeeks).toBeGreaterThan(defaultPlan.phases.base.endWeek);
  });

  it("falls back to the built-in ratios for a structure that says nothing", () => {
    const plan = generatePlan("half", RACE, TODAY, undefined, {
      phaseStructure: {},
      weeklyMix: DEFAULT_MIX,
    });
    const defaultPlan = generatePlan("half", RACE, TODAY);
    expect(plan.phases).toEqual(defaultPlan.phases);
  });
});

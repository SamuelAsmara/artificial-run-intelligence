import { describe, expect, it } from "vitest";
import {
  MAX_WEEKS, MIN_WEEKS, RACE_TYPES,
  defaultTemplate, runningDays, validateTemplate, type CoachTemplate,
} from "../templates";

const tpl = (over: Partial<CoachTemplate> = {}): CoachTemplate => ({
  ...defaultTemplate("full"),
  ...over,
});

describe("defaultTemplate", () => {
  it("gives every distance a coherent starting point", () => {
    // If a built-in template is itself invalid, every coach starts from a plan
    // the app would refuse to save.
    for (const race of RACE_TYPES) {
      expect(validateTemplate(defaultTemplate(race)), race).toBeNull();
    }
  });

  it("gives longer races longer builds", () => {
    expect(defaultTemplate("full").weeks).toBeGreaterThan(defaultTemplate("5k").weeks);
  });

  it("marks itself as not yet the coach's own", () => {
    expect(defaultTemplate("half").isDefault).toBe(true);
    expect(defaultTemplate("half").id).toBeNull();
  });

  it("hands back a copy, not the shared object", () => {
    // Otherwise editing one coach's form mutates the default for everyone.
    const a = defaultTemplate("10k");
    a.phaseStructure.base = 99;
    expect(defaultTemplate("10k").phaseStructure.base).not.toBe(99);
  });
});

describe("validateTemplate", () => {
  it("accepts a sound template", () => {
    expect(validateTemplate(tpl())).toBeNull();
  });

  it("rejects a plan too short or too long to be one", () => {
    expect(validateTemplate(tpl({ weeks: MIN_WEEKS - 1 }))).toContain("weeks");
    expect(validateTemplate(tpl({ weeks: MAX_WEEKS + 1 }))).toContain("weeks");
  });

  it("catches phases that do not add up to the plan", () => {
    // The off-by-one nobody notices until an athlete has run it for four months
    const bad = tpl({ weeks: 18, phaseStructure: { base: 8, build: 6, peak: 2, taper: 1 } });
    expect(validateTemplate(bad)).toContain("17 weeks");
  });

  it("insists on a taper", () => {
    const bad = tpl({ weeks: 18, phaseStructure: { base: 9, build: 6, peak: 3, taper: 0 } });
    expect(validateTemplate(bad)).toContain("taper");
  });

  it("catches a week that is not seven days", () => {
    const nine = tpl({ weeklyMix: { easy: 4, long: 1, interval: 2, rest: 2 } });
    expect(validateTemplate(nine)).toContain("9 days");

    const six = tpl({ weeklyMix: { easy: 3, long: 1, interval: 1, rest: 1 } });
    expect(validateTemplate(six)).toContain("6 days");
  });

  it("insists on a rest day", () => {
    const none = tpl({ weeklyMix: { easy: 4, long: 1, interval: 2, rest: 0 } });
    expect(validateTemplate(none)).toContain("rest day");
  });

  it("insists on a long run", () => {
    const none = tpl({ weeklyMix: { easy: 4, long: 0, interval: 1, rest: 2 } });
    expect(validateTemplate(none)).toContain("long run");
  });

  it("rejects fractional and negative weeks", () => {
    expect(validateTemplate(tpl({ weeks: 12.5 }))).not.toBeNull();
    expect(validateTemplate(tpl({ phaseStructure: { base: -1, build: 10, peak: 5, taper: 4 } })))
      .toContain("whole weeks");
    expect(validateTemplate(tpl({ weeklyMix: { easy: 3.5, long: 1, interval: 1, rest: 1.5 } })))
      .toContain("whole days");
  });

  it("reports one problem at a time", () => {
    // A coach fixing a form wants the next thing to fix, not a wall of text.
    const wrong = tpl({ weeks: 2, weeklyMix: { easy: 9, long: 0, interval: 0, rest: 0 } });
    expect(validateTemplate(wrong)!.split(".").filter(Boolean)).toHaveLength(1);
  });
});

describe("runningDays", () => {
  it("counts the days that are actually sessions", () => {
    expect(runningDays({ easy: 3, long: 1, interval: 1, rest: 2 })).toBe(5);
  });

  it("is zero for a week of rest", () => {
    expect(runningDays({ rest: 7 })).toBe(0);
  });
});

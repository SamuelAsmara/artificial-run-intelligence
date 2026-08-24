import { describe, expect, it } from "vitest";
import { templateWeeks, weekOf, type TemplateAthlete } from "../templateWeeks";

const TODAY = "2026-08-24";
const a = (name: string, raceDate: string | null, raceType = "full"): TemplateAthlete => ({
  id: name, name, raceType, raceDate,
});

describe("weekOf", () => {
  it("puts race week last", () => {
    expect(weekOf(a("x", "2026-08-24"), 12, TODAY)).toBe(12);
    expect(weekOf(a("x", "2026-08-30"), 12, TODAY)).toBe(12);
  });

  it("counts backwards a week at a time", () => {
    expect(weekOf(a("x", "2026-08-31"), 12, TODAY)).toBe(11);
    expect(weekOf(a("x", "2026-09-07"), 12, TODAY)).toBe(10);
  });

  it("places someone at the start of a full programme in week 1", () => {
    // 12 weeks out, to the day
    expect(weekOf(a("x", "2026-11-16"), 12, TODAY)).toBe(1);
  });

  it("does not run off the front for someone who joined very early", () => {
    expect(weekOf(a("x", "2027-06-01"), 12, TODAY)).toBe(1);
  });

  it("returns null with no race, and after the race has been run", () => {
    expect(weekOf(a("x", null), 12, TODAY)).toBeNull();
    expect(weekOf(a("x", "2026-08-01"), 12, TODAY)).toBeNull();
  });

  it("returns null for a template with no weeks", () => {
    expect(weekOf(a("x", "2026-10-01"), 0, TODAY)).toBeNull();
  });
});

describe("templateWeeks", () => {
  const roster = [
    a("Late", "2026-08-31"),      // week 11
    a("Middle", "2026-09-28"),    // week 7
    a("Early", "2026-11-16"),     // week 1
    a("Other", "2026-09-28", "half"),
    a("NoRace", null),
  ];

  it("returns one entry per week of the template", () => {
    expect(templateWeeks(roster, "full", 12, TODAY)).toHaveLength(12);
  });

  it("places each athlete in exactly one week", () => {
    const weeks = templateWeeks(roster, "full", 12, TODAY);
    const placed = weeks.flatMap((w) => w.athletes.map((x) => x.name));
    expect(placed.sort()).toEqual(["Early", "Late", "Middle"]);
  });

  it("ignores athletes racing another distance", () => {
    const weeks = templateWeeks(roster, "full", 12, TODAY);
    expect(weeks.flatMap((w) => w.athletes.map((x) => x.name))).not.toContain("Other");
  });

  it("ignores athletes with no race", () => {
    const weeks = templateWeeks(roster, "full", 12, TODAY);
    expect(weeks.flatMap((w) => w.athletes.map((x) => x.name))).not.toContain("NoRace");
  });

  it("marks weeks nobody can still reach as not editable", () => {
    // Everyone in this group is at week 7 or later.
    const weeks = templateWeeks([a("Middle", "2026-09-28")], "full", 12, TODAY);
    expect(weeks[0].editable).toBe(false);   // week 1
    expect(weeks[5].editable).toBe(false);   // week 6
    expect(weeks[6].editable).toBe(true);    // week 7 — where they are
    expect(weeks[11].editable).toBe(true);
  });

  it("treats every week as editable when nobody is in the group yet", () => {
    expect(templateWeeks([], "full", 12, TODAY).every((w) => w.editable)).toBe(true);
  });

  it("counts add up to the athletes in the group", () => {
    const weeks = templateWeeks(roster, "full", 12, TODAY);
    const total = weeks.reduce((s, w) => s + w.athletes.length, 0);
    expect(total).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { buildHighlights } from "@/lib/screens/coachHome";
import { applyFilter, buildCycles, cyclesSummary, EMPTY_FILTER } from "../programs";
import type { AthleteRow } from "../roster";

const athlete = (
  id: string,
  raceType: AthleteRow["raceType"],
  raceDate: string | null,
  readiness: number | null = 70,
): AthleteRow => ({
  id,
  name: id,
  avatarUrl: null,
  readiness,
  form: 0,
  loadRatio: 1,
  lastRunAt: "2026-08-18T06:00:00Z",
  lastRunM: 8000,
  raceType,
  raceDate,
  missedThisWeek: 0,
});

const TODAY = "2026-08-19";

describe("buildCycles", () => {
  it("groups athletes sharing a race and a date", () => {
    const { cycles } = buildCycles(
      [
        athlete("a", "full", "2026-10-11"),
        athlete("b", "full", "2026-10-11"),
        athlete("c", "10k", "2026-09-06"),
      ],
      TODAY,
    );
    expect(cycles).toHaveLength(2);
    const marathon = cycles.find((c) => c.raceType === "full");
    expect(marathon?.athletes.map((x) => x.id)).toEqual(["a", "b"]);
  });

  /**
   * The documented cost of deriving cycles instead of storing them: two
   * marathons a week apart are two cycles. Asserted so nobody "fixes" it by
   * accident.
   */
  it("keeps the same distance on different dates apart", () => {
    const { cycles } = buildCycles(
      [athlete("a", "full", "2026-10-11"), athlete("b", "full", "2026-10-18")],
      TODAY,
    );
    expect(cycles).toHaveLength(2);
  });

  it("returns athletes with no race separately rather than as a group", () => {
    const { cycles, withoutRace } = buildCycles(
      [athlete("a", "10k", "2026-09-06"), athlete("b", null, null)],
      TODAY,
    );
    expect(cycles).toHaveLength(1);
    expect(withoutRace.map((x) => x.id)).toEqual(["b"]);
  });

  it("treats a race type with no date as having no race", () => {
    const { cycles, withoutRace } = buildCycles([athlete("a", "10k", null)], TODAY);
    expect(cycles).toHaveLength(0);
    expect(withoutRace).toHaveLength(1);
  });

  it("counts down in days and whole weeks", () => {
    const { cycles } = buildCycles([athlete("a", "10k", "2026-09-02")], TODAY);
    expect(cycles[0].daysAway).toBe(14);
    expect(cycles[0].weeksAway).toBe(2);
  });

  it("orders races still ahead before races already run", () => {
    const { cycles } = buildCycles(
      [
        athlete("past", "5k", "2026-08-01"),
        athlete("far", "full", "2026-12-01"),
        athlete("soon", "10k", "2026-08-23"),
      ],
      TODAY,
    );
    expect(cycles.map((c) => c.athletes[0].id)).toEqual(["soon", "far", "past"]);
  });

  it("averages readiness across the group, ignoring athletes with none", () => {
    const { cycles } = buildCycles(
      [
        athlete("a", "10k", "2026-09-06", 80),
        athlete("b", "10k", "2026-09-06", 60),
        athlete("c", "10k", "2026-09-06", null),
      ],
      TODAY,
    );
    expect(cycles[0].meanReadiness).toBe(70);
  });

  it("says nothing rather than zero when no one in the group has a score", () => {
    const { cycles } = buildCycles([athlete("a", "10k", "2026-09-06", null)], TODAY);
    expect(cycles[0].meanReadiness).toBeNull();
  });

  it("counts how many of the group need attention", () => {
    const { cycles } = buildCycles(
      [athlete("a", "10k", "2026-09-06"), athlete("b", "10k", "2026-09-06")],
      TODAY,
      new Set(["a"]),
    );
    expect(cycles[0].needAttention).toBe(1);
  });
});

describe("applyFilter", () => {
  const roster = [
    { ...athlete("a", "10k", "2026-09-06"), sex: "male", targetPaceSec: 270 },
    { ...athlete("b", "10k", "2026-09-06"), sex: "female", targetPaceSec: 300 },
    { ...athlete("c", "full", "2026-10-11"), sex: "male", targetPaceSec: 330 },
    { ...athlete("d", null, null), sex: "female", targetPaceSec: null },
  ];
  const cycleOf = (a: (typeof roster)[number]) =>
    a.raceType && a.raceDate ? `${a.raceType}|${a.raceDate}` : null;

  /** A filter panel that shows nothing when cleared is one people distrust. */
  it("returns everyone when nothing is selected", () => {
    expect(applyFilter(roster, EMPTY_FILTER, cycleOf)).toHaveLength(4);
  });

  it("filters by cycle", () => {
    const out = applyFilter(roster, { ...EMPTY_FILTER, cycles: ["10k|2026-09-06"] }, cycleOf);
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("accepts several cycles at once", () => {
    const out = applyFilter(
      roster,
      { ...EMPTY_FILTER, cycles: ["10k|2026-09-06", "full|2026-10-11"] },
      cycleOf,
    );
    expect(out).toHaveLength(3);
  });

  it("filters by sex", () => {
    expect(applyFilter(roster, { ...EMPTY_FILTER, sex: "female" }, cycleOf).map((x) => x.id))
      .toEqual(["b", "d"]);
  });

  it("filters by a target-pace band", () => {
    const out = applyFilter(roster, { ...EMPTY_FILTER, paceFrom: 280, paceTo: 340 }, cycleOf);
    expect(out.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("excludes athletes with no target pace when a pace bound is set", () => {
    expect(applyFilter(roster, { ...EMPTY_FILTER, paceFrom: 200 }, cycleOf).map((x) => x.id))
      .toEqual(["a", "b", "c"]);
  });

  it("combines clauses", () => {
    const out = applyFilter(
      roster,
      { ...EMPTY_FILTER, cycles: ["10k|2026-09-06"], sex: "female" },
      cycleOf,
    );
    expect(out.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("cyclesSummary", () => {
  it("counts athletes across cycles and those without one", () => {
    const { cycles, withoutRace } = buildCycles(
      [
        athlete("a", "10k", "2026-09-06"),
        athlete("b", "10k", "2026-09-06"),
        athlete("c", null, null),
      ],
      TODAY,
    );
    expect(cyclesSummary(cycles, withoutRace.length)).toBe("3 athletes · 1 cycle · 1 without a race");
  });

  it("says nothing about cycles when there are none", () => {
    expect(cyclesSummary([], 1)).toBe("1 athlete · 1 without a race");
  });
});

describe("buildHighlights", () => {
  const base = {
    athleteCount: 10,
    flagCount: 0,
    needAttention: 0,
    nextRace: null,
    thisWeekPlanned: 0,
    thisWeekDone: 0,
    withoutRace: 0,
  };

  it("says only one thing when the roster is empty", () => {
    const out = buildHighlights({ ...base, athleteCount: 0, withoutRace: 3, needAttention: 2 });
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain("coach code");
  });

  it("leads with the athletes who need a look", () => {
    const out = buildHighlights({ ...base, needAttention: 3, thisWeekPlanned: 10, thisWeekDone: 9 });
    expect(out[0].text).toBe("3 athletes need a look today.");
    expect(out[0].tone).toBe("negative");
  });

  it("uses the singular for one", () => {
    expect(buildHighlights({ ...base, needAttention: 1 })[0].text).toBe("One athlete needs a look today.");
  });

  it("reads race day, tomorrow and later differently", () => {
    const race = (daysAway: number) =>
      buildHighlights({ ...base, nextRace: { name: "Dana", daysAway } })[0];
    expect(race(0).text).toBe("Dana races today.");
    expect(race(1).text).toBe("Dana races tomorrow.");
    expect(race(9).text).toBe("Dana races in 9 days.");
    expect(race(3).tone).toBe("caution");
    expect(race(30).tone).toBe("accent");
  });

  it("reports the week as a fraction and a percentage", () => {
    const out = buildHighlights({ ...base, thisWeekPlanned: 20, thisWeekDone: 13 });
    expect(out[0].text).toBe("13 of 20 sessions done this week — 65%.");
    expect(out[0].tone).toBe("caution");
  });

  it("stops nagging about a week that is going well", () => {
    expect(buildHighlights({ ...base, thisWeekPlanned: 10, thisWeekDone: 9 })[0].tone).toBe("muted");
  });

  it("names why an athlete without a race is a problem", () => {
    expect(buildHighlights({ ...base, withoutRace: 2 })[0].text).toContain("no plan can be built");
  });

  it("says nothing at all when there is nothing to say", () => {
    expect(buildHighlights(base)).toHaveLength(0);
  });
});

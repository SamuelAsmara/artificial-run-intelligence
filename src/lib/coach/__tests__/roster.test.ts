import { describe, expect, it } from "vitest";
import {
  LOW_READINESS, OVERLOAD_RATIO, SILENT_DAYS, UNDERLOAD_RATIO,
  flagsFor, rosterFlags, summariseRoster, weekBoard, weekDates,
  type AthleteRow, type PlannedSession, type RunRecord,
} from "../roster";

const TODAY = "2026-08-19"; // a Wednesday

const athlete = (over: Partial<AthleteRow> = {}): AthleteRow => ({
  id: "a1", name: "Amit", avatarUrl: null,
  readiness: 78, form: 2, loadRatio: 1.05,
  lastRunAt: "2026-08-18", lastRunM: 10_000,
  raceType: "half", raceDate: "2026-11-01",
  missedThisWeek: 0,
  ...over,
});

describe("flagsFor", () => {
  it("says nothing about an athlete who is fine", () => {
    expect(flagsFor(athlete(), TODAY)).toEqual([]);
  });

  it("notices an athlete who has gone quiet", () => {
    const f = flagsFor(athlete({ lastRunAt: "2026-08-12" }), TODAY);
    expect(f.map((x) => x.kind)).toContain("silent");
    expect(f[0].text).toContain("7 days");
  });

  it("holds its tongue right up to the threshold", () => {
    const justInside = new Date(Date.parse(TODAY) - (SILENT_DAYS - 1) * 86_400_000)
      .toISOString().slice(0, 10);
    expect(flagsFor(athlete({ lastRunAt: justInside }), TODAY)).toEqual([]);
  });

  it("counts missed sessions in the athlete's own words", () => {
    expect(flagsFor(athlete({ missedThisWeek: 1 }), TODAY)[0].text).toContain("one session");
    expect(flagsFor(athlete({ missedThisWeek: 3 }), TODAY)[0].text).toContain("3 sessions");
  });

  it("separates ramping too fast from detraining", () => {
    const over = flagsFor(athlete({ loadRatio: OVERLOAD_RATIO + 0.1 }), TODAY);
    expect(over.map((x) => x.kind)).toContain("overload");

    const under = flagsFor(athlete({ loadRatio: UNDERLOAD_RATIO - 0.1 }), TODAY);
    expect(under.map((x) => x.kind)).toContain("underload");
    // opposite problems must not both fire
    expect(under.map((x) => x.kind)).not.toContain("overload");
  });

  it("flags low readiness as a lighter day, not an alarm", () => {
    const f = flagsFor(athlete({ readiness: LOW_READINESS - 1 }), TODAY);
    expect(f.map((x) => x.kind)).toContain("flat");
    expect(f.find((x) => x.kind === "flat")!.tone).toBe("caution");
  });

  it("mentions a race only once it is close enough to change anything", () => {
    expect(flagsFor(athlete({ raceDate: "2026-08-30" }), TODAY).map((x) => x.kind)).toContain("race");
    expect(flagsFor(athlete({ raceDate: "2026-12-30" }), TODAY).map((x) => x.kind)).not.toContain("race");
  });

  it("does not flag a race that has already happened", () => {
    expect(flagsFor(athlete({ raceDate: "2026-08-01" }), TODAY).map((x) => x.kind)).not.toContain("race");
  });

  it("says nothing rather than guessing when data is missing", () => {
    const blank = athlete({ readiness: null, loadRatio: null, lastRunAt: null, raceDate: null });
    expect(flagsFor(blank, TODAY)).toEqual([]);
  });
});

describe("rosterFlags", () => {
  it("puts what needs acting on first", () => {
    const flags = rosterFlags([
      athlete({ id: "a", name: "A", readiness: 40 }),                 // caution
      athlete({ id: "b", name: "B", lastRunAt: "2026-08-01" }),       // negative
      athlete({ id: "c", name: "C", raceDate: "2026-08-25" }),        // accent
    ], TODAY);
    expect(flags[0].tone).toBe("negative");
    expect(flags[flags.length - 1].tone).toBe("accent");
  });

  it("is empty for a roster with nothing wrong", () => {
    expect(rosterFlags([athlete(), athlete({ id: "a2" })], TODAY)).toEqual([]);
  });
});

describe("summariseRoster", () => {
  const roster = [
    athlete({ id: "1", raceType: "full", raceDate: "2026-10-11" }),
    athlete({ id: "2", raceType: "full", raceDate: "2026-09-20" }),
    athlete({ id: "3", raceType: "10k", raceDate: "2026-09-05" }),
    athlete({ id: "4", raceType: null, raceDate: null }),
  ];

  it("counts the roster and groups it by distance", () => {
    const s = summariseRoster(roster, TODAY);
    expect(s.total).toBe(4);
    expect(s.byRace[0]).toEqual({ raceType: "full", count: 2 });
    expect(s.withoutRace).toBe(1);
  });

  it("lists races soonest first", () => {
    const s = summariseRoster(roster, TODAY);
    expect(s.upcoming.map((r) => r.raceDate)).toEqual(["2026-09-05", "2026-09-20", "2026-10-11"]);
    expect(s.upcoming[0].daysAway).toBe(17);
  });

  it("leaves races already run out of the list", () => {
    const s = summariseRoster([athlete({ raceDate: "2026-01-01" })], TODAY);
    expect(s.upcoming).toEqual([]);
    // but they still count towards the distance they train for
    expect(s.byRace[0].count).toBe(1);
  });

  it("handles an empty roster", () => {
    expect(summariseRoster([], TODAY)).toEqual({ total: 0, byRace: [], withoutRace: 0, upcoming: [] });
  });
});

describe("weekDates", () => {
  // The definition lives in @/lib/time/week and starts on Sunday; these check
  // the board is asking it rather than counting days itself.
  it("starts the week on Sunday", () => {
    expect(weekDates("2026-08-19")[0]).toBe("2026-08-16");
    expect(weekDates("2026-08-19")).toHaveLength(7);
  });

  it("treats Saturday as the end of its week, not the start of the next", () => {
    expect(weekDates("2026-08-22")[0]).toBe("2026-08-16");
    expect(weekDates("2026-08-22")[6]).toBe("2026-08-22");
  });
});

describe("weekBoard", () => {
  const a = athlete({ id: "a1", name: "Amit" });

  /**
   * The week of Wednesday 19 August 2026 runs Sun 16 to Sat 22, so:
   *   cell 0 = Sun 16   cell 1 = Mon 17 (easy)   cell 2 = Tue 18 (rest)
   *   cell 3 = Wed 19 (today)                    cell 5 = Fri 21 (long)
   */
  const sessions: PlannedSession[] = [
    { athleteId: "a1", date: "2026-08-17", workoutType: "easy", distanceM: 8000 },
    { athleteId: "a1", date: "2026-08-18", workoutType: "rest", distanceM: null },
    { athleteId: "a1", date: "2026-08-21", workoutType: "long", distanceM: 20000 },
  ];

  it("gives every athlete seven cells", () => {
    const board = weekBoard([a], sessions, [], TODAY);
    expect(board).toHaveLength(1);
    expect(board[0].cells).toHaveLength(7);
  });

  it("marks a planned session that was run as done", () => {
    const runs: RunRecord[] = [{ athleteId: "a1", date: "2026-08-17", distanceM: 8100 }];
    const cell = weekBoard([a], sessions, runs, TODAY)[0].cells[1];
    expect(cell.state).toBe("done");
    expect(cell.planned).toBe("Easy 8 km");
    expect(cell.actualKm).toBe(8.1);
  });

  it("marks a past session with no run as missed", () => {
    expect(weekBoard([a], sessions, [], TODAY)[0].cells[1].state).toBe("missed");
  });

  it("does not call a future session missed", () => {
    // Friday's long run has not happened yet on Wednesday
    const friday = weekBoard([a], sessions, [], TODAY)[0].cells[5];
    expect(friday.state).toBe("planned");
  });

  it("shows a run on a rest day rather than hiding it", () => {
    const runs: RunRecord[] = [{ athleteId: "a1", date: "2026-08-18", distanceM: 6000 }];
    const cell = weekBoard([a], sessions, runs, TODAY)[0].cells[2];
    expect(cell.state).toBe("extra");
    expect(cell.actualKm).toBe(6);
  });

  it("keeps a rest day that was rested quiet", () => {
    expect(weekBoard([a], sessions, [], TODAY)[0].cells[2].state).toBe("rest");
  });

  it("marks an unplanned run as extra", () => {
    const runs: RunRecord[] = [{ athleteId: "a1", date: "2026-08-19", distanceM: 5000 }];
    const cell = weekBoard([a], sessions, runs, TODAY)[0].cells[3];
    expect(cell.state).toBe("extra");
    expect(cell.planned).toBeNull();
  });

  it("adds up two runs on the same day", () => {
    const runs: RunRecord[] = [
      { athleteId: "a1", date: "2026-08-17", distanceM: 5000 },
      { athleteId: "a1", date: "2026-08-17", distanceM: 6000 },
    ];
    expect(weekBoard([a], sessions, runs, TODAY)[0].cells[1].actualKm).toBe(11);
  });

  it("keeps each athlete's sessions to their own row", () => {
    const b = athlete({ id: "a2", name: "Bar" });
    const board = weekBoard([a, b], sessions, [], TODAY);
    expect(board[1].cells.every((c) => c.planned === null)).toBe(true);
  });

  it("leaves a day with nothing planned and nothing run empty", () => {
    expect(weekBoard([a], sessions, [], TODAY)[0].cells[0].state).toBe("empty");
  });
});

describe("rosterFlags gives each athlete one row", () => {
  const athlete = (over: Partial<AthleteRow>): AthleteRow => ({
    id: "a1", name: "Runner8", readiness: 82, form: 0, loadRatio: 0.76,
    lastRunAt: "2026-08-18T06:30:00Z", lastRunM: 9000,
    raceType: "10k", raceDate: "2026-11-01", missedThisWeek: 1,
    avatarUrl: null,
    ...over,
  });

  it("keeps only the loudest flag when one athlete trips several rules", () => {
    // Runner8 was appearing twice on the board: once for the missed session and
    // once for detraining. Two rows, one person, and the coach reads it as two
    // problems.
    const flags = rosterFlags([athlete({})], "2026-08-20");
    expect(flags.filter((f) => f.athleteId === "a1")).toHaveLength(1);
  });

  it("still lists every athlete who needs a look", () => {
    const flags = rosterFlags(
      [athlete({}), athlete({ id: "a2", name: "Runner15", loadRatio: 0.75 })],
      "2026-08-20",
    );
    expect(new Set(flags.map((f) => f.athleteId))).toEqual(new Set(["a1", "a2"]));
  });

  it("keeps the loudest tone, not whichever came first", () => {
    const flags = rosterFlags([athlete({})], "2026-08-20");
    const order = { negative: 0, caution: 1, accent: 2 } as const;
    const all = [...flags];
    expect(all.every((f) => order[f.tone] <= 2)).toBe(true);
  });
});

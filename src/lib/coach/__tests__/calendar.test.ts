import { describe, expect, it } from "vitest";
import {
  colorFor, DEFAULT_RACE_COLORS, densityOpacity, monthView, NO_RACE_COLOR,
  weekView, yearView, type CalendarSession,
} from "../calendar";

const session = (
  date: string,
  athleteId: string,
  raceType: CalendarSession["raceType"],
  workoutType = "easy",
  done = false,
): CalendarSession => ({
  date,
  athleteId,
  athleteName: athleteId,
  raceType,
  workoutType,
  plannedDistanceM: workoutType === "rest" ? null : 8000,
  done,
});

describe("colorFor", () => {
  it("gives each distance its own colour", () => {
    const colors = Object.values(DEFAULT_RACE_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("marks an athlete with no race differently from every race", () => {
    expect(colorFor(null)).toBe(NO_RACE_COLOR);
    expect(Object.values(DEFAULT_RACE_COLORS)).not.toContain(NO_RACE_COLOR);
  });

  it("honours a coach's override", () => {
    expect(colorFor("10k", { "10k": "#ABCDEF" })).toBe("#ABCDEF");
  });

  /** The value reaches an inline style, so it has to look like a colour. */
  it("ignores an override that is not a hex colour", () => {
    expect(colorFor("10k", { "10k": "red; background:url(x)" })).toBe(DEFAULT_RACE_COLORS["10k"]);
    expect(colorFor("10k", { "10k": "" })).toBe(DEFAULT_RACE_COLORS["10k"]);
  });
});

describe("monthView", () => {
  it("is always six rows of seven, so paging does not move the grid", () => {
    for (const [y, m] of [[2026, 1], [2026, 7], [2027, 2], [2024, 1]] as const) {
      const view = monthView(y, m, [], "2026-08-19");
      expect(view.weeks).toHaveLength(6);
      for (const week of view.weeks) expect(week).toHaveLength(7);
    }
  });

  it("starts every row on a Sunday", () => {
    const view = monthView(2026, 7, [], "2026-08-19");
    for (const week of view.weeks) {
      const d = new Date(week[0].date + "T00:00:00");
      expect(d.getDay()).toBe(0);
    }
  });

  it("marks which cells belong to the month", () => {
    const view = monthView(2026, 7, [], "2026-08-19");
    const inMonth = view.weeks.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(31); // August
    expect(inMonth[0].label).toBe("1");
    expect(inMonth[30].label).toBe("31");
  });

  it("labels the month and year from its arguments, not from the clock", () => {
    expect(monthView(2027, 2, [], "2026-08-19").label).toBe("March 2027");
  });

  it("puts each session on its own day", () => {
    const view = monthView(2026, 7, [session("2026-08-19", "a", "10k")], "2026-08-19");
    const cell = view.weeks.flat().find((c) => c.date === "2026-08-19");
    expect(cell?.sessions).toHaveLength(1);
    expect(cell?.isToday).toBe(true);
  });

  it("groups a day by race and counts completions", () => {
    const view = monthView(
      2026,
      7,
      [
        session("2026-08-19", "a", "10k", "easy", true),
        session("2026-08-19", "b", "10k", "easy", false),
        session("2026-08-19", "c", "full", "long", false),
      ],
      "2026-08-19",
    );
    const cell = view.weeks.flat().find((c) => c.date === "2026-08-19");
    expect(cell?.groups).toHaveLength(2);
    const tenK = cell?.groups.find((g) => g.raceType === "10k");
    expect(tenK?.count).toBe(2);
    expect(tenK?.done).toBe(1);
  });

  /** Thirty rest days on a month grid say only that it is Sunday. */
  it("leaves rest days out of the dots", () => {
    const view = monthView(
      2026,
      7,
      [session("2026-08-19", "a", "10k", "rest"), session("2026-08-19", "b", "10k", "easy")],
      "2026-08-19",
    );
    const cell = view.weeks.flat().find((c) => c.date === "2026-08-19");
    expect(cell?.sessions).toHaveLength(2);
    expect(cell?.groups[0].count).toBe(1);
  });
});

describe("weekView", () => {
  it("returns seven days beginning on Sunday", () => {
    const view = weekView("2026-08-19", [], "2026-08-19");
    expect(view.days).toHaveLength(7);
    expect(view.startsOn).toBe("2026-08-16");
    expect(view.days[0].weekday).toBe("Sun");
    expect(view.days[6].weekday).toBe("Sat");
  });

  it("finds the same week from any day inside it", () => {
    for (const d of ["2026-08-16", "2026-08-19", "2026-08-22"]) {
      expect(weekView(d, [], "2026-08-19").startsOn).toBe("2026-08-16");
    }
  });

  it("places sessions on the right day", () => {
    const view = weekView("2026-08-19", [session("2026-08-21", "a", "half")], "2026-08-19");
    expect(view.days[5].sessions).toHaveLength(1);
    expect(view.days[4].sessions).toHaveLength(0);
  });
});

describe("yearView", () => {
  it("returns twelve months with the right number of days", () => {
    const months = yearView(2026, [], "2026-08-19");
    expect(months).toHaveLength(12);
    expect(months[1].days).toHaveLength(28); // Feb 2026
    expect(months[7].days).toHaveLength(31);
  });

  it("handles a leap year", () => {
    expect(yearView(2028, [], "2026-08-19")[1].days).toHaveLength(29);
  });

  it("colours a day by whichever group has the most sessions", () => {
    const months = yearView(
      2026,
      [
        session("2026-08-19", "a", "full"),
        session("2026-08-19", "b", "full"),
        session("2026-08-19", "c", "5k"),
      ],
      "2026-08-19",
    );
    const day = months[7].days.find((d) => d.date === "2026-08-19");
    expect(day?.count).toBe(3);
    expect(day?.color).toBe(DEFAULT_RACE_COLORS.full);
  });

  it("leaves an empty day with no colour at all", () => {
    const day = yearView(2026, [], "2026-08-19")[7].days[0];
    expect(day.count).toBe(0);
    expect(day.color).toBeNull();
  });
});

describe("densityOpacity", () => {
  it("is invisible only when there is nothing there", () => {
    expect(densityOpacity(0, 5)).toBe(0);
    expect(densityOpacity(1, 5)).toBeGreaterThan(0.25);
  });

  it("rises with the count and never leaves the range", () => {
    const a = densityOpacity(1, 10);
    const b = densityOpacity(5, 10);
    const c = densityOpacity(10, 10);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThanOrEqual(1);
  });

  it("does not exceed 1 when a day beats the busiest it was told about", () => {
    expect(densityOpacity(20, 10)).toBeLessThanOrEqual(1);
  });
});

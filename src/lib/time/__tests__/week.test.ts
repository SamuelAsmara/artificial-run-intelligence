import { describe, expect, it } from "vitest";
import {
  WEEKDAYS, WEEK_STARTS_ON, dayOfWeek, weekDates, weekNumber, weekStart, weekYear,
} from "../week";

describe("the configured week", () => {
  it("starts on Sunday, because that is where our athletes' week starts", () => {
    expect(WEEK_STARTS_ON).toBe(0);
    expect(WEEKDAYS[0]).toBe("Sun");
    expect(WEEKDAYS[6]).toBe("Sat");
    expect(WEEKDAYS).toHaveLength(7);
  });
});

describe("weekStart", () => {
  it("walks back to Sunday", () => {
    // 19 Aug 2026 is a Wednesday
    expect(weekStart(new Date("2026-08-19T00:00:00")).getDate()).toBe(16);
  });

  it("leaves a Sunday alone", () => {
    expect(weekStart(new Date("2026-08-16T00:00:00")).getDate()).toBe(16);
  });

  it("treats Saturday as the end of its week, not the start of the next", () => {
    expect(weekStart(new Date("2026-08-22T00:00:00")).getDate()).toBe(16);
  });

  it("crosses a month boundary correctly", () => {
    // 1 Sep 2026 is a Tuesday; its week began 30 August
    const start = weekStart(new Date("2026-09-01T00:00:00"));
    expect(start.getMonth()).toBe(7); // August
    expect(start.getDate()).toBe(30);
  });

  it("returns local midnight, not a time inside the day", () => {
    const s = weekStart(new Date("2026-08-19T23:30:00"));
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
  });
});

describe("dayOfWeek", () => {
  it("is zero on the first day of the week", () => {
    expect(dayOfWeek(new Date("2026-08-16T00:00:00"))).toBe(0);
  });

  it("is six on the last", () => {
    expect(dayOfWeek(new Date("2026-08-22T00:00:00"))).toBe(6);
  });
});

describe("weekDates", () => {
  it("gives seven dates, Sunday first", () => {
    const week = weekDates("2026-08-19");
    expect(week).toHaveLength(7);
    expect(week[0]).toBe("2026-08-16");
    expect(week[6]).toBe("2026-08-22");
  });

  it("puts a Saturday at the end of its own week", () => {
    // The trap: Saturday must not roll into next week.
    expect(weekDates("2026-08-22")[0]).toBe("2026-08-16");
  });

  it("puts a Sunday at the start of its own week", () => {
    expect(weekDates("2026-08-16")[0]).toBe("2026-08-16");
  });

  it("returns consecutive days with no gaps", () => {
    const week = weekDates("2026-12-30");
    for (let i = 1; i < week.length; i++) {
      const gap = Date.parse(week[i]) - Date.parse(week[i - 1]);
      expect(gap).toBe(86_400_000);
    }
  });

  it("crosses into the new year without breaking", () => {
    const week = weekDates("2026-12-31");
    expect(week[0]).toBe("2026-12-27");
    expect(week[6]).toBe("2027-01-02");
  });
});

describe("weekNumber", () => {
  it("numbers a mid-year week", () => {
    expect(weekNumber(new Date("2026-08-19T00:00:00"))).toBe(34);
  });

  it("gives every day of one week the same number", () => {
    const seen = new Set(
      weekDates("2026-08-19").map((d) => weekNumber(new Date(`${d}T00:00:00`))),
    );
    expect(seen.size).toBe(1);
  });

  it("never produces week 0 or a week past 53", () => {
    // Walk a whole year rather than trusting the arithmetic.
    for (let i = 0; i < 366; i++) {
      const d = new Date(2026, 0, 1 + i);
      const n = weekNumber(d);
      expect(n, d.toDateString()).toBeGreaterThanOrEqual(1);
      expect(n, d.toDateString()).toBeLessThanOrEqual(53);
    }
  });

  it("increments by one from week to week, all year", () => {
    // The failure this catches is a week that repeats or is skipped, which only
    // shows up at a year boundary or across a leap year.
    let previous = weekNumber(new Date(2026, 0, 4));
    for (let i = 11; i < 360; i += 7) {
      const n = weekNumber(new Date(2026, 0, 4 + i));
      expect(n).toBe(previous + 1);
      previous = n;
    }
  });
});

describe("weekYear", () => {
  it("keeps a week that straddles new year in one year", () => {
    const week = weekDates("2026-12-31");
    const years = new Set(week.map((d) => weekYear(new Date(`${d}T00:00:00`))));
    expect(years.size).toBe(1);
  });
});

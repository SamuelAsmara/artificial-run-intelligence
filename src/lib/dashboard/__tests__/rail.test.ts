import { describe, expect, it } from "vitest";
import {
  calendarDots, interruptedWeeks, isoWeekNumber, isoWeekYear, raceCountdown,
  runStreak, VOLUME_WEEKS, weeklyVolume, weeklyVolumeSummary, weekStart,
} from "../rail";
import { calendarDotColor, volumeBarAppearance, VOLUME_BAR_MIN_H } from "../presentation";

/** Wednesday 19 August 2026. */
const TODAY = new Date("2026-08-19T09:00:00");

const run = (date: string, km: number) => ({ date, distanceM: km * 1000 });

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart(new Date("2026-08-19T09:00:00")).getDate()).toBe(17);
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // Sunday 23 Aug still belongs to the week beginning Monday 17 Aug
    expect(weekStart(new Date("2026-08-23T09:00:00")).getDate()).toBe(17);
  });
});

describe("weeklyVolume", () => {
  it("returns twelve weeks, oldest first", () => {
    const bars = weeklyVolume([], TODAY);
    expect(bars).toHaveLength(VOLUME_WEEKS);
    expect(bars[0].weekNumber).toBe(1);
  });

  it("sums the runs into the right week", () => {
    const bars = weeklyVolume([run("2026-08-17", 5), run("2026-08-19", 7)], TODAY);
    expect(bars[VOLUME_WEEKS - 1].km).toBeCloseTo(12);
  });

  it("keeps empty weeks rather than compressing a lay-off away", () => {
    const bars = weeklyVolume([run("2026-08-19", 10)], TODAY);
    expect(bars.filter((b) => b.km === 0)).toHaveLength(VOLUME_WEEKS - 1);
    for (const b of bars) expect(b.h).toBeGreaterThanOrEqual(VOLUME_BAR_MIN_H);
  });

  it("ignores runs outside the window", () => {
    const bars = weeklyVolume([run("2025-01-01", 42)], TODAY);
    expect(bars.every((b) => b.km === 0)).toBe(true);
  });

  it("uses the design's appearance rules, not its own", () => {
    const bars = weeklyVolume([run("2026-08-19", 10)], TODAY);
    expect(bars[VOLUME_WEEKS - 1].bg).toBe(volumeBarAppearance("current").bg);
    expect(bars[0].bg).toBe(volumeBarAppearance("past").bg);
  });
});

describe("weeklyVolumeSummary", () => {
  it("compares this week against last", () => {
    const s = weeklyVolumeSummary(
      [run("2026-08-19", 20), run("2026-08-12", 10)], // this week 20, last week 10
      TODAY,
    );
    expect(s.km).toBe(20);
    expect(s.changePct).toBe(100);
  });

  it("returns null rather than dividing by a week of nothing", () => {
    const s = weeklyVolumeSummary([run("2026-08-19", 20)], TODAY);
    expect(s.changePct).toBeNull();
  });
});

describe("calendarDots", () => {
  const planned = [
    { date: "2026-08-17", isRest: false },
    { date: "2026-08-18", isRest: true },
    { date: "2026-08-19", isRest: false },
    { date: "2026-08-21", isRest: false },
  ];
  const key = (m: number, d: number) => m * 100 + d;

  it("marks a planned day done when a run was recorded", () => {
    const dots = calendarDots(planned, [run("2026-08-17", 6)], TODAY);
    expect(dots[key(7, 17)]).toBe(calendarDotColor("done"));
  });

  it("marks a past planned day missed when nothing was run", () => {
    const dots = calendarDots(planned, [], TODAY);
    expect(dots[key(7, 17)]).toBe(calendarDotColor("missed"));
  });

  it("leaves a future day planned", () => {
    const dots = calendarDots(planned, [], TODAY);
    expect(dots[key(7, 21)]).toBe(calendarDotColor("planned"));
  });

  it("never puts a dot on a rest day", () => {
    const dots = calendarDots(planned, [], TODAY);
    expect(dots[key(7, 18)]).toBeUndefined();
  });

  it("still records a run that was not in the plan", () => {
    const dots = calendarDots(planned, [run("2026-08-15", 8)], TODAY);
    expect(dots[key(7, 15)]).toBe(calendarDotColor("done"));
  });

  it("lets a completed run override a rest day", () => {
    const dots = calendarDots(planned, [run("2026-08-18", 4)], TODAY);
    expect(dots[key(7, 18)]).toBe(calendarDotColor("done"));
  });
});

describe("runStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(runStreak(
      [run("2026-08-19", 5), run("2026-08-18", 5), run("2026-08-17", 5)],
      TODAY,
    )).toBe(3);
  });

  it("stays alive when today's run has not happened yet", () => {
    // a morning runner opening the app before they head out has not broken it
    expect(runStreak([run("2026-08-18", 5), run("2026-08-17", 5)], TODAY)).toBe(2);
  });

  it("is broken by a gap of two days", () => {
    expect(runStreak([run("2026-08-17", 5), run("2026-08-16", 5)], TODAY)).toBe(0);
  });

  it("is zero with no runs at all", () => {
    expect(runStreak([], TODAY)).toBe(0);
  });

  it("ignores a duplicate on the same day", () => {
    expect(runStreak([run("2026-08-19", 5), run("2026-08-19", 3)], TODAY)).toBe(1);
  });
});

describe("raceCountdown", () => {
  it("counts the days to the race", () => {
    const c = raceCountdown("full", "2026-10-11", "2026-08-10", 20, TODAY);
    expect(c?.days).toBe(53);
    expect(c?.label).toContain("Marathon");
    expect(c?.label).toContain("Oct 11, 2026");
  });

  it("works out which week of the plan this is", () => {
    const c = raceCountdown("full", "2026-10-11", "2026-08-10", 20, TODAY);
    expect(c?.weekNumber).toBe(2);
    expect(c?.totalWeeks).toBe(20);
    expect(c?.progressPct).toBe(10);
  });

  it("never counts past the end of the plan", () => {
    const c = raceCountdown("10k", "2026-09-01", "2020-01-01", 8, TODAY);
    expect(c?.weekNumber).toBe(8);
    expect(c?.progressPct).toBe(100);
  });

  it("does not go negative once the race has passed", () => {
    const c = raceCountdown("5k", "2026-01-01", "2025-12-01", 4, TODAY);
    expect(c?.days).toBe(0);
  });

  it("returns null for an unusable date", () => {
    expect(raceCountdown("full", "not-a-date", null, 12, TODAY)).toBeNull();
  });
});

describe("isoWeekNumber", () => {
  it("numbers a mid-year week the way a calendar does", () => {
    // Wednesday 19 August 2026 falls in ISO week 34
    expect(isoWeekNumber(new Date("2026-08-19T00:00:00"))).toBe(34);
  });

  it("gives every day of a week the same number", () => {
    const monday = new Date("2026-08-17T00:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getTime() + i * 86_400_000);
      expect(isoWeekNumber(d)).toBe(34);
    }
  });

  it("puts early January into the previous year's last week when ISO says so", () => {
    // 1 Jan 2027 is a Friday, so it belongs to ISO week 53 of 2026
    const d = new Date("2027-01-01T00:00:00");
    expect(isoWeekNumber(d)).toBe(53);
    expect(isoWeekYear(d)).toBe(2026);
  });

  it("starts a year on week 1 when 1 January is a Monday", () => {
    // 1 Jan 2024 was a Monday
    expect(isoWeekNumber(new Date("2024-01-01T00:00:00"))).toBe(1);
  });
});

describe("weekly volume uses calendar weeks", () => {
  it("labels bars by ISO week, not by position in the strip", () => {
    const bars = weeklyVolume([run("2026-08-19", 10)], TODAY);
    expect(bars[VOLUME_WEEKS - 1].isoWeek).toBe(34);
    expect(bars[VOLUME_WEEKS - 1].title).toContain("Week 34");
  });

  it("numbers consecutive bars consecutively", () => {
    const bars = weeklyVolume([], TODAY);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].isoWeek).toBe(bars[i - 1].isoWeek + 1);
    }
  });
});

describe("interrupted weeks", () => {
  it("marks a week with no running inside an active block", () => {
    // ran three weeks ago and this week, nothing in between
    const bars = weeklyVolume(
      [run("2026-07-29", 30), run("2026-08-19", 20)],
      TODAY,
    );
    const gaps = interruptedWeeks(bars);
    expect(gaps.length).toBeGreaterThan(0);
    expect(bars.find((b) => b.interrupted)?.title).toContain("no running");
  });

  it("does not call the weeks before the athlete started an interruption", () => {
    const bars = weeklyVolume([run("2026-08-19", 20)], TODAY);
    expect(interruptedWeeks(bars)).toEqual([]);
  });

  it("never drops a week, however empty", () => {
    const bars = weeklyVolume([run("2026-08-19", 20)], TODAY);
    expect(bars).toHaveLength(VOLUME_WEEKS);
  });
});

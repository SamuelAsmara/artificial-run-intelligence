import { describe, expect, it } from "vitest";
import { buildRealPlan, relativeDay, realSessionSegments, type PlanWorkoutRow } from "../realPlan";

const TODAY = new Date("2026-08-19T09:00:00Z");

/** A fortnight of plan rows starting Monday 10 Aug 2026. */
function rows(): PlanWorkoutRow[] {
  const pattern: [number, PlanWorkoutRow["workout_type"], number | null][] = [
    [0, "easy", 6000], [1, "rest", null], [2, "interval", 8000], [3, "rest", null],
    [4, "easy", 7000], [5, "long", 14000], [6, "rest", null],
  ];
  const out: PlanWorkoutRow[] = [];
  for (const week of [1, 2]) {
    const monday = new Date("2026-08-10T00:00:00Z").getTime() + (week - 1) * 7 * 86_400_000;
    for (const [offset, type, dist] of pattern) {
      out.push({
        week_number: week,
        day_date: new Date(monday + offset * 86_400_000).toISOString().slice(0, 10),
        workout_type: type,
        planned_distance: dist,
        planned_pace: type === "rest" ? null : "5:30",
        status: "planned",
      });
    }
  }
  return out;
}

describe("buildRealPlan", () => {
  it("groups rows into weeks of seven days", () => {
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    expect(p.weeks).toHaveLength(2);
    expect(p.weeks[0].days).toHaveLength(7);
    expect(p.weeks[0].label).toBe("Week 1 of 2");
  });

  it("marks a session done when a run was recorded that day", () => {
    const p = buildRealPlan(rows(), [{ date: "2026-08-10", distanceM: 6100 }], 3.5, TODAY);
    const monday = p.weeks[0].days[0];
    expect(monday.done).toBe(true);
    expect(monday.status).toBe("Done");
  });

  it("marks a past session missed when nothing was run", () => {
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    const monday = p.weeks[0].days[0];
    expect(monday.missed).toBe(true);
    expect(monday.status).toBe("Missed");
  });

  it("never calls a rest day missed", () => {
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    for (const week of p.weeks) {
      for (const d of week.days) {
        if (d.type === "rest") {
          expect(d.missed).toBe(false);
          expect(d.status).not.toBe("Missed");
        }
      }
    }
  });

  it("does not mark a future session missed", () => {
    // Note week 2 starts on Monday 17 Aug, so its first two days are already in
    // the past — only days strictly after today should be untouched.
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    const future = p.weeks
      .flatMap((w) => w.days)
      .filter((d) => d.type !== "rest" && !d.today)
      .filter((d) => d.mon === "Aug" && d.dateNum > 19);
    expect(future.length).toBeGreaterThan(0);
    for (const d of future) {
      expect(d.missed).toBe(false);
      expect(d.status).not.toBe("Missed");
    }
  });

  it("opens on the week containing today", () => {
    // 19 Aug 2026 is the Wednesday of the second week
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    expect(p.currentWeek).toBe(1);
    expect(p.weeks[1].days.some((d) => d.today)).toBe(true);
  });

  it("falls back to the last week when the plan is already over", () => {
    const p = buildRealPlan(rows(), [], 3.5, new Date("2027-01-01T00:00:00Z"));
    expect(p.currentWeek).toBe(1);
  });

  it("translates the database workout vocabulary into the view's", () => {
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    const types = p.weeks[0].days.map((d) => d.type);
    expect(types).toContain("int"); // "interval" in the database
    expect(types).not.toContain("interval");
  });

  it("converts metres to the kilometres the strip shows", () => {
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    expect(p.weeks[0].days[0].dist).toBe(6);
    expect(p.weeks[0].days[5].dist).toBe(14);
  });
});

describe("the next session", () => {
  it("is the first non-rest session from today onward", () => {
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    expect(p.next?.date).toBe("2026-08-19"); // Wednesday intervals
    expect(p.next?.type).toBe("int");
    expect(p.next?.isToday).toBe(true);
  });

  it("skips rest days when looking ahead", () => {
    // Thursday is a rest day, so from Thursday the next session is Friday's easy run
    const p = buildRealPlan(rows(), [], 3.5, new Date("2026-08-20T09:00:00Z"));
    expect(p.next?.date).toBe("2026-08-21");
    expect(p.next?.type).toBe("easy");
  });

  it("carries a pace and an estimated duration", () => {
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    expect(p.next?.pace).toBe("5:30");
    // 8 km at 5:30/km is 44 minutes
    expect(p.next?.durationSec).toBe(2640);
  });

  it("is null once the plan has run out", () => {
    const p = buildRealPlan(rows(), [], 3.5, new Date("2027-01-01T00:00:00Z"));
    expect(p.next).toBeNull();
  });
});

describe("realSessionSegments", () => {
  it("splits an interval session into warm-up, reps and cool-down", () => {
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    const segs = realSessionSegments(p.next!);
    expect(segs.length).toBe(13); // wu + 6 reps + 5 recoveries + cd
  });

  it("renders a steady session as one block", () => {
    const p = buildRealPlan(rows(), [], 3.5, new Date("2026-08-21T09:00:00Z"));
    const segs = realSessionSegments(p.next!);
    expect(segs).toHaveLength(1);
    expect(segs[0].w).toBe("100.00");
  });

  it("always fills the bar exactly", () => {
    const p = buildRealPlan(rows(), [], 3.5, TODAY);
    for (const next of [p.next!]) {
      const total = realSessionSegments(next).reduce((s, x) => s + Number(x.w), 0);
      expect(total).toBeGreaterThan(99.5);
      expect(total).toBeLessThan(100.5);
    }
  });
});

describe("relativeDay", () => {
  it("says Today and Tomorrow", () => {
    expect(relativeDay("2026-08-19", TODAY)).toBe("Today");
    expect(relativeDay("2026-08-20", TODAY)).toBe("Tomorrow");
  });

  it("names the day otherwise", () => {
    expect(relativeDay("2026-08-22", TODAY)).toBe("Sat 22 Aug");
  });
});

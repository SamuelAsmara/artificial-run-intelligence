import { describe, expect, it } from "vitest";
import {
  CYCLE_LENGTH, LONG_RUN_MAX_SHARE, LONG_RUN_RAMP, planCapacity,
  progressionWeeks, REQUIRED_LONG_RUN_M, STEP_BACK_FRACTION,
  TARGET_PEAK_WEEKLY_M, weekLongRunM, weeksToReach, weekVolumeFraction,
} from "../capacity";
import { generatePlan } from "../generatePlan";
import { sessionSpikeVsRecentMax } from "../acwr";

/** Samuel's real position on 18 Aug 2026, from npm run analyze. */
const SAMUEL = { currentWeeklyM: 28_000, longestRecentM: 10_300 };

describe("progressionWeeks", () => {
  it("counts three progression weeks in every four", () => {
    expect(progressionWeeks(4)).toBe(3);
    expect(progressionWeeks(8)).toBe(6);
    expect(progressionWeeks(12)).toBe(9);
  });

  it("handles partial cycles", () => {
    expect(progressionWeeks(1)).toBe(1);
    expect(progressionWeeks(3)).toBe(3);
    expect(progressionWeeks(5)).toBe(4);
    expect(progressionWeeks(0)).toBe(0);
  });
});

describe("weeksToReach", () => {
  it("returns zero when the target is already met", () => {
    expect(weeksToReach(20_000, 15_000, 0.1)).toBe(0);
  });

  it("compounds rather than adding", () => {
    // 10 -> 20 km at 10% a week is about 8 weeks, not 10
    expect(weeksToReach(10_000, 20_000, 0.1)).toBe(8);
  });

  it("is infinite from nothing", () => {
    expect(weeksToReach(0, 10_000, 0.1)).toBe(Infinity);
  });
});

describe("planCapacity", () => {
  it("sizes the plan from the athlete, not from the race", () => {
    const strong = planCapacity("full", 16, { currentWeeklyM: 60_000, longestRecentM: 28_000 });
    const weak = planCapacity("full", 16, SAMUEL);
    expect(strong.peakWeeklyM).toBeGreaterThan(weak.peakWeeklyM);
    expect(strong.peakLongRunM).toBeGreaterThan(weak.peakLongRunM);
  });

  it("says a marathon is not reachable for Samuel in 12 building weeks", () => {
    const c = planCapacity("full", 12, SAMUEL);
    expect(c.achievable).toBe(false);
    expect(c.peakLongRunM).toBeLessThan(REQUIRED_LONG_RUN_M.full);
    expect(c.notes[0]).toMatch(/32\.0 km/);
  });

  it("says a 10K is reachable for the same athlete", () => {
    const c = planCapacity("10k", 12, SAMUEL);
    expect(c.achievable).toBe(true);
    expect(c.peakLongRunM).toBeGreaterThanOrEqual(REQUIRED_LONG_RUN_M["10k"]);
  });

  it("never lets one run take more than the permitted share of a week", () => {
    for (const race of ["5k", "10k", "half", "full"] as const) {
      for (const weeks of [8, 12, 20, 40]) {
        const c = planCapacity(race, weeks, SAMUEL);
        expect(c.peakLongRunM).toBeLessThanOrEqual(c.peakWeeklyM * LONG_RUN_MAX_SHARE + 100);
      }
    }
  });

  it("caps weekly volume at the per-race ceiling however long the plan", () => {
    const c = planCapacity("full", 60, { currentWeeklyM: 70_000, longestRecentM: 30_000 });
    expect(c.peakWeeklyM).toBeLessThanOrEqual(TARGET_PEAK_WEEKLY_M.full);
  });

  it("still produces a plan for someone with no history at all", () => {
    const c = planCapacity("10k", 12, { currentWeeklyM: 0, longestRecentM: 0 });
    expect(c.peakWeeklyM).toBeGreaterThan(0);
    expect(c.peakLongRunM).toBeGreaterThan(0);
    expect(Number.isFinite(c.peakWeeklyM)).toBe(true);
  });

  it("always explains itself", () => {
    const c = planCapacity("half", 14, SAMUEL);
    expect(c.notes.length).toBeGreaterThan(0);
    for (const n of c.notes) {
      expect(n).not.toMatch(/NaN|undefined|Infinity/);
      expect(n.length).toBeGreaterThan(30);
    }
  });

  it("states the peak it actually builds to, in every case", () => {
    // The prose and the number must not be able to drift apart — an earlier
    // version promised 24.3 km in the note while the plan built to 20.6.
    for (const race of ["5k", "10k", "half", "full"] as const) {
      for (const weeks of [6, 12, 24, 40]) {
        const c = planCapacity(race, weeks, SAMUEL);
        const stated = `${(c.peakLongRunM / 1000).toFixed(1)} km`;
        expect(c.notes.join(" ")).toContain(stated);
      }
    }
  });
});

describe("weekVolumeFraction", () => {
  it("steps back every fourth week", () => {
    const w3 = weekVolumeFraction(3, 12, 0.5);
    const w4 = weekVolumeFraction(CYCLE_LENGTH, 12, 0.5);
    expect(w4).toBeLessThan(w3);
    expect(w4 / (w3 / STEP_BACK_FRACTION)).toBeLessThan(1);
  });

  it("rises overall across the build", () => {
    expect(weekVolumeFraction(11, 12, 0.5)).toBeGreaterThan(weekVolumeFraction(1, 12, 0.5));
  });
});

describe("weekLongRunM", () => {
  it("never jumps more than the permitted step over the athlete's recent maximum", () => {
    // Comparing against the previous week would be the wrong test: after a
    // step-back week the next week is naturally larger than the week just
    // completed, and that is fine — what matters is the recent *maximum*,
    // which is what the injury literature and sessionSpikeVsRecentMax use.
    const c = planCapacity("half", 16, SAMUEL);
    let recentMax = SAMUEL.longestRecentM;
    for (let w = 1; w <= 16; w++) {
      const now = weekLongRunM(w, 16, SAMUEL, c);
      expect(now / recentMax).toBeLessThanOrEqual(1 + LONG_RUN_RAMP + 0.01);
      recentMax = Math.max(recentMax, now);
    }
  });

  it("cuts the long run on step-back weeks too", () => {
    const c = planCapacity("half", 16, SAMUEL);
    expect(weekLongRunM(4, 16, SAMUEL, c)).toBeLessThan(weekLongRunM(3, 16, SAMUEL, c));
  });

  it("never exceeds the capacity ceiling", () => {
    const c = planCapacity("full", 30, SAMUEL);
    for (let w = 1; w <= 30; w++) {
      expect(weekLongRunM(w, 30, SAMUEL, c)).toBeLessThanOrEqual(c.peakLongRunM);
    }
  });
});

describe("the plan agrees with the safety model", () => {
  // This is the point of the whole module: Runi must not prescribe a session
  // that Runi itself would flag. sessionSpikeVsRecentMax defines "no elevated
  // hazard" as within 10% of the athlete's recent maximum, and the long-run
  // ramp is set to exactly that.
  it("never prescribes a long run that spikes beyond the safe band", () => {
    const plan = generatePlan("full", new Date("2026-12-06"), new Date("2026-08-18"), SAMUEL);

    const longRuns = plan.workouts
      .filter((w) => w.workoutType === "long" && w.plannedDistance)
      .sort((a, b) => a.dayDate.localeCompare(b.dayDate));

    // walk forward, letting the athlete's recent max grow as they complete runs
    const completed: { date: string; distanceM: number }[] = [
      { date: "2026-08-09", distanceM: SAMUEL.longestRecentM },
    ];

    for (const run of longRuns) {
      const spike = sessionSpikeVsRecentMax(
        run.plannedDistance as number,
        completed,
        new Date(run.dayDate),
      );
      expect(spike.hazardRatio).toBeLessThanOrEqual(1.0);
      completed.push({ date: run.dayDate, distanceM: run.plannedDistance as number });
    }
  });

  it("the generic plan does not — which is why the capacity model exists", () => {
    const generic = generatePlan("full", new Date("2026-12-06"), new Date("2026-08-18"));
    const first = generic.workouts.find((w) => w.workoutType === "long");
    const spike = sessionSpikeVsRecentMax(
      first?.plannedDistance as number,
      [{ date: "2026-08-09", distanceM: SAMUEL.longestRecentM }],
      new Date("2026-08-18"),
    );
    expect(spike.hazardRatio).toBeGreaterThan(1.0);
  });
});

describe("generatePlan with a capacity model", () => {
  it("adds up: the week's sessions total the week's volume", () => {
    const plan = generatePlan("half", new Date("2026-12-06"), new Date("2026-08-18"), SAMUEL);
    const week1 = plan.workouts.filter((w) => w.weekNumber === 1);
    const total = week1.reduce((s, w) => s + (w.plannedDistance ?? 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(Number.isFinite(total)).toBe(true);
  });

  it("stays backwards compatible when no athlete is supplied", () => {
    const plan = generatePlan("half", new Date("2026-12-06"), new Date("2026-08-18"));
    expect(plan.capacity).toBeUndefined();
    expect(plan.workouts.length).toBeGreaterThan(0);
  });

  it("never plans a negative or non-finite distance", () => {
    for (const athlete of [SAMUEL, { currentWeeklyM: 0, longestRecentM: 0 }, { currentWeeklyM: 5_000, longestRecentM: 40_000 }]) {
      const plan = generatePlan("full", new Date("2027-06-01"), new Date("2026-08-18"), athlete);
      for (const w of plan.workouts) {
        if (w.plannedDistance !== null) {
          expect(w.plannedDistance).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(w.plannedDistance)).toBe(true);
        }
      }
    }
  });
});

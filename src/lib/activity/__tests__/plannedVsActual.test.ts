import { describe, expect, it } from "vitest";
import {
  comparePlanned,
  parsePaceLabel,
  PACE_TOLERANCE_S,
  type PlannedSession,
} from "../plannedVsActual";

/** 10.01 km in 49:10 — the run that exposed the bug this module fixes. */
const REAL_RUN = { distanceM: 10_010, durationS: 2_950 };

const session = (over: Partial<PlannedSession> = {}): PlannedSession => ({
  workoutType: "easy",
  plannedDistanceM: 10_000,
  plannedPace: "4:55",
  ...over,
});

describe("parsePaceLabel", () => {
  it("reads the format the plan stores", () => {
    expect(parsePaceLabel("5:30")).toBe(330);
    expect(parsePaceLabel("4:05")).toBe(245);
  });

  it("refuses anything that is not a pace", () => {
    expect(parsePaceLabel(null)).toBeNull();
    expect(parsePaceLabel("")).toBeNull();
    expect(parsePaceLabel("5:30/km")).toBeNull();
    expect(parsePaceLabel("5:60")).toBeNull();
    expect(parsePaceLabel("soon")).toBeNull();
  });

  it("rejects paces nobody runs", () => {
    expect(parsePaceLabel("0:45")).toBeNull();  // faster than the world record
    expect(parsePaceLabel("20:00")).toBeNull(); // slower than walking
  });
});

describe("comparePlanned", () => {
  it("says nothing at all when there was no planned session", () => {
    // This is the whole point. The old block claimed "Easy run, 6 km @ 5:30/km"
    // beside every run, whether or not one had been planned.
    expect(comparePlanned(null, REAL_RUN)).toBeNull();
  });

  it("says nothing for a run with no distance or duration", () => {
    expect(comparePlanned(session(), { distanceM: 0, durationS: 1800 })).toBeNull();
    expect(comparePlanned(session(), { distanceM: 5000, durationS: 0 })).toBeNull();
  });

  it("describes the run that was actually opened", () => {
    const c = comparePlanned(session(), REAL_RUN);
    expect(c?.actualLine).toBe("Actual · 10.0 km @ 4:55/km");
    expect(c?.plannedLine).toBe("Planned · Easy run, 10.0 km @ 4:55/km");
  });

  it("calls a run inside the tolerance on target", () => {
    const c = comparePlanned(session({ plannedPace: "5:00" }), REAL_RUN);
    expect(c?.verdict).toBe("ontarget");
  });

  it("treats the tolerance as inclusive on both sides", () => {
    // exactly 10 s/km either way is still on target; 11 is not
    const at = comparePlanned(
      session({ plannedPace: "5:00" }),
      { distanceM: 10_000, durationS: (300 + PACE_TOLERANCE_S) * 10 },
    );
    expect(at?.verdict).toBe("ontarget");

    const past = comparePlanned(
      session({ plannedPace: "5:00" }),
      { distanceM: 10_000, durationS: (300 + PACE_TOLERANCE_S + 1) * 10 },
    );
    expect(past?.verdict).toBe("tooslow");
  });

  it("names the cost of running an easy day too fast", () => {
    const c = comparePlanned(
      session({ plannedPace: "5:30" }),
      { distanceM: 10_000, durationS: 2_950 }, // 4:55/km, 35 s/km fast
    );
    expect(c?.verdict).toBe("toofast");
    expect(c?.note).toContain("35 s/km");
    expect(c?.note).toContain("recovery");
  });

  it("does not lecture about recovery on a hard day", () => {
    const c = comparePlanned(
      session({ workoutType: "tempo", plannedPace: "5:30" }),
      { distanceM: 10_000, durationS: 2_950 },
    );
    expect(c?.verdict).toBe("toofast");
    expect(c?.note).not.toContain("recovery");
  });

  it("flags a rest day rather than scoring it", () => {
    const c = comparePlanned(session({ workoutType: "rest", plannedPace: null }), REAL_RUN);
    expect(c?.verdict).toBe("unplanned");
    expect(c?.plannedLine).toBe("Planned · Rest");
  });

  it("still reports when the plan has no target pace", () => {
    const c = comparePlanned(session({ plannedPace: null }), REAL_RUN);
    expect(c?.verdict).toBe("ontarget");
    expect(c?.label).toBe("Logged");
    expect(c?.plannedPaceSec).toBeNull();
    // no pace in the planned line, because there was none
    expect(c?.plannedLine).toBe("Planned · Easy run, 10.0 km");
  });

  it("mentions distance only when it actually drifted", () => {
    const close = comparePlanned(
      session({ plannedDistanceM: 10_000, plannedPace: "4:55" }),
      REAL_RUN,
    );
    expect(close?.note).not.toMatch(/further|short/);

    const long = comparePlanned(
      session({ plannedDistanceM: 6_000, plannedPace: "4:55" }),
      REAL_RUN,
    );
    expect(long?.note).toContain("further");

    const short = comparePlanned(
      session({ plannedDistanceM: 20_000, plannedPace: "4:55" }),
      REAL_RUN,
    );
    expect(short?.note).toContain("short");
  });

  it("hands the chart the same planned pace it puts in the text", () => {
    // The shaded band on the chart and the sentence under it must come from one
    // number, or they will eventually disagree on screen.
    const c = comparePlanned(session({ plannedPace: "5:30" }), REAL_RUN);
    expect(c?.plannedPaceSec).toBe(330);
    expect(c?.plannedLine).toContain("5:30/km");
  });

  it("never renders a sixty-second pace", () => {
    for (let durationS = 1_500; durationS < 4_000; durationS++) {
      const c = comparePlanned(session(), { distanceM: 10_010, durationS });
      expect(c?.actualLine).not.toMatch(/:60/);
    }
  });
});

describe("distance is not dropped when the pace verdict fires", () => {
  const planned = { workoutType: "easy", plannedDistanceM: 6600, plannedPace: "4:57" };

  it("mentions the distance even when the pace is off target", () => {
    // The reported case: 6.6 km planned, 15.7 km run, and the app said only
    // that the pace was 20 s/km slow.
    const c = comparePlanned(planned, { distanceM: 15_700, durationS: 4985 });
    expect(c?.verdict).toBe("tooslow");
    expect(c?.note).toMatch(/9\.1 km further/);
    expect(c?.note).toMatch(/s\/km slower/);
  });

  it("leads with the distance once the drift is large", () => {
    const c = comparePlanned(planned, { distanceM: 15_700, durationS: 4985 });
    expect(c?.note.startsWith("You went")).toBe(true);
  });

  it("keeps pace first when the distance only drifted a little", () => {
    // 7.6 km against 6.6 planned: worth a mention, not worth the headline.
    const c = comparePlanned(planned, { distanceM: 7600, durationS: 2600 });
    expect(c?.note.startsWith("Pace came in")).toBe(true);
    expect(c?.note).toMatch(/1\.0 km further/);
  });

  it("says nothing about distance when it landed on the number", () => {
    const c = comparePlanned(planned, { distanceM: 6600, durationS: 2100 });
    expect(c?.note).not.toMatch(/km further|km short/);
  });

  it("appends the distance to a too-fast verdict as well", () => {
    const c = comparePlanned(planned, { distanceM: 3000, durationS: 780 });
    expect(c?.verdict).toBe("toofast");
    expect(c?.note).toMatch(/3\.6 km short/);
  });
});

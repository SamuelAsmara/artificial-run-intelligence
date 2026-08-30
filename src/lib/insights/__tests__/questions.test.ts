import { describe, expect, it } from "vitest";
import {
  QUESTIONS, questionById, filterQuestions, MIN_RUNS_PER_SIDE,
} from "@/lib/insights/questions";
import { shiftIso } from "@/lib/activity/window";
import type { InsightData, InsightRun, InsightPlanned, InsightLoad } from "@/lib/insights/types";
import type { SessionType } from "@/lib/activity/classify";

const TODAY = "2026-08-25";

let seq = 0;
function run(opts: {
  daysAgo: number;
  km?: number;
  paceSec?: number;
  hr?: number | null;
  drift?: number | null;
  type?: SessionType;
  pb?: string | null;
}): InsightRun {
  const kmv = opts.km ?? 10;
  const pace = opts.paceSec ?? 330;
  const date = shiftIso(TODAY, -opts.daysAgo);
  return {
    id: `r${seq++}`,
    date,
    dateLabel: date.slice(5),
    distanceKm: kmv,
    durationSec: Math.round(kmv * pace),
    paceSec: pace,
    avgHr: opts.hr === undefined ? 150 : opts.hr,
    cardiacDriftPct: opts.drift === undefined ? null : opts.drift,
    type: opts.type ?? "easy",
    pb: opts.pb ?? null,
  };
}

const load = (daysAgo: number, acwr: number | null, ctl = 50, tsb = 0): InsightLoad => ({
  date: shiftIso(TODAY, -daysAgo),
  ctl,
  atl: ctl - tsb,
  tsb,
  acwr,
});

const planned = (daysAgo: number, actualKm: number | null): InsightPlanned => ({
  date: shiftIso(TODAY, -daysAgo),
  workoutType: "easy",
  plannedKm: 10,
  actualKm,
  past: daysAgo > 0,
});

const data = (over: Partial<InsightData> = {}): InsightData => ({
  today: TODAY,
  runs: [],
  lthr: 165,
  planned: [],
  load: [],
  race: null,
  ...over,
});

/* ------------------------------------------------------------------ */

describe("the question set", () => {
  it("offers ten questions with unique ids", () => {
    expect(QUESTIONS).toHaveLength(10);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(10);
  });

  it("finds a question by id, and nothing by a made-up one", () => {
    expect(questionById("improvement")?.label).toMatch(/improved/);
    expect(questionById("does-not-exist")).toBeNull();
  });

  /*
   * The promise the panel makes: everything on screen answers.
   *
   * A question that threw, or returned a confident figure from an empty
   * dataset, would break exactly the contract that made this a list rather
   * than a chat box.
   */
  it("answers every question on an empty dataset, honestly", () => {
    for (const q of QUESTIONS) {
      const a = q.answer(data());
      expect(a.headline.length, q.id).toBeGreaterThan(0);
      expect(a.insufficient, q.id).toBe(true);
      expect(a.rows, q.id).toEqual([]);
    }
  });
});

describe("filterQuestions", () => {
  it("returns everything for an empty query", () => {
    expect(filterQuestions("")).toHaveLength(10);
    expect(filterQuestions("   ")).toHaveLength(10);
  });

  it("matches the label", () => {
    expect(filterQuestions("longest").map((q) => q.id)).toEqual(["longest"]);
  });

  it("matches a keyword that is not in the label", () => {
    // "acwr" appears nowhere in "Am I ramping up too fast?"
    expect(filterQuestions("acwr").map((q) => q.id)).toEqual(["ramping"]);
  });

  it("requires every word, so two words narrow rather than widen", () => {
    const one = filterQuestions("my");
    const two = filterQuestions("my longest");
    expect(one.length).toBeGreaterThan(1);
    expect(two.map((q) => q.id)).toEqual(["longest"]);
  });

  it("returns an empty list rather than pretending, and never invents a question", () => {
    expect(filterQuestions("why is my knee sore")).toEqual([]);
  });

  it("ignores case", () => {
    expect(filterQuestions("DRIFT").map((q) => q.id)).toEqual(["drift"]);
  });
});

/* ------------------------------------------------------------------ */

describe("improvement", () => {
  const q = questionById("improvement")!;
  const twoMonths = (recentPace: number, priorPace: number, hr: number | null = 150) => [
    ...[2, 8, 15, 22].map((d) => run({ daysAgo: d, paceSec: recentPace, hr })),
    ...[35, 42, 49, 56].map((d) => run({ daysAgo: d, paceSec: priorPace, hr })),
  ];

  it("declines when either month is thin", () => {
    const a = q.answer(data({ runs: [run({ daysAgo: 2 }), run({ daysAgo: 40 })] }));
    expect(a.insufficient).toBe(true);
    expect(a.detail).toContain(String(MIN_RUNS_PER_SIDE));
  });

  it("reports getting faster", () => {
    const a = q.answer(data({ runs: twoMonths(320, 340) }));
    expect(a.insufficient).toBe(false);
    expect(a.headline).toMatch(/faster/);
    expect(a.tone).toBe("positive");
  });

  it("reports getting slower without softening it", () => {
    const a = q.answer(data({ runs: twoMonths(345, 325) }));
    expect(a.headline).toMatch(/slower/);
    expect(a.tone).toBe("negative");
  });

  it("calls a small change level rather than progress", () => {
    const a = q.answer(data({ runs: twoMonths(330, 331) }));
    expect(a.headline).toMatch(/level/);
    expect(a.tone).toBeNull();
  });

  it("weights pace by distance rather than averaging the paces", () => {
    // One 2 km sprint and one 20 km steady run. The mean of the paces is 300;
    // the honest combined pace is much closer to the long run's.
    const runs = [
      run({ daysAgo: 2, km: 2, paceSec: 240 }),
      run({ daysAgo: 5, km: 20, paceSec: 360 }),
      run({ daysAgo: 9, km: 10, paceSec: 340 }),
      ...[35, 42, 49].map((d) => run({ daysAgo: d, paceSec: 340 })),
    ];
    const a = q.answer(data({ runs }));
    const row = a.rows.find((r) => r.label === "Pace this month")!;
    // Σtime / Σdistance = (480 + 7200 + 3400) / 32 = 346.25 s/km → 5:46.
    // The mean of the three paces is 313 s/km — 5:13, a third of a minute
    // per kilometre of pure arithmetic error, and always in the same
    // direction. This is the defect the aggregation audit found nine of.
    expect(row.value).toBe("5:46 /km");
  });

  it("reports efficiency when both months wore a strap", () => {
    const a = q.answer(data({ runs: twoMonths(325, 340, 150) }));
    expect(a.rows.some((r) => r.label === "Cost of a kilometre")).toBe(true);
    expect(a.caveat).toBeNull();
  });

  it("says so, rather than guessing, when heart rate is missing", () => {
    const a = q.answer(data({ runs: twoMonths(325, 340, null) }));
    expect(a.rows.some((r) => r.label === "Cost of a kilometre")).toBe(false);
    expect(a.caveat).toMatch(/no heart-rate data/);
  });
});

describe("this week", () => {
  const q = questionById("this-week")!;
  const baseline = [10, 14, 18, 22, 26].map((d) => run({ daysAgo: d, km: 10 }));

  it("declines without a baseline to compare against", () => {
    expect(q.answer(data({ runs: [run({ daysAgo: 1 })] })).insufficient).toBe(true);
  });

  it("calls an ordinary week ordinary", () => {
    // baseline is 50 km over 4 weeks = 12.5 km/week; this week 12 km.
    const a = q.answer(data({ runs: [run({ daysAgo: 1, km: 12 }), ...baseline] }));
    expect(a.headline).toMatch(/ordinary/);
    expect(a.tone).toBeNull();
  });

  it("flags a big week", () => {
    const a = q.answer(data({ runs: [run({ daysAgo: 1, km: 30 }), ...baseline] }));
    expect(a.tone).toBe("caution");
    expect(a.detail).toMatch(/load ratio/);
  });

  it("reads a cutback week as deliberate rather than as failure", () => {
    const a = q.answer(data({ runs: [run({ daysAgo: 1, km: 4 }), ...baseline] }));
    expect(a.detail).toMatch(/cutback/);
    expect(a.tone).toBeNull();
  });
});

describe("ramping", () => {
  const q = questionById("ramping")!;

  it("declines with no ratio yet", () => {
    expect(q.answer(data({ load: [load(1, null)] })).insufficient).toBe(true);
  });

  it("says yes above the risk threshold", () => {
    const a = q.answer(data({ load: [load(2, 1.2), load(1, 1.62)] }));
    expect(a.headline).toMatch(/^Yes/);
    expect(a.tone).toBe("negative");
  });

  it("says no in the safe band", () => {
    const a = q.answer(data({ load: [load(2, 1.0), load(1, 1.05)] }));
    expect(a.headline).toMatch(/^No/);
    expect(a.tone).toBe("positive");
  });

  it("flags detraining at the bottom of the range too", () => {
    const a = q.answer(data({ load: [load(1, 0.6)] }));
    expect(a.headline).toMatch(/below what you have absorbed/);
    expect(a.tone).toBe("caution");
  });

  it("counts the days spent over the line", () => {
    const series = [load(3, 1.7), load(2, 1.6), load(1, 1.1)];
    const a = q.answer(data({ load: series }));
    expect(a.rows.find((r) => r.label === "Days above it, last 14")!.value).toBe("2");
  });
});

describe("adherence", () => {
  const q = questionById("adherence")!;

  it("declines when there is no plan", () => {
    expect(q.answer(data()).insufficient).toBe(true);
  });

  it("never counts a session still ahead as missed", () => {
    const a = q.answer(data({
      planned: [planned(3, 10), planned(1, 10), { ...planned(0, null), past: false }],
    }));
    expect(a.headline).toBe("2 of 2 sessions done — 100%.");
  });

  it("reports the misses plainly", () => {
    const a = q.answer(data({ planned: [planned(5, 10), planned(3, null), planned(1, 10)] }));
    expect(a.headline).toMatch(/2 of 3/);
    expect(a.detail).toMatch(/1 session was not run/);
    expect(a.tone).toBe("caution");
  });

  it("ignores planned days older than four weeks", () => {
    const a = q.answer(data({ planned: [planned(40, null), planned(2, 10)] }));
    expect(a.headline).toMatch(/1 of 1/);
  });
});

describe("easy share", () => {
  const q = questionById("easy-share")!;

  it("declines on a thin month", () => {
    expect(q.answer(data({ runs: [run({ daysAgo: 1 })] })).insufficient).toBe(true);
  });

  it("measures time, not run count", () => {
    // Four short hard runs and one long easy one: by count that is 80% hard,
    // by time it is mostly easy — and time is what training load follows.
    const runs = [
      run({ daysAgo: 1, km: 20, paceSec: 360, hr: 140 }),
      ...[2, 3, 4, 5].map((d) => run({ daysAgo: d, km: 3, paceSec: 260, hr: 178 })),
    ];
    const a = q.answer(data({ runs }));
    expect(a.headline).toMatch(/7[0-9]%|8[0-9]%/);
  });

  it("praises a well-shaped month", () => {
    const runs = [
      ...[1, 3, 5, 7, 9].map((d) => run({ daysAgo: d, km: 10, hr: 140 })),
      run({ daysAgo: 11, km: 5, paceSec: 270, hr: 180 }),
    ];
    const a = q.answer(data({ runs }));
    expect(a.tone).toBe("positive");
  });

  it("flags the grey-middle month", () => {
    const runs = [1, 3, 5, 7, 9].map((d) => run({ daysAgo: d, km: 10, hr: 178 }));
    const a = q.answer(data({ runs }));
    expect(a.tone).toBe("caution");
    expect(a.detail).toMatch(/too fast/);
  });

  it("falls back to session type and says so when there is no threshold", () => {
    const runs = [1, 3, 5, 7].map((d) => run({ daysAgo: d, hr: null, type: "easy" }));
    const a = q.answer(data({ runs, lthr: null }));
    expect(a.caveat).toMatch(/inferred session type/);
  });
});

describe("drift", () => {
  const q = questionById("drift")!;
  const months = (recent: number, prior: number) => [
    ...[2, 8, 15].map((d) => run({ daysAgo: d, drift: recent })),
    ...[35, 42, 49].map((d) => run({ daysAgo: d, drift: prior })),
  ];

  it("declines when too few runs carry a drift reading", () => {
    const a = q.answer(data({ runs: [run({ daysAgo: 2, drift: 4 }), ...[35, 42, 49].map((d) => run({ daysAgo: d, drift: 6 }))] }));
    expect(a.insufficient).toBe(true);
  });

  it("reads a fall as improvement", () => {
    const a = q.answer(data({ runs: months(3.0, 6.0) }));
    expect(a.headline).toMatch(/Improving/);
    expect(a.tone).toBe("positive");
  });

  it("reads a rise as worsening, and blames nothing it cannot see", () => {
    const a = q.answer(data({ runs: months(7.0, 4.0) }));
    expect(a.headline).toMatch(/Worsening/);
    expect(a.caveat).toMatch(/Heat/);
  });

  it("calls a small change steady", () => {
    const a = q.answer(data({ runs: months(4.1, 4.0) }));
    expect(a.headline).toMatch(/Steady/);
    expect(a.tone).toBeNull();
  });
});

describe("pace by type", () => {
  const q = questionById("pace-by-type")!;

  it("declines on too few runs", () => {
    expect(q.answer(data({ runs: [run({ daysAgo: 1 })] })).insufficient).toBe(true);
  });

  it("groups by type and draws faster sessions as taller bars", () => {
    const runs = [
      ...[1, 3].map((d) => run({ daysAgo: d, paceSec: 340, type: "easy" })),
      ...[5, 7].map((d) => run({ daysAgo: d, paceSec: 285, type: "int" })),
    ];
    const a = q.answer(data({ runs }));
    expect(a.rows).toHaveLength(2);
    const easy = a.bars!.find((b) => b.label === "Easy")!;
    const int = a.bars!.find((b) => b.label === "Intervals")!;
    expect(int.value).toBeGreaterThan(easy.value);
    expect(easy.caption).toBe("5:40");
  });

  it("says the types are inferred", () => {
    const runs = [1, 3, 5].map((d) => run({ daysAgo: d }));
    expect(q.answer(data({ runs })).caveat).toMatch(/inferred/);
  });
});

describe("best runs", () => {
  const q = questionById("best-runs")!;

  it("declines on fewer than three runs", () => {
    expect(q.answer(data({ runs: [run({ daysAgo: 1 })] })).insufficient).toBe(true);
  });

  it("puts a record ahead of a merely fast run", () => {
    const runs = [
      run({ daysAgo: 1, paceSec: 300 }),
      run({ daysAgo: 3, paceSec: 340, pb: "10K PB" }),
      run({ daysAgo: 5, paceSec: 320 }),
    ];
    const a = q.answer(data({ runs }));
    expect(a.headline).toMatch(/10K PB/);
    expect(a.rows[0].tone).toBe("positive");
  });

  it("ranks by pace when nothing set a record", () => {
    const runs = [
      run({ daysAgo: 1, paceSec: 340 }),
      run({ daysAgo: 3, paceSec: 300 }),
      run({ daysAgo: 5, paceSec: 320 }),
    ];
    const a = q.answer(data({ runs })).rows.map((r) => r.value);
    expect(a[0]).toMatch(/5:00/);
  });
});

describe("longest", () => {
  const q = questionById("longest")!;

  it("declines with no runs", () => {
    expect(q.answer(data()).insufficient).toBe(true);
  });

  it("names the longest and the next longest", () => {
    const runs = [
      run({ daysAgo: 1, km: 12 }),
      run({ daysAgo: 8, km: 26 }),
      run({ daysAgo: 15, km: 18 }),
    ];
    const a = q.answer(data({ runs }));
    expect(a.headline).toMatch(/26\.0 km/);
    expect(a.rows.find((r) => r.label === "Next longest")!.value).toMatch(/18\.0 km/);
  });
});

describe("goal race", () => {
  const q = questionById("goal")!;

  it("declines with no race set, and says how to set one", () => {
    const a = q.answer(data());
    expect(a.insufficient).toBe(true);
    expect(a.detail).toMatch(/Settings/);
  });

  it("counts the days out", () => {
    const a = q.answer(data({
      race: { label: "Half marathon", date: shiftIso(TODAY, 21), targetSec: 5880 },
      load: [load(1, 1.0, 62, -4)],
    }));
    expect(a.headline).toMatch(/21 days away/);
    expect(a.rows.find((r) => r.label === "Target time")!.value).toBe("1:38:00");
  });

  it("does not call a past race upcoming", () => {
    const a = q.answer(data({ race: { label: "10K", date: shiftIso(TODAY, -5), targetSec: null } }));
    expect(a.headline).toMatch(/already been run/);
  });

  it("flags deep fatigue close to race day", () => {
    const a = q.answer(data({
      race: { label: "5K", date: shiftIso(TODAY, 6), targetSec: null },
      load: [load(1, 1.4, 60, -26)],
    }));
    expect(a.tone).toBe("caution");
    expect(a.detail).toMatch(/fatigue/);
  });
});

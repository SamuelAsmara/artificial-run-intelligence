import { describe, expect, it } from "vitest";
import {
  classify, medianPace, paceOf, LONG_RUN_KM, INTERVAL_RATIO, TEMPO_RATIO,
} from "@/lib/activity/classify";

const run = (distanceKm: number, paceSec: number) => ({ distanceKm, paceSec });

describe("medianPace", () => {
  it("is null with nothing to measure", () => {
    expect(medianPace([])).toBeNull();
  });

  it("ignores runs with no distance or no time", () => {
    expect(medianPace([run(0, 300), run(5, 0), run(5, 320)])).toBe(320);
  });

  it("takes the middle of an odd count", () => {
    expect(medianPace([run(5, 300), run(5, 340), run(5, 320)])).toBe(320);
  });

  it("averages the two middle values of an even count", () => {
    // Not the slower of the two: a two-run history would otherwise label the
    // faster run as an interval session against its own partner.
    expect(medianPace([run(5, 300), run(5, 340)])).toBe(320);
  });

  it("is not dragged by one outlier the way a mean would be", () => {
    const runs = [run(5, 330), run(5, 335), run(5, 340), run(5, 345), run(3, 210)];
    const mean = runs.reduce((s, r) => s + r.paceSec, 0) / runs.length;
    expect(medianPace(runs)).toBe(335);
    expect(mean).toBeLessThan(330);
  });
});

describe("classify", () => {
  const median = 330;

  it("calls anything long enough a long run whatever the pace", () => {
    expect(classify(run(LONG_RUN_KM, 250), median)).toBe("long");
    expect(classify(run(LONG_RUN_KM + 8, 400), median)).toBe("long");
  });

  it("reads a clearly fast short run as intervals", () => {
    expect(classify(run(8, median * INTERVAL_RATIO), median)).toBe("int");
    expect(classify(run(8, median * 0.85), median)).toBe("int");
  });

  it("reads a moderately fast run as a tempo", () => {
    expect(classify(run(8, median * TEMPO_RATIO), median)).toBe("tempo");
  });

  it("reads everything else as easy", () => {
    expect(classify(run(8, median), median)).toBe("easy");
    expect(classify(run(8, median * 1.1), median)).toBe("easy");
  });

  it("is relative, so the same pace means different things to different athletes", () => {
    const fast = 260;
    const slow = 380;
    // 4:20/km is an easy jog for one athlete and a hard session for the other.
    expect(classify(run(8, 260), fast)).toBe("easy");
    expect(classify(run(8, 260), slow)).toBe("int");
  });

  it("says easy rather than inventing a spread when there is no median", () => {
    expect(classify(run(8, 240), null)).toBe("easy");
    expect(classify(run(8, 240), 0)).toBe("easy");
  });
});

describe("paceOf", () => {
  it("is seconds per kilometre", () => {
    expect(paceOf({ distanceKm: 10, durationSec: 3000 })).toBe(300);
  });

  it("is null rather than zero or Infinity on an unusable run", () => {
    expect(paceOf({ distanceKm: 0, durationSec: 3000 })).toBeNull();
    expect(paceOf({ distanceKm: 10, durationSec: 0 })).toBeNull();
  });
});

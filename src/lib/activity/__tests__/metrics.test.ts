import { describe, expect, it } from "vitest";
import {
  CLIMB_THRESHOLD_M, FLAT_COST, driftOnset, energyCost, fastestSegment,
  gradeAdjustedPace, readableSegments, segments, summarise, totalClimb,
} from "../metrics";
import { resampleForChart, type RawStreams } from "../resample";

/**
 * A synthetic run at 1 Hz, resampled the same way a real one is.
 * @param grade rise in metres per second of running, as a function of time
 */
function chart(
  secs: number,
  mps: number | ((t: number) => number),
  hr?: number | ((t: number) => number),
  grade: (t: number) => number = () => 0,
) {
  const time: number[] = [], distance: number[] = [];
  const velocity: (number | null)[] = [], heartrate: (number | null)[] = [];
  const altitude: (number | null)[] = [], cadence: (number | null)[] = [];
  const power: (number | null)[] = [];
  let d = 0, a = 40;
  for (let t = 0; t < secs; t++) {
    const v = typeof mps === "function" ? mps(t) : mps;
    time.push(t); distance.push(d); d += v;
    velocity.push(v);
    heartrate.push(hr === undefined ? null : typeof hr === "function" ? hr(t) : hr);
    a += grade(t);
    altitude.push(a);
    cadence.push(170);
    power.push(260);
  }
  const raw: RawStreams = { time, distance, velocity, heartrate, altitude, cadence, power };
  return resampleForChart(raw)!;
}

describe("energyCost", () => {
  it("matches Minetti's flat value", () => {
    expect(FLAT_COST).toBeCloseTo(3.6, 5);
  });

  it("makes uphill cost more than flat", () => {
    expect(energyCost(0.05)).toBeGreaterThan(FLAT_COST);
    expect(energyCost(0.15)).toBeGreaterThan(energyCost(0.05));
  });

  it("makes a gentle descent cheaper than flat", () => {
    expect(energyCost(-0.1)).toBeLessThan(FLAT_COST);
  });

  it("makes a steep descent cost more again — braking is work", () => {
    // The asymmetry a linear grade adjustment gets wrong.
    expect(energyCost(-0.4)).toBeGreaterThan(energyCost(-0.2));
  });

  it("clamps rather than returning nonsense off the fitted range", () => {
    expect(Number.isFinite(energyCost(5))).toBe(true);
    expect(Number.isFinite(energyCost(-5))).toBe(true);
    expect(energyCost(5)).toBe(energyCost(0.45));
  });
});

describe("gradeAdjustedPace", () => {
  it("equals real pace on flat ground", () => {
    const s = chart(1800, 1000 / 300);
    expect(gradeAdjustedPace(s)!).toBeCloseTo(300, 0);
  });

  it("reports a climb as faster than the clock said", () => {
    // 5:30/km up a steady 5% grade is a better effort than 5:30 on the flat
    const s = chart(1800, 1000 / 330, undefined, () => (1000 / 330) * 0.05);
    expect(gradeAdjustedPace(s)!).toBeLessThan(330);
  });

  it("reports a gentle descent as slower than the clock said", () => {
    const s = chart(1800, 1000 / 270, undefined, () => -(1000 / 270) * 0.05);
    expect(gradeAdjustedPace(s)!).toBeGreaterThan(270);
  });

  it("returns null when there was no running", () => {
    expect(gradeAdjustedPace(chart(600, 0))).toBeNull();
  });
});

describe("totalClimb", () => {
  it("counts a real hill", () => {
    const s = chart(1200, 3, undefined, (t) => (t < 600 ? 0.05 : -0.05));
    expect(totalClimb(s.alt)).toBeGreaterThan(25);
  });

  it("is not inflated by barometric noise", () => {
    // flat ground, altimeter jittering under the threshold
    const alt = Array.from({ length: 3600 }, (_, i) => 40 + (i % 2) * (CLIMB_THRESHOLD_M - 0.5));
    expect(totalClimb(alt)).toBe(0);
  });

  it("is zero for a genuinely flat run", () => {
    expect(totalClimb(chart(1800, 3).alt)).toBe(0);
  });

  it("survives a stream with no altitude", () => {
    expect(totalClimb([])).toBe(0);
  });
});

describe("driftOnset", () => {
  it("refuses to answer for a short run", () => {
    expect(driftOnset(chart(600, 3, 150))).toBeNull();
  });

  it("refuses to answer without heart rate", () => {
    expect(driftOnset(chart(3600, 3))).toBeNull();
  });

  it("finds nothing in a genuinely steady run", () => {
    expect(driftOnset(chart(3600, 3, 150))).toBeNull();
  });

  it("finds the point where heart rate detached from pace", () => {
    // steady speed; heart rate flat until 30 min, then climbing hard
    const s = chart(4200, 3, (t) => (t < 1800 ? 150 : 150 + (t - 1800) * 0.02));
    const onset = driftOnset(s);
    expect(onset).not.toBeNull();
    // 3 m/s for 1800 s is 5400 m; allow the rolling window its lag
    expect(onset!).toBeGreaterThan(4500);
    expect(onset!).toBeLessThan(8000);
  });

  it("is not fooled by a hill", () => {
    // A real climb: heart rate up because the work is genuinely harder. Grade
    // adjustment should absorb this entirely.
    const s = chart(
      4200, 3,
      (t) => (t >= 1200 && t < 1800 ? 172 : 150),
      (t) => (t >= 1200 && t < 1800 ? 3 * 0.06 : 0),
    );
    expect(driftOnset(s)).toBeNull();
  });

  it("is not fooled by a surge that recovers", () => {
    // Five hard minutes in the middle, then back to normal. The rolling window
    // smears this well past any short persistence test, so what rules it out is
    // that the ratio came back down by the finish.
    const s = chart(4200, 3, (t) => (t >= 1200 && t < 1500 ? 180 : 150));
    expect(driftOnset(s)).toBeNull();
  });

  it("does not claim an onset it cannot prove", () => {
    // heart rate lifts in the final minute — too late to hold for three
    const s = chart(3600, 3, (t) => (t > 3540 ? 185 : 150));
    expect(driftOnset(s)).toBeNull();
  });
});

describe("segments", () => {
  it("gives one column per kilometre", () => {
    const s = chart(3000, 1000 / 300, 150); // 10 km at 5:00/km
    const list = segments(s);
    expect(list.length).toBe(10);
    expect(list[0].label).toBe("1");
  });

  it("gets the pace of each kilometre right", () => {
    const s = chart(3000, 1000 / 300, 150);
    for (const seg of segments(s)) expect(seg.paceSec).toBeGreaterThan(280);
    for (const seg of segments(s)) expect(seg.paceSec).toBeLessThan(320);
  });

  it("folds a trailing sliver into the kilometre before it", () => {
    // 10.08 km — the 80 m tail is not a kilometre
    const s = chart(3024, 1000 / 300, 150);
    const list = segments(s);
    expect(list.length).toBe(10);
    expect(list[9].distanceM).toBeGreaterThan(1000);
  });

  it("covers the whole run", () => {
    const s = chart(3000, 1000 / 300, 150);
    const covered = segments(s).reduce((sum, x) => sum + x.distanceM, 0);
    expect(covered).toBeCloseTo(s.dist[s.n - 1] - s.dist[0], 0);
  });

  it("groups rather than truncating a long run", () => {
    // a marathon must not silently lose its last twelve kilometres
    const s = chart(3 * 60 * 60, 42195 / (3 * 60 * 60), 150);
    const list = readableSegments(s);
    expect(list.length).toBeLessThanOrEqual(15);
    const covered = list.reduce((sum, x) => sum + x.distanceM, 0);
    expect(covered / (s.dist[s.n - 1] - s.dist[0])).toBeGreaterThan(0.99);
    expect(list[0].label).toContain("-");
  });

  it("keeps per-kilometre columns for a normal run", () => {
    const s = chart(3000, 1000 / 300, 150);
    expect(readableSegments(s)[0].label).toBe("1");
  });
});

describe("fastestSegment", () => {
  it("finds the quickest kilometre", () => {
    // progressive: each kilometre faster than the last
    const s = chart(3000, (t) => 3 + (t / 3000) * 0.8, 150);
    const list = segments(s);
    expect(fastestSegment(list)).toBe(list.length - 1);
  });

  it("returns -1 when there is nothing to compare", () => {
    expect(fastestSegment([])).toBe(-1);
  });
});

describe("summarise", () => {
  it("describes the whole run by default", () => {
    const s = chart(3000, 1000 / 300, 150);
    const all = summarise(s);
    expect(all.distanceM).toBeCloseTo(10_000, -2);
    expect(all.paceSec!).toBeCloseTo(300, 0);
    expect(all.avgHr).toBe(150);
    expect(all.speedKmh!).toBeCloseTo(12, 1);
  });

  it("describes only the selected range", () => {
    // slow first half, fast second half
    const s = chart(3000, (t) => (t < 1500 ? 1000 / 360 : 1000 / 250), 150);
    const half = Math.floor(s.n / 2);
    const first = summarise(s, 0, half);
    const second = summarise(s, half, s.n - 1);
    expect(first.paceSec!).toBeGreaterThan(second.paceSec!);
  });

  it("tolerates the range being handed over backwards", () => {
    const s = chart(3000, 1000 / 300, 150);
    expect(summarise(s, 100, 20).distanceM).toBe(summarise(s, 20, 100).distanceM);
  });

  it("reports max heart rate, not just average", () => {
    const s = chart(3000, 1000 / 300, (t) => (t > 2000 ? 180 : 140));
    const all = summarise(s);
    expect(all.maxHr!).toBeGreaterThan(all.avgHr!);
  });

  it("returns nulls rather than zeros for channels the device never sent", () => {
    const s = chart(1800, 3);
    expect(summarise(s).avgHr).toBeNull();
  });
});

describe("moving time", () => {
  it("excludes the time the athlete stood still", () => {
    // 50 minutes of recording with five of them standing at a crossing
    const s = chart(3000, (t) => (t >= 1200 && t < 1500 ? 0 : 1000 / 300), 150);
    const all = summarise(s);
    expect(all.elapsedS).toBeCloseTo(2999, -1);
    expect(all.durationS).toBeLessThan(all.elapsedS - 250);
    expect(all.stoppedS).toBeGreaterThan(250);
  });

  it("reports the pace the athlete actually ran", () => {
    // Without this the two-minute stop on a real 10 km run showed 5:08/km in
    // the header while the watch said 4:55.
    const s = chart(3000, (t) => (t >= 1200 && t < 1500 ? 0 : 1000 / 300), 150);
    const all = summarise(s);
    expect(all.paceSec!).toBeGreaterThan(290);
    expect(all.paceSec!).toBeLessThan(310);
  });

  it("reports no stopped time for a run with none", () => {
    expect(summarise(chart(1800, 3, 150)).stoppedS).toBe(0);
  });

  it("makes moving and stopped add up to the clock", () => {
    const s = chart(3000, (t) => (t >= 600 && t < 900 ? 0 : 3), 150);
    const all = summarise(s);
    expect(all.durationS + all.stoppedS).toBeCloseTo(all.elapsedS, 0);
  });
});

describe("the trailing part-kilometre", () => {
  it("absorbs up to half a kilometre rather than making a stub column", () => {
    const s = chart(3 * 1000 + 120, 1000 / 300, 150); // 10.4 km
    const list = segments(s);
    expect(list.length).toBe(10);
  });

  it("says so in the label once the last segment is materially longer", () => {
    const s = chart(3 * 1000 + 120, 1000 / 300, 150);
    const last = segments(s)[9];
    // absorbing is fine; pretending it was a kilometre is not
    expect(last.label).toMatch(/km/);
    expect(last.distanceM).toBeGreaterThan(1300);
  });

  it("leaves an ordinary final kilometre alone", () => {
    const s = chart(3000, 1000 / 300, 150);
    expect(segments(s)[9].label).toBe("10");
  });

  it("still covers the whole run after absorbing", () => {
    const s = chart(3 * 1000 + 120, 1000 / 300, 150);
    const covered = segments(s).reduce((sum, x) => sum + x.distanceM, 0);
    expect(covered).toBeCloseTo(s.dist[s.n - 1] - s.dist[0], 0);
  });
});

describe("the device's moving time wins", () => {
  /**
   * A run whose stream implies 2400 s of movement, while the watch reported
   * 2390. The watch is right by definition — it is the number the athlete has
   * already seen — and an app that argues with it by ten seconds reads as
   * unreliable.
   */
  const s = () => chart(3000, (t) => (t >= 1200 && t < 1800 ? 0 : 1000 / 300), 150);

  it("reports exactly what the watch reported", () => {
    expect(summarise(s(), 0, s().n - 1, 2390).durationS).toBe(2390);
  });

  it("derives pace from the watch's time, not from its own count", () => {
    const all = summarise(s(), 0, s().n - 1, 2390);
    expect(all.paceSec!).toBeCloseTo(2390 / (all.distanceM / 1000), 5);
  });

  it("still falls back to its own count when the watch said nothing", () => {
    const all = summarise(s());
    expect(all.durationS).toBeGreaterThan(0);
    expect(all.durationS).toBeLessThan(all.elapsedS);
  });

  it("keeps a selection consistent with the whole", () => {
    // Parts must sum to the authoritative whole, or dragging the full width
    // would disagree with the header it is meant to replace.
    const run = s();
    const whole = summarise(run, 0, run.n - 1, 2390);
    const first = summarise(run, 0, Math.floor(run.n / 2), 2390);
    const second = summarise(run, Math.floor(run.n / 2), run.n - 1, 2390);
    expect(first.durationS + second.durationS).toBeCloseTo(whole.durationS, -1);
  });

  it("never claims more movement than the clock allows", () => {
    // A wildly wrong authoritative value must not produce a range that moved
    // for longer than it lasted.
    const run = s();
    const part = summarise(run, 0, 20, 99_999);
    expect(part.durationS).toBeLessThanOrEqual(part.elapsedS);
  });
});

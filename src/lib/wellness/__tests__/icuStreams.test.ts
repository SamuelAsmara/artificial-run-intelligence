import { describe, expect, it } from "vitest";
import {
  bestEfforts, cardiacDriftPct, deriveFromStreams, paceShape,
  PR_DISTANCES, SPARK_POINTS, type ActivityStreams,
} from "../icuStreams";

/**
 * Builds a synthetic run.
 * @param secs   duration
 * @param mps    speed, constant or a function of the second
 * @param hr     heart rate, constant or a function of the second
 */
function run(
  secs: number,
  mps: number | ((t: number) => number),
  hr?: number | ((t: number) => number),
): ActivityStreams {
  const time: number[] = [];
  const distance: number[] = [];
  const velocity: (number | null)[] = [];
  const heartrate: (number | null)[] = [];
  // A gentle rise and fall, so elevation is present without being the subject
  // of any assertion here.
  const altitude: (number | null)[] = [];
  const cadence: (number | null)[] = [];
  const power: (number | null)[] = [];
  let d = 0;
  for (let t = 0; t < secs; t++) {
    const v = typeof mps === "function" ? mps(t) : mps;
    time.push(t);
    // real streams start at zero and accumulate after the first sample
    distance.push(d);
    d += v;
    velocity.push(v);
    heartrate.push(hr === undefined ? null : typeof hr === "function" ? hr(t) : hr);
    altitude.push(40 + Math.sin((t / secs) * Math.PI) * 12);
    cadence.push(168);
    power.push(260);
  }
  return { time, distance, velocity, heartrate, altitude, cadence, power };
}

describe("bestEfforts", () => {
  it("finds a 5K inside a longer run", () => {
    // 10 km at exactly 4:00/km — every 5 km window takes 1200 s
    const s = run(2400, 1000 / 240);
    const efforts = bestEfforts(s);
    expect(efforts["5k"]).toBeGreaterThanOrEqual(1195);
    expect(efforts["5k"]).toBeLessThanOrEqual(1205);
  });

  it("only reports distances the run actually covered", () => {
    // 1210 s at 4:00/km covers just over 5 km — a run of exactly 1200 samples
    // covers 1199 intervals and lands 4 m short, which is a real distinction
    // and not one the test should paper over.
    const s = run(1210, 1000 / 240);
    const efforts = bestEfforts(s);
    expect(efforts["1k"]).toBeDefined();
    expect(efforts["5k"]).toBeDefined();
    expect(efforts["10k"]).toBeUndefined();
    expect(efforts.marathon).toBeUndefined();
  });

  it("finds the fast kilometre in an otherwise easy run", () => {
    // 20 minutes easy, one minute hard in the middle, then easy again
    const s = run(1800, (t) => (t >= 900 && t < 1080 ? 1000 / 180 : 1000 / 330));
    const efforts = bestEfforts(s);
    // the surge alone covers 1 km, so the best kilometre must beat easy pace
    expect(efforts["1k"]).toBeLessThan(330);
  });

  it("never reports a best slower than the whole run's average", () => {
    const s = run(2400, 1000 / 240);
    const efforts = bestEfforts(s);
    for (const [label, seconds] of Object.entries(efforts)) {
      const perKm = seconds / (PR_DISTANCES[label] / 1000);
      expect(perKm).toBeLessThanOrEqual(245);
    }
  });

  it("returns nothing for a run shorter than every tracked distance", () => {
    expect(bestEfforts(run(120, 3))).toEqual({});
  });
});

describe("paceShape", () => {
  it("returns seconds per kilometre", () => {
    const s = run(1200, 1000 / 300); // 5:00/km
    const shape = paceShape(s);
    for (const p of shape) {
      expect(p).not.toBeNull();
      expect(p as number).toBeGreaterThan(290);
      expect(p as number).toBeLessThan(310);
    }
  });

  it("stays within the point budget", () => {
    expect(paceShape(run(3600, 3)).length).toBeLessThanOrEqual(SPARK_POINTS);
  });

  it("shows the shape of a run that started fast and faded", () => {
    const s = run(1800, (t) => (t < 900 ? 1000 / 240 : 1000 / 330));
    const shape = paceShape(s).filter((p): p is number => p !== null);
    expect(shape[0]).toBeLessThan(shape[shape.length - 1]);
  });

  it("does not let a stop become a pace spike", () => {
    // thirty seconds standing still at a crossing
    const s = run(1200, (t) => (t >= 600 && t < 630 ? 0 : 1000 / 300));
    const values = paceShape(s).filter((p): p is number => p !== null);
    for (const v of values) expect(v).toBeLessThan(320);
  });

  it("survives a run with no speed data", () => {
    const s: ActivityStreams = { time: [0, 1], distance: [0, 3], heartrate: [], velocity: [], altitude: [], cadence: [], power: [] };
    expect(paceShape(s)).toEqual([]);
  });
});

describe("cardiacDriftPct", () => {
  it("is near zero for a genuinely steady run", () => {
    const s = run(3600, 3, 150);
    const drift = cardiacDriftPct(s);
    expect(drift).not.toBeNull();
    expect(Math.abs(drift as number)).toBeLessThan(1);
  });

  it("detects heart rate climbing at unchanged pace", () => {
    // same speed throughout, heart rate rising from 140 to 160
    const s = run(3600, 3, (t) => 140 + (t / 3600) * 20);
    const drift = cardiacDriftPct(s);
    expect(drift).not.toBeNull();
    expect(drift as number).toBeGreaterThan(5);
  });

  it("refuses to answer for a short run", () => {
    expect(cardiacDriftPct(run(900, 3, 150))).toBeNull();
  });

  it("refuses to answer without heart rate", () => {
    expect(cardiacDriftPct(run(3600, 3))).toBeNull();
  });
});

describe("deriveFromStreams", () => {
  it("produces all three summaries from one pass", () => {
    const d = deriveFromStreams(run(3600, 1000 / 300, 150));
    expect(d.paceShape.length).toBeGreaterThan(0);
    expect(d.bestEfforts["5k"]).toBeDefined();
    expect(d.cardiacDriftPct).not.toBeNull();
  });

  it("never emits NaN", () => {
    const d = deriveFromStreams(run(3600, (t) => (t % 100 === 0 ? 0 : 3), 150));
    expect(JSON.stringify(d)).not.toMatch(/null,null,null,null|NaN/);
    for (const v of Object.values(d.bestEfforts)) expect(Number.isFinite(v)).toBe(true);
  });
});

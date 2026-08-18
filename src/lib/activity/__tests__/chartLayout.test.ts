import { describe, expect, it } from "vitest";
import {
  ALL_BANDS, BAND_BOTTOM, BAND_TOP, X0, X1,
  bandAt, distanceTicks, layoutBands, timeTicks, type BandRange,
} from "../chartLayout";
import { formatMinSec } from "@/lib/format/pace";

const FIVE: BandRange[] = [
  { id: "pace", lo: 240, hi: 392, inverted: true },
  { id: "power", lo: 0, hi: 580 },
  { id: "hr", lo: 93, hi: 184 },
  { id: "cadence", lo: 158, hi: 192 },
  { id: "altitude", lo: 7, hi: 19 },
];

describe("layoutBands", () => {
  it("fills the vertical space exactly", () => {
    const bands = layoutBands(FIVE);
    expect(bands[0].top).toBe(BAND_TOP);
    expect(bands[bands.length - 1].bottom).toBeCloseTo(BAND_BOTTOM, 5);
  });

  it("leaves no gap or overlap between bands", () => {
    const bands = layoutBands(FIVE);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].top).toBeCloseTo(bands[i - 1].bottom, 5);
    }
  });

  it("gives the remaining bands the space when a run has no power", () => {
    // A run logged by hand has no power and no cadence. An empty band labelled
    // "Power" would be worse than no band.
    const four = layoutBands(FIVE.filter((b) => b.id !== "power"));
    const five = layoutBands(FIVE);
    expect(four.length).toBe(4);
    expect(four[0].bottom - four[0].top).toBeGreaterThan(five[0].bottom - five[0].top);
    expect(four[four.length - 1].bottom).toBeCloseTo(BAND_BOTTOM, 5);
  });

  it("keeps the handoff's order whichever bands survive", () => {
    const ids = layoutBands(FIVE.filter((b) => b.id !== "cadence")).map((b) => b.id);
    expect(ids).toEqual(["pace", "power", "hr", "altitude"]);
  });

  it("draws pace inverted — faster is up", () => {
    const [pace] = layoutBands(FIVE);
    // 4:00/km is faster than 6:00/km, so it must sit higher, i.e. smaller y
    expect(pace.y(240)).toBeLessThan(pace.y(360));
  });

  it("draws every other band the usual way up", () => {
    const hr = layoutBands(FIVE).find((b) => b.id === "hr")!;
    expect(hr.y(180)).toBeLessThan(hr.y(100));
  });

  it("clamps a value past the range into the band", () => {
    const [pace] = layoutBands(FIVE);
    // a stop makes pace enormous; it must land on the floor, not off the canvas
    expect(pace.y(9999)).toBeLessThanOrEqual(pace.plotBottom);
    expect(pace.y(9999)).toBeGreaterThanOrEqual(pace.plotTop);
    expect(pace.y(1)).toBeGreaterThanOrEqual(pace.plotTop);
  });

  it("never returns NaN, even for a degenerate range", () => {
    const flat = layoutBands([{ id: "cadence", lo: 170, hi: 170 }]);
    expect(Number.isFinite(flat[0].y(170))).toBe(true);
    expect(Number.isFinite(flat[0].y(NaN))).toBe(true);
  });

  it("reads a value back off a position", () => {
    const hr = layoutBands(FIVE).find((b) => b.id === "hr")!;
    for (const v of [100, 130, 150, 180]) {
      expect(hr.valueAt(hr.y(v))).toBeCloseTo(v, 5);
    }
  });

  it("round-trips an inverted band too", () => {
    const [pace] = layoutBands(FIVE);
    for (const v of [250, 300, 350, 390]) {
      expect(pace.valueAt(pace.y(v))).toBeCloseTo(v, 5);
    }
  });

  it("returns nothing when the run has no bands at all", () => {
    expect(layoutBands([])).toEqual([]);
  });

  it("knows every band the design defines", () => {
    expect(ALL_BANDS.map((b) => b.id)).toEqual(
      ["pace", "power", "hr", "cadence", "altitude"],
    );
  });
});

describe("bandAt", () => {
  it("finds the band under the cursor", () => {
    const bands = layoutBands(FIVE);
    expect(bandAt(bands, bands[2].top + 1)!.id).toBe("hr");
  });

  it("returns null above and below the chart", () => {
    const bands = layoutBands(FIVE);
    expect(bandAt(bands, 0)).toBeNull();
    expect(bandAt(bands, 400)).toBeNull();
  });

  it("covers every pixel between the first and last band", () => {
    const bands = layoutBands(FIVE);
    for (let y = BAND_TOP; y < BAND_BOTTOM; y++) {
      expect(bandAt(bands, y), `y=${y}`).not.toBeNull();
    }
  });
});

describe("distanceTicks", () => {
  const x = (m: number) => X0 + (m / 10_000) * (X1 - X0);

  it("ticks every half kilometre over ten", () => {
    const ticks = distanceTicks(10_000, x);
    expect(ticks.some((t) => t.label === "0.5")).toBe(true);
    expect(ticks.filter((t) => t.major).length).toBe(10);
  });

  it("opens the spacing out for a marathon rather than drawing a fence", () => {
    const long = (m: number) => X0 + (m / 42_195) * (X1 - X0);
    const ticks = distanceTicks(42_195, long);
    expect(ticks.length).toBeLessThan(25);
  });

  it("always ticks the finish", () => {
    const ticks = distanceTicks(10_010, x);
    expect(ticks[ticks.length - 1].label).toBe("10");
  });

  it("keeps every tick inside the plot", () => {
    for (const total of [3_000, 10_000, 21_097, 42_195]) {
      const f = (m: number) => X0 + (m / total) * (X1 - X0);
      for (const t of distanceTicks(total, f)) {
        expect(t.x).toBeGreaterThanOrEqual(X0);
        expect(t.x).toBeLessThanOrEqual(X1 + 0.001);
      }
    }
  });
});

describe("timeTicks", () => {
  /** 10 km run: slow first half, fast second. */
  const build = () => {
    const time: number[] = [], dist: number[] = [];
    let d = 0;
    for (let t = 0; t < 3000; t++) {
      time.push(t);
      dist.push(d);
      d += t < 1800 ? 2.8 : 3.6;
    }
    return { time, dist };
  };

  it("places ticks by distance covered, not by even spacing", () => {
    // This is the point: five minutes of a fast finish covers more ground than
    // five minutes of a slow start, and the two axis rows must agree.
    const { time, dist } = build();
    const x = (m: number) => X0 + (m / dist[dist.length - 1]) * (X1 - X0);
    const ticks = timeTicks(time, dist, x, formatMinSec);

    const gaps = ticks.slice(1).map((t, i) => t.x - ticks[i].x);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(1);
  });

  it("labels in minutes and seconds", () => {
    // A 50-minute run steps every 10 minutes, so the first tick is 10:00.
    const { time, dist } = build();
    const x = (m: number) => X0 + (m / dist[dist.length - 1]) * (X1 - X0);
    expect(timeTicks(time, dist, x, formatMinSec)[0].label).toBe("10:00");
  });

  it("steps every five minutes on a short run", () => {
    const time = Array.from({ length: 1200 }, (_, i) => i);
    const dist = time.map((t) => t * 3);
    const x = (m: number) => X0 + (m / dist[dist.length - 1]) * (X1 - X0);
    expect(timeTicks(time, dist, x, formatMinSec)[0].label).toBe("5:00");
  });

  it("opens the spacing out for a long run", () => {
    const time = Array.from({ length: 12_000 }, (_, i) => i);
    const dist = time.map((t) => t * 3);
    const x = (m: number) => X0 + (m / dist[dist.length - 1]) * (X1 - X0);
    expect(timeTicks(time, dist, x, formatMinSec).length).toBeLessThan(15);
  });

  it("says nothing about a run with no duration", () => {
    expect(timeTicks([0, 0], [0, 0], () => 0, formatMinSec)).toEqual([]);
  });
});

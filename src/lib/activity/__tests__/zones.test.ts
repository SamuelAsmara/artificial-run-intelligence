import { describe, expect, it } from "vitest";
import { AGREEMENT, HR_ZONES, effectiveHrMax, estimateLthr, observedHrMax, zoneFor } from "../zones";

describe("zoneFor", () => {
  /**
   * The reference case: intervals.icu's own labelling of this athlete's
   * 17 August run, whose threshold works out at 173 bpm. If our boundaries
   * disagree with these, one of us is telling the athlete the wrong thing.
   */
  const LTHR = 173;
  const reference: [number, string][] = [
    [137, "Z1"], [139, "Z1"], [141, "Z1"], [144, "Z1"],
    [148, "Z2"], [152, "Z2"],
    [156, "Z3"],
    [164, "Z4"], [170, "Z4"],
    [174, "Z5"],
    [180, "Z6"],
  ];

  it("agrees with intervals.icu on every kilometre of the reference run", () => {
    for (const [hr, expected] of reference) {
      expect(zoneFor(hr, LTHR)!.zone.id, `${hr} bpm`).toBe(expected);
    }
  });

  it("reports a percentage above 100 above threshold", () => {
    // The tell that this is threshold-based and not maximum-based.
    expect(zoneFor(180, LTHR)!.pct).toBeGreaterThan(100);
  });

  it("leaves no gap and no overlap between zones", () => {
    for (let i = 1; i < HR_ZONES.length; i++) {
      expect(HR_ZONES[i].from).toBe(HR_ZONES[i - 1].to);
    }
    expect(HR_ZONES[0].from).toBe(0);
    expect(HR_ZONES[HR_ZONES.length - 1].to).toBe(Infinity);
  });

  it("places every plausible heart rate in exactly one zone", () => {
    for (let hr = 60; hr <= 220; hr++) {
      const matches = HR_ZONES.filter((z) => {
        const pct = Math.round((hr / LTHR) * 100);
        return pct >= z.from && pct < z.to;
      });
      expect(matches.length, `${hr} bpm`).toBe(1);
    }
  });

  it("refuses rather than guessing when threshold is unknown", () => {
    expect(zoneFor(150, 0)).toBeNull();
    expect(zoneFor(150, NaN)).toBeNull();
    expect(zoneFor(0, 173)).toBeNull();
  });
});

describe("observedHrMax", () => {
  it("takes the highest rate two runs agree on", () => {
    expect(observedHrMax([181, 178, 176, 160, 155])).toBe(181);
  });

  it("throws out a strap artefact nothing else supports", () => {
    // 214 with the next value 40 beats lower is interference, not physiology
    expect(observedHrMax([214, 174, 172, 168])).toBe(174);
  });

  it("accepts a genuine new maximum once a second run comes near it", () => {
    expect(observedHrMax([192, 186, 174, 172])).toBe(192);
    expect(192 - 186).toBeLessThanOrEqual(AGREEMENT);
  });

  it("ignores readings outside human range", () => {
    expect(observedHrMax([300, 4, 174, 172])).toBe(174);
  });

  it("has nothing to say without data", () => {
    expect(observedHrMax([])).toBeNull();
    expect(observedHrMax([null, undefined])).toBeNull();
  });

  it("takes a lone reading at face value", () => {
    expect(observedHrMax([181])).toBe(181);
  });
});

describe("effectiveHrMax", () => {
  it("prefers what the athlete measured over the age formula", () => {
    // 220 - 34 = 186, but this athlete hit 192 in a race
    expect(effectiveHrMax({ observed: 192, age: 34 })).toBe(192);
  });

  it("never lets a stated maximum sit below one already recorded", () => {
    // You cannot run above your maximum, so a typed 180 against a recorded 192
    // is a typo, not a correction.
    expect(effectiveHrMax({ stated: 180, observed: 192, age: 34 })).toBe(192);
  });

  it("honours a stated maximum above what has been recorded", () => {
    expect(effectiveHrMax({ stated: 198, observed: 181, age: 34 })).toBe(198);
  });

  it("falls back to the formula only when nothing was measured", () => {
    expect(effectiveHrMax({ age: 34 })).toBe(186);
  });

  it("returns null rather than inventing a number", () => {
    expect(effectiveHrMax({})).toBeNull();
  });
});

describe("estimateLthr", () => {
  it("lands near this athlete's measured threshold", () => {
    // measured 173 against a maximum near 190
    expect(Math.abs(estimateLthr(192) - 173)).toBeLessThanOrEqual(3);
  });
});

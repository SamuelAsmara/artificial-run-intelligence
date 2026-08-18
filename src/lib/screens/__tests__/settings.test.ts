import { describe, expect, it } from "vitest";
import {
  PROVIDER_TILES,
  RACE_OPTIONS,
  parseTargetTime,
  raceLabel,
  reachesUsViaIntervals,
  requiredPace,
} from "../settings";
import { PROVIDERS } from "@/lib/providers/registry";

describe("requiredPace", () => {
  it("turns a marathon target into the pace it demands", () => {
    // 3:45:00 over 42.195 km is 13500 s / 42.195 km = 319.9 s/km
    expect(requiredPace("full", "3:45:00")).toBe("5:20 /km");
  });

  it("accepts a two-part time for the shorter distances", () => {
    expect(requiredPace("10k", "47:00")).toBe("4:42 /km");
  });

  it("is blank rather than wrong when either half is missing", () => {
    expect(requiredPace(null, "3:45:00")).toBe("—");
    expect(requiredPace("full", null)).toBe("—");
    expect(requiredPace("full", "")).toBe("—");
  });

  it("refuses nonsense instead of rendering NaN", () => {
    expect(requiredPace("full", "soon")).toBe("—");
    expect(requiredPace("full", "0:00:00")).toBe("—");
  });

  it("never produces a sixty-second remainder", () => {
    // the bug this codebase already fixed once — a pace of 4:59.7 must not
    // round the seconds independently and print 4:60
    for (const race of RACE_OPTIONS) {
      for (let seconds = 600; seconds < 40_000; seconds += 7) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const target = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        expect(requiredPace(race.value, target)).not.toMatch(/:60 /);
      }
    }
  });
});

describe("parseTargetTime", () => {
  it("reads both the two-part and three-part forms", () => {
    expect(parseTargetTime("3:45:00")).toBe(13_500);
    expect(parseTargetTime("47:00")).toBe(2_820);
  });

  it("treats blank as 'no target' rather than an error", () => {
    expect(parseTargetTime("")).toBeNull();
    expect(parseTargetTime("   ")).toBeNull();
  });

  it("rejects anything that is not a time", () => {
    expect(parseTargetTime("soon")).toBe("invalid");
    expect(parseTargetTime("3:45:")).toBe("invalid");
    expect(parseTargetTime("3")).toBe("invalid");
    expect(parseTargetTime("1:2:3:4")).toBe("invalid");
    expect(parseTargetTime("-5:00")).toBe("invalid");
  });

  it("rejects times nobody means", () => {
    expect(parseTargetTime("2:00")).toBe("invalid");   // a two-minute marathon
    expect(parseTargetTime("20:00:00")).toBe("invalid"); // twenty hours
  });
});

describe("raceLabel", () => {
  it("shows the athlete's word, not the database's", () => {
    expect(raceLabel("full")).toBe("Marathon");
    expect(raceLabel("half")).toBe("Half");
    expect(raceLabel(null)).toBe("—");
  });
});

describe("the connections row", () => {
  it("only lists providers the registry actually knows about", () => {
    // A tile whose id has no registry entry renders a panel with no name and
    // no status — the tab would look live and do nothing.
    for (const tile of PROVIDER_TILES) {
      expect(PROVIDERS.some((p) => p.id === tile.id)).toBe(true);
    }
  });

  it("routes every source that arrives through intervals.icu to its panel", () => {
    expect(reachesUsViaIntervals("intervals_icu")).toBe(true);
    expect(reachesUsViaIntervals("garmin")).toBe(true);
    expect(reachesUsViaIntervals("suunto")).toBe(true);
    expect(reachesUsViaIntervals("strava")).toBe(true);
  });

  it("does not route Apple Health or Runkeeper there", () => {
    // Neither feeds intervals.icu, so showing its card would be a false claim
    // that they are connected.
    expect(reachesUsViaIntervals("apple_health")).toBe(false);
    expect(reachesUsViaIntervals("runkeeper")).toBe(false);
  });

  it("gives every tile a fallback mark for when the logo will not load", () => {
    for (const tile of PROVIDER_TILES) {
      expect(tile.mark.length).toBeGreaterThan(0);
    }
  });

  it("puts every provider the registry lists in the row", () => {
    // Otherwise a source could be supported and invisible.
    for (const provider of PROVIDERS) {
      expect(PROVIDER_TILES.some((t) => t.id === provider.id)).toBe(true);
    }
  });
});

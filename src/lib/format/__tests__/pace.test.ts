import { describe, expect, it } from "vitest";
import { formatDuration, formatMinSec, formatPace, speedToPace } from "../pace";

describe("formatMinSec", () => {
  it("formats a whole number of seconds", () => {
    expect(formatMinSec(324)).toBe("5:24");
  });

  it("carries into the minute instead of printing :60", () => {
    // 299.6 s/km used to render as "4:60" because the remainder was rounded
    // after the split rather than before it.
    expect(formatMinSec(299.6)).toBe("5:00");
    expect(formatMinSec(359.7)).toBe("6:00");
  });

  it("pads single-digit seconds", () => {
    expect(formatMinSec(305)).toBe("5:05");
  });

  it("never produces a seconds field of 60", () => {
    for (let s = 0; s < 1200; s += 0.1) {
      const secs = formatMinSec(s).split(":")[1];
      expect(Number(secs)).toBeLessThan(60);
    }
  });
});

describe("formatPace", () => {
  it("returns a dash rather than a nonsense pace when there is no data", () => {
    expect(formatPace(null)).toBe("—");
    expect(formatPace(undefined)).toBe("—");
    expect(formatPace(0)).toBe("—");
    expect(formatPace(NaN)).toBe("—");
    expect(formatPace(Infinity)).toBe("—");
  });

  it("formats a normal pace", () => {
    expect(formatPace(330)).toBe("5:30");
  });
});

describe("formatDuration", () => {
  it("stays in m:ss below an hour", () => {
    expect(formatDuration(2755)).toBe("45:55");
  });

  it("switches to h:mm:ss above an hour", () => {
    expect(formatDuration(5323)).toBe("1:28:43");
  });

  it("carries correctly at the hour boundary", () => {
    expect(formatDuration(3599.7)).toBe("1:00:00");
  });

  it("returns a dash for missing input", () => {
    expect(formatDuration(null)).toBe("—");
  });
});

describe("speedToPace", () => {
  it("converts metres per second to pace per kilometre", () => {
    expect(speedToPace(1000 / 300)).toBe("5:00");
  });

  it("returns a dash for a stopped or missing speed", () => {
    expect(speedToPace(0)).toBe("—");
    expect(speedToPace(null)).toBe("—");
  });
});

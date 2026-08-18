import { describe, expect, it } from "vitest";
import {
  apiKeyHint,
  hrvVsBaselinePct,
  latestSleepHours,
  normaliseAthleteId,
  type RecoverySignal,
} from "../intervalsIcu";

describe("normaliseAthleteId", () => {
  it("accepts the id exactly as intervals.icu shows it", () => {
    expect(normaliseAthleteId("i679767")).toBe("i679767");
  });

  it("adds the leading i when the athlete pastes only the digits", () => {
    expect(normaliseAthleteId("679767")).toBe("i679767");
  });

  it("pulls the id out of a pasted profile URL", () => {
    expect(normaliseAthleteId("https://intervals.icu/athlete/i679767/fitness")).toBe("i679767");
    expect(normaliseAthleteId("intervals.icu/athlete/679767")).toBe("i679767");
  });

  it("tolerates surrounding whitespace and a capital I", () => {
    expect(normaliseAthleteId("  I679767 ")).toBe("i679767");
  });

  it("rejects anything that isn't an id", () => {
    expect(normaliseAthleteId("")).toBeNull();
    expect(normaliseAthleteId("   ")).toBeNull();
    expect(normaliseAthleteId("nonsense")).toBeNull();
    expect(normaliseAthleteId("i")).toBeNull();
    expect(normaliseAthleteId("i7")).toBeNull(); // too short to be real
  });
});

describe("apiKeyHint", () => {
  it("returns the last four characters", () => {
    expect(apiKeyHint("abcdefghijklmnop")).toBe("mnop");
  });

  it("never reveals a short key", () => {
    expect(apiKeyHint("abc")).toBe("•••");
  });

  it("ignores surrounding whitespace", () => {
    expect(apiKeyHint("  abcdefghijkl  ")).toBe("ijkl");
  });
});

/* --- the two readers the readiness engine depends on --- */

const nights = (rows: Array<Partial<RecoverySignal> & { date: string }>): RecoverySignal[] =>
  rows.map((r) => ({
    date: r.date,
    sleepHours: r.sleepHours ?? null,
    restingHr: r.restingHr ?? null,
    hrv: r.hrv ?? null,
    source: "webhook",
  }));

describe("hrvVsBaselinePct", () => {
  it("compares last night against the seven nights before it", () => {
    const signals = nights([
      { date: "2026-08-11", hrv: 50 },
      { date: "2026-08-12", hrv: 50 },
      { date: "2026-08-13", hrv: 50 },
      { date: "2026-08-14", hrv: 50 },
      { date: "2026-08-17", hrv: 25 },
    ]);
    expect(hrvVsBaselinePct(signals, "2026-08-17")).toBe(50);
  });

  it("returns null until there are at least three baseline nights", () => {
    const signals = nights([
      { date: "2026-08-16", hrv: 50 },
      { date: "2026-08-17", hrv: 50 },
    ]);
    expect(hrvVsBaselinePct(signals, "2026-08-17")).toBeNull();
  });

  it("ignores nights after the date being asked about", () => {
    const signals = nights([
      { date: "2026-08-10", hrv: 40 },
      { date: "2026-08-11", hrv: 40 },
      { date: "2026-08-12", hrv: 40 },
      { date: "2026-08-13", hrv: 40 },
      { date: "2026-08-20", hrv: 999 },
    ]);
    expect(hrvVsBaselinePct(signals, "2026-08-13")).toBe(100);
  });
});

describe("latestSleepHours", () => {
  it("returns the most recent recorded night", () => {
    const signals = nights([
      { date: "2026-08-15", sleepHours: 7.5 },
      { date: "2026-08-17", sleepHours: 5.9 },
    ]);
    expect(latestSleepHours(signals, "2026-08-17")).toBe(5.9);
  });

  it("skips nights the watch didn't record", () => {
    const signals = nights([
      { date: "2026-08-15", sleepHours: 7.5 },
      { date: "2026-08-17", sleepHours: null },
    ]);
    expect(latestSleepHours(signals, "2026-08-17")).toBe(7.5);
  });

  it("returns null when nothing has been recorded", () => {
    expect(latestSleepHours([], "2026-08-17")).toBeNull();
  });
});

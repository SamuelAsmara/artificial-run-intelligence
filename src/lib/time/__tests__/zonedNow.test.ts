import { describe, expect, it } from "vitest";
import { isoDate, todayIso, zonedNow } from "@/lib/time/week";

/**
 * The bug these cover.
 *
 * `isoDate` reads the runtime's timezone. Vercel runs Node in UTC and nothing
 * sets `TZ`, so every "today" in the product was a UTC today while the app
 * claimed Asia/Jerusalem — three hours a night when the two disagree. The
 * existing timezone test sets `process.env.TZ` before running, which proves the
 * behaviour under a timezone production never has.
 *
 * `zonedNow` must therefore be correct *without* that: these run under whatever
 * timezone the machine has.
 */
describe("zonedNow", () => {
  it("gives the Jerusalem calendar day for an instant that is still yesterday in UTC", () => {
    // 22:30 UTC on 17 August is 01:30 on 18 August in Jerusalem (UTC+3).
    const instant = new Date("2026-08-17T22:30:00Z");
    expect(todayIso(instant)).toBe("2026-08-18");
    expect(isoDate(zonedNow(instant))).toBe("2026-08-18");
  });

  it("gives the Jerusalem day for an instant that is already tomorrow in UTC", () => {
    // Winter: UTC+2. 23:30 UTC on 31 December is 01:30 on 1 January locally.
    expect(todayIso(new Date("2025-12-31T23:30:00Z"))).toBe("2026-01-01");
  });

  it("agrees with UTC in the middle of the day", () => {
    expect(todayIso(new Date("2026-08-17T09:00:00Z"))).toBe("2026-08-17");
  });

  it("carries the local wall clock, not the UTC one", () => {
    const d = zonedNow(new Date("2026-08-17T22:30:00Z"));
    expect(d.getHours()).toBe(1);
    expect(d.getMinutes()).toBe(30);
    expect(d.getDay()).toBe(2); // Tuesday
  });
});

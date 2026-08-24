import { describe, expect, it } from "vitest";
import { dayCellStyle, SESSION_EDGE, type DayState } from "../dayCell";

const ALL: DayState[] = ["done", "missed", "today", "planned", "rest", "empty", "adjusted"];

describe("dayCellStyle", () => {
  it("gives every state a style", () => {
    for (const s of ALL) expect(dayCellStyle(s)).toBeTruthy();
  });

  it("never uses an outer border — selection must not move the layout", () => {
    for (const s of ALL) expect(dayCellStyle(s).ring.startsWith("inset")).toBe(true);
  });

  it("marks today with the accent on every channel that carries state", () => {
    const t = dayCellStyle("today");
    expect(t.bg).toBe("var(--color-accent-soft)");
    expect(t.ring).toContain("var(--color-accent)");
    expect(t.dayColor).toBe("var(--color-accent)");
  });

  it("dims a missed session without hiding it", () => {
    const m = dayCellStyle("missed");
    expect(m.opacity).toBeLessThan(1);
    expect(m.opacity).toBeGreaterThan(0.5);
    expect(m.statusColor).toBe("var(--color-negative)");
  });

  it("makes a coach-adjusted session visibly different from a plain planned one", () => {
    expect(dayCellStyle("adjusted").ring).not.toBe(dayCellStyle("planned").ring);
    expect(dayCellStyle("adjusted").statusColor).toBe("var(--color-caution)");
  });

  it("does not colour a done session's status like a missed one", () => {
    expect(dayCellStyle("done").statusColor).not.toBe(dayCellStyle("missed").statusColor);
  });

  it("keeps the session-type colours the product already fixed", () => {
    expect(SESSION_EDGE).toEqual({
      easy: "var(--color-positive)",
      tempo: "var(--color-caution)",
      intervals: "var(--color-accent)",
      long: "var(--color-atl)",
      rest: "var(--color-faint)",
    });
  });

  it("gives an empty day no status word to read", () => {
    expect(dayCellStyle("empty").statusLabel).toBe("");
  });
});

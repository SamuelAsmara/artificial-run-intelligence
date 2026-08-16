import { describe, expect, it } from "vitest";
import { calculateACWR, isHighInjuryRisk, ACWR_INJURY_RISK_THRESHOLD } from "../acwr";

// מסמך אפיון בדיקות §1: calculateACWR — בהינתן היסטוריית עומס 28 יום,
// מחזיר יחס Acute:Chronic נכון חשבונית.

function daysAgo(n: number, from = new Date("2026-08-06")): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("calculateACWR", () => {
  it("מחשב יחס נכון כאשר העומס יציב (acute == chronic)", () => {
    const asOf = new Date("2026-08-06");
    const loads = Array.from({ length: 28 }, (_, i) => ({ date: daysAgo(i, asOf), load: 1000 }));
    const result = calculateACWR(loads, asOf);
    expect(result.acwr).toBeCloseTo(1, 5);
  });

  it("מזהה עלייה חדה בעומס (ACWR מעל הסף)", () => {
    const asOf = new Date("2026-08-06");
    const loads = [
      ...Array.from({ length: 21 }, (_, i) => ({ date: daysAgo(i + 7, asOf), load: 500 })), // עומס כרוני נמוך
      ...Array.from({ length: 7 }, (_, i) => ({ date: daysAgo(i, asOf), load: 3000 })), // עומס אקוטי גבוה
    ];
    const result = calculateACWR(loads, asOf);
    expect(result.acwr).toBeGreaterThan(ACWR_INJURY_RISK_THRESHOLD);
    expect(isHighInjuryRisk(result)).toBe(true);
  });

  it('מחזיר acwr=null ("אין מספיק נתונים") כשאין היסטוריה', () => {
    const result = calculateACWR([]);
    expect(result.acwr).toBeNull();
  });

  it("מתעלם מנתונים עתידיים ביחס ל-asOf", () => {
    const asOf = new Date("2026-08-06");
    const loads = [
      { date: daysAgo(1, asOf), load: 1000 },
      { date: "2026-08-10", load: 999999 }, // עתידי — לא אמור להיספר
    ];
    const result = calculateACWR(loads, asOf);
    expect(result.acute).toBeCloseTo(1000 / 7, 5);
  });
});

import { describe, expect, it } from "vitest";
import { detectCardiacDrift, type StreamPoint } from "../cardiacDrift";

// מסמך אפיון בדיקות §1: detectCardiacDrift — מזהה עלייה בדופק בזמן שהקצב
// נשאר קבוע בתוך stream של אימון בודד.

function buildStream(points: number): StreamPoint[] {
  return Array.from({ length: points }, (_, i) => ({
    t: i * 30,
    heartRate: 140,
    pace: 3.0,
  }));
}

describe("detectCardiacDrift", () => {
  it("מזהה drift כאשר הדופק עולה והקצב יציב", () => {
    const stream = buildStream(20);
    for (let i = 10; i < 20; i++) stream[i].heartRate = 158; // +~13%

    const result = detectCardiacDrift(stream);
    expect(result.hrDriftPct).toBeGreaterThan(5);
    expect(result.isSignificantDrift).toBe(true);
  });

  it("לא מזהה drift כשהדופק והקצב יציבים לאורך כל האימון", () => {
    const stream = buildStream(20);
    const result = detectCardiacDrift(stream);
    expect(result.isSignificantDrift).toBe(false);
  });

  it("לא מזהה drift כשגם הקצב וגם הדופק משתנים יחד (מאמץ מכוון, לא עייפות)", () => {
    const stream = buildStream(20);
    for (let i = 10; i < 20; i++) {
      stream[i].heartRate = 160;
      stream[i].pace = 3.6; // קצב השתנה גם כן -> לא "drift" קלאסי
    }
    const result = detectCardiacDrift(stream);
    expect(result.isSignificantDrift).toBe(false);
  });

  it("מחזיר תוצאה בטוחה (לא קורס) על stream קצר מדי", () => {
    const result = detectCardiacDrift(buildStream(2));
    expect(result.isSignificantDrift).toBe(false);
  });
});

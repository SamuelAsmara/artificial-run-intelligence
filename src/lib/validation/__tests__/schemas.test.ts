import { describe, expect, it } from "vitest";
import { goalRaceSchema, healthWebhookSchema } from "../schemas";

// מסמך אפיון בדיקות §2: קלטים לא תקינים.

describe("goalRaceSchema", () => {
  it("דוחה תאריך מרוץ בעבר", () => {
    const result = goalRaceSchema.safeParse({ raceType: "10k", raceDate: "2020-01-01" });
    expect(result.success).toBe(false);
  });

  it("דוחה תאריך מרוץ רחוק מדי (מעל שנתיים קדימה)", () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 5);
    const result = goalRaceSchema.safeParse({
      raceType: "10k",
      raceDate: farFuture.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(false);
  });

  it("דוחה race_type שאינו אחד מ-5k/10k/half/full", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 3);
    const result = goalRaceSchema.safeParse({
      raceType: "marathon-ultra",
      raceDate: future.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(false);
  });

  it("מקבל קלט תקין", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 4);
    const result = goalRaceSchema.safeParse({
      raceType: "half",
      raceDate: future.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(true);
  });
});

describe("healthWebhookSchema", () => {
  it("דוחה דופק שלילי", () => {
    const result = healthWebhookSchema.safeParse({ date: "2026-08-05", restingHr: -5 });
    expect(result.success).toBe(false);
  });

  it("דוחה שינה של 40 שעות (מחוץ לטווח פיזיולוגי)", () => {
    const result = healthWebhookSchema.safeParse({ date: "2026-08-05", sleepHours: 40 });
    expect(result.success).toBe(false);
  });

  it("מקבל payload תקין עם שדות אופציונליים חסרים", () => {
    const result = healthWebhookSchema.safeParse({ date: "2026-08-05", sleepHours: 7.2 });
    expect(result.success).toBe(true);
  });
});

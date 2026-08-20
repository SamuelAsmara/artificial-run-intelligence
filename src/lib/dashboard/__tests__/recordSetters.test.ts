import { describe, expect, it } from "vitest";
import { recordSetters } from "@/lib/dashboard/personalRecords";

const run = (id: string, date: string, efforts: Record<string, number> | null) => ({
  id,
  started_at: `${date}T06:30:00Z`,
  best_efforts: efforts,
});

describe("recordSetters", () => {
  it("marks the first run to cover a distance", () => {
    const marks = recordSetters([run("a", "2026-01-05", { "5k": 1400 })]);
    expect(marks.get("a")).toBe("5K PB");
  });

  it("marks a later run only when it is faster", () => {
    const marks = recordSetters([
      run("slow", "2026-01-05", { "5k": 1400 }),
      run("slower", "2026-02-05", { "5k": 1450 }),
      run("fast", "2026-03-05", { "5k": 1300 }),
    ]);
    expect(marks.get("slow")).toBe("5K PB");
    expect(marks.has("slower")).toBe(false);
    expect(marks.get("fast")).toBe("5K PB");
  });

  it("keeps the mark on a record that has since been beaten", () => {
    // The point of the feature: a personal best is a day, not a standing title.
    const marks = recordSetters([
      run("march", "2026-03-01", { "10k": 3000 }),
      run("june", "2026-06-01", { "10k": 2900 }),
    ]);
    expect(marks.get("march")).toBe("10K PB");
    expect(marks.get("june")).toBe("10K PB");
  });

  it("names the longest distance when one run takes several", () => {
    const marks = recordSetters([
      run("first", "2026-01-01", { "5k": 1400, "10k": 3000, half: 6400 }),
    ]);
    expect(marks.get("first")).toBe("Half PB");
  });

  it("ignores order of input", () => {
    const later = run("later", "2026-05-01", { "5k": 1500 });
    const earlier = run("earlier", "2026-01-01", { "5k": 1400 });
    const marks = recordSetters([later, earlier]);
    expect(marks.get("earlier")).toBe("5K PB");
    expect(marks.has("later")).toBe(false);
  });

  it("skips runs with no efforts, no date or unusable numbers", () => {
    const marks = recordSetters([
      run("none", "2026-01-01", null),
      { id: "undated", started_at: null, best_efforts: { "5k": 1200 } },
      run("zero", "2026-02-01", { "5k": 0 }),
      run("nan", "2026-03-01", { "5k": Number.NaN }),
    ]);
    expect(marks.size).toBe(0);
  });
});

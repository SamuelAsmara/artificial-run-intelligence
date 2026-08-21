import { describe, expect, it } from "vitest";
import { listWords, provenanceOf } from "@/lib/activity/provenance";

const base = {
  source: "intervals_icu",
  resolution: "full" as const,
  hasHeartRate: true,
  hasElevation: true,
  hasCadence: true,
  hasPower: true,
};

describe("listWords", () => {
  it("says a list the way a person would", () => {
    expect(listWords([])).toBe("");
    expect(listWords(["heart rate"])).toBe("heart rate");
    expect(listWords(["heart rate", "cadence"])).toBe("heart rate and cadence");
    expect(listWords(["power", "heart rate", "cadence"])).toBe("power, heart rate and cadence");
  });
});

describe("provenanceOf", () => {
  it("says nothing when a full recording has everything", () => {
    expect(provenanceOf(base).note).toBe("");
    expect(provenanceOf(base).missing).toEqual([]);
  });

  it("does not remark on missing power alone", () => {
    // Almost no watch records running power; calling it out on every run
    // would train the athlete to ignore this line.
    const p = provenanceOf({ ...base, hasPower: false });
    expect(p.missing).toEqual(["power"]);
    expect(p.note).toBe("");
  });

  it("blames the watch, not the app, for a missing heart rate", () => {
    const p = provenanceOf({ ...base, hasPower: false, hasHeartRate: false });
    expect(p.note).toBe(
      "Your watch did not record heart rate on this run, so that band is left out rather than drawn flat.",
    );
    // Power is missing too, and saying so would bury the absence that matters.
    expect(p.note).not.toContain("power");
  });

  it("agrees in number when several measurements are absent", () => {
    const one = provenanceOf({
      ...base, source: "manual", resolution: "summary",
      hasHeartRate: true, hasCadence: true, hasElevation: true, hasPower: false,
    });
    expect(one.note).toContain("no power was kept with it");

    const many = provenanceOf({
      ...base, source: "manual", resolution: "summary",
      hasHeartRate: false, hasCadence: true, hasElevation: true, hasPower: false,
    });
    expect(many.note).toContain("were kept with it");
  });

  it("names every absent band when several are gone", () => {
    const p = provenanceOf({ ...base, hasHeartRate: false, hasCadence: false, hasElevation: false });
    expect(p.note).toContain("heart rate");
    expect(p.note).toContain("cadence and elevation");
  });

  it("explains a chart drawn from the stored summary", () => {
    const p = provenanceOf({
      ...base, source: "strava", resolution: "summary",
      hasHeartRate: false, hasCadence: false, hasElevation: false, hasPower: false,
    });
    expect(p.sourceLabel).toBe("Strava");
    expect(p.note).toContain("pace summary");
    expect(p.note).toContain("second-by-second");
  });

  it("says a hand-entered run was entered by hand", () => {
    const p = provenanceOf({
      ...base, source: "manual", resolution: "summary",
      hasHeartRate: false, hasCadence: false, hasElevation: false, hasPower: false,
    });
    expect(p.sourceLabel).toBe("Entered by hand");
    expect(p.note).toMatch(/^Entered by hand/);
  });

  it("distinguishes nothing-to-draw from could-not-fetch", () => {
    const gone = provenanceOf({ ...base, resolution: "none" });
    expect(gone.note).toContain("No recording was kept");

    const offline = provenanceOf({ ...base, resolution: "none", unreachable: true });
    expect(offline.note).toContain("could not be fetched");
  });

  it("says a hand-entered run with no shape has nothing to draw", () => {
    const p = provenanceOf({ ...base, source: "manual", resolution: "none" });
    expect(p.note).toContain("entered by hand");
    expect(p.note).toContain("typed in");
  });

  it("labels every source the importer can write", () => {
    for (const [source, label] of [
      ["intervals_icu", "intervals.icu"], ["strava", "Strava"],
      ["manual", "Entered by hand"], ["derived", "Derived"],
    ]) {
      expect(provenanceOf({ ...base, source }).sourceLabel).toBe(label);
    }
    expect(provenanceOf({ ...base, source: null }).sourceLabel).toBe("Unknown source");
  });
});

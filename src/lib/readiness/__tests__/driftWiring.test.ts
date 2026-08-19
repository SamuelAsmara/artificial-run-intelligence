import { describe, expect, it } from "vitest";
import { buildSnapshots, type ActivityRow } from "@/lib/readiness/pipeline";

/**
 * `cardiacDriftPct` was hard-coded null into both `computeReadiness` and
 * `buildNarrative` — "needs per-activity streams, not wired yet" — while
 * `activities.cardiac_drift_pct` had been derived, stored and displayed on the
 * dashboard since migration 0007. So the screen showed a drift figure sitting
 * beside a readiness score that provably ignored it.
 */

const PROFILE = { age: 34, sex: "male" as const };

/** Eight weeks of identical daily runs, so only drift can move the score. */
function runs(driftOnLastRun: number | null): ActivityRow[] {
  const out: ActivityRow[] = [];
  for (let i = 56; i >= 0; i--) {
    const d = new Date(Date.UTC(2026, 5, 1));
    d.setUTCDate(d.getUTCDate() + (56 - i));
    out.push({
      started_at: d.toISOString(),
      distance_m: 10_000,
      duration_s: 3_000,
      avg_hr: 150,
      cardiac_drift_pct: i === 0 ? driftOnLastRun : null,
    });
  }
  return out;
}

const lastSnapshot = (drift: number | null) => {
  const result = buildSnapshots(runs(drift), [], PROFILE, new Date(Date.UTC(2026, 6, 27)), 90);
  return result.snapshots[result.snapshots.length - 1];
};

describe("cardiac drift reaches the readiness score", () => {
  it("stores the drift reading on the snapshot instead of null", () => {
    expect(lastSnapshot(9.5)?.cardiac_drift).toBe(9.5);
  });

  it("scores a run with heavy drift below the same run without it", () => {
    const clean = lastSnapshot(1)?.readiness_score ?? 0;
    const drifting = lastSnapshot(12)?.readiness_score ?? 0;
    expect(drifting).toBeLessThan(clean);
  });

  it("leaves the snapshot null when no run has a drift reading", () => {
    expect(lastSnapshot(null)?.cardiac_drift).toBeNull();
  });
});

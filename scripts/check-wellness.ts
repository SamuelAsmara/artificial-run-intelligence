/**
 * Connection check for intervals.icu.
 *
 * Run: npx tsx scripts/check-wellness.ts
 *
 * Reports which wellness fields are actually populated and how far back the
 * history goes — deliberately without printing any values, so the output is
 * safe to paste anywhere.
 */

import { readFileSync } from "node:fs";
import { fetchWellness, toRecoverySignals, type IcuWellness } from "../src/lib/wellness/intervalsIcu";

// minimal .env.local reader so this runs without extra dependencies
function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* env may already be set another way */
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  loadEnv();
  const apiKey = process.env.INTERVALS_ICU_API_KEY;
  const athleteId = process.env.INTERVALS_ICU_ATHLETE_ID;

  if (!apiKey || !athleteId) {
    console.error("✗ INTERVALS_ICU_API_KEY or INTERVALS_ICU_ATHLETE_ID missing from .env.local");
    process.exit(1);
  }
  console.log(`athlete ${athleteId}, key ${apiKey.length} chars\n`);

  const newest = iso(new Date());
  const oldest = iso(new Date(Date.now() - 400 * 86400000));

  let rows: IcuWellness[];
  try {
    rows = await fetchWellness({ apiKey, athleteId }, oldest, newest);
  } catch (e) {
    console.error("✗", (e as Error).message);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log("Connected, but no wellness rows returned.");
    console.log("Is Garmin linked in intervals.icu Settings?");
    return;
  }

  const dates = rows.map((r) => r.id).sort();
  console.log(`✓ ${rows.length} days returned`);
  console.log(`  from ${dates[0]} to ${dates[dates.length - 1]}\n`);

  const FIELDS: (keyof IcuWellness)[] = [
    "sleepSecs", "sleepScore", "sleepQuality", "hrv", "hrvSDNN",
    "restingHR", "avgSleepingHR", "steps", "weight", "spO2",
    "fatigue", "soreness", "stress", "mood",
  ];

  console.log("field coverage (last 90 days):");
  const recent = rows.filter((r) => r.id >= iso(new Date(Date.now() - 90 * 86400000)));
  for (const f of FIELDS) {
    const n = recent.filter((r) => r[f] !== null && r[f] !== undefined).length;
    const pct = recent.length ? Math.round((n / recent.length) * 100) : 0;
    const bar = "█".repeat(Math.round(pct / 5)).padEnd(20, "·");
    console.log(`  ${String(f).padEnd(14)} ${bar} ${String(pct).padStart(3)}%`);
  }

  const signals = toRecoverySignals(rows);
  const withSleep = signals.filter((s) => s.sleepHours !== null).length;
  const withHrv = signals.filter((s) => s.hrv !== null).length;
  console.log(`\nusable for readiness: ${withSleep} nights of sleep, ${withHrv} of HRV`);
  console.log(withHrv >= 21 ? "✓ enough HRV history for a baseline" : "⚠ needs ~21 nights of HRV for a stable baseline");
}

main();

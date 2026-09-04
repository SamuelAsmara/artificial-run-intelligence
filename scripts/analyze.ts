/**
 * Runs the training engine over the athlete's real history and prints the
 * result. Nothing is written anywhere — this is a read-only sanity check that
 * the maths behaves on real data rather than on test fixtures.
 *
 *   npm run analyze
 *
 * Data comes from intervals.icu: activities for load, wellness for recovery.
 * (Strava remains the production source for activities; intervals.icu is used
 * here because it already holds a long backfilled history.)
 */

import { readFileSync } from "node:fs";
import {
  sessionLoad, toDailySeries, type LoadProfile,
} from "../src/lib/planning/load";
import { estimateThresholds, type HistoryActivity } from "../src/lib/planning/thresholds";
import { computePmc, formZone, FORM_ZONE_LABEL, rampVerdict, seedFromHistory } from "../src/lib/planning/pmc";
import { loadRatio, sessionSpikeVsRecentMax } from "../src/lib/planning/acwr";
import { computeReadiness } from "../src/lib/planning/readiness";
import { buildNarrative } from "../src/lib/narrative/buildNarrative";

/** Greedy word wrap, so the narrative reads as a paragraph in the terminal. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > width) { out.push(line); line = word; }
    else { line = line ? line + " " + word : word; }
  }
  if (line) out.push(line);
  return out;
}
import {
  fetchWellness, hrvVsBaselinePct, latestSleepHours, toRecoverySignals,
} from "../src/lib/wellness/intervalsIcu";

/* ---------- env ---------- */

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* env may be provided another way */
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const BASE = "https://intervals.icu/api/v1";

/* ---------- activities ---------- */

interface IcuActivity {
  start_date_local?: string;
  type?: string;
  distance?: number;          // metres
  moving_time?: number;       // seconds
  elapsed_time?: number;
  average_heartrate?: number | null;
  icu_average_watts?: number | null;
  name?: string;
}

async function fetchActivities(
  athleteId: string, apiKey: string, oldest: string, newest: string,
): Promise<IcuActivity[]> {
  const url = `${BASE}/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}`;
  const res = await fetch(url, {
    headers: {
      Authorization: "Basic " + Buffer.from(`API_KEY:${apiKey}`).toString("base64"),
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`activities: HTTP ${res.status}`);
  const body = (await res.json()) as unknown;
  return Array.isArray(body) ? (body as IcuActivity[]) : [];
}

/* ---------- presentation ---------- */

const pad = (s: string, n: number) => s.padEnd(n);
const bar = (v: number, max: number, width = 24) =>
  "█".repeat(Math.max(0, Math.round((v / max) * width))).padEnd(width, "·");
const rule = (t = "") =>
  console.log("\n" + (t ? `── ${t} ` : "").padEnd(62, "─"));

import { formatPace as paceStr } from "../src/lib/format/pace";

/* ---------- main ---------- */

async function main() {
  loadEnv();
  const apiKey = process.env.INTERVALS_ICU_API_KEY;
  const athleteId = process.env.INTERVALS_ICU_ATHLETE_ID;
  if (!apiKey || !athleteId) {
    console.error("Missing INTERVALS_ICU_API_KEY / INTERVALS_ICU_ATHLETE_ID in .env.local");
    process.exit(1);
  }

  const today = new Date();
  const newest = iso(today);
  const oldest = iso(new Date(today.getTime() - 400 * 86400000));

  console.log(`\nRuni — engine check`);
  console.log(`athlete ${athleteId} · ${oldest} → ${newest}`);

  const [acts, wellnessRows] = await Promise.all([
    fetchActivities(athleteId, apiKey, oldest, newest),
    fetchWellness({ apiKey, athleteId }, oldest, newest),
  ]);

  const runs = acts.filter(
    (a) => (a.type ?? "").toLowerCase().includes("run") && (a.moving_time ?? 0) > 0,
  );
  console.log(`${acts.length} activities, ${runs.length} runs, ${wellnessRows.length} wellness days`);

  /* --- thresholds --- */
  rule("Your thresholds, learned from history");

  const history: HistoryActivity[] = runs.map((a) => ({
    durationSec: a.moving_time ?? 0,
    distanceM: a.distance ?? 0,
    avgHr: a.average_heartrate ?? null,
    date: (a.start_date_local ?? "").slice(0, 10),
  }));

  const restingHrs = wellnessRows
    .map((w) => w.restingHR)
    .filter((v): v is number => v != null);
  const hrRest = restingHrs.length
    ? Math.round(restingHrs.slice(-30).reduce((s, v) => s + v, 0) / Math.min(30, restingHrs.length))
    : undefined;

  const th = estimateThresholds(history, { age: 34, sex: "male", hrRest });
  th.notes.forEach((n) => console.log("  " + n));

  const profile: LoadProfile = {
    hrMax: th.hrMax, hrRest: th.hrRest, lthr: th.lthr, sex: "male",
    thresholdSpeedMps: th.thresholdSpeedMps,
    thresholdsMeasured: th.measured,
  };

  /* --- load --- */
  rule("Training load");

  const dated = history
    .filter((h) => h.date)
    .map((h) => ({ date: h.date, load: sessionLoad(h, profile).load }));
  const series = toDailySeries(dated, oldest, newest);

  const methods = history.map((h) => sessionLoad(h, profile).method);
  const hrCount = methods.filter((m) => m === "hrss").length;
  console.log(`  ${hrCount}/${methods.length} runs scored from heart rate, the rest from pace`);

  const last30 = series.slice(-30);
  const total30 = Math.round(last30.reduce((s, d) => s + d.load, 0));
  console.log(`  last 30 days: ${total30} points (${Math.round(total30 / 30)}/day average)`);

  /* --- fitness / fatigue / form --- */
  rule("Fitness · Fatigue · Form");

  const pmc = computePmc(series, {
    seedCtl: seedFromHistory(series.slice(0, 42)),
    seedAtl: seedFromHistory(series.slice(0, 7)),
  });
  const now = pmc[pmc.length - 1];

  const maxScale = Math.max(now.ctl, now.atl, 1) * 1.2;
  console.log(`  ${pad("Fitness (CTL)", 15)} ${bar(now.ctl, maxScale)} ${now.ctl.toFixed(1)}`);
  console.log(`  ${pad("Fatigue (ATL)", 15)} ${bar(now.atl, maxScale)} ${now.atl.toFixed(1)}`);
  console.log(`  ${pad("Form (TSB)", 15)} ${" ".repeat(24)} ${now.tsb >= 0 ? "+" : ""}${now.tsb.toFixed(1)}  ${FORM_ZONE_LABEL[formZone(now.tsb)]}`);
  console.log(`  ${pad("Ramp rate", 15)} ${" ".repeat(24)} ${now.rampRate >= 0 ? "+" : ""}${now.rampRate.toFixed(1)}/week  ${rampVerdict(now.rampRate)}`);

  /* --- load ratio and spike --- */
  rule("Load balance");

  const lr = loadRatio(series);
  console.log(`  ${lr.description}`);
  if (lr.ratio !== null) console.log(`  ratio ${lr.ratio.toFixed(2)}  (acute ${lr.acute.toFixed(1)} / chronic ${lr.chronic.toFixed(1)})`);

  const recentRuns = history.map((h) => ({ date: h.date, distanceM: h.distanceM }));
  const longest30 = Math.max(
    0,
    ...recentRuns
      .filter((r) => new Date(r.date).getTime() >= today.getTime() - 30 * 86400000)
      .map((r) => r.distanceM),
  );
  if (longest30 > 0) {
    const example = longest30 * 1.35;
    const spike = sessionSpikeVsRecentMax(example, recentRuns, today);
    console.log(`  longest run in the last 30 days: ${(longest30 / 1000).toFixed(1)} km`);
    console.log(`  → a ${(example / 1000).toFixed(1)} km run today would be: ${spike.band} (hazard ratio ${spike.hazardRatio})`);
  }

  /* --- recovery --- */
  rule("Recovery, from your watch");

  const signals = toRecoverySignals(wellnessRows);
  const sleep = latestSleepHours(signals, newest);
  const hrvPct = hrvVsBaselinePct(signals, newest);
  console.log(`  last night's sleep: ${sleep !== null ? sleep.toFixed(1) + " h" : "not recorded"}`);
  console.log(`  HRV vs your 7-day baseline: ${hrvPct !== null ? Math.round(hrvPct) + "%" : "not enough nights"}`);
  if (hrRest) console.log(`  resting heart rate (30-day mean): ${hrRest} bpm`);

  /* --- readiness --- */
  rule("Readiness today");

  const readiness = computeReadiness({
    pmc: now,
    loadRatio: lr.ratio,
    cardiacDriftPct: null, // needs per-run streams; not wired yet
    sleepHours: sleep,
    hrvVsBaselinePct: hrvPct,
  });

  console.log(`\n     ${readiness.score}    ${readiness.label}\n`);
  for (const c of readiness.contributions) {
    console.log(`  ${pad(c.component, 14)} ${bar(c.sub, 100, 20)} ${String(c.sub).padStart(3)}  × ${(c.weight * 100).toFixed(0)}%`);
  }
  console.log(`\n  ${readiness.basis}`);

  /* --- narrative --- */
  rule("What Runi would tell you today");

  const narrative = buildNarrative({
    readiness,
    pmc: now,
    loadRatio: lr.ratio,
    sleepHours: sleep,
    hrvVsBaselinePct: hrvPct,
    cardiacDriftPct: null,
    restingHr: hrRest ?? null,
    longestRecentM: longest30 > 0 ? longest30 : null,
  });

  console.log();
  for (const line of wrap(narrative.full, 66)) console.log("  " + line);
  if (narrative.limiter) {
    const held = narrative.reasoning.find((r) => r.component === narrative.limiter);
    console.log(`\n  held back most by: ${held?.label}`);
  }

  /* --- sanity --- */
  rule("Sanity checks");
  const warn = (ok: boolean, msg: string) => console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  warn(series.length > 300, `series is gap-filled (${series.length} calendar days)`);
  warn(now.ctl > 0 && now.ctl < 200, `fitness is in a plausible range (${now.ctl.toFixed(0)})`);
  warn(Math.abs(now.tsb) < 60, `form is in a plausible range (${now.tsb.toFixed(0)})`);
  warn(th.measured, `thresholds measured from real efforts, not seeded`);
  warn(hrCount / Math.max(1, methods.length) > 0.5, `most runs have heart rate`);
  console.log(`  threshold pace ${paceStr(1000 / (th.thresholdSpeedMps || 1))}/km, LTHR ${Math.round(th.lthr)} bpm\n`);
}

main().catch((e) => {
  console.error("\n✗", (e as Error).message);
  process.exit(1);
});

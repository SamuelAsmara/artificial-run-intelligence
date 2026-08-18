import { ActivitiesView } from "@/components/screens/ActivitiesView";
import { getActivities } from "@/actions/activities";
import { paceShapeColor, paceShapeToPath } from "@/lib/dashboard/sparkline";
import type { Act } from "@/lib/screens/activities";

export const metadata = { title: "Activities · ARI" };

/**
 * Classifies a run for the list's filter chips.
 *
 * We do not store a session type — intervals.icu reports everything as "Run" —
 * so it is inferred from distance and pace relative to the athlete's own
 * spread. Rough, and labelled as a filter rather than a fact.
 */
function classify(a: { distanceKm: number; paceSec: number; medianPace: number }): string {
  if (a.distanceKm >= 15) return "long";
  if (a.paceSec <= a.medianPace * 0.92) return "int";
  if (a.paceSec <= a.medianPace * 0.97) return "tempo";
  return "easy";
}

const NAMES: Record<string, string> = {
  easy: "Easy Run", tempo: "Tempo Run", int: "Intervals", long: "Long Run",
};

export default async function ActivitiesPage() {
  const rows = await getActivities(60);
  if (rows.length === 0) return <ActivitiesView />;

  const paces = rows
    .filter((r) => r.distanceKm > 0 && r.durationSec > 0)
    .map((r) => r.durationSec / r.distanceKm)
    .sort((a, b) => a - b);
  const medianPace = paces[Math.floor(paces.length / 2)] ?? 330;

  const acts: Act[] = rows.map((r) => {
    const paceSec = r.distanceKm > 0 ? r.durationSec / r.distanceKm : 0;
    const type = classify({ distanceKm: r.distanceKm, paceSec, medianPace });
    return {
      id: r.id,
      type,
      name: NAMES[type] ?? "Run",
      date: r.dateLabel,
      km: r.distanceKm.toFixed(1),
      time: r.duration,
      pace: r.pace,
      paceSec,
      hr: r.avgHr !== null ? String(r.avgHr) : "\u2014",
      kmN: r.distanceKm,
      spark: paceShapeToPath(r.paceShape),
      sparkColor: paceShapeColor(r.paceShape),
    };
  });

  // The list's weekly bars, oldest week first.
  const weekKm = new Array(4).fill(0);
  const now = Date.now();
  for (const r of rows) {
    const weeksAgo = Math.floor((now - Date.parse(r.date)) / (7 * 86_400_000));
    if (weeksAgo >= 0 && weeksAgo < 4) weekKm[3 - weeksAgo] += r.distanceKm;
  }

  const easyPaces = acts.filter((a) => a.type === "easy").map((a) => a.paceSec).reverse();
  const wp = easyPaces.length >= 2 ? easyPaces : [medianPace, medianPace];

  return <ActivitiesView data={{ acts, weekKm: weekKm.map((k) => Math.round(k)), wp }} />;
}

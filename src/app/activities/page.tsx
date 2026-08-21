import { ActivitiesView } from "@/components/screens/ActivitiesView";
import { EmptyActivities } from "@/components/screens/EmptyActivities";
import { getActivities, getPersonalRecords } from "@/actions/activities";
import { paceShapeColor, paceShapeToPath } from "@/lib/dashboard/sparkline";
import type { Act } from "@/lib/screens/activities";
import type { ComparableRun } from "@/lib/activity/compareRuns";

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
  const [rows, prs] = await Promise.all([getActivities(60), getPersonalRecords()]);
  // No runs means no runs — not a month of somebody else's.
  if (rows.length === 0) return <EmptyActivities />;

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
      pb: r.pb,
    };
  });

  /*
   * The same runs again, in the shape the comparison engine reads.
   *
   * Deliberately not folded into `Act`: that type is the design handoff's
   * row model and the comparison needs raw numbers — metres, seconds, the
   * unresampled pace shape — which the row deliberately does not carry
   * because it only ever prints strings.
   */
  const compare: ComparableRun[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    label: r.dateLabel,
    distanceM: r.distanceKm * 1000,
    durationS: r.durationSec,
    avgHr: r.avgHr,
    paceShape: r.paceShape,
    hrShape: r.hrShape,
    type: classify({
      distanceKm: r.distanceKm,
      paceSec: r.distanceKm > 0 ? r.durationSec / r.distanceKm : 0,
      medianPace,
    }),
  }));

  // The list's weekly bars, oldest week first.
  const weekKm = new Array(4).fill(0);
  const now = Date.now();
  for (const r of rows) {
    const weeksAgo = Math.floor((now - Date.parse(r.date)) / (7 * 86_400_000));
    if (weeksAgo >= 0 && weeksAgo < 4) weekKm[3 - weeksAgo] += r.distanceKm;
  }

  /*
   * The easy-run pace trend, one point per week.
   *
   * The caption says "weekly average" and this used to plot every easy run
   * individually — forty points of ordinary day-to-day variation, which is what
   * made the line look like noise rather than a trend. Averaging by week is
   * both what the label promises and what makes a direction visible.
   */
  const easyByWeek = new Map<number, { sum: number; n: number }>();
  for (const r of rows) {
    const paceSec = r.distanceKm > 0 ? r.durationSec / r.distanceKm : 0;
    if (paceSec <= 0) continue;
    if (classify({ distanceKm: r.distanceKm, paceSec, medianPace }) !== "easy") continue;
    const weeksAgo = Math.floor((now - Date.parse(r.date)) / (7 * 86_400_000));
    if (weeksAgo < 0 || weeksAgo > 11) continue;
    const bucket = easyByWeek.get(weeksAgo) ?? { sum: 0, n: 0 };
    bucket.sum += paceSec;
    bucket.n += 1;
    easyByWeek.set(weeksAgo, bucket);
  }

  /*
   * One point per calendar week, positioned by *when* it happened.
   *
   * Two faults lived here. The `Map` only contains weeks that had an easy run,
   * and the chart spaced whatever survived evenly — so weeks 11, 8, 3 and 0
   * were drawn as if they were consecutive, and a three-month gap looked like a
   * steady four-week trend. Each point now carries its own x position, so a gap
   * is drawn as a gap.
   *
   * The second: week 0 is *this* week, still in progress. A single Monday easy
   * run set the last vertex of a trend line and made it swing. The current week
   * joins the chart when it is over.
   */
  const wp = [...easyByWeek.entries()]
    .filter(([weeksAgo]) => weeksAgo > 0)
    .sort((a, b) => b[0] - a[0]) // oldest week first
    .map(([weeksAgo, v]) => ({ t: (11 - weeksAgo) / 10, v: v.sum / v.n }));

  const pb10k = prs.find((r) => r.key === "10k")?.time ?? null;

  /*
   * Heart rate, averaged over the runs that actually have one.
   *
   * The view used to do `+a.hr` over every row, and `a.hr` is a display string
   * that is an em dash when the strap was not worn. `+"—"` is NaN, so a single
   * strapless run turned the whole tile into "NaN bpm".
   */
  const withHr = rows.filter((r) => r.avgHr !== null);
  const avgHr = withHr.length
    ? Math.round(withHr.reduce((sum, r) => sum + (r.avgHr as number), 0) / withHr.length)
    : null;

  return (
    <ActivitiesView
      data={{ acts, weekKm: weekKm.map((k) => Math.round(k)), wp, pb10k, avgHr, compare }}
    />
  );
}

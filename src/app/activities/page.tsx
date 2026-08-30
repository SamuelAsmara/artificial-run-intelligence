/**
 * The activity list — the runs, the four-week summary, and the trend charts.
 *
 * One thing here is worth reading carefully. `getActivities(60)` is a **row
 * limit, not a date filter**, so the rows on this page can span months. The
 * tiles above the list are labelled "4 weeks", so they are computed from
 * `withinDays(rows, SUMMARY_DAYS, today)` and not from every row fetched —
 * otherwise the heading would be a promise the arithmetic does not keep, which
 * is exactly the bug the aggregation audit found here.
 */

import { ActivitiesView } from "@/components/screens/ActivitiesView";
import { EmptyActivities } from "@/components/screens/EmptyActivities";
import { getActivities, getPersonalRecords } from "@/actions/activities";
import { paceShapeColor, paceShapeToPath } from "@/lib/dashboard/sparkline";
import type { Act } from "@/lib/screens/activities";
import type { ComparableRun } from "@/lib/activity/compareRuns";
import { summariseRuns, withinDays, SUMMARY_DAYS } from "@/lib/activity/window";
import { classify, medianPace as medianPaceOf, paceOf, SESSION_NAME } from "@/lib/activity/classify";
import { isoDate, weekStart, zonedNow } from "@/lib/time/week";

export const metadata = { title: "Activities · Runi" };

/*
 * `classify` and `medianPace` used to be written here, in the page.
 *
 * They moved to `lib/activity/classify.ts` so they could be tested and so the
 * insight questions could reach the same definition — two screens disagreeing
 * about what counts as a tempo run is the same class of defect the aggregation
 * audit found nine of, every one of them in maths written inside a page.
 */

export default async function ActivitiesPage() {
  const [rows, prs] = await Promise.all([getActivities(60), getPersonalRecords()]);
  // No runs means no runs — not a month of somebody else's.
  if (rows.length === 0) return <EmptyActivities />;

  const median = medianPaceOf(
    rows.map((r) => ({ distanceKm: r.distanceKm, paceSec: paceOf(r) ?? 0 })),
  );

  const acts: Act[] = rows.map((r) => {
    const paceSec = paceOf(r) ?? 0;
    const type = classify({ distanceKm: r.distanceKm, paceSec }, median);
    return {
      id: r.id,
      type,
      name: SESSION_NAME[type],
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
    type: classify({ distanceKm: r.distanceKm, paceSec: paceOf(r) ?? 0 }, median),
  }));

  // The list's weekly bars, oldest week first.
  /*
   * Calendar weeks, not seven-day windows anchored on the current clock time.
   *
   * `Math.floor((now - date) / week)` buckets by "how long ago", so bucket 0
   * was the trailing seven days rather than this week — a run six days ago
   * could fall outside "this week" while the dashboard, which uses real week
   * starts, counted it in. Two screens, two answers for the same athlete.
   */
  const weekKm = new Array(4).fill(0);
  const today = isoDate(zonedNow());
  const thisWeek = isoDate(weekStart(zonedNow()));
  for (const r of rows) {
    const runWeek = isoDate(weekStart(new Date(`${r.date}T00:00:00`)));
    const weeksAgo = Math.round(
      (Date.parse(`${thisWeek}T00:00:00`) - Date.parse(`${runWeek}T00:00:00`)) / (7 * 86_400_000),
    );
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
    const paceSec = paceOf(r);
    if (paceSec === null) continue;
    if (classify({ distanceKm: r.distanceKm, paceSec }, median) !== "easy") continue;
    const runWeek = isoDate(weekStart(new Date(`${r.date}T00:00:00`)));
    const weeksAgo = Math.round(
      (Date.parse(`${thisWeek}T00:00:00`) - Date.parse(`${runWeek}T00:00:00`)) / (7 * 86_400_000),
    );
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
  /*
   * The stats row, over the window its label promises.
   *
   * `getActivities(60)` is a row limit, not a date filter — for anyone running
   * five times a week that is roughly three months. The tiles said "4 weeks"
   * over three months of training while the bar chart beside them showed four,
   * so one screen reported two different truths. The list still shows
   * everything that was fetched; only the summary is windowed.
   *
   * Both averages are weighted, and `summariseRuns` is where that arithmetic
   * lives so it has tests around it.
   */
  const summary = summariseRuns(withinDays(rows, SUMMARY_DAYS, today));

  return (
    <ActivitiesView
      data={{
        acts,
        weekKm: weekKm.map((k) => Math.round(k)),
        wp,
        pb10k,
        avgHr: summary.avgHr,
        summary: { runs: summary.runs, totalKm: summary.totalKm, avgPaceSec: summary.avgPaceSec },
        compare,
      }}
    />
  );
}

"use server";

/**
 * The data behind "Ask Runi".
 *
 * ## One fetch, and only when asked
 *
 * The panel is opened by a button, so nothing here runs for an athlete who
 * never opens it — and once it has run, moving between the ten questions costs
 * no round trip at all. That is the opposite of a fetch per question, which
 * would put a spinner between every click for data the browser already had.
 *
 * The bundle is small on purpose: ninety days of runs is a few hundred rows of
 * numbers, no streams, no per-run samples. The heavy columns — `pace_shape`,
 * `hr_shape`, `best_efforts` — are deliberately not selected, because no
 * question reads them.
 *
 * ## Why the answers are not computed here
 *
 * This file fetches. `lib/insights/questions.ts` decides. Every figure the
 * athlete reads comes from a pure function with a unit test behind it, which is
 * the rule the whole codebase follows and the reason the aggregation audit found
 * nothing in a tested module.
 *
 * Every export is an async function, because in a `"use server"` file every
 * export is a public endpoint.
 */

import { createClient } from "@/lib/supabase/server";
import { classify, medianPace, paceOf } from "@/lib/activity/classify";
import { estimateLthr } from "@/lib/activity/zones";
import { RACE_LABEL } from "@/lib/coach/templates";
import { todayIso } from "@/lib/time/week";
import { recordSetters } from "@/lib/dashboard/personalRecords";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/time/week";
import type { RaceType } from "@/types/database.types";
import type {
  InsightData, InsightLoad, InsightPlanned, InsightRun,
} from "@/lib/insights/types";

/** How far back the questions can see. The longest window any of them uses is 90 days. */
const HISTORY_DAYS = 120;

/** The athlete's own calendar date for a run, not the server's. */
const zonedIso = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: APP_TIME_ZONE,
  }).format(new Date(iso));

const label = (iso: string) =>
  new Intl.DateTimeFormat(APP_LOCALE, { day: "2-digit", month: "short", timeZone: APP_TIME_ZONE })
    .format(new Date(iso))
    .replace(/^(\d+) (\w+)$/, "$2 $1");

/** "01:38:00" from Postgres, as seconds. Null on anything unparseable. */
function intervalSeconds(value: string | null): number | null {
  if (!value) return null;
  const parts = value.trim().split(":");
  if (parts.length !== 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const [h, m, s] = parts.map(Number);
  const total = h * 3600 + m * 60 + s;
  return Number.isFinite(total) && total > 0 ? Math.round(total) : null;
}

const emptyBundle = (): InsightData => ({
  today: todayIso(), runs: [], lthr: null, planned: [], load: [], race: null,
});

/**
 * Everything the ten questions can read, for the signed-in athlete.
 *
 * Row-level security scopes every one of these queries to the caller, so an
 * athlete cannot reach another athlete's history through this even if the id
 * were guessed — the `.eq("user_id", user.id)` filters are belt to that brace,
 * not the security itself.
 */
export async function getInsightData(): Promise<InsightData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyBundle();

  const today = todayIso();
  const from = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
  const fromDay = from.slice(0, 10);

  const [activities, efforts, snapshots, profile, race, plan] = await Promise.all([
    supabase
      .from("activities")
      .select("id, started_at, distance_m, duration_s, avg_hr, cardiac_drift_pct")
      .eq("user_id", user.id)
      .gte("started_at", from)
      .order("started_at", { ascending: false }),
    // Records are judged over the whole history — a run from March can only be
    // a record against everything before it, not against the last 120 days.
    supabase
      .from("activities")
      .select("id, started_at, best_efforts")
      .eq("user_id", user.id)
      .not("best_efforts", "is", null),
    supabase
      .from("readiness_snapshots")
      .select("date, ctl, atl, tsb, acwr")
      .eq("user_id", user.id)
      .gte("date", fromDay)
      .order("date", { ascending: true }),
    supabase.from("profiles").select("lthr, hr_max").eq("id", user.id).maybeSingle(),
    supabase
      .from("goal_races")
      .select("race_type, race_date, target_time")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("race_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("training_plans")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const records = recordSetters(efforts.data ?? []);

  const rows = (activities.data ?? []).filter((a) => a.started_at);
  const bare = rows.map((a) => {
    const distanceKm = (a.distance_m ?? 0) / 1000;
    const durationSec = a.duration_s ?? 0;
    return {
      id: a.id as string,
      started: a.started_at as string,
      distanceKm,
      durationSec,
      paceSec: paceOf({ distanceKm, durationSec }),
      avgHr: a.avg_hr as number | null,
      cardiacDriftPct: a.cardiac_drift_pct as number | null,
    };
  });

  // One median over the whole window, so a run's type does not change
  // depending on which question happens to be asking.
  const median = medianPace(bare.map((b) => ({ distanceKm: b.distanceKm, paceSec: b.paceSec ?? 0 })));

  const runs: InsightRun[] = bare.map((b) => ({
    id: b.id,
    date: zonedIso(b.started),
    dateLabel: label(b.started),
    distanceKm: b.distanceKm,
    durationSec: b.durationSec,
    paceSec: b.paceSec,
    avgHr: b.avgHr,
    cardiacDriftPct: b.cardiacDriftPct,
    type: classify({ distanceKm: b.distanceKm, paceSec: b.paceSec ?? 0 }, median),
    pb: records.get(b.id) ?? null,
  }));

  const load: InsightLoad[] = (snapshots.data ?? []).map((s) => ({
    date: s.date as string,
    ctl: Number(s.ctl ?? 0),
    atl: Number(s.atl ?? 0),
    tsb: Number(s.tsb ?? 0),
    acwr: s.acwr === null || s.acwr === undefined ? null : Number(s.acwr),
  }));

  /*
   * Threshold heart rate, measured if we have it and estimated if we do not.
   *
   * The estimate is only used to split easy from hard, which is a coarse enough
   * question to survive it — and the answer says which of the two it used, so
   * the athlete is never shown a precise-looking figure resting on a guess.
   */
  const lthr =
    (profile.data?.lthr as number | null) ??
    (profile.data?.hr_max ? estimateLthr(profile.data.hr_max as number) : null);

  let planned: InsightPlanned[] = [];
  if (plan.data?.id) {
    const { data: workouts } = await supabase
      .from("plan_workouts")
      .select("day_date, workout_type, planned_distance")
      .eq("plan_id", plan.data.id)
      .gte("day_date", fromDay)
      .order("day_date", { ascending: true });

    // What was actually run on each planned day, by the athlete's calendar.
    const ranKm = new Map<string, number>();
    for (const b of bare) {
      const day = zonedIso(b.started);
      ranKm.set(day, (ranKm.get(day) ?? 0) + b.distanceKm);
    }

    planned = (workouts ?? [])
      .filter((w) => w.workout_type !== "rest")
      .map((w) => ({
        date: w.day_date as string,
        workoutType: w.workout_type as string,
        plannedKm: w.planned_distance === null ? null : Number(w.planned_distance),
        actualKm: ranKm.get(w.day_date as string) ?? null,
        // Today is still in progress, so today's session is not yet missed.
        past: (w.day_date as string) < today,
      }));
  }

  return {
    today,
    runs,
    lthr,
    planned,
    load,
    race: race.data
      ? {
          label: RACE_LABEL[race.data.race_type as RaceType],
          date: race.data.race_date as string,
          targetSec: intervalSeconds(race.data.target_time as string | null),
        }
      : null,
  };
}

"use server";

/**
 * Reading the athlete's own activities — the list, and one run in detail.
 *
 * ## Why the detail page fetches a stream instead of reading one
 *
 * The sync stores three summaries per activity and throws the raw stream away,
 * because keeping thousands of samples per run would be tens of megabytes for
 * data we normally only read through those summaries. The detail page is the
 * exception: it draws pace, heart rate and elevation second by second, so it
 * pulls the stream on demand. That is one request, for one run, only when
 * someone actually opens it.
 */

import { createClient } from "@/lib/supabase/server";
import { icuConfigForCurrentUser } from "@/lib/providers/credentials";
import { fetchStreams } from "@/lib/wellness/icuStreams";
import { resampleForChart } from "@/lib/activity/resample";
import { formatDuration, formatPace } from "@/lib/format/pace";
import { comparePlanned, type Comparison } from "@/lib/activity/plannedVsActual";

export interface ActivityListItem {
  id: string;
  date: string;
  /** "Aug 17" */
  dateLabel: string;
  distanceKm: number;
  durationSec: number;
  /** "4:55" */
  pace: string;
  /** "49:12" */
  duration: string;
  avgHr: number | null;
  paceShape: (number | null)[] | null;
  cardiacDriftPct: number | null;
}

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const label = (isoDate: string) => {
  const d = new Date(isoDate);
  return `${MO[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
};

export async function getActivities(limit = 60): Promise<ActivityListItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("activities")
    .select("id, started_at, distance_m, duration_s, avg_hr, pace_shape, cardiac_drift_pct")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(limit);

  return (data ?? [])
    .filter((a) => a.started_at)
    .map((a) => {
      const km = (a.distance_m ?? 0) / 1000;
      const seconds = a.duration_s ?? 0;
      return {
        id: a.id,
        date: (a.started_at as string).slice(0, 10),
        dateLabel: label(a.started_at as string),
        distanceKm: km,
        durationSec: seconds,
        pace: km > 0 ? formatPace(seconds / km) : "—",
        duration: formatDuration(seconds),
        avgHr: a.avg_hr,
        paceShape: a.pace_shape,
        cardiacDriftPct: a.cardiac_drift_pct,
      };
    });
}

/** The per-second arrays the detail chart draws from. */
export interface DetailStreams {
  n: number;
  /** metres, cumulative */
  dist: number[];
  /** metres per second */
  vel: number[];
  hr: number[];
  alt: number[];
  /** seconds from the start */
  time: number[];
}

export interface ActivityDetail {
  id: string;
  dateLabel: string;
  /** "Monday 17 August 2026" */
  fullDate: string;
  distanceKm: number;
  duration: string;
  pace: string;
  avgHr: number | null;
  cardiacDriftPct: number | null;
  bestEfforts: Record<string, number> | null;
  /** null when the stream could not be fetched — the page still renders */
  streams: DetailStreams | null;
  /** why the chart is missing, when it is */
  streamsNote: string | null;
  /**
   * How this run compared with the session planned for that day.
   *
   * null when nothing was planned, which is the common case for an athlete
   * without an active plan. The page hides the block entirely rather than
   * showing a target that was never set.
   */
  comparison: Comparison | null;
}

export async function getActivityDetail(id: string): Promise<ActivityDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from("activities")
    .select("id, source, external_id, started_at, distance_m, duration_s, avg_hr, cardiac_drift_pct, best_efforts")
    // The id alone would be enough for Postgres, but scoping to the user means
    // a guessed id returns nothing rather than relying on RLS as the only guard.
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  if (!row || !row.started_at) return null;

  const started = new Date(row.started_at);
  const km = (row.distance_m ?? 0) / 1000;
  const seconds = row.duration_s ?? 0;

  let streams: DetailStreams | null = null;
  let streamsNote: string | null = null;

  if (row.source === "intervals_icu") {
    const cfg = await icuConfigForCurrentUser();
    if (!cfg) {
      streamsNote = "Connect intervals.icu to see this run second by second.";
    } else {
      try {
        const raw = await fetchStreams(cfg, row.external_id);
        streams = raw ? resampleForChart(raw) : null;
        if (!streams) {
          streamsNote = "This run has no second-by-second record — it may have been entered by hand.";
        }
      } catch {
        streamsNote = "Could not reach intervals.icu for the detail of this run.";
      }
    }
  } else {
    streamsNote = "Second-by-second detail is only available for runs from intervals.icu.";
  }

  const comparison = await comparePlannedFor(
    supabase,
    user.id,
    (row.started_at as string).slice(0, 10),
    { distanceM: row.distance_m ?? 0, durationS: seconds },
  );

  return {
    id: row.id,
    dateLabel: label(row.started_at),
    fullDate: started.toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    }),
    distanceKm: km,
    duration: formatDuration(seconds),
    pace: km > 0 ? formatPace(seconds / km) : "—",
    avgHr: row.avg_hr,
    cardiacDriftPct: row.cardiac_drift_pct,
    bestEfforts: row.best_efforts,
    streams,
    streamsNote,
    comparison,
  };
}

/**
 * The planned session for one date, compared against what was run.
 *
 * Reads `plan_workouts` for the athlete's active plan. A missing plan, a
 * missing day, or a day with no target all end in the same place: no block on
 * the page. That is deliberate — the alternative is the prototype's fixed copy,
 * which claimed a 6 km easy run beside every activity regardless of what was
 * actually planned or actually run.
 */
async function comparePlannedFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  date: string,
  actual: { distanceM: number; durationS: number },
): Promise<Comparison | null> {
  const { data: plan } = await supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return null;

  const { data: workout } = await supabase
    .from("plan_workouts")
    .select("workout_type, planned_distance, planned_pace")
    .eq("plan_id", plan.id)
    .eq("day_date", date)
    .maybeSingle();

  if (!workout) return null;

  return comparePlanned(
    {
      workoutType: workout.workout_type,
      plannedDistanceM: workout.planned_distance,
      plannedPace: workout.planned_pace,
    },
    actual,
  );
}

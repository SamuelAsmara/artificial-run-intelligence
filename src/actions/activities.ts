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
import { streamsFromShape } from "@/lib/activity/shapeStreams";
import { provenanceOf, type Provenance } from "@/lib/activity/provenance";
import { formatDuration, formatPace } from "@/lib/format/pace";
import { comparePlanned, type Comparison } from "@/lib/activity/plannedVsActual";
import type { ChartStreams } from "@/lib/activity/resample";
import { driftOnset, readableSegments, summarise, fastestSegment, type RangeSummary, type Segment } from "@/lib/activity/metrics";
import { buildActivityNote, type ActivityNote } from "@/lib/activity/buildActivityNote";
import { effectiveHrMax, estimateLthr, observedHrMax } from "@/lib/activity/zones";
import {
  personalRecords,
  recordSetters,
  type PersonalRecord,
} from "@/lib/dashboard/personalRecords";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/time/week";

/**
 * How far back a record search reads.
 *
 * Records are all-time by definition, so this is a safety bound rather than a
 * window: 400 activities is more than two years of five-a-week running, and an
 * athlete past that is a problem worth having.
 */
const PR_SCAN_LIMIT = 400;

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
  hrShape: (number | null)[] | null;
  cardiacDriftPct: number | null;
  /** "10K PB" when this run broke a record the day it was run, else null */
  pb: string | null;
}

/**
 * "Aug 18", in the athlete's timezone rather than the server's.
 *
 * These run inside server actions, so `getMonth()`/`getDate()` were reading UTC
 * on Vercel — an hour or three behind, which is a whole day for any run started
 * before about 03:00 local.
 */
/** the YYYY-MM-DD the athlete would write on that run, in their own zone */
const zonedIso = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: APP_TIME_ZONE,
  }).format(new Date(iso));

const label = (iso: string) =>
  new Intl.DateTimeFormat(APP_LOCALE, {
    day: "2-digit",
    month: "short",
    timeZone: APP_TIME_ZONE,
  })
    .format(new Date(iso))
    .replace(/^(\d+) (\w+)$/, "$2 $1");

export async function getActivities(limit = 60): Promise<ActivityListItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("activities")
    .select("id, started_at, distance_m, duration_s, avg_hr, pace_shape, hr_shape, cardiac_drift_pct, best_efforts")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(limit);

  /*
   * Records are decided over the whole history, not over the page.
   *
   * `limit` is the list's page size; a run from last March can only be judged
   * against everything before it. Asking for the efforts alone is cheap — two
   * columns, no streams — and it is the only way the mark can be honest.
   */
  const { data: history } = await supabase
    .from("activities")
    .select("id, started_at, best_efforts")
    .eq("user_id", user.id)
    .not("best_efforts", "is", null);

  const records = recordSetters(history ?? []);

  return (data ?? [])
    .filter((a) => a.started_at)
    .map((a) => {
      const km = (a.distance_m ?? 0) / 1000;
      const seconds = a.duration_s ?? 0;
      return {
        id: a.id,
        // The athlete's calendar date, not the server's. `slice(0, 10)` on a
        // UTC timestamp files a run started at 01:00 local on the previous
        // day — so the list header said Tuesday while the streak, the calendar
        // dot and the weekly bar all said Monday.
        date: zonedIso(a.started_at as string),
        dateLabel: label(a.started_at as string),
        distanceKm: km,
        durationSec: seconds,
        pace: km > 0 ? formatPace(seconds / km) : "—",
        duration: formatDuration(seconds),
        avgHr: a.avg_hr,
        paceShape: a.pace_shape,
        hrShape: a.hr_shape,
        cardiacDriftPct: a.cardiac_drift_pct,
        pb: records.get(a.id) ?? null,
      };
    });
}

/** What the analysis screen needs, beyond the stream itself. */
export interface ActivityDetail {
  id: string;
  /** the device's moving time, which every figure on the page defers to */
  movingS: number;
  /** "Aug 17" */
  dateLabel: string;
  /** "Monday, 17.08.26" */
  fullDate: string;
  /** "7:00 PM" */
  clock: string;
  /** the planned session's type when there was one, else "Run" */
  runType: string;

  /** for the small identity block in the header */
  athlete: { name: string; initials: string; avatarUrl: string | null; avatarPosition: string };

  /** every figure the header trio reports, over the whole run */
  summary: RangeSummary;
  segments: Segment[];
  /** index into `segments`, or -1 */
  fastestIndex: number;

  /** metres into the run where drift began, null when it never did */
  driftOnsetM: number | null;
  cardiacDriftPct: number | null;

  /** threshold and maximum heart rate, for the zone labels */
  lthr: number | null;
  /** how `lthr` was arrived at, so the zone labels can be honest about it */
  lthrBasis: "stated" | "observed" | "formula" | null;
  hrMax: number | null;

  bestEfforts: Record<string, number> | null;
  /** as the device reported it; never derived */
  calories: number | null;

  /** null when the stream could not be fetched — the page still renders */
  streams: ChartStreams | null;
  /** where this run came from, at what resolution, and what it is missing */
  provenance: Provenance;
  /**
   * True when the chart was rebuilt from the stored pace summary rather than a
   * second-by-second stream. The chart is honest at that resolution; dragging
   * a range across it is not, so the page does not offer it.
   */
  coarseChart: boolean;

  /**
   * How this run compared with the session planned for that day.
   *
   * null when nothing was planned, which is the common case for an athlete
   * without an active plan. The page hides the block entirely rather than
   * showing a target that was never set.
   */
  comparison: Comparison | null;

  /** the coach card, built from the facts above */
  note: ActivityNote | null;
}

export async function getActivityDetail(id: string): Promise<ActivityDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from("activities")
    .select("user_id, id, source, external_id, started_at, distance_m, duration_s, avg_hr, max_hr, calories, avg_cadence, avg_power, cardiac_drift_pct, drift_onset_m, best_efforts, pace_shape, hr_shape")
    .eq("id", id)
    .maybeSingle();

  if (!row || !row.started_at) return null;

  /*
   * The owner, or their coach.
   *
   * This used to scope the query to `user.id`, which meant a coach opening one
   * of their athlete's runs got a 404 — while the page carried a "Coach view —
   * you are viewing this athlete's run" banner that nothing could ever reach.
   * The banner is now true. The check is explicit rather than left to RLS,
   * which is the rule everywhere else in this file.
   */
  const isOwner = row.user_id === user.id;
  let coaching = false;

  if (!isOwner) {
    const { data: link } = await supabase
      .from("coach_athletes")
      .select("athlete_id")
      .eq("coach_id", user.id)
      .eq("athlete_id", row.user_id)
      .eq("status", "active")
      .maybeSingle();
    coaching = !!link;
  }

  // Same answer as a missing row: a stranger must not learn that the id exists.
  if (!isOwner && !coaching) return null;

  const started = new Date(row.started_at);
  const km = (row.distance_m ?? 0) / 1000;
  const seconds = row.duration_s ?? 0;

  let streams: ChartStreams | null = null;
  let unreachable = false;

  if (row.source === "intervals_icu") {
    // The stream belongs to whoever ran it, so it needs their credentials. A
    // coach reading an athlete's run has none of their own that would work —
    // and `provider_connections` has no coach policy, deliberately, so this
    // returns null for them rather than reaching for the athlete's key.
    const cfg = isOwner ? await icuConfigForCurrentUser() : null;
    if (cfg) {
      try {
        const raw = await fetchStreams(cfg, row.external_id);
        streams = raw ? resampleForChart(raw) : null;
      } catch {
        // Their provider is down or the token expired. Say so rather than
        // letting it read as "this run has no data".
        unreachable = true;
      }
    }
  }

  /*
   * No provider stream, but the run is not blind.
   *
   * `pace_shape` was stored at import for exactly this reason — forty points
   * of seconds per kilometre, kept so the raw stream could be thrown away.
   * Until now only the list's sparkline read it, and every run that did not
   * come from intervals.icu lost its whole chart: no pace curve, and with it
   * no planned pace and no target window, because both are drawn inside the
   * pace band.
   *
   * Deliberately kept out of `streams`. Everything below reads that variable
   * to decide what the *figures* are, and a forty-point curve cannot be the
   * source of a climb or a kilometre split. It draws; the stored row still
   * reports.
   */
  const coarse = streams
    ? null
    : streamsFromShape(
        row.pace_shape as (number | null)[] | null,
        row.distance_m ?? 0,
        seconds,
        row.hr_shape as (number | null)[] | null,
      );
  const chart = streams ?? coarse;

  /*
   * One description of what this chart is made of, for every door a run can
   * come through. Each branch above used to write its own sentence, so the
   * same absence was worded differently depending on where it was noticed and
   * a run missing only its heart rate was described as missing everything.
   */
  const provenance: Provenance = provenanceOf({
    source: row.source,
    resolution: streams ? "full" : coarse ? "summary" : "none",
    hasHeartRate: Boolean(chart?.hr.some((v) => Number.isFinite(v) && v > 0)),
    hasElevation: Boolean(chart?.alt.some((v) => Number.isFinite(v))),
    hasCadence: Boolean(chart?.hasCadence),
    hasPower: Boolean(chart?.hasPower),
    unreachable,
    restricted: !isOwner && row.source === "intervals_icu",
  });

  /*
   * Everything below describes the run's owner, so it is keyed on `row.user_id`
   * and not on whoever is looking.
   *
   * These three used to be passed `user.id`. That was harmless while only the
   * owner could open the page — and became wrong the moment coaches could. A
   * coach opening an athlete's long run saw her own avatar and initials over
   * his run, every kilometre labelled Z2/Z3/Z4 against *her* lactate threshold
   * presented as measured, and "planned vs actual" comparing his run to
   * whatever she had scheduled that day. Confidently wrong on every figure, and
   * a zone chart computed from the wrong person's threshold is precisely the
   * kind of thing a coach would act on.
   */
  const ownerId = row.user_id;

  const comparison = await comparePlannedFor(
    supabase,
    ownerId,
    (row.started_at as string).slice(0, 10),
    { distanceM: row.distance_m ?? 0, durationS: seconds },
  );

  const [physiology, plannedType] = await Promise.all([
    heartRateAnchors(supabase, ownerId),
    plannedTypeFor(supabase, ownerId, (row.started_at as string).slice(0, 10)),
  ]);

  // Everything the header reports comes from the stream when there is one, so
  // the whole-run figures and the drag-selection figures take the same path.
  // Without a stream we fall back to the stored summary, which is thinner but
  // never contradicts it.
  const segments = streams ? readableSegments(streams) : [];

  /**
   * Drift onset, computed from the stream this request already has.
   *
   * The sync stores it too, but only for activities whose stream it fetches —
   * and it skips any it has already seen, so every run imported before this
   * measurement existed carries a null forever. Deriving it here from a stream
   * that is in memory anyway costs nothing and means the page is right on the
   * first load rather than after a backfill nobody remembered to run.
   */
  const onset = streams ? driftOnset(streams) : row.drift_onset_m;
  const summary: RangeSummary = streams
    // `seconds` is intervals.icu's moving_time — Garmin's own number, stored at
    // import. It is the authority; the stream only says how to divide it up.
    ? summarise(streams, 0, streams.n - 1, seconds)
    : {
        distanceM: row.distance_m ?? 0,
        // The stored duration is already moving time, as intervals.icu reports
        // it, so without a stream there is nothing to subtract.
        durationS: seconds,
        elapsedS: seconds,
        stoppedS: 0,
        paceSec: km > 0 && seconds > 0 ? seconds / km : null,
        gapSec: null,
        speedKmh: seconds > 0 ? km / (seconds / 3600) : null,
        // No stream, so no elevation was measured — see RangeSummary.climbM.
        climbM: null,
        avgHr: row.avg_hr,
        maxHr: row.max_hr,
        avgCadence: row.avg_cadence,
        avgPower: row.avg_power,
      };

  /*
   * The narrative used to be gated on having a stream, which meant a run with
   * a plan behind it and no stream said nothing at all about that plan. Each
   * sentence already returns null when its own inputs are missing, so with no
   * stream the shape and fastest-kilometre sentences drop out by themselves
   * and the planned-versus-actual one remains, which is the sentence the
   * athlete came for.
   */
  const note =
    streams || comparison
      ? buildActivityNote({
          summary,
          segments,
          driftOnsetM: onset,
          driftPct: row.cardiac_drift_pct,
          comparison,
        })
      : null;

  const name = physiology.fullName ?? "";

  return {
    id: row.id,
    movingS: seconds,
    dateLabel: label(row.started_at),
    fullDate: new Intl.DateTimeFormat(APP_LOCALE, {
      weekday: "long", day: "2-digit", month: "2-digit", year: "2-digit",
      timeZone: APP_TIME_ZONE,
    }).format(started),
    clock: new Intl.DateTimeFormat(APP_LOCALE, {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: APP_TIME_ZONE,
    }).format(started),
    runType: plannedType ?? "Run",
    athlete: {
      name,
      initials: initialsOf(name),
      avatarUrl: physiology.avatarUrl,
      avatarPosition: physiology.avatarPosition,
    },
    summary,
    segments,
    fastestIndex: fastestSegment(segments),
    driftOnsetM: onset,
    cardiacDriftPct: row.cardiac_drift_pct,
    lthr: physiology.lthr,
    lthrBasis: physiology.lthrBasis,
    hrMax: physiology.hrMax,
    calories: row.calories,
    bestEfforts: row.best_efforts,
    streams: chart,
    provenance,
    coarseChart: Boolean(coarse),
    comparison,
    note,
  };
}

/** "Samuel Asmara" -> "SA". Falls back to a single letter, then to nothing. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The two heart rates every zone label depends on, plus the athlete's identity.
 *
 * Maximum comes from what has actually been recorded across their runs, not
 * from 220 minus their age — see src/lib/activity/zones.ts for why that formula
 * is not good enough to label a training zone with.
 */
async function heartRateAnchors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const [{ data: profile }, { data: runs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_url, avatar_position, age, hr_max, lthr")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("activities")
      .select("max_hr")
      .eq("user_id", userId)
      .not("max_hr", "is", null)
      .order("max_hr", { ascending: false })
      .limit(40),
  ]);

  const observed = observedHrMax((runs ?? []).map((r) => r.max_hr));
  const hrMax = effectiveHrMax({
    stated: profile?.hr_max ?? null,
    observed,
    age: profile?.age ?? null,
  });

  /*
   * Where the threshold came from, so the screen can say.
   *
   * The per-kilometre strip labels each split "Z3", "Z4" and so on, and those
   * labels are only as good as the threshold behind them. A stated LTHR is the
   * athlete's own number; a threshold derived from an observed maximum is a
   * measurement; one derived from `220 - age` is a population average that
   * `lib/activity/zones.ts` argues at length is not good enough to label a zone
   * with. All three used to look identical on screen.
   */
  const lthrBasis: "stated" | "observed" | "formula" | null = profile?.lthr
    ? "stated"
    : hrMax === null
      ? null
      : observed !== null
        ? "observed"
        : "formula";

  return {
    fullName: profile?.full_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    avatarPosition: profile?.avatar_position ?? "50% 30%",
    hrMax,
    lthr: profile?.lthr ?? (hrMax ? estimateLthr(hrMax) : null),
    lthrBasis,
  };
}

/** The planned session's type for a date, used as the run's tag. */
async function plannedTypeFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  date: string,
): Promise<string | null> {
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
    .select("workout_type")
    .eq("plan_id", plan.id)
    .eq("day_date", date)
    .maybeSingle();
  if (!workout || workout.workout_type === "rest") return null;

  const t = workout.workout_type;
  return t.charAt(0).toUpperCase() + t.slice(1) + " Run";
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

/* ------------------------------------------------------------------ */
/* Personal records                                                    */
/* ------------------------------------------------------------------ */

/**
 * The athlete's records, computed once and read by every screen that shows one.
 *
 * This exists because the dashboard and the activity list disagreed. The
 * dashboard reduced `best_efforts` across 400 activities; the list printed the
 * string "47:12". Two screens, two different 10 km bests, one of them invented.
 *
 * A record is a claim about the athlete's whole history, so the query is not
 * bounded by whatever the list happens to be showing. Any screen wanting a
 * record calls this — there is no second implementation to drift from.
 */
export async function getPersonalRecords(): Promise<PersonalRecord[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return personalRecords([]);

  const { data } = await supabase
    .from("activities")
    .select("id, started_at, best_efforts")
    .eq("user_id", user.id)
    .not("best_efforts", "is", null)
    .order("started_at", { ascending: false })
    .limit(PR_SCAN_LIMIT);

  // A record set in the last month is worth calling out.
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  return personalRecords(data ?? [], monthAgo);
}

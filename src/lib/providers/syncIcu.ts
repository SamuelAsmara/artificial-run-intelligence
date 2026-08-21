/**
 * Importing an athlete's data from intervals.icu, for any athlete.
 *
 * This is the same work the Settings button does, lifted out of the server
 * action so the nightly job can do it too. The action knows who is signed in;
 * the cron does not, so the athlete is a parameter rather than a session.
 *
 * Every write here is idempotent — the unique keys on (user_id, date) and
 * (user_id, source, external_id) mean a scheduled run and a manual press can
 * overlap without producing a single duplicate row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  fetchActivities, fetchWellness, toActivityImports, toRecoverySignals,
  type IcuConfig, type RecoverySignal,
} from "@/lib/wellness/intervalsIcu";
import { deriveFromStreams, fetchStreams } from "@/lib/wellness/icuStreams";
import { resampleForChart } from "@/lib/activity/resample";
import { driftOnset } from "@/lib/activity/metrics";

type Client = SupabaseClient<Database>;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const BACKFILL_DAYS = 400;

/**
 * Which version of the stream derivation this build implements.
 *
 * The four derived columns are a cache of a pure function over a stream we no
 * longer keep, so when the function changes the cache is silently wrong and
 * nothing re-derives it — the sync skips anything already stamped
 * `streams_fetched_at`. Raising this number is how a maths change reaches data
 * that was imported before it.
 *
 *   1 — original
 *   2 — bestEfforts measures its windows on moving time rather than elapsed,
 *       so a stop inside a fast stretch no longer counts against the effort
 *
 * See migration 0010.
 */
export const DERIVATION_VERSION = 3;

/**
 * Activity streams processed per run.
 *
 * Each is a separate request to intervals.icu, so a first backfill of a year's
 * running is hundreds of round trips — more than belongs in one request. Each
 * run takes a batch of whatever is unprocessed and reports what is left, so a
 * backfill finishes over several runs instead of timing out half-way and
 * leaving the data in a state nobody can reason about.
 */
export /**
 * The external ids whose provider timestamp has moved since we stored them.
 *
 * Null on either side means "unknown", and unknown is never treated as changed:
 * every row that exists today has no stored timestamp, and re-deriving the whole
 * history on the first sync after this ships would be a self-inflicted rate-limit
 * on somebody's account. They heal on the next real edit, or when
 * `DERIVATION_VERSION` next moves.
 */
async function editedSinceImport(
  supabase: Client,
  userId: string,
  imports: { external_id: string; source_updated_at: string | null }[],
): Promise<string[]> {
  const incoming = new Map(
    imports
      .filter((a) => a.source_updated_at)
      .map((a) => [a.external_id, a.source_updated_at as string]),
  );
  if (incoming.size === 0) return [];

  const ids = [...incoming.keys()];
  const changed: string[] = [];

  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("activities")
      .select("external_id, source_updated_at, streams_derived_version")
      .eq("user_id", userId)
      .eq("source", "intervals_icu")
      .in("external_id", ids.slice(i, i + 200));

    for (const row of data ?? []) {
      // Nothing derived yet? It is already in the queue; saying so twice costs
      // an extra write for no change in outcome.
      if ((row.streams_derived_version ?? 0) === 0) continue;
      if (!row.source_updated_at) continue;
      const next = incoming.get(row.external_id);
      if (next && next !== row.source_updated_at) changed.push(row.external_id);
    }
  }

  return changed;
}

/**
 * How long after a run we stop expecting a stream to appear.
 *
 * intervals.icu needs a few minutes to process an uploaded FIT file, and a run
 * synced before that finishes has no stream *yet*. A day is far past any
 * processing delay, so a run still bare after one genuinely has none.
 */
const SETTLE_MS = 24 * 60 * 60 * 1000;

const STREAM_BATCH = 25;

/** Requests in flight at once. Politeness toward a free API run by one person. */
const STREAM_CONCURRENCY = 4;

export interface IcuImportResult {
  nights: number;
  runs: number;
  /** activity streams processed this run */
  detailed: number;
  /** streams still waiting — sync again to continue */
  remaining: number;
  /** set when part of the import failed but the connection itself is fine */
  warning?: string;
}

export async function importFromIcu(
  supabase: Client,
  userId: string,
  cfg: IcuConfig,
): Promise<IcuImportResult> {
  const oldest = iso(new Date(Date.now() - BACKFILL_DAYS * 86_400_000));
  const newest = iso(new Date());

  const [wellnessResult, activityResult] = await Promise.allSettled([
    fetchWellness(cfg, oldest, newest),
    fetchActivities(cfg, oldest, newest),
  ]);

  const problems: string[] = [];
  let nights = 0;
  let runs = 0;

  if (wellnessResult.status === "fulfilled") {
    const signals: RecoverySignal[] = toRecoverySignals(wellnessResult.value);
    if (signals.length > 0) {
      const { error } = await supabase.from("recovery_signals").upsert(
        signals.map((r) => ({
          user_id: userId,
          date: r.date,
          sleep_hours: r.sleepHours,
          resting_hr: r.restingHr,
          hrv: r.hrv,
          source: r.source,
        })),
        { onConflict: "user_id,date" },
      );
      if (error) problems.push(`recovery data: ${error.message}`);
      else nights = signals.length;
    }
  } else {
    problems.push("could not read recovery data");
  }

  if (activityResult.status === "fulfilled") {
    const imports = toActivityImports(activityResult.value);
    if (imports.length > 0) {
      /*
       * Which runs have been edited since we analysed them.
       *
       * This has to be worked out *before* the upsert, because the upsert
       * overwrites the stored timestamp with the incoming one and the evidence
       * is gone. See migration 0015 for what the gap cost: a run cropped on
       * intervals.icu got its distance corrected and kept a `pace_shape`,
       * `best_efforts` and `cardiac_drift_pct` derived from the uncropped file,
       * for ever.
       */
      const edited = await editedSinceImport(supabase, userId, imports);

      const CHUNK = 200;
      for (let i = 0; i < imports.length; i += CHUNK) {
        const { error } = await supabase.from("activities").upsert(
          imports.slice(i, i + CHUNK).map((a) => ({ ...a, user_id: userId })),
          { onConflict: "user_id,source,external_id" },
        );
        if (error) {
          problems.push(`runs: ${error.message}`);
          break;
        }
        runs += Math.min(CHUNK, imports.length - i);
      }

      /*
       * Put them back in the queue.
       *
       * Version 0 is below any `DERIVATION_VERSION`, so `processStreams` picks
       * them up on this same pass — the path built for "we changed the maths"
       * serves "they changed the run" without a second mechanism.
       */
      if (edited.length > 0) {
        for (let i = 0; i < edited.length; i += 200) {
          await supabase
            .from("activities")
            .update({ streams_derived_version: 0 })
            .eq("user_id", userId)
            .eq("source", "intervals_icu")
            .in("external_id", edited.slice(i, i + 200));
        }
      }
    }
  } else {
    problems.push("could not read activities");
  }

  let streamProgress = { detailed: 0, remaining: 0 };
  try {
    streamProgress = await processStreams(supabase, userId, cfg);
  } catch {
    problems.push("could not read activity detail");
  }

  return {
    nights,
    runs,
    detailed: streamProgress.detailed,
    remaining: streamProgress.remaining,
    warning: problems.length ? problems.join("; ") : undefined,
  };
}

/**
 * Pulls per-second data for activities that do not have it yet, derives the
 * pace shape, best efforts and cardiac drift, and stores those. The raw stream
 * is discarded — see src/lib/wellness/icuStreams.ts for why.
 *
 * Exported so a manual sync can run several batches back to back. A first
 * import of a year's running leaves hundreds of activities without detail, and
 * one batch of 25 per press is a backfill measured in days of pressing.
 */
export async function processStreams(
  supabase: Client,
  userId: string,
  cfg: IcuConfig,
): Promise<{ detailed: number; remaining: number }> {
  // Never derived, or derived by an older version of the maths.
  const { data: pending } = await supabase
    .from("activities")
    .select("id, external_id, started_at")
    .eq("user_id", userId)
    .eq("source", "intervals_icu")
    .lt("streams_derived_version", DERIVATION_VERSION)
    .order("started_at", { ascending: false })
    .limit(STREAM_BATCH);

  if (!pending || pending.length === 0) return { detailed: 0, remaining: 0 };

  let detailed = 0;
  const queue = [...pending];

  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;

      /*
       * Three outcomes, and only one of them is "done".
       *
       * The version stamp is what takes a row out of the pending set forever,
       * so it may only be written when the stream was genuinely read — or when
       * we are confident there will never be one. It used to be written
       * unconditionally, including after a thrown 429 or a stream intervals.icu
       * had not finished processing yet, which is how a run synced ten minutes
       * after it ended acquired a flat sparkline and no personal best for good.
       *
       * A run older than a day with no stream really has none: manual entries
       * and treadmill logs never get one. Below that age we wait and ask again.
       */
      const startedAt = row.started_at ? Date.parse(row.started_at) : 0;
      const settled = startedAt > 0 && Date.now() - startedAt > SETTLE_MS;

      let update: {
        streams_fetched_at: string;
        streams_derived_version?: number;
        pace_shape?: (number | null)[];
        hr_shape?: (number | null)[] | null;
        best_efforts?: Record<string, number>;
        cardiac_drift_pct?: number | null;
        drift_onset_m?: number | null;
      } | null = null;

      try {
        const streams = await fetchStreams(cfg, row.external_id);
        if (streams) {
          const derived = deriveFromStreams(streams);
          update = {
            streams_fetched_at: new Date().toISOString(),
            streams_derived_version: DERIVATION_VERSION,
            pace_shape: derived.paceShape,
            hr_shape: derived.hrShape,
            best_efforts: derived.bestEfforts,
            cardiac_drift_pct: derived.cardiacDriftPct,
            // Where drift began, not just how much of it there was. Derived
            // from the same fetch, because the stream is discarded afterwards
            // and asking again would mean another round trip per activity.
            drift_onset_m: onsetFrom(streams),
          };
          detailed++;
        } else {
          update = {
            streams_fetched_at: new Date().toISOString(),
            ...(settled ? { streams_derived_version: DERIVATION_VERSION } : {}),
          };
        }
      } catch {
        // Transient: an auth failure, a 5xx, a rate limit, a dropped socket.
        // Record nothing, so the next sync tries again.
        update = null;
      }

      if (update) await supabase.from("activities").update(update).eq("id", row.id);
    }
  };

  await Promise.all(Array.from({ length: STREAM_CONCURRENCY }, worker));

  const { count } = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "intervals_icu")
    .lt("streams_derived_version", DERIVATION_VERSION);

  return { detailed, remaining: count ?? 0 };
}

/** Drift onset for one stream, or null when the run cannot support the claim. */
function onsetFrom(streams: Parameters<typeof deriveFromStreams>[0]): number | null {
  const chart = resampleForChart(streams);
  return chart ? driftOnset(chart) : null;
}

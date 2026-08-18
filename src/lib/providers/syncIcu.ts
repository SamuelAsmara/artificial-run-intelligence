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

type Client = SupabaseClient<Database>;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const BACKFILL_DAYS = 400;

/**
 * Activity streams processed per run.
 *
 * Each is a separate request to intervals.icu, so a first backfill of a year's
 * running is hundreds of round trips — more than belongs in one request. Each
 * run takes a batch of whatever is unprocessed and reports what is left, so a
 * backfill finishes over several runs instead of timing out half-way and
 * leaving the data in a state nobody can reason about.
 */
export const STREAM_BATCH = 25;

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
 */
async function processStreams(
  supabase: Client,
  userId: string,
  cfg: IcuConfig,
): Promise<{ detailed: number; remaining: number }> {
  const { data: pending } = await supabase
    .from("activities")
    .select("id, external_id")
    .eq("user_id", userId)
    .eq("source", "intervals_icu")
    .is("streams_fetched_at", null)
    .order("started_at", { ascending: false })
    .limit(STREAM_BATCH);

  if (!pending || pending.length === 0) return { detailed: 0, remaining: 0 };

  let detailed = 0;
  const queue = [...pending];

  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;

      let update: {
        streams_fetched_at: string;
        pace_shape?: (number | null)[];
        best_efforts?: Record<string, number>;
        cardiac_drift_pct?: number | null;
      } = {
        // Stamped even when there is no stream, so an activity without one is
        // not retried on every future sync.
        streams_fetched_at: new Date().toISOString(),
      };

      try {
        const streams = await fetchStreams(cfg, row.external_id);
        if (streams) {
          const derived = deriveFromStreams(streams);
          update = {
            ...update,
            pace_shape: derived.paceShape,
            best_efforts: derived.bestEfforts,
            cardiac_drift_pct: derived.cardiacDriftPct,
          };
          detailed++;
        }
      } catch {
        /* one unreadable activity must not stop the batch */
      }

      await supabase.from("activities").update(update).eq("id", row.id);
    }
  };

  await Promise.all(Array.from({ length: STREAM_CONCURRENCY }, worker));

  const { count } = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "intervals_icu")
    .is("streams_fetched_at", null);

  return { detailed, remaining: count ?? 0 };
}

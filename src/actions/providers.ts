"use server";

/**
 * Connecting an athlete's own data sources from inside the app.
 *
 * Before this, intervals.icu credentials lived in `.env.local` — fine for one
 * developer, useless for a second athlete. These actions let anyone paste their
 * own key on the Settings screen.
 *
 * Two rules hold throughout:
 *
 *   1. The API key never travels back to the browser. Every read here selects
 *      explicit columns and omits `api_key`; only `api_key_hint` (last four
 *      characters) is ever returned.
 *   2. Credentials are verified against intervals.icu *before* they are stored,
 *      so a typo surfaces immediately rather than as a silently stale readiness
 *      score a week later.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { icuConfigForCurrentUser } from "@/lib/providers/credentials";
import { deriveFromStreams, fetchStreams } from "@/lib/wellness/icuStreams";
import { recomputeReadiness } from "@/actions/readiness";
import {
  apiKeyHint,
  fetchActivities,
  fetchWellness,
  icuConfigFromEnv,
  normaliseAthleteId,
  toActivityImports,
  toRecoverySignals,
  verifyCredentials,
  type IcuConfig,
  type RecoverySignal,
} from "@/lib/wellness/intervalsIcu";

export type ProviderId = "intervals_icu";

/** What Settings is allowed to know about a connection. Never includes the key. */
export interface ProviderConnectionView {
  provider: ProviderId;
  externalId: string;
  apiKeyHint: string | null;
  status: "connected" | "error" | "revoked";
  lastError: string | null;
  lastSyncedAt: string | null;
  connectedAt: string;
  /** true when the credentials come from .env rather than from this athlete */
  fromEnvironment?: boolean;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** The athlete's intervals.icu connection, or null. Safe to render. */
export async function getIntervalsIcuConnection(): Promise<ProviderConnectionView | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("provider_connections")
    // note the explicit column list — `api_key` is deliberately absent
    .select("provider, external_id, api_key_hint, status, last_error, last_synced_at, connected_at")
    .eq("user_id", user.id)
    .eq("provider", "intervals_icu")
    .maybeSingle();

  if (data) {
    return {
      provider: "intervals_icu",
      externalId: data.external_id,
      apiKeyHint: data.api_key_hint,
      status: data.status,
      lastError: data.last_error,
      lastSyncedAt: data.last_synced_at,
      connectedAt: data.connected_at,
    };
  }

  // Fall back to the environment so the developer's own setup keeps working
  // after this migration. Flagged so the UI can say where it came from.
  const env = icuConfigFromEnv();
  if (!env) return null;
  return {
    provider: "intervals_icu",
    externalId: env.athleteId,
    apiKeyHint: apiKeyHint(env.apiKey),
    status: "connected",
    lastError: null,
    lastSyncedAt: null,
    connectedAt: new Date(0).toISOString(),
    fromEnvironment: true,
  };
}

/* ------------------------------------------------------------------ */
/* Importing                                                           */
/* ------------------------------------------------------------------ */

const BACKFILL_DAYS = 400;

/**
 * How many activity streams to process in a single sync.
 *
 * Each one is a separate request to intervals.icu, so a first backfill of a
 * year's running is hundreds of round trips — far more than belongs inside one
 * server action. Instead each sync takes a batch of whatever is still
 * unprocessed and reports what is left, so the athlete can finish it by syncing
 * again. Slower, but it never times out half-way and leaves the data in a state
 * nobody can reason about.
 */
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

/**
 * Pulls per-second data for activities that do not have it yet, derives the
 * pace shape, the best efforts and the cardiac drift, and stores those. The raw
 * stream is discarded — see src/lib/wellness/icuStreams.ts for why.
 */
async function processStreams(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

/**
 * Pulls everything intervals.icu holds for this athlete and stores it.
 *
 * Wellness and activities are fetched together but stored independently: a
 * failure on one must not lose the other. Both upserts are idempotent — the
 * unique keys on (user_id, date) and (user_id, source, external_id) mean this
 * can run as often as we like without duplicating anything.
 */
async function importFromIcu(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
      // Chunked because a year of running is several hundred rows and a single
      // oversized statement is the kind of thing that works locally and times
      // out in production.
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

  // Per-second data for a batch of activities. This is what fills the pace
  // sparklines, the personal records and the cardiac-drift figure.
  let streamProgress = { detailed: 0, remaining: 0 };
  try {
    streamProgress = await processStreams(supabase, userId, cfg);
  } catch {
    problems.push("could not read activity detail");
  }

  // Importing runs is only half the job: the dashboard reads
  // `readiness_snapshots`, which nothing writes until the engine runs. Syncing
  // and then seeing an unchanged dashboard is the failure this prevents.
  if (runs > 0 || nights > 0 || streamProgress.detailed > 0) {
    const recomputed = await recomputeReadiness(120);
    if (recomputed.error) problems.push(`readiness: ${recomputed.error}`);
  }

  return {
    nights,
    runs,
    detailed: streamProgress.detailed,
    remaining: streamProgress.remaining,
    warning: problems.length ? problems.join("; ") : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Verifies and stores an intervals.icu connection.
 *
 * On success it also pulls the last 400 days of wellness straight away, so the
 * athlete sees sleep and heart-rate-variability data on their next dashboard
 * load instead of waiting for the nightly job.
 */
export async function connectIntervalsIcu(
  rawAthleteId: string,
  rawApiKey: string,
): Promise<
  Result<{
    name: string | null;
    nightsImported: number;
    runsImported: number;
    detailed: number;
    remaining: number;
    warning?: string;
  }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const athleteId = normaliseAthleteId(rawAthleteId ?? "");
  const apiKey = (rawApiKey ?? "").trim();

  if (!athleteId) {
    return { ok: false, error: "That doesn't look like an athlete ID. It looks like i123456." };
  }
  if (apiKey.length < 8) {
    return { ok: false, error: "That API key looks too short — copy the whole thing." };
  }

  const check = await verifyCredentials({ athleteId, apiKey });
  if (!check.ok) return { ok: false, error: check.reason };

  const { error: upsertErr } = await supabase.from("provider_connections").upsert(
    {
      user_id: user.id,
      provider: "intervals_icu",
      external_id: athleteId,
      api_key: apiKey,
      api_key_hint: apiKeyHint(apiKey),
      status: "connected",
      last_error: null,
    },
    { onConflict: "user_id,provider" },
  );

  if (upsertErr) {
    return { ok: false, error: `Could not save the connection: ${upsertErr.message}` };
  }

  // Best-effort backfill. A failure here is not a failed connection — the
  // credentials are already proven good, so say so and let the athlete retry
  // with Sync now.
  let imported: IcuImportResult = { nights: 0, runs: 0, detailed: 0, remaining: 0 };
  try {
    imported = await importFromIcu(supabase, user.id, { athleteId, apiKey });
    if (imported.nights > 0 || imported.runs > 0) {
      await supabase
        .from("provider_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("provider", "intervals_icu");
    }
  } catch {
    /* the connection itself is valid */
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/activities");

  return {
    ok: true,
    data: {
      name: check.name,
      nightsImported: imported.nights,
      runsImported: imported.runs,
      detailed: imported.detailed,
      remaining: imported.remaining,
      warning: imported.warning,
    },
  };
}

/** Removes the stored credentials. Imported wellness data is kept. */
export async function disconnectIntervalsIcu(): Promise<Result<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { error } = await supabase
    .from("provider_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "intervals_icu");

  if (error) return { ok: false, error: `Could not disconnect: ${error.message}` };

  revalidatePath("/settings");
  return { ok: true, data: null };
}

/** Pulls wellness again on demand — the "Sync now" button. */
export async function syncIntervalsIcu(): Promise<Result<IcuImportResult>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const cfg = await icuConfigForCurrentUser();
  if (!cfg) return { ok: false, error: "No intervals.icu connection yet." };

  try {
    const imported = await importFromIcu(supabase, user.id, cfg);

    await supabase
      .from("provider_connections")
      .update({
        last_synced_at: new Date().toISOString(),
        status: imported.warning ? "error" : "connected",
        last_error: imported.warning ?? null,
      })
      .eq("user_id", user.id)
      .eq("provider", "intervals_icu");

    revalidatePath("/dashboard");
    revalidatePath("/activities");
    return { ok: true, data: imported };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    await supabase
      .from("provider_connections")
      .update({ status: "error", last_error: message })
      .eq("user_id", user.id)
      .eq("provider", "intervals_icu");
    return { ok: false, error: message };
  }
}

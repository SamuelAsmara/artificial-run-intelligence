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
import { importFromIcu, processStreams, type IcuImportResult } from "@/lib/providers/syncIcu";

/**
 * How long a manual sync keeps fetching activity detail before reporting back.
 *
 * Short enough to stay well inside the platform's request timeout, long enough
 * that a first backfill finishes in a handful of presses rather than a
 * fortnight of them.
 */
const SYNC_BUDGET_MS = 20_000;
import { recomputeForUser } from "@/lib/readiness/recompute";
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
  /**
   * The date of the most recent activity we hold.
   *
   * Distinct from `lastSyncedAt`, and the distinction matters: one says when we
   * last *asked*, the other says when the source last had something new. An
   * athlete whose watch has not uploaded sees a recent sync and an old run, and
   * without both numbers they will reasonably conclude our app is broken.
   */
  lastActivityAt?: string | null;
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

  const { data: latest } = await supabase
    .from("activities")
    .select("started_at")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastActivityAt = latest?.started_at ?? null;

  if (data) {
    return {
      provider: "intervals_icu",
      lastActivityAt,
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
    lastActivityAt,
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
    await recomputeForUser(supabase, user.id, 120);
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
    const first = await importFromIcu(supabase, user.id, cfg);

    // A first import leaves every activity without its per-second detail, and
    // `processStreams` deliberately takes only a batch at a time so one request
    // cannot make hundreds of round trips. That is right for the nightly job
    // and wrong for somebody standing at the screen: they press Sync, are told
    // it worked, and their charts are empty. So a manual press keeps going —
    // bounded by wall clock rather than by batch count, because the limit that
    // matters is the request timeout — and then reports exactly what is left.
    let detailed = first.detailed;
    let remaining = first.remaining;
    const startedAt = Date.now();

    while (remaining > 0 && Date.now() - startedAt < SYNC_BUDGET_MS) {
      const more = await processStreams(supabase, user.id, cfg);
      detailed += more.detailed;
      remaining = more.remaining;
      // Nothing moved: every activity left has no stream to fetch. Spinning
      // would burn the budget without changing the number.
      if (more.detailed === 0) break;
    }

    const imported = { ...first, detailed, remaining };

    // Same call the nightly job makes, so a manual press and a scheduled run
    // cannot produce different results.
    await recomputeForUser(supabase, user.id, 120);

    await supabase
      .from("provider_connections")
      .update({
        last_synced_at: new Date().toISOString(),
        status: imported.warning ? "error" : "connected",
        last_error: imported.warning ?? null,
      })
      .eq("user_id", user.id)
      .eq("provider", "intervals_icu");

    // Settings too, and its absence was a real bug: the row it renders is
    // "Last checked", the sync had just written that timestamp, and the cached
    // page kept saying "Never". A sync that reports success while the screen
    // insists nothing happened is worse than one that fails loudly.
    revalidatePath("/settings");
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

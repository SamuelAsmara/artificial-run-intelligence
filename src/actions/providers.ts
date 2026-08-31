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
  normaliseAthleteId,
  resolveAthleteFromKey,
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

  /*
   * No environment fallback. This used to return the server's own athlete id
   * and the last four characters of the server's own API key, with a
   * `fromEnvironment: true` flag that nothing ever read — so every user with no
   * connection of their own saw the operator's account rendered on their
   * Settings page, indistinguishable from a real one.
   *
   * Not connected is not a state to paper over. It is the state that makes the
   * "Connect" button mean something.
   */
  return null;
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
    athleteId: string;
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

  const apiKey = (rawApiKey ?? "").trim();
  if (apiKey.length < 8) {
    return { ok: false, error: "That API key looks too short — copy the whole thing." };
  }

  /*
   * The athlete id is optional. The connect form no longer asks for it: the
   * key alone identifies the account (`athlete/0`), so the form is one field
   * and the athlete is greeted by name. An id is still accepted — a script or
   * an old client can pass one — and is then verified against the key.
   */
  let athleteId = normaliseAthleteId(rawAthleteId ?? "");
  let name: string | null;
  if (athleteId) {
    const check = await verifyCredentials({ athleteId, apiKey });
    if (!check.ok) return { ok: false, error: check.reason };
    name = check.name;
  } else {
    if ((rawAthleteId ?? "").trim()) {
      return { ok: false, error: "That doesn't look like an athlete ID. It looks like i123456 — or leave it blank." };
    }
    const who = await resolveAthleteFromKey(apiKey);
    if (!who.ok) return { ok: false, error: who.reason };
    athleteId = who.athleteId;
    name = who.name;
  }
  const check = { name };

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
    /*
     * We looked. Say so, even if there was nothing there.
     *
     * This used to be gated on `nights > 0 || runs > 0`, so an athlete with no
     * history yet connected successfully and immediately read "Last checked:
     * Never" — the same dishonest timestamp, in the other direction. The field
     * records when we last asked, not whether the answer was interesting.
     */
    await supabase
      .from("provider_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("provider", "intervals_icu");
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
      athleteId,
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

    /*
     * A partial failure is still a working connection.
     *
     * `status` used to flip to "error" whenever anything at all went wrong —
     * including "could not read recovery data" on an account that has no
     * wellness — so the panel read "Not connected" for credentials that had
     * just successfully imported a hundred runs. The warning is worth showing,
     * and it is now shown (see `lastError` on the settings panel); it is not
     * worth calling the connection broken.
     */
    await supabase
      .from("provider_connections")
      .update({
        last_synced_at: new Date().toISOString(),
        status: "connected",
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
    /*
     * A Server Action that revalidates nothing does not re-render the page at
     * all. The success path above revalidates; this one did not, so a failed
     * sync wrote `status: "error"` into the database and left the panel on
     * screen still bordered green, still tagged "Connected", still showing this
     * morning's "Last checked". The athlete found out days later.
     */
    revalidatePath("/settings");
    return { ok: false, error: message };
  }
}

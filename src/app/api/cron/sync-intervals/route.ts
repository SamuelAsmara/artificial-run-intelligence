import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { importFromIcu } from "@/lib/providers/syncIcu";
import { recomputeForUser } from "@/lib/readiness/recompute";
import { runPlanAdjustment } from "@/lib/planning/runAdjustment";

/**
 * Nightly sync from intervals.icu, for every athlete who has connected it.
 *
 * ## Why this exists
 *
 * Until now the only way to get data in was to open Settings and press a
 * button. That is not a product: an athlete who runs in the morning and opens
 * the app in the evening should find their run already there, along with a
 * readiness score that accounts for it. Asking them to press sync is asking
 * them to do the app's job.
 *
 * ## What runs, and in what order
 *
 * For each athlete: import runs and recovery, then recompute readiness, then
 * let the adjustment engine react to whatever changed. The order matters —
 * adjusting a plan against yesterday's numbers is worse than not adjusting it.
 *
 * ## Failure handling
 *
 * One athlete's failure is logged and skipped, never allowed to abort the
 * batch. A broken key or an intervals.icu outage for one person must not stop
 * everyone else's data arriving.
 *
 * ## Known limit
 *
 * Sequential, so it scales to hundreds of athletes rather than thousands. Past
 * that this becomes a queue with one job per athlete. Documented rather than
 * pretended away.
 */

/** Runs longer than the default; a full batch does real network work. */
export const maxDuration = 300;

/** Constant-time check of the scheduler's bearer token. */
function authorised(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const provided = request.headers.get("authorization");
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(`Bearer ${expected}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: connections, error } = await supabase
    .from("provider_connections")
    .select("user_id, external_id, api_key, status")
    .eq("provider", "intervals_icu")
    .neq("status", "revoked");

  if (error) {
    return NextResponse.json({ error: "could not read connections" }, { status: 500 });
  }

  let synced = 0;
  let failed = 0;
  let runsImported = 0;
  let nightsImported = 0;

  for (const conn of connections ?? []) {
    try {
      const result = await importFromIcu(supabase, conn.user_id, {
        athleteId: conn.external_id,
        apiKey: conn.api_key,
      });

      runsImported += result.runs;
      nightsImported += result.nights;

      await supabase
        .from("provider_connections")
        .update({
          last_synced_at: new Date().toISOString(),
          status: result.warning ? "error" : "connected",
          last_error: result.warning ?? null,
        })
        .eq("user_id", conn.user_id)
        .eq("provider", "intervals_icu");

      // Recompute even when nothing new arrived: form and fatigue decay daily,
      // so yesterday's snapshot is wrong today regardless of new runs.
      await recomputeForUser(supabase, conn.user_id, 120);

      try {
        await runPlanAdjustment(supabase, conn.user_id);
      } catch {
        /* an athlete without a plan is not a failure */
      }

      synced++;
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : "sync failed";
      console.error(`[cron/sync-intervals] ${conn.user_id}: ${message}`);
      await supabase
        .from("provider_connections")
        .update({ status: "error", last_error: message })
        .eq("user_id", conn.user_id)
        .eq("provider", "intervals_icu");
    }
  }

  return NextResponse.json({
    ok: true,
    athletes: connections?.length ?? 0,
    synced,
    failed,
    runsImported,
    nightsImported,
  });
}

/** Vercel Cron issues GET; accept both so either scheduler works. */
export const GET = POST;

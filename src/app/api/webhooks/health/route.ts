import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { healthWebhookSchema } from "@/lib/validation/schemas";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/webhooks/health — Technical design §5, Security doc §6.
 * Receives a recovery payload (sleep / HRV / resting HR) from a bridging app,
 * checks a shared secret in constant time, validates the body with Zod and
 * upserts into recovery_signals.
 *
 * The secret is one per deployment, not per athlete — a known limitation,
 * listed in the Security doc §8. The route is off unless
 * HEALTH_WEBHOOK_ENABLED=true (see below).
 */

function isValidSecret(provided: string | null): boolean {
  const expected = process.env.HEALTH_WEBHOOK_SECRET;
  if (!provided || !expected) return false;

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("X-Webhook-Secret");
  if (!isValidSecret(secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  /*
   * Disabled unless explicitly switched on, and this is the honest state of it.
   *
   * The route authenticates with one secret shared by every installation of the
   * bridging app, then writes recovery data for whichever `?userId=` it is
   * handed, using the service-role client — so RLS cannot help. Any athlete who
   * can read the secret out of their own copy of the app can write sleep, HRV
   * and resting-heart-rate rows into anybody else's account, and those feed
   * straight into that person's readiness score and dashboard narrative.
   *
   * Fixing it properly means a per-user token: a secret issued to one athlete,
   * stored against their row, that identifies them rather than being presented
   * alongside a claim about who they are. That is a schema change and a real
   * piece of work. Until then the route is off by default rather than
   * quietly exploitable — nothing currently calls it.
   */
  if (process.env.HEALTH_WEBHOOK_ENABLED !== "true") {
    return NextResponse.json({ error: "not enabled" }, { status: 404 });
  }

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  }

  // A malformed id would otherwise reach Postgres as a cast error.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: "invalid userId" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = healthWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid payload" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("recovery_signals").upsert(
    {
      user_id: userId,
      date: parsed.data.date,
      source: "webhook",
      sleep_hours: parsed.data.sleepHours ?? null,
      resting_hr: parsed.data.restingHr ?? null,
      hrv: parsed.data.hrv ?? null,
    },
    { onConflict: "user_id,date" }
  );

  if (error) {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

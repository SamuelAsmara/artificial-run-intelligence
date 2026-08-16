import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { healthWebhookSchema } from "@/lib/validation/schemas";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/webhooks/health — מסמך תכנון טכני §5, מסמך אבטחה §6.
 * מקבל payload מאפליקציית הגישור (Health Webhook), מאמת secret token
 * בהשוואת זמן-קבוע (מונע Timing Attack), כותב ל-recovery_signals (upsert).
 *
 * הערה: ה-secret הנוכחי משותף לכלל האפליקציה, לא ייחודי-למשתמש —
 * מגבלה ידועה, מתועדת במסמך אבטחה §8 כשיפור עתידי.
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

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
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

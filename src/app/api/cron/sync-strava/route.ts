import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { listRecentActivities, refreshStravaToken } from "@/lib/strava/api";
import { runPlanAdjustment } from "@/lib/planning/runAdjustment";

/**
 * POST /api/cron/sync-strava — מסמך ארכיטקטורה §5-6, מסמך סקייל §1,7.
 * מופעל ע"י Vercel Cron. מוגן בסוד CRON_SECRET (מסמך אבטחה §6).
 *
 * מגבלה ידועה (מסמך סקייל §7): רץ ברצף (loop) על כל המשתמשים המחוברים —
 * מספיק לעשרות/מאות משתמשים, לא לקנה מידה גדול יותר (ראו מסמך סקייל §8).
 * כשל בסנכרון משתמש בודד נרשם ללוג וממשיך — לא מפיל את כל ה-batch
 * (מסמך תכנון טכני §8).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: connections } = await supabase
    .from("strava_connections")
    .select("user_id, access_token, refresh_token, expires_at");

  let syncedUsers = 0;
  let failedUsers = 0;

  for (const conn of connections ?? []) {
    try {
      let accessToken = conn.access_token;

      if (new Date(conn.expires_at) <= new Date()) {
        const refreshed = await refreshStravaToken(conn.refresh_token);
        accessToken = refreshed.access_token;
        await supabase
          .from("strava_connections")
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
          })
          .eq("user_id", conn.user_id);
      }

      const since = new Date();
      since.setDate(since.getDate() - 7);
      const activities = await listRecentActivities(accessToken, Math.floor(since.getTime() / 1000));

      for (const activity of activities) {
        // מסמך אפיון בדיקות §6: אימון כפול (סנכרון חוזר) לא יוצר רשומה כפולה
        await supabase.from("activities").upsert(
          {
            user_id: conn.user_id,
            strava_activity_id: activity.id,
            type: activity.type,
            distance_m: activity.distance,
            duration_s: activity.moving_time,
            avg_hr: activity.average_heartrate ?? null,
            avg_pace: null,
            started_at: activity.start_date,
          },
          { onConflict: "user_id,strava_activity_id" }
        );
      }

      await runPlanAdjustment(supabase, conn.user_id);
      syncedUsers++;
    } catch (err) {
      // לוג ומשך — כשל בודד לא מפיל את כל ה-Cron (מסמך תכנון טכני §8)
      console.error(`[sync-strava] user ${conn.user_id} failed:`, err);
      failedUsers++;
    }
  }

  return NextResponse.json({ syncedUsers, failedUsers });
}

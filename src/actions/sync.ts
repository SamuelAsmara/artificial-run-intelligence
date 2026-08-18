"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listRecentActivities, refreshStravaToken } from "@/lib/strava/api";

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/** סנכרון ידני של אימוני המשתמש הנוכחי מ-Strava (30 יום אחרונים). slice 1. */
export async function syncMyActivities(): Promise<ActionResult<{ synced: number }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "יש להתחבר" };

  const { data: conn } = await supabase
    .from("strava_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conn) return { error: "Strava לא מחובר — חבר קודם במסך ה-Onboarding" };

  try {
    let accessToken = conn.access_token;
    if (new Date(conn.expires_at) <= new Date()) {
      const r = await refreshStravaToken(conn.refresh_token);
      accessToken = r.access_token;
      await supabase.from("strava_connections").update({
        access_token: r.access_token, refresh_token: r.refresh_token,
        expires_at: new Date(r.expires_at * 1000).toISOString(),
      }).eq("user_id", user.id);
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const acts = await listRecentActivities(accessToken, Math.floor(since.getTime() / 1000));

    let synced = 0;
    for (const a of acts) {
      const { error } = await supabase.from("activities").upsert({
        user_id: user.id,
        // Since migration 0004 the deduplication key is (source, external_id),
        // so Strava is now one source among several rather than the only one.
        source: "strava",
        external_id: String(a.id),
        strava_activity_id: a.id,
        type: a.type,
        distance_m: a.distance, duration_s: a.moving_time,
        avg_hr: a.average_heartrate ?? null, avg_pace: null, started_at: a.start_date,
      }, { onConflict: "user_id,source,external_id" });
      if (!error) synced++;
    }

    await supabase.from("strava_connections").update({
      last_sync_at: new Date().toISOString(), last_sync_status: "ok",
    }).eq("user_id", user.id);

    revalidatePath("/activities");
    return { data: { synced } };
  } catch {
    await supabase.from("strava_connections").update({ last_sync_status: "error" }).eq("user_id", user.id);
    return { error: "סנכרון מול Strava נכשל, נסה שוב" };
  }
}

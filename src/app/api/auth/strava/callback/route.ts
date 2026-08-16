import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForToken } from "@/lib/strava/api";

/**
 * GET /api/auth/strava/callback — מסמך תכנון טכני §5.
 * קולט code+state מ-Strava, מאמת state כנגד CSRF (מסמך אבטחה §6), מחליף
 * לטוקן, שומר ב-strava_connections, ומפנה בחזרה ל-/onboarding.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/settings?strava_error=1`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // state = auth.uid() שנשלח ב-getStravaAuthorizeUrl — חייב להתאים למשתמש
  // המחובר כעת, אחרת מדובר בניסיון CSRF (מסמך אבטחה §6).
  if (!user || user.id !== state) {
    return NextResponse.redirect(`${appUrl}/login?strava_error=csrf`);
  }

  try {
    const token = await exchangeCodeForToken(code);

    await supabase.from("strava_connections").upsert(
      {
        user_id: user.id,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: new Date(token.expires_at * 1000).toISOString(),
        athlete_id: token.athlete?.id ?? 0,
      },
      { onConflict: "user_id" }
    );
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?strava_error=exchange`);
  }

  return NextResponse.redirect(`${appUrl}/onboarding?strava_connected=1`);
}

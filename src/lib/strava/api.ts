/**
 * עטיפת קריאות ל-Strava API (OAuth2). מסמך ארכיטקטורה §5, §8.
 * מפתח האפליקציה (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET) נרשם ב-
 * https://www.strava.com/settings/api — ראו README.md.
 */

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export function getStravaAuthorizeUrl(state: string): string {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/strava/callback`;
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state, // = auth.uid() — מאומת ב-callback כנגד CSRF (מסמך אבטחה §6)
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: { id: number };
}

export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${res.status}`);
  }
  return res.json();
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokenResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // מסמך תכנון טכני §8: כשל רענון -> המשתמש מקבל הנחיה לחבר מחדש ב-/settings
    throw new Error(`Strava token refresh failed: ${res.status}`);
  }
  return res.json();
}

export interface StravaActivity {
  id: number;
  type: string;
  distance: number; // meters
  moving_time: number; // seconds
  average_heartrate?: number;
  average_speed?: number; // m/s
  start_date: string; // ISO
}

export async function listRecentActivities(
  accessToken: string,
  afterUnix: number
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({ after: String(afterUnix), per_page: "50" });
  const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Strava list activities failed: ${res.status}`);
  }
  return res.json();
}

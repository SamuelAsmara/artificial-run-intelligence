import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where an email confirmation link lands.
 *
 * ## Why this route has to exist
 *
 * `@supabase/ssr` signs users up with the PKCE flow. The link in the
 * confirmation email goes to Supabase, which verifies the token and then
 * redirects the browser back to this application with `?code=<one-time code>`.
 * That code is not a session — it has to be exchanged for one, on the server,
 * so the session cookie is set on a response the browser will keep.
 *
 * Without a route to do the exchange the redirect simply lands on a path the
 * app does not serve, and a new user's first experience of ARI is a 404 with
 * their account created but unusable. That is exactly what happened: signup
 * worked, the row appeared in `auth.users`, and the email link went nowhere.
 *
 * ## Why `next` is checked rather than trusted
 *
 * The parameter decides where somebody lands after signing in, and it arrives
 * in a URL. An absolute one would make this an open redirect — a link that
 * looks like ours and finishes somewhere else. Only same-origin paths pass.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requested = searchParams.get("next");
  const next =
    requested && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : // "/" decides the front door by role — see app/page.tsx. Defaulting
        // straight to /dashboard here sent coaches to the athlete screen and
        // put the rule in three places instead of one.
        "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing-code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Most often an expired or already-used link. Say so on the sign-in screen
    // rather than dropping them somewhere with no explanation.
    return NextResponse.redirect(`${origin}/login?error=link-expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

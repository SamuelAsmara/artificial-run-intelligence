import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The other shape a Supabase confirmation link can take.
 *
 * Newer projects ship email templates built around
 * `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
 * rather than the older code-exchange redirect. Which one an account uses
 * depends on when the project was created and whether the templates were ever
 * edited — so both are served here rather than betting on one and finding out
 * from a user who cannot get in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const requested = searchParams.get("next");
  const next =
    requested && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/dashboard";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=missing-token`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=link-expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

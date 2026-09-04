import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safePath } from "@/lib/auth/safePath";

/**
 * Route-level auth guard (Security doc §3): redirects to /login when there is
 * no active session. Every protected Server Action ALSO checks auth.uid()
 * independently — this middleware is a first layer, not the only one.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/plan",
  "/activities",
  "/numbers",
  "/settings",
  "/coach",
  // "/upgrade" only redirects to /coach/settings#billing, which is covered by
  // "/coach"; it needs no guard of its own.
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  );

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname + request.nextUrl.search);
    const redirectResponse = NextResponse.redirect(loginUrl);
    /*
     * Carry over whatever `getUser()` wrote to the cookie jar.
     *
     * A brand-new NextResponse starts with none of them, so building the
     * redirect from scratch threw away Supabase's instruction to *clear* the
     * dead session cookies. The stale pair stayed in the browser, the next
     * request failed to refresh in exactly the same way, and the athlete was
     * bounced to /login on every single navigation with no way to break the
     * loop but clearing site data by hand.
     */
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  /*
   * Somebody already signed in has no business on the sign-in card — landing
   * there after a bookmark or a back-button press and being asked to log in
   * again reads as "it forgot me". The auth routes are exempt: they are
   * mid-handshake by definition.
   */
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    const safe = safePath(request.nextUrl.searchParams.get("redirectTo"));
    const homeResponse = NextResponse.redirect(new URL(safe, request.url));
    response.cookies.getAll().forEach((cookie) => homeResponse.cookies.set(cookie));
    return homeResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

/**
 * Supabase client for use in Server Components, Server Actions, and Route Handlers.
 * Reads/writes the session via httpOnly cookies (never localStorage — see Security doc §1).
 * Still subject to RLS (anon key) — this is NOT the service-role client.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — safe to ignore if
            // middleware is refreshing the session (see middleware.ts).
          }
        },
      },
    }
  );
}

/**
 * Service-role client — bypasses RLS entirely. Server-only (Cron Job, webhooks).
 * NEVER import this from a Client Component or expose the key to the browser.
 * See Security doc §4: anon key vs. service-role key separation.
 */
export function createServiceRoleClient() {
  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

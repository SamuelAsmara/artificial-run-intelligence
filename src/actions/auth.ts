"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign out of this browser, and only this browser.
 *
 * The default scope is `global`, which revokes every refresh token the account
 * has anywhere. Pressing "sign out" on a shared laptop would then also kick the
 * athlete's phone out mid-run. `local` ends this session and leaves the others
 * alone, which is what the button appears to promise.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

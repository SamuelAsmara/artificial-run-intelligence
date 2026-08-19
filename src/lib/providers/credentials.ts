/**
 * Which data source this athlete's numbers come from.
 *
 * This lives outside `src/actions` on purpose. Both the provider actions and
 * the readiness action need to resolve an athlete's credentials, and if either
 * imported the other the module graph would be circular. Putting the lookup
 * here keeps that graph a tree.
 *
 * It is also the first piece of the shape the app is growing into: sources are
 * *interchangeable*, not cumulative. An athlete with an Apple Watch will
 * connect it instead of intervals.icu, not alongside it, so the rest of the
 * app should ask "where does this athlete's data come from?" rather than
 * "is intervals.icu connected?".
 */

import { createClient } from "@/lib/supabase/server";
import { icuConfigFromEnv, type IcuConfig } from "@/lib/wellness/intervalsIcu";

/**
 * The athlete's intervals.icu credentials, preferring their own connection over
 * anything configured on the server. Server-only — the result contains the key,
 * so it must never be returned to a client component.
 */
export async function icuConfigForCurrentUser(): Promise<IcuConfig | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // No session at all means a script or a job, not a person — those may still
  // use the server's own credentials. The nightly cron does not come through
  // here; it reads each athlete's stored key directly.
  if (!user) return icuConfigFromEnv();

  const { data } = await supabase
    .from("provider_connections")
    .select("external_id, api_key, status")
    .eq("user_id", user.id)
    .eq("provider", "intervals_icu")
    .maybeSingle();

  if (data && data.status !== "revoked") {
    return { athleteId: data.external_id, apiKey: data.api_key };
  }

  /*
   * No fallback to the environment for a signed-in athlete, and this is a
   * deliberate reversal.
   *
   * The fallback was here so the original developer's `.env.local` setup kept
   * working after connections moved into the database. What it actually did was
   * hand *the operator's* intervals.icu account to every user who had not
   * connected one: they pressed "Sync now", and the operator's four hundred
   * days of runs, sleep and heart-rate data were written into their rows and
   * drawn on their dashboard as their own. Disconnecting made it worse, because
   * deleting the row re-engaged the fallback.
   *
   * An athlete with no connection has no data. That is the correct answer.
   */
  return null;
}

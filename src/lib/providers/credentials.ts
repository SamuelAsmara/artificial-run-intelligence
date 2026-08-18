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
  return icuConfigFromEnv();
}

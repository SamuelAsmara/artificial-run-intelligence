import { createClient } from "@/lib/supabase/server";

/**
 * Is the signed-in user a coach?
 *
 * Read once here rather than in every athlete screen, because the only thing it
 * decides is whether the coach's navigation strip appears above them. It is
 * emphatically not a permission: `role` gates presentation, and the coaching
 * data is protected by the `coach_athletes` relationship in RLS. A coach who
 * also runs sees both sides, which is the normal case rather than a special one.
 */
export async function isCoach(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return data?.role === "coach";
  } catch {
    // The layout wraps the sign-in screens too, and a failure to answer this
    // must never be the reason somebody cannot reach them.
    return false;
  }
}

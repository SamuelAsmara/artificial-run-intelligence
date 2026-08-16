import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The product has no separate marketing page — the design handoff covers the
 * app only. Signed in goes to the dashboard, everyone else to sign-in.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}

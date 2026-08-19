import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
// One weight, one screen: the sign-in headline. Archivo Black is the display
// face the login handoff is drawn in, and nothing else in the product uses it.
import "@fontsource/archivo-black/400.css";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { CoachModeBar } from "@/components/coach/CoachModeBar";

export const metadata: Metadata = {
  title: "Artificial Run Intelligence",
  description:
    "A data-driven running coach — adaptive periodization and recovery-aware training",
};

/**
 * Is the signed-in user a coach?
 *
 * Read once here rather than in every athlete screen, because the only thing it
 * decides is whether the coach's navigation strip appears above them. It is
 * emphatically not a permission: `role` gates presentation, and the coaching
 * data is protected by the `coach_athletes` relationship in RLS. A coach who
 * also runs sees both sides, which is the normal case rather than a special one.
 */
async function isCoach(): Promise<boolean> {
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const coach = await isCoach();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <CoachModeBar isCoach={coach} />
        {children}
      </body>
    </html>
  );
}

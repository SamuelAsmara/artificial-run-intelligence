/**
 * The shell every page renders inside.
 *
 * Three jobs, and no more: load the fonts once for the whole product, paint the
 * two fixed accent washes that sit behind everything, and — for a coach — show
 * the mode bar that says whether the numbers on screen are their athletes' or
 * their own.
 *
 * The role is read here rather than per page so the question "is this user a
 * coach" is asked once per navigation. It is presentation only: the coaching
 * *data* is protected by row-level security on `coach_athletes`, not by this.
 */

import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
// One weight, one screen: the sign-in headline. Archivo Black is the display
// face the login handoff is drawn in, and nothing else in the product uses it.
import "@fontsource/archivo-black/400.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/sora/800.css";
import "./globals.css";
import { isCoach } from "@/lib/auth/role";
import { CoachModeBar } from "@/components/coach/CoachModeBar";

const SITE = "https://runi-coach.vercel.app";
const DESCRIPTION =
  "A running coach that computes instead of guessing. Connect your watch, set a goal race, and get a plan that adapts after every run — with the reason written next to it.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Runi — Run with Intelligence",
  description: DESCRIPTION,
  // What a shared link looks like in WhatsApp, LinkedIn, iMessage, Slack.
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Runi",
    title: "Runi — Run with Intelligence",
    description: DESCRIPTION,
    images: [{ url: "/landing/og.jpg", width: 1200, height: 630, alt: "Runi — Run with Intelligence" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Runi — Run with Intelligence",
    description: DESCRIPTION,
    images: ["/landing/og.jpg"],
  },
};


export default async function RootLayout({ children }: LayoutProps<"/">) {
  const coach = await isCoach();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {/*
          Ambience, behind everything.

          Two very low radial washes of the accent and a hairline across the top
          of the viewport. Neither carries information, and that is the point:
          a flat black ground made every screen read as a document, and these
          give it depth without asking for attention. Fixed, so they do not
          travel with the scroll, and inert to the pointer.
        */}
        <div
          aria-hidden
          style={{
            position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
            background:
              "radial-gradient(900px 420px at 22% -5%, color-mix(in oklab, var(--color-accent) 13%, transparent), transparent 70%)," +
              "radial-gradient(700px 380px at 88% 108%, color-mix(in oklab, var(--color-accent) 7%, transparent), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "fixed", insetBlockStart: 0, insetInline: 0, height: "2px", zIndex: 2,
            pointerEvents: "none",
            background:
              "linear-gradient(90deg, transparent, var(--color-accent) 30%, var(--color-accent) 70%, transparent)",
          }}
        />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>
          <CoachModeBar isCoach={coach} />
          {children}
        </div>
      </body>
    </html>
  );
}

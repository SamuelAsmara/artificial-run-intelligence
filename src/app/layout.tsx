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
import { isCoach } from "@/lib/auth/role";
import { CoachModeBar } from "@/components/coach/CoachModeBar";

export const metadata: Metadata = {
  title: "Artificial Run Intelligence",
  description:
    "A data-driven running coach — adaptive periodization and recovery-aware training",
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

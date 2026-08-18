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

export const metadata: Metadata = {
  title: "Artificial Run Intelligence",
  description:
    "A data-driven running coach — adaptive periodization and recovery-aware training",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

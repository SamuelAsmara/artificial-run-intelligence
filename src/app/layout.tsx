import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Artificial Run Intelligence",
  description: "מאמן ריצה מבוסס AI — תכנון periodization קדימה ומודעות להתאוששות",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

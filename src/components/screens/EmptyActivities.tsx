/**
 * The activity list before anything has been synced — shown while the athlete
 * has no runs on file. It answers "have my runs arrived?" honestly: not yet.
 */

import { Entrance, BrandMark, EmptyState } from "@/components/ui";
import Link from "next/link";

const COPY = {
  brand: "Runi",
  navHome: "Home",
  navActivities: "Activities",
  navPlan: "Plan",
  navSettings: "Settings",
  title: "Activities",
  subtitle: "Nothing here yet",
  heading: "No runs yet",
  body:
    "Connect your watch in Settings — Garmin, Coros, Polar, Suunto, Apple Watch or Strava — and press Sync. Your runs, and everything Runi derives from them — pace shape, personal records, cardiac drift — appear here as soon as they arrive.",
  cta: "Connect your watch",
} as const;


export function EmptyActivities() {
  return (
    <div data-entrance-root style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance />
      <header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <BrandMark />
          <span className="num" style={{ fontWeight: 500, fontSize: "16px", letterSpacing: ".12em" }}>{COPY.brand}</span>
        </div>
        <div style={{ textAlign: "start" }}>
          <h1 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{COPY.title}</h1>
          <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-muted)" }}>{COPY.subtitle}</p>
        </div>
        <nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}>
          <Link href="/dashboard" style={{ color: "var(--color-muted)" }}>{COPY.navHome}</Link>
          <Link href="/plan" style={{ color: "var(--color-muted)" }}>{COPY.navPlan}</Link>
          <Link href="/activities" style={{ color: "var(--color-ink)" }}>{COPY.navActivities}</Link>
          <Link href="/numbers" style={{ color: "var(--color-muted)" }}>Numbers</Link>
          <Link href="/settings" style={{ color: "var(--color-muted)" }}>{COPY.navSettings}</Link>
        </nav>
        <div style={{ flex: 1 }} />
      </header>

      <EmptyState
        message={
          <>
            <span style={{ display: "block", fontSize: "15px", fontWeight: 600, color: "var(--color-ink)", marginBlockEnd: "8px" }}>
              {COPY.heading}
            </span>
            {COPY.body}
          </>
        }
        style={{ maxWidth: "620px", marginInline: "auto", width: "100%" }}
        action={<Link className="btn btn-primary" href="/settings#connections">{COPY.cta}</Link>}
      />
    </div>
  );
}

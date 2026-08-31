/**
 * The activity list before anything has been synced.
 *
 * Previously this screen fell through to `buildActivities()` — a month of
 * invented runs with distances, paces and heart rates, indistinguishable from
 * real ones. A new athlete's first impression of the app was therefore somebody
 * else's training, and the number that mattered most to them ("have my runs
 * arrived?") was answered "yes" when the truth was "not yet".
 */

import { Entrance, BrandMark, EmptyState } from "@/components/ui";

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
          <a href="/dashboard" style={{ color: "var(--color-muted)" }}>{COPY.navHome}</a>
          <a href="/plan" style={{ color: "var(--color-muted)" }}>{COPY.navPlan}</a>
          <a href="/activities" style={{ color: "var(--color-ink)" }}>{COPY.navActivities}</a>
          <a href="/numbers" style={{ color: "var(--color-muted)" }}>Numbers</a>
          <a href="/settings" style={{ color: "var(--color-muted)" }}>{COPY.navSettings}</a>
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
        action={<a className="btn btn-primary" href="/settings#connections">{COPY.cta}</a>}
      />
    </div>
  );
}

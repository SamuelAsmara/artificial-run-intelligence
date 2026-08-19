/**
 * The activity list before anything has been synced.
 *
 * Previously this screen fell through to `buildActivities()` — a month of
 * invented runs with distances, paces and heart rates, indistinguishable from
 * real ones. A new athlete's first impression of the app was therefore somebody
 * else's training, and the number that mattered most to them ("have my runs
 * arrived?") was answered "yes" when the truth was "not yet".
 */

const COPY = {
  brand: "ARI",
  navHome: "Home",
  navActivities: "Activities",
  navPlan: "Plan",
  navSettings: "Settings",
  title: "Activities",
  subtitle: "Nothing here yet",
  heading: "No runs yet",
  body:
    "Connect intervals.icu in Settings and press Sync. Your runs, and everything ARI derives from them — pace shape, personal records, cardiac drift — appear here as soon as they arrive.",
  cta: "Connect a data source",
} as const;

export function EmptyActivities() {
  return (
    <div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }} />
          <span className="num" style={{ fontWeight: 500, fontSize: "16px", letterSpacing: ".12em" }}>{COPY.brand}</span>
        </div>
        <nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}>
          <a href="/dashboard" style={{ color: "var(--color-muted)" }}>{COPY.navHome}</a>
          <a href="/activities" style={{ color: "var(--color-ink)" }}>{COPY.navActivities}</a>
          <a href="/plan" style={{ color: "var(--color-muted)" }}>{COPY.navPlan}</a>
          <a href="/settings" style={{ color: "var(--color-muted)" }}>{COPY.navSettings}</a>
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "end" }}>
          <h1 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{COPY.title}</h1>
          <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-muted)" }}>{COPY.subtitle}</p>
        </div>
      </header>

      <section className="card" style={{ padding: "48px 26px", textAlign: "center" }}>
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{COPY.heading}</h2>
        <p style={{ margin: "10px auto 0", fontSize: "13px", color: "var(--color-muted)", maxWidth: "54ch", lineHeight: 1.7 }}>
          {COPY.body}
        </p>
        <a className="btn btn-primary" href="/settings" style={{ display: "inline-block", marginBlockStart: "18px" }}>
          {COPY.cta}
        </a>
      </section>
    </div>
  );
}

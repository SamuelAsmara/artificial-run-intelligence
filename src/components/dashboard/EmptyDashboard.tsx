/**
 * The dashboard before there is anything to show.
 *
 * ## Why this component exists
 *
 * Until now `/dashboard` fell back to the demo dataset whenever the athlete had
 * no history. That looked fine in a screenshot and was quietly dishonest: a new
 * account saw a readiness score of 82, a 10K personal best of 47:12 and a
 * marathon "in 61 days" — none of it theirs, and nothing on screen said so.
 *
 * So the empty state shows *nothing* rather than something borrowed. Every
 * number is a dash. The chart is a placeholder. The personal-record band is
 * present but blank, so the athlete can see what the app will fill in once
 * their runs arrive.
 *
 * The layout is the empty state from the Claude Design handoff (the `isEmpty`
 * branch of the sign-up prototype), ported as-is: same 12-column grid, same
 * tokens, same dashed readiness ring. The only addition is the personal-record
 * band, built from the same gold treatment the populated dashboard uses.
 *
 * Demo data still exists — it now lives behind `/dashboard?demo=1`, which is
 * what the walkthrough and the screenshots use.
 */

const COPY = {
  brand: "ARI",
  navHome: "Home",
  navActivities: "Activities",
  navPlan: "Plan",
  navSettings: "Settings",
  greeting: "Welcome",
  context: "No goal race yet",
  aiTag: "AI Coach",
  readinessCaption: "Readiness · needs 7 days of data",
  narrative:
    "Welcome! I don’t know anything about your running yet. Connect intervals.icu " +
    "and ARI will read your runs, your sleep and your heart-rate variability — " +
    "then build you a plan around them.",
  ctaConnect: "Connect intervals.icu",
  ctaBuild: "Build my training plan",
  noData: "No data yet",
  chartTitle: "Fitness · Fatigue · Form will appear here",
  chartSub: "The chart starts drawing after your first synced run.",
  historyTitle: "No activity history yet",
  historySub:
    "Your runs will be listed here — distance, pace, heart rate and the shape of " +
    "each session.",
  pbTitle: "Personal Records",
  pbSub: "Your bests will appear here as soon as ARI has seen the distance.",
} as const;

/** The four headline metrics, shown blank so the shape of the page is legible. */
const TILES = [
  { name: "Cardiac Drift" },
  { name: "Weekly Volume" },
  { name: "Load Ratio" },
  { name: "Form (TSB)" },
] as const;

const PBS = [
  { label: "5K" },
  { label: "10K" },
  { label: "Half" },
  { label: "Marathon" },
] as const;

const DASH = "--";

export function EmptyDashboard({ name }: { name?: string | null }) {
  return (
    <div
      style={{
        maxWidth: "1280px",
        marginInline: "auto",
        padding: "16px 24px 40px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              background: "var(--color-accent)",
              borderRadius: "2px",
              display: "inline-block",
            }}
          />
          <span className="num" style={{ fontWeight: 500, fontSize: "16px", letterSpacing: ".12em" }}>
            {COPY.brand}
          </span>
        </div>
        <div style={{ textAlign: "start" }}>
          <h1 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>
            {name ? `${COPY.greeting}, ${name}` : COPY.greeting}
          </h1>
          <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-muted)" }}>{COPY.context}</p>
        </div>
        <nav
          className="topnav"
          style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}
        >
          <a href="/dashboard" style={{ color: "var(--color-ink)" }}>{COPY.navHome}</a>
          <a href="/plan" style={{ color: "var(--color-muted)" }}>{COPY.navPlan}</a>
          <a href="/activities" style={{ color: "var(--color-muted)" }}>{COPY.navActivities}</a>
          <a href="/settings" style={{ color: "var(--color-muted)" }}>{COPY.navSettings}</a>
        </nav>
        <div style={{ flex: 1 }} />
      </header>

      {/* Hero: dashed ring instead of a score, and the one thing worth doing next. */}
      <section
        className="card hero-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: "20px",
          padding: "20px 24px",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "116px",
              height: "116px",
              borderRadius: "50%",
              border: "2px dashed var(--color-line-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="num" style={{ fontSize: "30px", color: "var(--color-faint)" }}>{DASH}</span>
          </div>
          <p className="num" style={{ margin: 0, fontSize: "11px", color: "var(--color-faint)" }}>
            {COPY.readinessCaption}
          </p>
        </div>
        <div
          style={{
            borderInlineStart: "1px solid var(--color-line)",
            paddingInlineStart: "28px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            alignSelf: "stretch",
            justifyContent: "center",
          }}
        >
          <div>
            <span
              className="tag"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
            >
              {COPY.aiTag}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "16px", lineHeight: 1.55, maxWidth: "640px", textWrap: "pretty" }}>
            {COPY.narrative}
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBlockStart: "4px" }}>
            <a className="btn btn-primary" href="/settings">{COPY.ctaConnect}</a>
            <a className="btn btn-secondary" href="/plan">{COPY.ctaBuild}</a>
          </div>
        </div>
      </section>

      {/* Headline metrics, blank. */}
      <section className="grid" aria-label="Key metrics">
        {TILES.map((tile) => (
          <div key={tile.name} className="card c3" style={{ padding: "16px 18px" }}>
            <span className="num" style={{ fontSize: "30px", fontWeight: 500, color: "var(--color-faint)" }}>
              {DASH}
            </span>
            <p style={{ margin: "6px 0 2px", fontSize: "12px", color: "var(--color-muted)" }}>{tile.name}</p>
            <p className="num" style={{ margin: 0, fontSize: "11px", color: "var(--color-faint)" }}>
              {COPY.noData}
            </p>
          </div>
        ))}
      </section>

      {/* Where the fitness/fatigue/form chart will go. */}
      <section
        className="card"
        style={{
          padding: "40px 22px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-faint)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <path d="m7 15 4-6 4 3 4-7" />
        </svg>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--color-muted)" }}>{COPY.chartTitle}</p>
        <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-faint)" }}>{COPY.chartSub}</p>
      </section>

      {/* No activity history. */}
      <section
        className="card"
        style={{
          padding: "40px 22px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-faint)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 8v4l3 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--color-muted)" }}>{COPY.historyTitle}</p>
        <p
          style={{
            margin: 0,
            fontSize: "11.5px",
            color: "var(--color-faint)",
            maxWidth: "46ch",
            textAlign: "center",
            textWrap: "pretty",
          }}
        >
          {COPY.historySub}
        </p>
      </section>

      {/* Personal records, blank — same gold treatment as the populated band. */}
      <section
        className="card"
        aria-label="Personal records"
        style={{
          padding: "13px 20px",
          border: "1px solid var(--color-line-strong)",
          borderBlockStart: "2px solid var(--color-line-strong)",
        }}
      >
        <h2
          style={{
            margin: "0 0 10px",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            color: "var(--color-faint)",
            letterSpacing: ".04em",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-faint)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="6" />
            <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
          </svg>
          {COPY.pbTitle}
        </h2>
        <div
          className="pb-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}
        >
          {PBS.map((pb, i) => (
            <div
              key={pb.label}
              style={{
                textAlign: "center",
                paddingBlock: "4px",
                borderInlineStart: i === 0 ? "none" : "1px solid var(--color-line)",
              }}
            >
              <p
                className="num"
                style={{
                  margin: 0,
                  fontSize: "10px",
                  letterSpacing: ".12em",
                  color: "var(--color-faint)",
                }}
              >
                {pb.label}
              </p>
              <p
                className="num"
                style={{ margin: "4px 0 0", fontSize: "22px", fontWeight: 500, color: "var(--color-faint)" }}
              >
                {DASH}
              </p>
            </div>
          ))}
        </div>
        <p
          className="num"
          style={{
            margin: "10px 0 0",
            textAlign: "center",
            fontSize: "10.5px",
            color: "var(--color-faint)",
          }}
        >
          {COPY.pbSub}
        </p>
      </section>
    </div>
  );
}

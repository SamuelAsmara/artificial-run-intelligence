/**
 * The landing page — what a signed-out visitor sees at `/`.
 *
 * Ported 1:1 from the Claude Design handoff (`handoff_landing/Runi
 * Landing.dc.html`, 2026-08-30): full-viewport hero over the long-exposure
 * trail photograph, four analysis columns, "How it works", "For coaches",
 * final CTA. The DC harness (support.js / image-slot.js) was prototype-only
 * and is not ported; the template loops are unrolled here as plain arrays.
 *
 * Two deliberate departures from the mock, both link targets:
 * - "Pricing" had no page behind it; the slot links to /methodology instead
 *   ("The numbers"), which the product actually has.
 * - The demo/coach CTAs point at /login — the mock linked static artboards.
 *
 * Static server component: no state, no client runtime. The entrance
 * animation and grain are CSS only, guarded by prefers-reduced-motion in
 * globals.css (.land-* rules live there).
 */

import { BrandMark } from "@/components/ui";

const STATS = [
  { v: "Heart-rate analysis", k: "Zones, drift and recovery — what your heart says about the effort" },
  { v: "Pace intelligence", k: "Real pace vs planned, split by split, hills accounted for" },
  { v: "Run-to-run comparison", k: "Every run measured against your history — see the trend, not the day" },
  { v: "Readiness that adapts", k: "Fitness and fatigue recalculated after every run, plan adjusted forward" },
];

const STEPS = [
  { n: "01", t: "Connect and set a goal", d: "Link Garmin, Suunto, Strava or intervals.icu and pick your race — 5K to marathon. Runi builds the full programme around your date." },
  { n: "02", t: "Run. Runi measures", d: "After every run it recalculates fitness, fatigue, readiness and cardiac drift from the raw stream — not just distance and pace." },
  { n: "03", t: "The plan adapts — and explains why", d: "Sessions get upgraded or eased off automatically, with a plain-language reason for every change. No black box." },
];

const COACH_POINTS = [
  { n: "01", t: "A roster that flags itself", d: "Risk flags on ACWR spikes, missed sessions and race proximity — who needs you today surfaces on its own." },
  { n: "02", t: "One programme, many start dates", d: "Build a template once; each athlete runs it from their own week. Edits apply forward only, never to weeks already run." },
  { n: "03", t: "Share a plan with a code", d: "Send a QR or code — the athlete’s app syncs the programme and grants you full view of their training." },
];

const ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
  </svg>
);

function NumberedRows({ items }: { items: { n: string; t: string; d: string }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((st) => (
        <div key={st.n} style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: "18px", paddingBlock: "24px", borderBlockStart: "1px solid var(--color-line)" }}>
          <span className="num" style={{ fontSize: "13px", color: "var(--color-accent)" }}>{st.n}</span>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600 }}>{st.t}</h3>
            <p style={{ margin: 0, fontSize: "13.5px", color: "var(--color-muted)", textWrap: "pretty" }}>{st.d}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LandingView() {
  return (
    <div style={{ background: "var(--color-canvas)", color: "var(--color-ink)" }}>

      {/* ---------- hero ---------- */}
      <section style={{ position: "relative", height: "100svh", minHeight: "660px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "absolute", inset: 0, background: "#08090c" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed hero, no next/image sizing needed */}
          <img src="/landing/hero-trail.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%", display: "block", filter: "contrast(1.08) brightness(.95)" }} />
          <div style={{ position: "absolute", inset: 0, background: "var(--color-accent)", mixBlendMode: "color", opacity: 0.35, pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(20,36,61,.30),rgba(10,16,31,.42))", mixBlendMode: "multiply", pointerEvents: "none" }} />
        </div>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg,rgba(8,9,12,.66) 0%,rgba(8,9,12,.12) 30%,rgba(8,9,12,.18) 60%,rgba(8,9,12,.94) 100%)" }} />
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", mixBlendMode: "soft-light", opacity: 0.55 }} aria-hidden>
          <div className="land-grain" />
        </div>

        <header style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", padding: "24px 46px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <BrandMark size={24} />
            <span style={{ font: "800 15px Sora, sans-serif", letterSpacing: ".3em" }}>RUNI</span>
          </div>
          <nav className="navlinks" style={{ display: "flex", gap: "32px" }}>
            <a className="mlabel land-navlink" href="#how">How it works</a>
            <a className="mlabel land-navlink" href="#coaches">For coaches</a>
            <a className="mlabel land-navlink" href="/methodology">The numbers</a>
          </nav>
          <a href="/login" className="mlabel land-pill-ghost" style={{ padding: "10px 22px" }}>Sign in</a>
        </header>

        <div className="land-rise" style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", paddingInline: "24px" }}>
          <div className="hero-meta" style={{ position: "absolute", insetInline: "46px", top: "38%", display: "flex", justifyContent: "space-between", pointerEvents: "none" }}>
            <span className="mlabel" style={{ color: "rgba(233,237,243,.8)" }}>EST. 2026</span>
            <span className="mlabel" style={{ color: "rgba(233,237,243,.8)" }}>MEASURED · EXPLAINED · ADJUSTED</span>
          </div>
          <span style={{ filter: "drop-shadow(0 6px 40px rgba(0,0,0,.55))", display: "inline-flex" }}><BrandMark size={132} /></span>
          <h1 className="hero-word" style={{ margin: "22px 0 0", font: "800 min(7vw,92px)/0.95 Sora, sans-serif", letterSpacing: ".3em", textIndent: ".3em", textTransform: "uppercase", textShadow: "0 4px 60px rgba(0,0,0,.6)" }}>Runi</h1>
          <p className="mlabel" style={{ margin: "24px 0 0", color: "rgba(233,237,243,.9)", letterSpacing: ".46em", textIndent: ".46em" }}>Run with intelligence</p>
        </div>

        <div className="land-rise land-rise2" style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: "26px", paddingBlockEnd: "52px" }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
            <a href="/signup" className="land-pill-main" style={{ display: "inline-flex", alignItems: "center", gap: "9px", font: "600 13.5px 'IBM Plex Sans', sans-serif", padding: "13px 28px", borderRadius: "999px" }}>Start the journey{ARROW}</a>
            <a href="/login" className="land-pill-ghost" style={{ display: "inline-flex", alignItems: "center", font: "500 13.5px 'IBM Plex Sans', sans-serif", padding: "13px 28px" }}>View live demo</a>
          </div>
          <svg width="16" height="22" viewBox="0 0 16 22" fill="none" stroke="rgba(233,237,243,.5)" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M8 2v14" /><path d="m3 12 5 5 5-5" />
          </svg>
        </div>
      </section>

      {/* ---------- analysis row ---------- */}
      <section style={{ borderBlockStart: "1px solid var(--color-line)" }}>
        <div className="statrow" style={{ maxWidth: "1180px", marginInline: "auto", padding: "38px 46px", display: "flex", gap: "60px", flexWrap: "wrap", justifyContent: "center" }}>
          {STATS.map((s) => (
            <div key={s.v} style={{ display: "flex", flexDirection: "column", gap: "7px", alignItems: "center", flex: 1, minWidth: "190px", textAlign: "center" }}>
              <span style={{ font: "600 16px 'IBM Plex Sans', sans-serif" }}>{s.v}</span>
              <span style={{ fontSize: "12.5px", color: "var(--color-muted)", maxWidth: "230px", textWrap: "pretty" }}>{s.k}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" style={{ maxWidth: "1180px", marginInline: "auto", padding: "88px 46px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "60px", alignItems: "start" }}>
          <div>
            <p className="mlabel" style={{ margin: "0 0 14px", color: "var(--color-accent)" }}>How it works</p>
            <h2 style={{ margin: 0, font: "700 34px/1.15 Sora, sans-serif", letterSpacing: "-0.01em", textWrap: "balance" }}>A coach that recalculates after every run.</h2>
          </div>
          <NumberedRows items={STEPS} />
        </div>
      </section>

      {/* ---------- for coaches ---------- */}
      <section id="coaches" style={{ borderBlockStart: "1px solid var(--color-line)" }}>
        <div style={{ maxWidth: "1180px", marginInline: "auto", padding: "72px 46px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "60px", alignItems: "start" }}>
          <div>
            <p className="mlabel" style={{ margin: "0 0 14px", color: "var(--color-accent)" }}>For coaches</p>
            <h2 style={{ margin: "0 0 14px", font: "700 34px/1.15 Sora, sans-serif", letterSpacing: "-0.01em", textWrap: "balance" }}>Your whole roster. One morning glance.</h2>
            <p style={{ margin: 0, fontSize: "14.5px", color: "var(--color-muted)", maxWidth: "460px", textWrap: "pretty" }}>
              Runi is built for the coach&rsquo;s roster too — every athlete&rsquo;s readiness, risk and week on one board, with the same engine doing the math underneath.
            </p>
            <a href="/login" className="land-pill-line" style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBlockStart: "22px", font: "600 13.5px 'IBM Plex Sans', sans-serif", padding: "12px 24px" }}>See the coach board{ARROW}</a>
          </div>
          <NumberedRows items={COACH_POINTS} />
        </div>
      </section>

      {/* ---------- final CTA + footer ---------- */}
      <section style={{ borderBlockStart: "1px solid var(--color-line)" }}>
        <div style={{ maxWidth: "1180px", marginInline: "auto", padding: "72px 46px", display: "flex", flexDirection: "column", alignItems: "center", gap: "22px", textAlign: "center" }}>
          <h2 style={{ margin: 0, font: "800 40px/1.05 Sora, sans-serif", letterSpacing: ".02em", textTransform: "uppercase", textWrap: "balance" }}>Precision in every step</h2>
          <p style={{ margin: 0, fontSize: "15px", color: "var(--color-muted)", maxWidth: "440px", textWrap: "pretty" }}>
            Connect your watch, set a goal race, and get a plan that adapts to what your body actually did — not what the spreadsheet hoped.
          </p>
          <a href="/signup" className="land-pill-accent" style={{ display: "inline-flex", alignItems: "center", gap: "9px", font: "600 14px 'IBM Plex Sans', sans-serif", padding: "14px 32px", marginBlockStart: "8px" }}>Start the journey</a>
        </div>
        <footer style={{ borderBlockStart: "1px solid var(--color-line)" }}>
          <div style={{ maxWidth: "1180px", marginInline: "auto", padding: "22px 46px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <span className="mlabel" style={{ color: "var(--color-faint)" }}>© 2026 RUNI</span>
            <span className="mlabel" style={{ color: "var(--color-faint)" }}>BUILT FOR DISTANCE RUNNERS</span>
          </div>
        </footer>
      </section>
    </div>
  );
}

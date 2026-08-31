/**
 * The landing page — what a signed-out visitor sees at `/`.
 *
 * The hero is a 1:1 port of the Claude Design handoff (`handoff_landing/Runi
 * Landing.dc.html`, 2026-08-30): full-viewport, the long-exposure trail
 * photograph, blue grade, film grain, the R-Trace mark and the wordmark.
 *
 * Below it the page was rebuilt on 2026-08-31 around six sections, in the
 * order a visitor would ask the questions: how big is this → what does it
 * connect to → what does it measure → what does it do for a runner → what
 * does it do for a coach → start.
 *
 * Content rules, because the words here are the product:
 * - The numbers strip is the seeded demo population and says so in a
 *   footnote. Nothing on this page claims users it does not have.
 * - The connectivity diagram draws the real architecture: watches reach
 *   Runi through intervals.icu (see lib/screens/settings.ts, "The providers
 *   whose data reaches Runi through intervals.icu"). Strava also connects
 *   directly. Nothing else is drawn.
 * - No "AI", no "brain". The product's stance everywhere else is that every
 *   figure is computed; the copy here matches. It is an engine.
 *
 * Motion: LandingMotion (client) reveals `[data-reveal]` groups on scroll,
 * counts `[data-count]` numerals and draws `[data-draw]` strokes. All of it
 * is behind prefers-reduced-motion. This file itself is a static server
 * component; the only client leaves are LandingMotion and TileMark.
 */

import { BrandMark } from "@/components/ui";
import { LandingMotion } from "@/components/landing/LandingMotion";
import { TileMark } from "@/components/screens/SettingsView";
import { PROVIDER_TILES } from "@/lib/screens/settings";

/* ------------------------------------------------------------------ */
/* copy                                                                */
/* ------------------------------------------------------------------ */

const NUMBERS = [
  { n: "6", k: "coaching teams" },
  { n: "70", k: "coached runners" },
  { n: "100", k: "independent athletes" },
  { n: "34", k: "races in preparation" },
];

const ANALYSIS = [
  { id: "hr", v: "Heart-rate analysis", k: "Zones, drift and recovery — what your heart says about the effort." },
  { id: "pace", v: "Pace intelligence", k: "Real pace against planned, split by split, hills accounted for." },
  { id: "cmp", v: "Run-to-run comparison", k: "Every run measured against your own history — the trend, not the day." },
  { id: "ready", v: "Readiness that adapts", k: "Fitness and fatigue recalculated after every run; the plan adjusted forward." },
];

const ATHLETE = [
  { n: "01", t: "Connect your training to the engine", d: "Link your watch once. From then on every run, every night of sleep and every heart-rate stream lands in Runi without you typing a number." },
  { n: "02", t: "Understand your own numbers", d: "Fitness, fatigue, form, load ratio, cardiac drift — each one explained in a sentence, each one traceable to the runs that produced it." },
  { n: "03", t: "You, measured against you", d: "No leaderboards. Runi is your mirror: this week against your normal, this run against your last ten, this month against the last. Progress you can see even when there is no race on the calendar." },
  { n: "04", t: "Break a record", d: "Set a goal race and the plan builds itself around the date — then bends when your body says so. Sessions eased or upgraded, always with the reason written next to them." },
];

const COACH = [
  { n: "01", t: "Every athlete, at every resolution", d: "The whole roster on one board, and one click down to a single session of a single runner. Build a programme once; each athlete starts it on their own week." },
  { n: "02", t: "Plan against execution", d: "For every athlete: what you prescribed next to what they ran, measurable and side by side. Your experience decides what it means. Runi makes sure you see it." },
  { n: "03", t: "Peak moments", d: "Races are where ceilings break — theirs and yours. Runi tracks each athlete's countdown, taper and readiness, so you reach the start line with them prepared, and with the numbers to show for it." },
];

const OUTPUTS = ["Readiness", "Tomorrow's session", "The reason why"];

const ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* the four mini-graphics — drawn from the product's own chart language  */
/* ------------------------------------------------------------------ */

function Graphic({ id }: { id: string }) {
  // Sized by the 56px box they sit in, left-aligned, never by the card width.
  const common = { width: "100%", height: "100%", display: "block" as const };
  switch (id) {
    case "hr":
      return (
        <svg viewBox="0 0 160 56" preserveAspectRatio="xMinYMid meet" style={common} data-draw aria-hidden>
          <path d="M2 30h28l6-10 8 24 8-34 8 30 6-12 6 4h20l6-8 8 20 8-26 8 20 6-6h26" fill="none" stroke="var(--color-negative)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
    case "pace":
      return (
        <svg viewBox="0 0 160 56" preserveAspectRatio="xMinYMid meet" style={common} data-draw aria-hidden>
          {[14, 22, 19, 28, 26, 34, 31, 40, 38, 46].map((h, i) => (
            <path key={i} d={`M${10 + i * 15} 52V${52 - h}`} stroke={i >= 7 ? "var(--color-accent)" : "var(--color-line-strong)"} strokeWidth="7" strokeLinecap="round" fill="none" />
          ))}
        </svg>
      );
    case "cmp":
      return (
        <svg viewBox="0 0 160 56" preserveAspectRatio="xMinYMid meet" style={common} data-draw aria-hidden>
          <path d="M2 40C30 42 50 30 78 34S120 22 158 26" fill="none" stroke="var(--color-line-strong)" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M2 44C34 40 52 22 84 24S126 10 158 8" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 160 56" preserveAspectRatio="xMinYMid meet" style={common} data-draw aria-hidden>
          <path d="M28 52A52 52 0 0 1 132 52" fill="none" stroke="var(--color-line-strong)" strokeWidth="6" strokeLinecap="round" />
          <path d="M28 52A52 52 0 0 1 118 22" fill="none" stroke="var(--color-positive)" strokeWidth="6" strokeLinecap="round" />
          <text x="80" y="50" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="18" fontWeight="500" fill="var(--color-ink)">82</text>
        </svg>
      );
  }
}

/* ------------------------------------------------------------------ */
/* connectivity diagram                                                */
/* ------------------------------------------------------------------ */

const SOURCES = PROVIDER_TILES.filter((t) => t.id !== "intervals_icu");
const HUB = PROVIDER_TILES.find((t) => t.id === "intervals_icu")!;

function Chip({ tile, label }: { tile: (typeof PROVIDER_TILES)[number]; label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span style={{ width: "56px", height: "32px", borderRadius: "8px", background: tile.chipBg, display: "grid", placeItems: "center", flex: "none", boxShadow: "0 0 0 1px rgb(255 255 255 / 8%)" }}>
        <TileMark tile={tile} />
      </span>
      <span style={{ fontSize: "12.5px", color: "var(--color-muted)", whiteSpace: "nowrap" }}>{label ?? tile.name}</span>
    </div>
  );
}

/** Five lines fanning in to one point; scales with the column it sits in. */
function FanIn() {
  const ys = [10, 30, 50, 70, 90];
  return (
    <svg className="land-wire" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {ys.map((y) => (
        <path key={y} d={`M0 ${y} C50 ${y} 50 50 100 50`} fill="none" stroke="var(--color-line-strong)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      ))}
      {ys.map((y) => (
        <path key={`f${y}`} className="land-flow" d={`M0 ${y} C50 ${y} 50 50 100 50`} fill="none" stroke="var(--color-accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function Straight() {
  return (
    <svg className="land-wire" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <path d="M0 50H100" fill="none" stroke="var(--color-line-strong)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <path className="land-flow" d="M0 50H100" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function FanOut() {
  const ys = [18, 50, 82];
  return (
    <svg className="land-wire" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {ys.map((y) => (
        <path key={y} d={`M0 50 C50 50 50 ${y} 100 ${y}`} fill="none" stroke="var(--color-line-strong)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      ))}
      {ys.map((y) => (
        <path key={`f${y}`} className="land-flow" d={`M0 50 C50 50 50 ${y} 100 ${y}`} fill="none" stroke="var(--color-accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */

function NumberedRows({ items }: { items: { n: string; t: string; d: string }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((st) => (
        <div key={st.n} style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: "18px", paddingBlock: "24px", borderBlockStart: "1px solid var(--color-line)" }}>
          <span className="num" style={{ fontSize: "13px", color: "var(--color-accent)" }}>{st.n}</span>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600 }}>{st.t}</h3>
            <p style={{ margin: 0, fontSize: "13.5px", color: "var(--color-muted)", textWrap: "pretty", lineHeight: 1.6 }}>{st.d}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const WRAP = { maxWidth: "1180px", marginInline: "auto" } as const;

export function LandingView() {
  return (
    <div style={{ background: "var(--color-canvas)", color: "var(--color-ink)" }}>
      <LandingMotion />

      {/* ---------- hero (Claude Design handoff, unchanged) ---------- */}
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
            <a className="mlabel land-navlink" href="#numbers">The numbers</a>
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

      {/* ---------- by the numbers ---------- */}
      <section id="numbers" style={{ borderBlockStart: "1px solid var(--color-line)" }}>
        <div data-reveal style={{ ...WRAP, padding: "56px 46px 40px" }}>
          <div className="land-numbers" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px" }}>
            {NUMBERS.map((x) => (
              <div key={x.k} className="land-item" style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", textAlign: "center" }}>
                <span className="num" data-count style={{ fontSize: "clamp(40px, 5vw, 60px)", fontWeight: 500, lineHeight: 1, letterSpacing: "-0.03em" }}>{x.n}</span>
                <span className="mlabel" style={{ color: "var(--color-faint)" }}>{x.k}</span>
              </div>
            ))}
          </div>
          <p className="land-item" style={{ margin: "28px auto 0", maxWidth: "62ch", textAlign: "center", fontSize: "11.5px", color: "var(--color-faint)", lineHeight: 1.6 }}>
            * The seeded population Runi is demonstrated with — not live users. Every figure on the screens behind these numbers is computed from those runs.
          </p>
        </div>
      </section>

      {/* ---------- connectivity ---------- */}
      <section style={{ borderBlockStart: "1px solid var(--color-line)" }}>
        <div data-reveal style={{ ...WRAP, padding: "88px 46px" }}>
          <div className="land-item" style={{ maxWidth: "640px", marginBlockEnd: "44px" }}>
            <p className="mlabel" style={{ margin: "0 0 14px", color: "var(--color-accent)" }}>Connects to what you already run with</p>
            <h2 style={{ margin: "0 0 14px", font: "700 34px/1.15 Sora, sans-serif", letterSpacing: "-0.01em", textWrap: "balance" }}>Runs in from wherever you already run.</h2>
            <p style={{ margin: 0, fontSize: "14.5px", color: "var(--color-muted)", textWrap: "pretty", lineHeight: 1.65 }}>
              Your watch already records everything. intervals.icu collects it — runs, sleep, HRV, resting heart rate — and Runi reads the raw stream from there. Connect once; there is nothing to log by hand. Strava can also connect directly.
            </p>
          </div>

          <div className="land-item land-diagram" aria-label="Data flows from Garmin, Suunto, Strava, Apple Health and Runkeeper through intervals.icu into Runi, and comes out as readiness, tomorrow's session and the reason why">
            <div className="land-col land-sources" style={{ display: "grid", gap: "14px", alignContent: "center" }}>
              {SOURCES.map((t) => <Chip key={t.id} tile={t} />)}
            </div>
            <div className="land-wirecell"><FanIn /></div>
            <div className="land-col" style={{ display: "grid", placeItems: "center" }}>
              <Chip tile={HUB} />
            </div>
            <div className="land-wirecell"><Straight /></div>
            <div className="land-col" style={{ display: "grid", placeItems: "center" }}>
              <div style={{ display: "grid", placeItems: "center", gap: "8px" }}>
                <span className="land-core" style={{ width: "96px", height: "96px", borderRadius: "24px", display: "grid", placeItems: "center", background: "rgb(255 255 255 / 4%)", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 10%), 0 0 60px rgb(78 142 247 / 18%)" }}>
                  <BrandMark size={56} />
                </span>
                <span className="mlabel" style={{ color: "var(--color-faint)" }}>Runi</span>
              </div>
            </div>
            <div className="land-wirecell"><FanOut /></div>
            <div className="land-col land-outputs" style={{ display: "grid", gap: "14px", alignContent: "center" }}>
              {OUTPUTS.map((o) => (
                <span key={o} className="num" style={{ justifySelf: "start", fontSize: "12.5px", color: "var(--color-ink)", padding: "9px 14px", borderRadius: "999px", background: "var(--color-accent-soft)", boxShadow: "inset 0 0 0 1px rgb(78 142 247 / 35%)", whiteSpace: "nowrap" }}>{o}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- what it measures ---------- */}
      <section id="how" style={{ borderBlockStart: "1px solid var(--color-line)" }}>
        <div data-reveal style={{ ...WRAP, padding: "72px 46px" }}>
          <p className="mlabel land-item" style={{ margin: "0 0 28px", color: "var(--color-accent)" }}>What it measures</p>
          <div className="land-analysis" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            {ANALYSIS.map((a) => (
              <div key={a.id} className="land-item" style={{ padding: "22px 20px 20px", borderRadius: "14px", background: "var(--color-surface)", boxShadow: "inset 0 0 0 1px var(--color-line)", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ height: "56px" }}><Graphic id={a.id} /></div>
                <div>
                  <h3 style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 600 }}>{a.v}</h3>
                  <p style={{ margin: 0, fontSize: "12.5px", color: "var(--color-muted)", textWrap: "pretty", lineHeight: 1.6 }}>{a.k}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- for the runner ---------- */}
      <section style={{ borderBlockStart: "1px solid var(--color-line)" }}>
        <div data-reveal style={{ ...WRAP, padding: "88px 46px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "60px", alignItems: "start" }}>
          <div className="land-item">
            <p className="mlabel" style={{ margin: "0 0 14px", color: "var(--color-accent)" }}>For the runner</p>
            <h2 style={{ margin: "0 0 14px", font: "700 34px/1.15 Sora, sans-serif", letterSpacing: "-0.01em", textWrap: "balance" }}>You, measured against you.</h2>
            <p style={{ margin: 0, fontSize: "14.5px", color: "var(--color-muted)", maxWidth: "460px", textWrap: "pretty", lineHeight: 1.65 }}>
              Four things Runi does with your runs — whether you are chasing a start line or just want to understand what your body is doing this month.
            </p>
          </div>
          <div className="land-item"><NumberedRows items={ATHLETE} /></div>
        </div>
      </section>

      {/* ---------- for coaches ---------- */}
      <section id="coaches" style={{ borderBlockStart: "1px solid var(--color-line)" }}>
        <div data-reveal style={{ ...WRAP, padding: "72px 46px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "60px", alignItems: "start" }}>
          <div className="land-item">
            <p className="mlabel" style={{ margin: "0 0 14px", color: "var(--color-accent)" }}>For coaches</p>
            <h2 style={{ margin: "0 0 14px", font: "700 34px/1.15 Sora, sans-serif", letterSpacing: "-0.01em", textWrap: "balance" }}>We don&rsquo;t replace you. We make you the coach who talks in numbers.</h2>
            <p style={{ margin: 0, fontSize: "14.5px", color: "var(--color-muted)", maxWidth: "460px", textWrap: "pretty", lineHeight: 1.65 }}>
              You lead; Runi assists. It reads every athlete&rsquo;s data, shows the process clearly, and leaves the judgment — and the relationship — where it belongs: with you.
            </p>
            <a href="/login" className="land-pill-line" style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBlockStart: "22px", font: "600 13.5px 'IBM Plex Sans', sans-serif", padding: "12px 24px" }}>See the coach board{ARROW}</a>
          </div>
          <div className="land-item"><NumberedRows items={COACH} /></div>
        </div>
      </section>

      {/* ---------- final CTA + footer ---------- */}
      <section style={{ borderBlockStart: "1px solid var(--color-line)" }}>
        <div data-reveal style={{ ...WRAP, padding: "72px 46px", display: "flex", flexDirection: "column", alignItems: "center", gap: "22px", textAlign: "center" }}>
          <h2 className="land-item" style={{ margin: 0, font: "800 40px/1.05 Sora, sans-serif", letterSpacing: ".02em", textTransform: "uppercase", textWrap: "balance" }}>Precision in every step</h2>
          <p className="land-item" style={{ margin: 0, fontSize: "15px", color: "var(--color-muted)", maxWidth: "440px", textWrap: "pretty" }}>
            Connect your watch, set a goal race, and get a plan that adapts to what your body actually did — not what the spreadsheet hoped.
          </p>
          <a href="/signup" className="land-pill-accent land-item" style={{ display: "inline-flex", alignItems: "center", gap: "9px", font: "600 14px 'IBM Plex Sans', sans-serif", padding: "14px 32px", marginBlockStart: "8px" }}>Start the journey</a>
        </div>
        <footer style={{ borderBlockStart: "1px solid var(--color-line)" }}>
          <div style={{ ...WRAP, padding: "22px 46px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <span className="mlabel" style={{ color: "var(--color-faint)" }}>© 2026 RUNI</span>
            <span className="mlabel" style={{ color: "var(--color-faint)" }}>BUILT FOR DISTANCE RUNNERS</span>
          </div>
        </footer>
      </section>
    </div>
  );
}

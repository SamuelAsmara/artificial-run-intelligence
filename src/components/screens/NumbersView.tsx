"use client";

/**
 * Your numbers — the board.
 *
 * Thirteen tiles, each carrying the athlete's own current value, laid out as
 * the pipeline they form: what comes in → load → fitness & fatigue → form &
 * ratio → readiness, with the per-run figures (GAP, drift, Riegel) in a row
 * underneath. Clicking a tile fills the one panel under the board with that
 * figure's four short blocks — the letters, your numbers, the formula, why.
 *
 * Readiness is open when the page loads: it is the question everyone arrives
 * with, and a board that starts with an empty panel reads as broken.
 *
 * On phones the flow stacks into one column and the panel opens directly
 * under the tapped tile instead of at the bottom of the board, so the
 * explanation is never a scroll away from the thing it explains. Both
 * placements render the same content; CSS shows one of them.
 *
 * The tiles' text and bands come from lib/screens/numbers.ts; this file is
 * layout only.
 */

import { useEffect, useMemo, useState } from "react";
import { Entrance, BrandMark } from "@/components/ui";
import { NUMBERS_COPY, NUMBERS_HUE, type History, type HistoryRange, type Lane, type NumberTile, type Scale, type ScaleFormat, type Tone } from "@/lib/screens/numbers";
import { formatDuration, formatPace } from "@/lib/format/pace";
import { NUMBERS_FORMULAS } from "@/components/screens/numbersFormulas";
import Link from "next/link";

const TONE: Record<Tone, string> = {
  positive: "var(--color-positive)",
  caution: "var(--color-caution)",
  negative: "var(--color-negative)",
  neutral: "var(--color-faint)",
};

const LANES: Lane[] = ["inputs", "load", "fitness", "form", "readiness"];

const hueOf = (tile: NumberTile) => NUMBERS_HUE[tile.id] ?? TONE[tile.status.tone];

export function NumbersView({ tiles, asOf }: { tiles: NumberTile[]; asOf: string }) {
  /*
   * The selected tile lives in the URL hash — /numbers#tsb — so a coach can
   * send an athlete straight to one figure, and back/forward move between
   * tiles. Read once when the screen mounts (readiness when there is no hash,
   * or an unknown one); written on every change without adding a history
   * entry per click.
   */
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const fromHash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    return fromHash && tiles.some((t) => t.id === fromHash) ? fromHash : "readiness";
  });
  const selected = selectedId ? tiles.find((t) => t.id === selectedId) ?? null : null;

  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.slice(1);
      if (id && tiles.some((t) => t.id === id)) setSelectedId(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [tiles]);
  // Clicking the open tile again closes its panel; so does Escape and the ×.
  const select = (id: string) => {
    const next = id === selectedId ? null : id;
    setSelectedId(next);
    if (typeof window !== "undefined") window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname + window.location.search);
  };
  const close = () => { if (selectedId) select(selectedId); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const byLane = (lane: Lane) => tiles.filter((t) => t.lane === lane);
  const nav = NUMBERS_COPY.nav;

  return (
    <div data-entrance-root style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance />
      <header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <BrandMark />
          <span className="num" style={{ fontWeight: 500, fontSize: "16px", letterSpacing: ".12em" }}>Runi</span>
        </div>
        <div style={{ textAlign: "start" }}>
          <h1 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{NUMBERS_COPY.title}</h1>
          <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-muted)" }}>{NUMBERS_COPY.subtitle}</p>
        </div>
        <nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}>
          <Link href="/dashboard" style={{ color: "var(--color-muted)" }}>{nav.home}</Link>
          <Link href="/plan" style={{ color: "var(--color-muted)" }}>{nav.plan}</Link>
          <Link href="/activities" style={{ color: "var(--color-muted)" }}>{nav.activities}</Link>
          <Link href="/numbers" style={{ color: "var(--color-ink)" }}>{nav.numbers}</Link>
          <Link href="/settings" style={{ color: "var(--color-muted)" }}>{nav.settings}</Link>
        </nav>
        <div style={{ flex: 1 }} />
        <span className="num hide-m" style={{ fontSize: "11px", color: "var(--color-faint)" }}>{asOf}</span>
      </header>

      {/* ---------- the flow board ---------- */}
      <section aria-label="How today's readiness is built" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="nb-flow">
          {LANES.map((lane, i) => (
            <FlowLane key={lane} lane={lane} tiles={byLane(lane)} selectedId={selected?.id ?? null} onSelect={select} selected={selected}
              wireBefore={i === 0 ? null : wireShape(byLane(LANES[i - 1]).length, byLane(lane).length)} />
          ))}
        </div>
        {selected && selected.lane !== "perRun" ? <DetailPanel tile={selected} className="nb-panel-desktop" onClose={close} /> : null}
      </section>

      {/* ---------- per run ---------- */}
      <section aria-label="Per-run figures" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <p className="nb-lanel" style={{ margin: "6px 0 0" }}>{NUMBERS_COPY.lanes.perRun}</p>
        <div className="nb-perrun">
          {byLane("perRun").map((t) => (
            <div key={t.id} className="nb-tilewrap">
              <Tile tile={t} selected={t.id === selected?.id} onSelect={select} />
              {t.id === selected?.id ? <DetailPanel tile={t} className="nb-panel-inline" onClose={close} /> : null}
            </div>
          ))}
        </div>
        {selected && selected.lane === "perRun" ? <DetailPanel tile={selected} className="nb-panel-desktop" onClose={close} /> : null}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FlowLane({ lane, tiles, selectedId, onSelect, wireBefore }: {
  lane: Lane; tiles: NumberTile[]; selectedId: string | null; onSelect: (id: string) => void;
  selected: NumberTile | null; wireBefore: { from: number; to: number } | null;
}) {
  const close = () => { if (selectedId) onSelect(selectedId); };
  return (
    <>
      {wireBefore ? <div className="nb-wirecell" aria-hidden><Wire from={wireBefore.from} to={wireBefore.to} lit={lane === "readiness"} /></div> : null}
      <div className="nb-lane">
        <p className="nb-lanel">{NUMBERS_COPY.lanes[lane]}</p>
        <div className="nb-lanetiles">
          {tiles.map((t) => (
            <div key={t.id} className="nb-tilewrap">
              <Tile tile={t} selected={t.id === selectedId} onSelect={onSelect} hero={lane === "readiness"} />
              {t.id === selectedId ? <DetailPanel tile={t} className="nb-panel-inline" onClose={close} /> : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function wireShape(from: number, to: number) {
  return { from, to };
}

/** `from` lines on the left fanning to `to` lines on the right, in a 100×100 box. */
function Wire({ from, to, lit }: { from: number; to: number; lit?: boolean }) {
  const ys = (n: number) => Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * 100);
  const L = ys(from), R = ys(to);
  const stroke = lit ? "var(--color-accent)" : "var(--color-line-strong)";
  return (
    <svg className="nb-wire" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {L.map((y1) => R.map((y2) => (
        <path key={`${y1}-${y2}`} d={`M0 ${y1} C50 ${y1} 50 ${y2} 100 ${y2}`} fill="none" stroke={stroke} strokeWidth="1.2" vectorEffect="non-scaling-stroke" opacity={lit ? 0.9 : 0.8} />
      )))}
      {/* the data, travelling: one accent dash per wire, staggered so they don't march in step */}
      {L.map((y1, a) => R.map((y2, b) => (
        <path key={`f${y1}-${y2}`} className="nb-flowdash" style={{ animationDelay: `${((a * 3 + b) % 5) * -0.5}s` }}
          d={`M0 ${y1} C50 ${y1} 50 ${y2} 100 ${y2}`} fill="none" stroke="var(--color-accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      )))}
    </svg>
  );
}

function Tile({ tile, selected, onSelect, hero }: { tile: NumberTile; selected: boolean; onSelect: (id: string) => void; hero?: boolean }) {
  const tone = TONE[tile.status.tone];
  const hue = hueOf(tile);
  const valueColor = tile.value === "—" ? "var(--color-faint)" : hero ? tone : "var(--color-ink)";
  return (
    <button
      type="button"
      className={`card nb-tile ${selected ? "is-selected" : ""}`}
      onClick={() => onSelect(tile.id)}
      aria-pressed={selected}
      aria-label={`${tile.name}: ${tile.value}${tile.unit ? " " + tile.unit : ""}, ${tile.status.label}`}
      style={{
        textAlign: "start", fontFamily: "inherit", cursor: "pointer", color: "inherit",
        padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: "4px", width: "100%",
        boxShadow: selected ? `inset 0 0 0 1.5px ${hue}` : undefined,
        background: hero ? "var(--color-accent-soft)" : undefined,
        ["--hue" as string]: hue,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px 8px", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
          <svg className={`nb-icon nb-icon-${tile.id}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={hue} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={tile.icon} /></svg>
          <span className="num" style={{ fontSize: "10px", letterSpacing: ".14em", color: hue, fontWeight: 600 }}>{tile.abbr}</span>
        </span>
        <span className="num nb-chip" style={{ color: tone }}>{tile.status.label}</span>
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: "5px", marginBlockStart: "4px" }}>
        <span className="num" style={{ fontSize: hero ? "34px" : "26px", lineHeight: 1, fontWeight: 500, letterSpacing: "-0.02em", color: valueColor }}>{tile.value}</span>
        {tile.unit && tile.value !== "—" ? <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{tile.unit}</span> : null}
      </span>
      <span style={{ fontSize: "11.5px", color: "var(--color-muted)" }}>{tile.name}</span>
    </button>
  );
}

function DetailPanel({ tile, className, onClose }: { tile: NumberTile; className: string; onClose: () => void }) {
  const B = NUMBERS_COPY.blocks;
  const typeset = NUMBERS_FORMULAS[tile.id];
  const hue = hueOf(tile);
  return (
    <div key={tile.id} className={`card nb-panel ${className}`} style={{ padding: "16px 18px 18px", boxShadow: "inset 0 0 0 1px var(--color-accent-soft)", ["--hue" as string]: hue }} aria-live="polite">
      {/* title, then what the letters mean right under it — the one thing to read before anything else */}
      <div className="nb-panel-head">
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
            <svg className={`nb-icon nb-icon-${tile.id} nb-panel-icon`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={hue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ alignSelf: "center" }}><path d={tile.icon} /></svg>
            {tile.name}
            <span className="num" style={{ color: hue, fontWeight: 600, fontSize: "11px", letterSpacing: ".1em" }}>{tile.abbr}</span>
            <span className="num" style={{ fontSize: "10.5px", fontWeight: 500, color: TONE[tile.status.tone] }}>{tile.status.label}</span>
          </h2>
          <p className="nb-letters">{tile.letters}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)", whiteSpace: "nowrap" }}>Seen on: {tile.seenOn}</span>
          <button type="button" className="nb-close" onClick={onClose} aria-label={`Close ${tile.name}`} title="Close (Esc)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>

      <div className={`nb-body${tile.history ? " has-chart" : ""}`}>
        <div className="nb-text">
          {tile.scale ? <ScaleBar scale={tile.scale} /> : null}
          <Block title={B.yours} live>{tile.yours}</Block>
          <div>
            <BlockTitle>{B.formula}</BlockTitle>
            {typeset ? <div className="nb-formula">{typeset}</div> : <span className="num nb-eq">{tile.formula}</span>}
          </div>
          <Block title={B.why}>{tile.why}</Block>
        </div>
        {tile.history ? <HistoryChart history={tile.history} scale={tile.scale} name={tile.name} id={tile.id} hue={hue} /> : null}
      </div>
    </div>
  );
}

function BlockTitle({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <p className="num" style={{ margin: "0 0 5px", fontSize: "9.5px", letterSpacing: ".14em", textTransform: "uppercase", color: live ? "var(--color-accent)" : "var(--color-faint)", fontWeight: 600 }}>{children}</p>
  );
}

function Block({ title, children, live }: { title: string; children: React.ReactNode; live?: boolean }) {
  return (
    <div>
      <BlockTitle live={live}>{title}</BlockTitle>
      <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.6, color: live ? "var(--color-ink)" : "var(--color-muted)", textWrap: "pretty", maxWidth: "68ch" }}>{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* the history chart                                                   */
/* ------------------------------------------------------------------ */

/*
 * One metric over time, to the dataviz rules: a single 2px line (or thin
 * bars for a sum), a recessive grid of three lines, the last point
 * emphasised and labelled, a crosshair with a tooltip on hover, and the range
 * presets in one row above the plot. When the tile has a band bar in the
 * same unit, its bands are painted faintly behind the line, so "when was I in
 * the red" reads without a legend. Text stays in text tokens; the line is the
 * only thing wearing the accent.
 */

const CW = 320;
const CH = 132;
const PAD = { l: 34, r: 12, t: 14, b: 20 };

function fmtHistory(v: number, f: History["format"], unit?: string): string {
  const s = f === "pace" ? formatPace(v) : fmt(v, f);
  return unit ? `${s}${unit.startsWith("/") ? "" : " "}${unit}` : s;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function HistoryChart({ history, scale, name, id, hue }: { history: History; scale?: Scale; name: string; id: string; hue: string }) {
  const [rangeKey, setRangeKey] = useState<HistoryRange>(() => (history.ranges.find((r) => r.key === "m") ?? history.ranges[0]).key);
  const [hover, setHover] = useState<number | null>(null);
  const range = history.ranges.find((r) => r.key === rangeKey) ?? history.ranges[0];
  const pts = range.points;

  const geo = useMemo(() => {
    const vs = pts.map((p) => p.v);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (history.kind === "bars") lo = 0;
    if (hi - lo < 1e-9) { hi = lo + 1; lo = lo - 1; }
    const span = hi - lo;
    lo -= history.kind === "bars" ? 0 : span * 0.15;
    hi += span * 0.15;
    const inv = history.lowerIsBetter === true;
    const y = (v: number) => {
      const t = (v - lo) / (hi - lo);
      return inv ? PAD.t + t * (CH - PAD.t - PAD.b) : CH - PAD.b - t * (CH - PAD.t - PAD.b);
    };
    const n = pts.length;
    const x = (i: number) => (n === 1 ? (PAD.l + CW - PAD.r) / 2 : PAD.l + (i / (n - 1)) * (CW - PAD.l - PAD.r));
    const grid = [0, 0.5, 1].map((t) => ({ y: inv ? PAD.t + t * (CH - PAD.t - PAD.b) : CH - PAD.b - t * (CH - PAD.t - PAD.b), v: lo + t * (hi - lo) }));
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const base = inv ? PAD.t : CH - PAD.b;
    const area = n > 1 ? `${path} L${x(n - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z` : "";
    const bands = scale && scale.format === history.format
      ? scale.segments.map((sg) => {
          const a = y(Math.max(lo, Math.min(hi, sg.from))), b = y(Math.max(lo, Math.min(hi, sg.to)));
          return { y: Math.min(a, b), h: Math.abs(a - b), tone: sg.tone };
        }).filter((b) => b.h > 0.5)
      : [];
    const avg = vs.reduce((a, b) => a + b, 0) / n;
    return { lo, hi, x, y, grid, path, area, bands, avg, base, bw: n > 1 ? Math.max(2, ((CW - PAD.l - PAD.r) / n) * 0.72) : 12 };
  }, [pts, history.kind, history.lowerIsBetter, history.format, scale]);

  const last = pts[pts.length - 1];
  const first = pts[0];
  const hov = hover != null ? pts[hover] : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * CW;
    let best = 0, bd = Infinity;
    pts.forEach((_, i) => { const d = Math.abs(geo.x(i) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };

  return (
    <div className="nb-chart">
      <div className="nb-chart-head">
        <BlockTitle>History</BlockTitle>
        <div className="nb-seg" role="tablist" aria-label={`${name} history range`}>
          {history.ranges.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={r.key === range.key} className={`nb-seg-btn${r.key === range.key ? " is-on" : ""}`} onClick={() => { setRangeKey(r.key); setHover(null); }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="nb-chart-svg" role="img" aria-label={`${name}, ${range.label === "W" ? "last week" : range.label === "M" ? "last month" : range.label === "3M" ? "last three months" : "last year"}: from ${fmtHistory(first.v, history.format)} to ${fmtHistory(last.v, history.format)}`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {geo.bands.map((b, i) => <rect key={i} x={PAD.l} y={b.y} width={CW - PAD.l - PAD.r} height={b.h} fill={BAND_FILL[b.tone]} opacity="0.07" />)}
        {geo.grid.map((g, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={CW - PAD.r} y1={g.y} y2={g.y} stroke="var(--color-line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={g.y + 3} textAnchor="end" fontSize="8.5" fill="var(--color-faint)" fontFamily="var(--font-mono)">{fmtHistory(g.v, history.format)}</text>
          </g>
        ))}
        {history.kind === "bars" ? (
          pts.map((p, i) => (
            <rect key={p.d} x={geo.x(i) - geo.bw / 2} y={geo.y(p.v)} width={geo.bw} height={Math.max(0, geo.base - geo.y(p.v))} rx="2"
              fill={hue} opacity={i === pts.length - 1 ? 1 : hover === i ? 0.85 : 0.45} className={i === pts.length - 1 ? `nb-dot nb-dot-${id}` : undefined} />
          ))
        ) : (
          <>
            <defs>
              <linearGradient id={`nbfill-${name.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hue} stopOpacity={history.lowerIsBetter ? 0 : 0.18} />
                <stop offset="100%" stopColor={hue} stopOpacity={history.lowerIsBetter ? 0.18 : 0} />
              </linearGradient>
            </defs>
            <path d={geo.area} fill={`url(#nbfill-${name.replace(/\W/g, "")})`} />
            <path d={geo.path} fill="none" stroke={hue} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="nb-chart-line" />
            {/* the last point: a soft ring in the hue that pulses the way the tile's icon moves */}
            <circle cx={geo.x(pts.length - 1)} cy={geo.y(last.v)} r="7" fill={hue} opacity="0.18" className={`nb-ring nb-ring-${id}`} />
            <circle cx={geo.x(pts.length - 1)} cy={geo.y(last.v)} r="3.5" fill={hue} stroke="var(--color-surface)" strokeWidth="2" className={`nb-dot nb-dot-${id}`} />
          </>
        )}
        {hov ? (
          <g>
            <line x1={geo.x(hover as number)} x2={geo.x(hover as number)} y1={PAD.t} y2={CH - PAD.b} stroke="var(--color-faint)" strokeWidth="1" strokeDasharray="3 3" />
            {history.kind === "line" ? <circle cx={geo.x(hover as number)} cy={geo.y(hov.v)} r="4" fill="var(--color-canvas)" stroke={hue} strokeWidth="2" /> : null}
          </g>
        ) : null}
        <text x={PAD.l} y={CH - 6} fontSize="8.5" fill="var(--color-faint)" fontFamily="var(--font-mono)">{shortDate(first.d)}</text>
        <text x={CW - PAD.r} y={CH - 6} fontSize="8.5" fill="var(--color-faint)" fontFamily="var(--font-mono)" textAnchor="end">{shortDate(last.d)}</text>
      </svg>
      <div className="nb-chart-foot num">
        {hov ? (
          <span style={{ color: "var(--color-ink)" }}>{shortDate(hov.d)} · <strong style={{ fontWeight: 500 }}>{fmtHistory(hov.v, history.format, history.unit)}</strong></span>
        ) : (
          history.kind === "bars" && range.key !== "w" ? (
            // the last bar is the running week, so the average is over the finished ones
            <span>this week so far <strong style={{ fontWeight: 500, color: "var(--color-ink)" }}>{fmtHistory(last.v, history.format, history.unit)}</strong>{pts.length > 1 ? <> · average {fmtHistory(pts.slice(0, -1).reduce((a, p) => a + p.v, 0) / (pts.length - 1), history.format, history.unit)} over {pts.length - 1} full {pts.length - 1 === 1 ? "week" : "weeks"}</> : null}</span>
          ) : (
            <span>latest <strong style={{ fontWeight: 500, color: "var(--color-ink)" }}>{fmtHistory(last.v, history.format, history.unit)}</strong> · average {fmtHistory(geo.avg, history.format, history.unit)} over {pts.length} {history.kind === "bars" ? "days" : "points"}</span>
          )
        )}
        <span className="nb-chart-grain">{history.grain}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* the band bar                                                        */
/* ------------------------------------------------------------------ */

/*
 * Drawn to the dataviz rules: a thin track, the fill carrying severity, text
 * in text tokens (never the band colour), one lit segment. The band the
 * athlete's value sits in is painted at full strength; the others stay a
 * quiet tint of their own colour, so the eye lands on "where am I" before it
 * reads "what else is there". Ticks mark the band edges underneath.
 */

const BAND_FILL: Record<Tone, string> = {
  positive: "var(--color-positive)",
  caution: "var(--color-caution)",
  negative: "var(--color-negative)",
  neutral: "var(--color-line-strong)",
};

function fmt(v: number, f: ScaleFormat): string {
  switch (f) {
    case "signed": return v > 0 ? `+${Math.round(v)}` : String(Math.round(v));
    case "ratio": return v.toFixed(2);
    case "pct": return `${Math.round(v)}%`;
    case "pct1": return `${v.toFixed(1)}%`;
    case "hours": return `${v.toFixed(1)} h`;
    case "time": return formatDuration(v);
    case "paceRatio": return v.toFixed(2);
    default: return String(Math.round(v));
  }
}

/** The tick label at a band edge — short, so five of them fit on a phone. */
function edgeLabel(v: number, f: ScaleFormat): string {
  if (f === "time") return formatDuration(v);
  if (f === "paceRatio") return v === 1 ? "threshold" : `${v.toFixed(2)}×`;
  if (f === "hours") return `${v}h`;
  return fmt(v, f);
}

function ScaleBar({ scale }: { scale: Scale }) {
  const span = scale.max - scale.min;
  const pct = (v: number) => ((v - scale.min) / span) * 100;
  const primary = scale.markers[0]?.value ?? null;
  const litIndex = primary == null ? -1 : scale.segments.findIndex((sg, i) =>
    primary >= sg.from && (primary < sg.to || (i === scale.segments.length - 1 && primary <= sg.to)));

  // edge ticks, skipping any that would sit on the previous one
  const ticks: number[] = [];
  for (const sg of scale.segments.slice(1)) {
    const last = ticks.length ? pct(ticks[ticks.length - 1]) : -100;
    if (pct(sg.from) - last >= 9) ticks.push(sg.from);
  }

  return (
    <div className="nb-scale" role="img" aria-label={`${scale.axis}: ${scale.markers.map((m) => m.label).join(", ")}`}>
      <div className="nb-scale-head">
        <span className="num nb-scale-axis">{scale.axis}</span>
        {litIndex >= 0 && scale.segments.length > 1 ? <span className="num nb-scale-band" style={{ color: TONE[scale.segments[litIndex].tone] }}>● {scale.segments[litIndex].label}</span> : null}
      </div>

      <div className="nb-track-wrap">
        {/* markers: needle + value pill */}
        {scale.markers.map((m, i) => (
          <div key={i} className={`nb-marker ${i === 0 ? "is-primary" : "is-secondary"}`} style={{ left: `${pct(m.value)}%` }}>
            <span className="num nb-marker-label">{m.label}</span>
            <span className="nb-marker-needle" />
          </div>
        ))}
        {/* on a one-band scale with two markers, the gap between them is the point — paint it */}
        {scale.segments.length === 1 && scale.markers.length === 2 ? (
          <span className="nb-gap" style={{
            left: `${Math.min(pct(scale.markers[0].value), pct(scale.markers[1].value))}%`,
            width: `${Math.abs(pct(scale.markers[0].value) - pct(scale.markers[1].value))}%`,
            background: scale.markers[0].value >= scale.markers[1].value ? "var(--color-positive)" : "var(--color-caution)",
          }} />
        ) : null}
        {/* the track: quiet tints, one lit band */}
        <div className="nb-track">
          {scale.segments.map((sg, i) => (
            <div key={i} className={`nb-band ${i === litIndex ? "is-lit" : ""}`}
              style={{ width: `${((sg.to - sg.from) / span) * 100}%`, ["--band" as string]: BAND_FILL[sg.tone] }}
              title={`${sg.label}: ${fmt(sg.from, scale.format)} – ${fmt(sg.to, scale.format)}`} />
          ))}
        </div>
        {/* ticks */}
        <div className="nb-ticks">
          {ticks.map((v) => (
            <span key={v} className="num nb-tick" style={{ left: `${pct(v)}%` }}>{edgeLabel(v, scale.format)}</span>
          ))}
        </div>
      </div>

      {/* band names, in text tokens, under their bands */}
      {scale.segments.length > 1 ? (
        <div className="nb-bandnames">
          {scale.segments.map((sg, i) => (
            <span key={i} className={`nb-bandname ${i === litIndex ? "is-lit" : ""}`} style={{ width: `${((sg.to - sg.from) / span) * 100}%` }}>{sg.label}</span>
          ))}
        </div>
      ) : (
        <p className="nb-bandnames" style={{ margin: 0 }}><span className="nb-bandname" style={{ width: "100%", textAlign: "start" }}>{scale.segments[0].label}</span></p>
      )}
    </div>
  );
}

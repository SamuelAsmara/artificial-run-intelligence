"use client";

/**
 * Activity analysis — a port of
 * design_handoff_ari_athlete_app/ARI Activity Detail.dc.html (v2).
 *
 * ## The shape of the screen
 *
 * A header of four metric cards, a strip of per-kilometre splits, and one SVG
 * holding five stacked bands that share a single x axis. Below the chart, the
 * planned-vs-actual verdict and the coach's note.
 *
 * ## Two things this does that the handoff could not
 *
 * The handoff draws every label as absolutely-positioned HTML over the SVG,
 * because its runtime cannot render dynamic `<text>`. React can, so the labels
 * are native SVG here. That is not a style preference: an overlay is a second
 * coordinate system that has to be kept in step with the first, and eventually
 * will not be.
 *
 * And the bands are chosen per run. A run with no power meter gets four bands
 * that share the height, not five with an empty one captioned "Power".
 *
 * ## Selection
 *
 * Dragging across the chart recomputes every header figure for that range. The
 * whole run is simply the range 0..n-1, so there is one code path rather than
 * two that could drift apart.
 */

import * as React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  AXIS_KM_Y, AXIS_TIME_Y, BAND_BOTTOM, BAND_TOP, VIEW, X0, X1,
  bandAt, distanceTicks, layoutBands, timeTicks,
  type Band, type BandRange,
  targetBand,
} from "@/lib/activity/chartLayout";
import { fastestSegment, readableSegments, summarise, type RangeSummary, type Segment } from "@/lib/activity/metrics";
import { paceAxisFor, type ChartStreams } from "@/lib/activity/resample";
import { DataNote } from "@/components/activities/DataNote";
import type { Provenance } from "@/lib/activity/provenance";
import { zoneFor } from "@/lib/activity/zones";
import { AD_COPY, buildStreams, fmt, fmtLong } from "@/lib/screens/activityDetail";
import { formatPace } from "@/lib/format/pace";
import type { Comparison } from "@/lib/activity/plannedVsActual";
import type { ActivityNote } from "@/lib/activity/buildActivityNote";
import { Avatar } from "@/components/ui/Avatar";

const copy = AD_COPY;
const DASH = "—";

export interface ActivityDetailData {
  id: string;
  movingS: number;
  dateLabel: string;
  fullDate: string;
  clock: string;
  runType: string;
  athlete: { name: string; initials: string; avatarUrl: string | null; avatarPosition: string };
  summary: RangeSummary;
  segments: Segment[];
  fastestIndex: number;
  driftOnsetM: number | null;
  cardiacDriftPct: number | null;
  lthr: number | null;
  /** how that threshold was arrived at — see the note under the split strip */
  lthrBasis?: "stated" | "observed" | "formula" | null;
  hrMax: number | null;
  bestEfforts: Record<string, number> | null;
  calories: number | null;
  streams: ChartStreams | null;
  /** where this run came from, and what it is missing — see DataNote */
  provenance?: Provenance;
  /** the chart was rebuilt from the stored pace summary, not a real stream */
  coarseChart?: boolean;
  comparison: Comparison | null;
  note: ActivityNote | null;
}

/* ------------------------------------------------------------------ */

export function ActivityDetailView({
  coachView = false,
  data,
}: {
  coachView?: boolean;
  data?: ActivityDetailData;
}) {
  const streams = data?.streams ?? (data ? null : buildStreams());
  /*
   * The chart was rebuilt from the stored pace summary, so it draws the run
   * honestly at about forty points — but a range dragged across it would
   * report a distance and a time that were interpolated rather than measured.
   * Reading is offered; measuring is not.
   */
  const coarse = data?.coarseChart ?? false;

  const [hover, setHover] = useState<{ i: number; y: number } | null>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const dragging = useRef(false);
  const dragStart = useRef(-1);

  /* ---- geometry, recomputed only when the run changes ---- */
  const geo = useMemo(() => (streams ? buildGeometry(streams) : null), [streams]);

  /* ---- the figures on show: the selection when there is one ---- */
  const selected = sel && streams && !coarse ? summarise(streams, sel.a, sel.b, data?.movingS) : null;
  /*
   * The header reports the run. Always.
   *
   * It used to report `selected ?? summary`, so dragging a range across the
   * chart quietly rewrote every figure above it — and a reader glancing at
   * "5:12/km" had no way to tell whether that was the run or the eight hundred
   * metres they happened to be holding. The summary of a run should not depend
   * on where the mouse is.
   *
   * The selection still reports, in its own row beneath the chart, where it is
   * unmistakably about the selection.
   */
  const shown = data?.summary ?? (streams && !coarse ? summarise(streams) : null);

  // The reference run arrives without splits, so it derives its own — the same
  // function the server uses, not a second copy that could disagree.
  const derived = useMemo(
    () => (data || !streams ? null : readableSegments(streams)),
    [data, streams],
  );
  const segments = data?.segments ?? derived ?? [];
  const fastest = data?.fastestIndex ?? (derived ? fastestSegment(derived) : -1);

  /* ---- pointer handling ---- */
  const indexAt = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!geo) return -1;
      const rect = e.currentTarget.getBoundingClientRect();
      const vx = ((e.clientX - rect.left) / rect.width) * VIEW.W;
      const frac = (vx - X0) / (X1 - X0);
      const target = Math.max(0, Math.min(1, frac)) * geo.totalM;
      // binary search the cumulative distance
      let lo = 0;
      let hi = geo.n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (geo.rel[mid] < target) lo = mid;
        else hi = mid;
      }
      return lo;
    },
    [geo],
  );

  const yAt = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return ((e.clientY - rect.top) / rect.height) * VIEW.H;
  };

  const onDown = (e: React.MouseEvent<SVGSVGElement>) => {
    dragging.current = true;
    dragStart.current = indexAt(e);
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const i = indexAt(e);
    if (i < 0) return;
    setHover({ i, y: yAt(e) });
    if (dragging.current && dragStart.current >= 0) {
      setSel({ a: Math.min(dragStart.current, i), b: Math.max(dragStart.current, i) });
    }
  };

  const onUp = (e: React.MouseEvent<SVGSVGElement>) => {
    const i = indexAt(e);
    dragging.current = false;
    // A click, not a drag: clear rather than select a single sample.
    if (Math.abs(i - dragStart.current) <= 2) setSel(null);
    dragStart.current = -1;
  };

  const onLeave = () => {
    setHover(null);
    dragging.current = false;
  };

  /* ---- header ---- */
  const runTitle = data ? `${data.dateLabel} · ${(data.summary.distanceM / 1000).toFixed(1)} km` : "Reference run";

  return (
    <div style={{
      maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px",
      display: "flex", flexDirection: "column", gap: "12px",
    }}>
      {coachView ? (
        <div style={{
          display: "flex", alignItems: "center", gap: "14px", padding: "10px 16px",
          border: "1px solid var(--color-accent-soft)", background: "var(--color-accent-soft)",
          borderRadius: "var(--radius-control)",
        }}>
          <span className="tag" style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}>
            {copy.coachViewTag}
          </span>
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--color-ink)", flex: 1 }}>
            {copy.coachViewMsg}
          </p>
          <a className="btn btn-secondary" href="/coach" style={{ padding: "6px 12px", fontSize: "12px" }}>
            {copy.coachBack}
          </a>
        </div>
      ) : null}

      <Nav runTitle={runTitle} />

      <HeaderCard
        data={data}
        shown={shown}
        calories={data?.calories ?? null}
        drift={data?.cardiacDriftPct ?? null}
        selection={selected ? sel : null}
        title={runTitle}
      />

      <section className="card" style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{copy.chartTitle}</h2>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--color-faint)" }}>{copy.chartHint}</p>
        </div>

        {segments.length > 0 && geo ? (
          <>
            <SegmentStrip segments={segments} fastest={fastest} lthr={data?.lthr ?? null} totalM={geo.totalM} />
            {data?.lthrBasis === "formula" ? (
              <p className="num" style={{ margin: "6px 0 0", fontSize: "10.5px", color: "var(--color-faint)" }}>
                Zone labels are based on a threshold estimated from your age, not measured. Add
                your lactate threshold heart rate in Settings to make them yours.
              </p>
            ) : null}
          </>
        ) : null}

        {geo ? (
          <Chart
            geo={geo}
            hover={hover}
            sel={sel}
            fastestSeg={fastest >= 0 ? segments[fastest] : null}
            driftOnsetM={data?.driftOnsetM ?? null}
            plannedPaceSec={data?.comparison?.plannedPaceSec ?? null}
            plannedType={data?.comparison?.workoutType ?? null}
            onDown={onDown} onMove={onMove} onUp={onUp} onLeave={onLeave}
          />
        ) : data?.provenance ? null : (
          <p style={{ margin: "24px 0", textAlign: "center", fontSize: "12.5px", color: "var(--color-faint)" }}>
            {copy.noStream}
          </p>
        )}

        {/*
            What the chart above is made of — or, with no chart, why there
            isn't one. One treatment for every route a run comes in by, so an
            absence reads as part of the product rather than as a failure.
        */}
        {data?.provenance ? (
          <DataNote provenance={data.provenance} centred={!geo} />
        ) : null}

        {selected && sel ? (
          <div
            style={{
              marginBlockStart: "10px",
              padding: "10px 14px",
              borderRadius: "var(--radius-control)",
              background: "var(--color-accent-soft)",
              boxShadow: "inset 0 0 0 1px var(--color-accent)",
              display: "flex",
              alignItems: "center",
              gap: "22px",
              flexWrap: "wrap",
            }}
          >
            <span
              className="num"
              style={{
                fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase",
                color: "var(--color-accent)", whiteSpace: "nowrap",
              }}
            >
              {copy.selLabel}
            </span>
            {[
              { k: copy.kDist, v: (selected.distanceM / 1000).toFixed(2), u: "km" },
              { k: copy.kTime, v: fmtLong(selected.durationS), u: "" },
              { k: copy.kPace, v: selected.paceSec ? formatPace(selected.paceSec) : DASH, u: "/km" },
              { k: copy.kAvgHr, v: selected.avgHr ? String(selected.avgHr) : DASH, u: "bpm" },
              { k: copy.kClimb, v: selected.climbM !== null ? String(selected.climbM) : DASH, u: "m" },
            ].map((f) => (
              <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                <span
                  className="num"
                  style={{ fontSize: "9px", letterSpacing: ".07em", textTransform: "uppercase", color: "var(--color-faint)" }}
                >
                  {f.k}
                </span>
                <span className="num" style={{ fontSize: "13.5px", fontWeight: 500, whiteSpace: "nowrap" }}>
                  {f.v}
                  {f.u ? <span style={{ fontSize: "10px", color: "var(--color-faint)" }}> {f.u}</span> : null}
                </span>
              </div>
            ))}
            <button
              className="btn btn-secondary" type="button" onClick={onLeave}
              style={{ marginInlineStart: "auto", padding: "4px 10px", fontSize: "11px" }}
            >
              {copy.clearSel}
            </button>
          </div>
        ) : null}
      </section>

      {data?.comparison ? <PlannedVsActual comparison={data.comparison} /> : null}

      <section className="card" style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
            {copy.aiTag}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.6, textWrap: "pretty" }}>
          {data?.note?.text || copy.noNote}
        </p>
        {/*
          "Show reasoning" used to sit here with no handler and no panel behind
          it — there is no reasoning view on this screen to open. A button that
          answers nothing when pressed reads as broken, not as unfinished. The
          dashboard has the real one, next to the narrative it explains.
        */}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

interface Geometry {
  n: number;
  totalM: number;
  /** distance from the start, so a stream that does not begin at zero still maps */
  rel: number[];
  s: ChartStreams;
  bands: Band[];
  band: Record<string, Band | undefined>;
  x: (m: number) => number;
  X: (i: number) => number;
  paths: { id: string; line: string; area: string; color: string }[];
  kmTicks: ReturnType<typeof distanceTicks>;
  timeRow: ReturnType<typeof timeTicks>;
  paceAxis: { min: number; max: number };
}

function buildGeometry(s: ChartStreams): Geometry {
  const rel = s.dist.map((d) => d - s.dist[0]);
  const totalM = rel[rel.length - 1] || 1;

  const x = (m: number) => X0 + (m / totalM) * (X1 - X0);
  const X = (i: number) => x(rel[i]);

  const paceAxis = paceAxisFor(s.vel, { min: 240, max: 392 });
  const finite = (xs: number[]) => xs.filter((v) => Number.isFinite(v) && v > 0);

  const hrs = finite(s.hr);
  const cads = finite(s.cad);
  const pows = finite(s.pow);
  const alts = s.alt.filter(Number.isFinite);

  const pad = (lo: number, hi: number, by: number) => ({
    lo: lo - by,
    hi: hi + by,
  });

  const ranges: BandRange[] = [
    { id: "pace", lo: paceAxis.min, hi: paceAxis.max, inverted: true },
  ];
  if (s.hasPower && pows.length) {
    ranges.push({ id: "power", lo: 0, hi: Math.max(...pows) * 1.05 });
  }
  if (hrs.length) {
    const r = pad(Math.min(...hrs), Math.max(...hrs), 5);
    ranges.push({ id: "hr", ...r });
  }
  if (s.hasCadence && cads.length) {
    const r = pad(Math.min(...cads), Math.max(...cads), 3);
    ranges.push({ id: "cadence", ...r });
  }
  if (alts.length) {
    const lo = Math.min(...alts);
    const hi = Math.max(...alts);
    ranges.push({ id: "altitude", lo, hi: hi - lo < 5 ? lo + 5 : hi });
  }

  const bands = layoutBands(ranges);
  const band: Record<string, Band | undefined> = {};
  for (const b of bands) band[b.id] = b;

  const series: Record<string, number[]> = {
    // A stop makes speed zero and pace infinite; the band clamps it to its
    // floor, which is where a stop belongs.
    pace: s.vel.map((v) => (v > 0.1 ? 1000 / v : Number.POSITIVE_INFINITY)),
    power: s.pow,
    hr: s.hr,
    cadence: s.cad,
    altitude: s.alt,
  };

  const paths = bands.map((b) => {
    const values = series[b.id];
    const pts = Array.from({ length: s.n }, (_, i) =>
      `${i ? "L" : "M"}${X(i).toFixed(1)} ${b.y(values[i]).toFixed(1)}`,
    ).join("");
    const area =
      `M${X0} ${b.plotBottom.toFixed(1)}` +
      Array.from({ length: s.n }, (_, i) => `L${X(i).toFixed(1)} ${b.y(values[i]).toFixed(1)}`).join("") +
      `L${X1} ${b.plotBottom.toFixed(1)}Z`;
    return { id: b.id, line: pts, area, color: b.color };
  });

  return {
    n: s.n, totalM, rel, s, bands, band, x, X, paths,
    kmTicks: distanceTicks(totalM, x),
    timeRow: timeTicks(s.time, s.dist, x, fmt),
    paceAxis,
  };
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Nav({ runTitle }: { runTitle?: string }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
        <span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }} />
        <span className="num" style={{ fontWeight: 500, fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span>
      </div>
      {/*
          The page title, on the left, like every other screen. This was the
          one screen without one — you arrived from the list and the header
          told you nothing about which run you were looking at.
      */}
      <div style={{ textAlign: "start", minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: "15px", fontWeight: 600, whiteSpace: "nowrap" }}>{copy.pageTitle}</h1>
        {runTitle ? (<p className="num" style={{ margin: 0, fontSize: "11.5px", color: "var(--color-muted)", whiteSpace: "nowrap" }}>{runTitle}</p>) : null}
      </div>
      <nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}>
        <a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a>
        <a href="/plan" style={{ color: "var(--color-muted)" }}>{copy.navPlan}</a>
        <a href="/activities" style={{ color: "var(--color-ink)" }}>{copy.navActivities}</a>
        <a href="/settings" style={{ color: "var(--color-muted)" }}>{copy.navSettings}</a>
      </nav>
      <div style={{ flex: 1 }} />
      <a href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-muted)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        {copy.back}
      </a>
    </header>
  );
}

const boxed = {
  border: "1px solid var(--color-line)",
  borderRadius: "var(--radius-control)",
} as const;

function MetricCard({
  title, color, icon, rows, columns = 1,
}: {
  title: string;
  color: string;
  icon: React.ReactNode;
  rows: { k: string; v: string; sub?: string; c?: string }[];
  columns?: number;
}) {
  return (
    <div style={{ ...boxed, padding: "8px 12px", display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, minWidth: 0 }}>
      <p style={{
        margin: "0 0 4px", fontSize: "9.5px", letterSpacing: ".07em", textTransform: "uppercase",
        color, display: "flex", alignItems: "center", gap: "5px",
      }}>
        <span style={{
          width: "20px", height: "20px", borderRadius: "6px",
          background: `color-mix(in oklab, ${color} 18%, transparent)`,
          display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none",
        }}>
          {icon}
        </span>
        {title}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: "4px 8px" }}>
        {rows.map((r) => (
          <div key={r.k} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ fontSize: "10.5px", color: "var(--color-muted)" }}>{r.k}</span>
            <span className="num" style={{ fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap", color: r.c ?? "var(--color-ink)" }}>
              {r.v}
              {r.sub ? <span style={{ fontSize: "9.5px", color: "var(--color-faint)" }}> {r.sub}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const IconPace = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </svg>
);
const IconHeart = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);
const IconTraining = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6.5 6.5h11v11h-11z" /><path d="M2 12h4.5M17.5 12H22" />
  </svg>
);

function HeaderCard({
  data, shown, calories, drift, selection, title,
}: {
  data?: ActivityDetailData;
  shown: RangeSummary | null;
  calories: number | null;
  drift: number | null;
  selection: { a: number; b: number } | null;
  title: string;
}) {
  const pct = (v: number | null, of: number | null) =>
    v && of ? `${Math.round((v / of) * 100)}%` : undefined;

  const paceRows = [
    { k: copy.kPace, v: shown?.paceSec ? formatPace(shown.paceSec) : DASH, sub: "/km" },
    { k: copy.kGap, v: shown?.gapSec ? formatPace(shown.gapSec) : DASH, sub: "/km" },
    { k: copy.kSpeed, v: shown?.speedKmh ? shown.speedKmh.toFixed(1) : DASH, sub: "km/h" },
    { k: copy.kClimb, v: shown && shown.climbM !== null ? String(shown.climbM) : DASH, sub: "m" },
  ];

  const hrRows = [
    { k: copy.kAvgHr, v: shown?.avgHr ? String(shown.avgHr) : DASH, sub: pct(shown?.avgHr ?? null, data?.hrMax ?? null) },
    { k: copy.kMaxHr, v: shown?.maxHr ? String(shown.maxHr) : DASH, sub: pct(shown?.maxHr ?? null, data?.hrMax ?? null) },
  ];

  const driftColor =
    drift === null ? undefined
      : Math.abs(drift) < 5 ? "var(--color-positive)" : "var(--color-caution)";

  const moreRows = [
    { k: copy.kCadence, v: shown?.avgCadence ? String(shown.avgCadence) : DASH, sub: "spm" },
    /*
     * These two are whole-run figures and stay whole-run figures.
     *
     * Cardiac drift is a comparison of a run's two halves — it is not defined
     * for an arbitrary slice — and calories come from the device for the run as
     * a whole. Selecting the first two kilometres of a fifteen-kilometre run
     * used to leave 980 kcal and +7.4% sitting beside a 2.0 km distance, under
     * a caption promising the summary reflected the selection. Dashed while a
     * selection is open, because "not for this range" is the truth.
     */
    { k: copy.kDrift, v: selection ? DASH : drift === null ? DASH : `${drift > 0 ? "+" : ""}${drift.toFixed(1)}%`, c: selection ? undefined : driftColor },
    { k: copy.kCalories, v: selection ? DASH : calories ? String(calories) : DASH, sub: "kcal" },
    { k: "Power", v: shown?.avgPower ? String(shown.avgPower) : DASH, sub: "W" },
  ];

  return (
    <section className="card" style={{ padding: "16px 18px" }}>
      <div className="head-grid" style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "1 1 250px", minWidth: 0 }}>
          <div style={{ ...boxed, display: "flex", alignItems: "center", gap: "10px", padding: "6px 12px", flex: 1 }}>
            {/*
              One Avatar, like everywhere else. This used to be a bare <img>
              with no error handler beside a <span> of initials with no circle
              around it — so an athlete with no photo saw their own name sitting
              in the layout as loose text rather than as a portrait slot.
            */}
            <Avatar
              src={data?.athlete.avatarUrl ?? null}
              name={data?.athlete.name}
              size={40}
              zoomable
            />
            <div style={{ minWidth: 0, paddingInlineStart: "4px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)", alignSelf: "start" }}>
                {data?.runType ?? "Run"}
              </span>
              <div style={{ whiteSpace: "nowrap" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 600 }}>{data?.fullDate ?? title}</span>
                {data ? <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}> · {data.clock}</span> : null}
              </div>
            </div>
          </div>
          <div style={{ ...boxed, padding: "6px 12px", display: "flex", alignItems: "baseline", justifyContent: "center", gap: "12px" }}>
            <span className="num" style={{ fontSize: "18px", fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap" }}>
              {shown ? (shown.distanceM / 1000).toFixed(2) : DASH}
              <span style={{ fontSize: "10.5px", color: "var(--color-faint)" }}> km</span>
            </span>
            <span className="num" style={{ fontSize: "12px", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
              {shown ? fmtLong(shown.durationS) : DASH}
            </span>
            {/* Standing still is stated rather than folded into the total. The
                chart draws the whole recording, so the header has to account
                for the difference or the two will appear to disagree. */}
            {shown && shown.stoppedS >= 30 ? (
              <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)", whiteSpace: "nowrap" }}>
                +{fmtLong(shown.stoppedS)} stopped
              </span>
            ) : null}
            {selection ? (
              <span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>range</span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flex: "99 1 520px", minWidth: 0 }}>
          <MetricCard title={copy.hPace} color="var(--color-pace)" icon={IconPace} rows={paceRows} columns={2} />
          <MetricCard title={copy.hHr} color="var(--color-hr)" icon={IconHeart} rows={hrRows} />
          <MetricCard title={copy.hMore} color="var(--color-cad)" icon={IconTraining} rows={moreRows} columns={2} />
        </div>
      </div>
    </section>
  );
}

/**
 * The per-kilometre strip, aligned to the plot area.
 *
 * Column widths are proportional to the distance each segment covered, so a
 * short final kilometre is drawn short and the strip lines up with the chart
 * underneath it rather than merely resembling it.
 */
function SegmentStrip({
  segments, fastest, lthr, totalM,
}: {
  segments: Segment[];
  fastest: number;
  lthr: number | null;
  totalM: number;
}) {
  return (
    <div style={{
      display: "flex", marginBlockStart: "12px",
      paddingInlineStart: `${(X0 / VIEW.W) * 100}%`,
      paddingInlineEnd: `${((VIEW.W - X1) / VIEW.W) * 100}%`,
    }}>
      {segments.map((seg, i) => {
        const best = i === fastest;
        const z = seg.avgHr !== null && lthr ? zoneFor(seg.avgHr, lthr) : null;
        return (
          <div
            key={seg.label}
            style={{
              width: `${(seg.distanceM / totalM) * 100}%`,
              minWidth: 0,
              padding: "6px 2px",
              textAlign: "center",
              background: best ? "var(--color-accent-soft)" : "transparent",
              borderBlockStart: `2px solid ${best ? "var(--color-accent)" : "var(--color-line-strong)"}`,
              borderInlineEnd: i === segments.length - 1 ? "none" : "1px solid var(--color-line)",
            }}
          >
            <p className="num" style={{
              margin: 0, fontSize: "11.5px", fontWeight: 600,
              color: best ? "var(--color-accent)" : "var(--color-ink)",
            }}>
              {fmt(seg.paceSec)}
            </p>
            <p className="num" style={{ margin: "1px 0 0", fontSize: "9.5px", color: "var(--color-faint)" }}>
              {fmt(seg.durationS)}
            </p>
            <p className="num" style={{ margin: "1px 0 0", fontSize: "9.5px", color: "var(--color-hr)" }}>
              {seg.avgHr ?? DASH}
              {seg.avgHr !== null ? "bpm" : ""}
            </p>
            {z ? (
              <p className="num" style={{ margin: "1px 0 0", fontSize: "9px", color: z.zone.color }}>
                {z.zone.id} · {z.pct}%
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Chart({
  geo, hover, sel, fastestSeg, driftOnsetM, plannedPaceSec, plannedType,
  onDown, onMove, onUp, onLeave,
}: {
  geo: Geometry;
  hover: { i: number; y: number } | null;
  sel: { a: number; b: number } | null;
  fastestSeg: Segment | null;
  driftOnsetM: number | null;
  plannedPaceSec: number | null;
  plannedType: string | null;
  onDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onUp: (e: React.MouseEvent<SVGSVGElement>) => void;
  onLeave: () => void;
}) {
  const { s, bands, band, X, x, paths, kmTicks, timeRow } = geo;
  const pace = band.pace;
  const target = pace ? targetBand(pace, plannedPaceSec, plannedType) : null;

  const hovered = hover && hover.i >= 0 && hover.i < geo.n ? hover : null;
  const hx = hovered ? X(hovered.i) : 0;
  const readout = hovered ? bandAt(bands, hovered.y) : null;

  return (
    <div style={{ position: "relative", marginBlockStart: "6px" }}>
      <svg
        viewBox={`0 0 ${VIEW.W} ${VIEW.H}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair", userSelect: "none" }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onLeave}
      >
        {/* alternating band backgrounds, so five lanes read as five */}
        {bands.map((b, i) => (
          <rect
            key={`bg-${b.id}`}
            x={X0} y={b.top} width={X1 - X0} height={b.bottom - b.top}
            fill={i % 2 ? "var(--color-elevated)" : "transparent"} opacity="0.45"
          />
        ))}

        {/* vertical gridlines, shared by every band */}
        {kmTicks.map((t) => (
          <line
            key={`g-${t.x}`} x1={t.x} x2={t.x} y1={BAND_TOP} y2={BAND_BOTTOM}
            stroke="var(--color-line)" strokeWidth={t.major ? 0.9 : 0.5}
          />
        ))}

        {/*
            The planned pace window.

            `targetBand` decides whether there is anything honest to draw: it
            declines for an interval session, where one band across warm-up,
            reps and floats would report failure on a session run exactly as
            written, and it reports when the whole run sat outside the target
            so an edge marker can be drawn instead of a one-pixel sliver.
        */}
        {pace && target ? (
          <>
            <rect
              x={X0} y={target.y} width={X1 - X0} height={target.height}
              fill="var(--color-accent)" opacity={target.outside ? 0.5 : 0.08}
            />
            {target.outside ? (
              <text
                x={X0 + 6}
                y={target.outside === "faster" ? target.y + 12 : target.y - 5}
                fill="var(--color-accent)" fontSize="8.5" fontFamily="var(--font-mono)"
                opacity="0.8"
              >
                {target.outside === "faster" ? copy.targetAbove : copy.targetBelow}
              </text>
            ) : (
              <line
                x1={X0} x2={X1}
                y1={pace.y(plannedPaceSec as number)} y2={pace.y(plannedPaceSec as number)}
                stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="6 4" opacity="0.55"
              />
            )}
          </>
        ) : null}

        {/* fastest kilometre */}
        {pace && fastestSeg ? (
          <>
            <rect
              x={X(fastestSeg.from)} y={pace.top}
              width={Math.max(2, X(fastestSeg.to) - X(fastestSeg.from))}
              height={pace.bottom - pace.top}
              fill="var(--color-pace)" opacity="0.13"
            />
            <text
              x={X(fastestSeg.from) + 4} y={pace.top + 10}
              fill="var(--color-pace)" fontSize="8.5" fontFamily="var(--font-mono)" opacity="0.9"
            >
              {copy.bestLbl}
            </text>
          </>
        ) : null}

        {/* where cardiac drift began */}
        {driftOnsetM !== null ? (
          <>
            <line
              x1={x(driftOnsetM)} x2={x(driftOnsetM)} y1={BAND_TOP} y2={BAND_BOTTOM}
              stroke="var(--color-caution)" strokeWidth="1.2" strokeDasharray="5 4" opacity="0.85"
            />
            <text
              x={x(driftOnsetM) + 4} y={BAND_TOP + 10}
              fill="var(--color-caution)" fontSize="8.5" fontFamily="var(--font-mono)"
            >
              {copy.driftLbl}
            </text>
          </>
        ) : null}

        {/* the selection */}
        {sel ? (
          <rect
            x={Math.min(X(sel.a), X(sel.b))} y={BAND_TOP}
            width={Math.max(1, Math.abs(X(sel.b) - X(sel.a)))} height={BAND_BOTTOM - BAND_TOP}
            fill="var(--color-accent)" opacity="0.14"
          />
        ) : null}

        {/* the series */}
        {paths.map((p) => (
          <g key={p.id}>
            <path d={p.area} fill={p.color} opacity="0.16" />
            <path d={p.line} fill="none" stroke={p.color} strokeWidth="1.4" />
          </g>
        ))}

        {/* per-band titles and three y ticks each */}
        {bands.map((b) => (
          <g key={`lbl-${b.id}`}>
            {/* Inside the band, not beside it. The gutter has to hold three
                axis figures; a title out there collides with them. */}
            <text
              x={X0 + 6} y={b.top + 12} fill={b.color} fontSize="9.5"
              fontFamily="var(--font-mono)" opacity="0.75"
            >
              {b.title}
            </text>
            {/* Top and middle for every band; the floor only on the last one.
                Adjacent bands sit a few pixels apart, so one band's bottom
                figure and the next one's top figure land on the same line and
                overprint each other. */}
            {(b === bands[bands.length - 1] ? [0, 0.5, 1] : [0, 0.5]).map((f) => {
              const y = b.plotTop + f * (b.plotBottom - b.plotTop);
              const value = b.valueAt(y);
              return (
                <text
                  key={f} x={X0 - 5} y={y} textAnchor="end" dominantBaseline="middle"
                  fill={f === 0.5 ? b.color : "var(--color-faint)"} fontSize={f === 0.5 ? "10" : "8.5"}
                  fontFamily="var(--font-mono)"
                >
                  {formatBandValue(b, value)}
                </text>
              );
            })}
          </g>
        ))}

        {/* the two x-axis rows */}
        {kmTicks.map((t) => (
          <text key={`k-${t.x}`} x={t.x} y={AXIS_KM_Y} textAnchor="middle" fill="var(--color-faint)" fontSize="9" fontFamily="var(--font-mono)">
            {t.label}
          </text>
        ))}
        <text x={X1 + 8} y={AXIS_KM_Y} fill="var(--color-faint)" fontSize="8.5" fontFamily="var(--font-mono)">{copy.axKm}</text>
        {timeRow.map((t) => (
          <text key={`t-${t.x}`} x={t.x} y={AXIS_TIME_Y} textAnchor="middle" fill="var(--color-faint)" fontSize="9" fontFamily="var(--font-mono)">
            {t.label}
          </text>
        ))}
        <text x={X1 + 8} y={AXIS_TIME_Y} fill="var(--color-faint)" fontSize="8.5" fontFamily="var(--font-mono)">{copy.axTime}</text>

        {/* crosshair */}
        {hovered ? (
          <g>
            <line x1={hx} x2={hx} y1={BAND_TOP} y2={BAND_BOTTOM} stroke="var(--color-faint)" strokeWidth="1" strokeDasharray="3 3" />
            {readout ? (
              <line x1={X0} x2={X1} y1={hovered.y} y2={hovered.y} stroke="var(--color-faint)" strokeWidth="0.7" strokeDasharray="2 4" opacity="0.7" />
            ) : null}
            {bands.map((b) => {
              const v = valueOf(s, b.id, hovered.i);
              return <circle key={`d-${b.id}`} cx={hx} cy={b.y(v)} r="2.6" fill={b.color} />;
            })}
            {readout ? (
              <>
                <rect x={X0 - 46} y={hovered.y - 8} width="44" height="16" rx="3" fill="var(--color-elevated)" stroke={readout.color} strokeWidth="0.8" />
                <text x={X0 - 24} y={hovered.y} textAnchor="middle" dominantBaseline="middle" fill={readout.color} fontSize="9" fontFamily="var(--font-mono)">
                  {formatBandValue(readout, readout.valueAt(hovered.y))}
                </text>
              </>
            ) : null}
            <rect x={Math.min(X1 - 54, Math.max(X0, hx - 27))} y={AXIS_KM_Y - 11} width="54" height="15" rx="3" fill="var(--color-accent)" />
            <text
              x={Math.min(X1 - 27, Math.max(X0 + 27, hx))} y={AXIS_KM_Y - 3} textAnchor="middle"
              fill="var(--color-accent-ink)" fontSize="9" fontFamily="var(--font-mono)"
            >
              {(geo.rel[hovered.i] / 1000).toFixed(2)} km
            </text>
          </g>
        ) : null}
      </svg>

      {hovered ? <Tooltip geo={geo} i={hovered.i} hx={hx} /> : null}
    </div>
  );
}

function Tooltip({ geo, i, hx }: { geo: Geometry; i: number; hx: number }) {
  const { s, bands } = geo;
  const rows = bands.map((b) => ({
    label: b.title,
    color: b.color,
    text: formatBandValue(b, valueOf(s, b.id, i)),
  }));

  return (
    <div
      className="num"
      style={{
        position: "absolute", top: "8px",
        left: `${(hx / VIEW.W) * 100}%`,
        transform: hx > VIEW.W * 0.72 ? "translateX(-112%)" : "translateX(14px)",
        background: "var(--color-elevated)", border: "1px solid var(--color-line-strong)",
        borderRadius: "var(--radius-control)", padding: "8px 12px", fontSize: "11px",
        pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,.5)",
      }}
    >
      <div style={{ color: "var(--color-faint)", marginBlockEnd: "3px" }}>
        {(geo.rel[i] / 1000).toFixed(2)} km · {fmtLong(s.time[i] - s.time[0])}
      </div>
      {rows.map((r) => (
        <div key={r.label} style={{ color: r.color }}>
          {r.label} {r.text}
        </div>
      ))}
    </div>
  );
}

function PlannedVsActual({ comparison }: { comparison: Comparison }) {
  return (
    <section className="card" style={{
      padding: "16px 26px", display: "grid", gridTemplateColumns: "auto 1fr auto",
      gap: "24px", alignItems: "center",
    }}>
      <div>
        <p style={{ margin: 0, fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-faint)" }}>
          Planned vs actual
        </p>
        <p className="num" style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--color-muted)" }}>{comparison.plannedLine}</p>
        <p className="num" style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--color-ink)" }}>{comparison.actualLine}</p>
      </div>
      <div style={{ height: "100%", borderInlineStart: "1px solid var(--color-line)" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
        <span className="tag" style={{ background: "var(--color-elevated)", color: comparison.color }}>{comparison.label}</span>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)", maxWidth: "340px", textAlign: "end", textWrap: "pretty" }}>
          {comparison.note}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function valueOf(s: ChartStreams, id: string, i: number): number {
  switch (id) {
    case "pace": return s.vel[i] > 0.1 ? 1000 / s.vel[i] : Number.POSITIVE_INFINITY;
    case "power": return s.pow[i];
    case "hr": return s.hr[i];
    case "cadence": return s.cad[i];
    default: return s.alt[i];
  }
}

/** Each band speaks its own units, and the reading has to say which. */
function formatBandValue(b: Band, v: number): string {
  if (!Number.isFinite(v)) return DASH;
  switch (b.id) {
    case "pace": return v > 1800 ? DASH : fmt(v);
    case "power": return `${Math.round(v)}W`;
    case "hr": return `${Math.round(v)}bpm`;
    case "cadence": return `${Math.round(v)}spm`;
    default: return `${Math.round(v)}m`;
  }
}

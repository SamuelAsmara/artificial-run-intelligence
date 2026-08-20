"use client";

/**
 * Activities — a 1:1 port of
 * design_handoff_ari_athlete_app/ARI Activities.dc.html.
 * Markup converted mechanically; do not restyle by hand.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import { ACT_COPY, buildActivities, fmtPace, type Act, type PacePoint } from "@/lib/screens/activities";

export function ActivitiesView({
  data,
}: {
  data?: {
    acts: Act[];
    weekKm: number[];
    wp: PacePoint[];
    pb10k?: string | null;
    avgHr?: number | null;
  };
} = {}) {
  // Real runs when the athlete has them; the reference set otherwise.
  const { acts, weekKm, wp } = useMemo(
    () => data ?? buildActivities(),
    [data],
  );
  const [filter, setFilter] = useState("All");

  const copy = ACT_COPY;
  const typeMap: Record<string, string | null> = {
    All: null, Easy: "easy", Tempo: "tempo", Intervals: "int", Long: "long",
  };
  const dot: Record<string, string> = {
    easy: "var(--color-positive)", tempo: "var(--color-caution)",
    int: "var(--color-accent)", long: "var(--color-atl)",
  };

  const rows = acts
    .filter((a) => !typeMap[filter] || a.type === typeMap[filter])
    .map((a) => ({ ...a, dot: dot[a.type] }));

  const filters = ["All", "Easy", "Tempo", "Intervals", "Long"].map((n) => ({
    name: n,
    pick: () => setFilter(n),
    bg: filter === n ? "var(--color-accent)" : "transparent",
    color: filter === n ? "var(--color-accent-ink)" : "var(--color-muted)",
    border: filter === n ? "transparent" : "var(--color-line-strong)",
  }));

  const totalKm = acts.reduce((s, a) => s + a.kmN, 0);
  const totalRuns = acts.length;
  // Distance-weighted, and only meaningful if some distance was covered — a
  // list of manually-entered runs with no distance would divide by zero and
  // print "NaN:NaN", because fmtPace has no finite guard.
  const avgPace = totalKm > 0 ? acts.reduce((s, a) => s + a.paceSec * a.kmN, 0) / totalKm : null;
  /*
   * Heart rate is computed on the server now, over the runs that have one.
   * It used to be `+a.hr` over every row — and `a.hr` is the *display* string,
   * an em dash when there is no strap, so `+"—"` is NaN and one strapless run
   * made the tile read "NaN bpm".
   */
  const avgHr = data ? (data.avgHr ?? null) : Math.round(
    acts.reduce((s, a) => s + Number(a.hr), 0) / (totalRuns || 1),
  );

  const stats = [
    { v: String(totalRuns), unit: "runs", name: "Completed · 4 weeks", divider: "transparent" },
    { v: Math.round(totalKm) + "", unit: "km", name: "Total distance", divider: "var(--color-line)" },
    { v: avgPace === null ? "\u2014" : fmtPace(avgPace), unit: "/km", name: "Average pace", divider: "var(--color-line)" },
    { v: avgHr === null || !Number.isFinite(avgHr) ? "\u2014" : String(avgHr), unit: "bpm", name: "Average heart rate", divider: "var(--color-line)" },
    // The athlete's own 10 km best, from the same source the dashboard reads.
    // It used to be the string "47:12", which is how one screen came to show a
    // different record from the other.
    { v: data ? (data.pb10k ?? "\u2014") : "47:12", unit: "", name: "10K personal best", divider: "var(--color-line)" },
  ];

  /*
   * `Math.max()` of four zeroes is 0, and `k / 0` is NaN — which reached the
   * DOM as `height: NaNpx`, an invalid declaration the browser drops, so all
   * four bars simply vanished and left an empty 90px box. An athlete with
   * imported history who has not run for five weeks saw exactly that.
   */
  const maxW = Math.max(...weekKm, 1);
  const volBars = weekKm.map((k, i) => ({
    km: k,
    h: Math.max(6, Math.round((k / maxW) * 62)),
    op: i === 3 ? "0.45" : "1",
    title: "Week " + (i + 1) + " · " + k + " km" + (i === 3 ? " so far" : ""),
  }));
  const volLabels = [{ t: "W1" }, { t: "W2" }, { t: "W3" }, { t: "W4 · so far" }];

  /*
   * Pace trend — lower is faster, so the y axis is not inverted here: the chart
   * plots seconds/km directly and the caption says "faster ↑".
   *
   * The range used to be the constants 320 and 344 — the prototype athlete's
   * easy-run band. A real athlete running 4:55/km sits at 295, well off the top
   * of a 320–344 window, so every point clipped to the edge and the line came
   * out as a jagged block. The range is now read from the data with a little
   * padding, and clamped so one bad point cannot flatten the rest.
   */
  /*
   * Two or more weeks, or no chart.
   *
   * With fewer the code used to draw a flat line at the median pace of *all*
   * runs and label it "Easy-run pace trend · weekly average" — a number the
   * athlete never ran, presented as a trend. A sentence saying there is not
   * enough history yet is worth more and claims nothing.
   */
  const hasPaceTrend = wp.length >= 2;
  const values = wp.map((p) => p.v);
  const pLo = hasPaceTrend ? Math.min(...values) : 0;
  const pHi = hasPaceTrend ? Math.max(...values) : 0;
  const pPad = Math.max(6, (pHi - pLo) * 0.25);
  const pMin = Math.floor((pLo - pPad) / 5) * 5;
  const pMax = Math.ceil((pHi + pPad) / 5) * 5;
  const X0 = 34, X1 = 536, Y0 = 10, Y1 = 82;
  // Positioned by week, not by index — see PacePoint.
  const px = (t: number) => X0 + Math.max(0, Math.min(1, t)) * (X1 - X0);
  const py = (v: number) => {
    const t = (v - pMin) / (pMax - pMin || 1);
    return Y0 + Math.max(0, Math.min(1, t)) * (Y1 - Y0);
  };
  const pacePath = wp
    .map((p, i) => (i ? "L" : "M") + px(p.t).toFixed(1) + " " + py(p.v).toFixed(1))
    .join("");
  const firstX = wp.length ? px(wp[0].t).toFixed(1) : String(X0);
  const lastX = wp.length ? px(wp[wp.length - 1].t).toFixed(1) : String(X1);
  const paceArea = pacePath + "L" + lastX + " " + Y1 + "L" + firstX + " " + Y1 + "Z";
  const paceDots = wp.map((p) => ({ x: px(p.t).toFixed(1), y: py(p.v).toFixed(1) }));
  // Two gridlines inside the range we actually drew, rather than 325 and 340.
  const paceGrid = [pMin + (pMax - pMin) / 3, pMin + ((pMax - pMin) * 2) / 3].map((v) => ({
    y: py(v).toFixed(1), ty: (py(v) + 3).toFixed(1), label: fmtPace(Math.round(v)),
  }));

  return (
<div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }}></span><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}><a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a><a href="/activities" style={{ color: "var(--color-ink)" }}>{copy.navActivities}</a><a href="/plan" style={{ color: "var(--color-muted)" }}>{copy.navPlan}</a><a href="/settings" style={{ color: "var(--color-muted)" }}>{copy.navSettings}</a></nav><div style={{ flex: "1" }}></div><div style={{ textAlign: "end" }}><h1 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{copy.title}</h1><p style={{ margin: "0", fontSize: "11.5px", color: "var(--color-muted)" }}>{copy.subtitle}</p></div></header><section className="card stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "16px", padding: "16px 22px" }}>{stats.map((s, _i1) => (<React.Fragment key={_i1}><div style={{ borderInlineStart: `1px solid ${s.divider}`, paddingInlineStart: "16px" }}><p className="num" style={{ margin: "0", fontSize: "20px", fontWeight: "500" }}>{s.v}<span style={{ fontSize: "11px", color: "var(--color-faint)" }}> {s.unit}</span></p><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{s.name}</p></div></React.Fragment>))}</section><section className="grid2"><div className="card" style={{ padding: "16px 20px" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.volTitle}</h2><div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "90px", marginBlockStart: "14px" }}>{volBars.map((v, _i2) => (<React.Fragment key={_i2}><div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}><span className="num" style={{ fontSize: "10px", color: "var(--color-muted)" }}>{v.km}</span><div title={v.title} style={{ width: "100%", height: `${v.h}px`, background: "var(--color-accent)", opacity: v.op, borderRadius: "3px 3px 0 0" }}></div></div></React.Fragment>))}</div><div style={{ display: "flex", gap: "6px", marginBlockStart: "6px" }}>{volLabels.map((l, _i3) => (<React.Fragment key={_i3}><span className="num" style={{ flex: "1", textAlign: "center", fontSize: "9.5px", color: "var(--color-faint)" }}>{l.t}</span></React.Fragment>))}</div></div><div className="card" style={{ padding: "16px 20px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.paceTitle}</h2><span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{copy.paceSub}</span></div>{(!hasPaceTrend) ? (<p style={{ margin: "14px 0 0", fontSize: "12px", color: "var(--color-muted)", lineHeight: "1.6" }}>{copy.paceEmpty}</p>) : (<svg viewBox="0 0 540 96" style={{ width: "100%", height: "auto", marginBlockStart: "12px" }}>{paceGrid.map((g, _i4) => (<React.Fragment key={_i4}><g><line x1="34" x2="536" y1={g.y} y2={g.y} stroke="var(--color-line)" strokeWidth="1" /><text x="28" y={g.ty} fill="var(--color-faint)" fontSize="8.5" fontFamily="IBM Plex Mono" textAnchor="end">{g.label}</text></g></React.Fragment>))}<path d={paceArea} fill="var(--color-accent)" opacity="0.10" /><path d={pacePath} fill="none" stroke="var(--color-accent)" strokeWidth="2" />{paceDots.map((d, _i5) => (<React.Fragment key={_i5}><circle cx={d.x} cy={d.y} r="3" fill="var(--color-accent)" /></React.Fragment>))}</svg>)}</div></section><section className="card" style={{ padding: "16px 20px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.histTitle}</h2><div style={{ display: "flex", gap: "6px" }}>{filters.map((f, _i6) => (<React.Fragment key={_i6}><button className="tag" type="button" onClick={f.pick} style={{ cursor: "pointer", border: `1px solid ${f.border}`, background: f.bg, color: f.color }}>{f.name}</button></React.Fragment>))}</div></div><div className="num actrow" style={{ display: "grid", gridTemplateColumns: "64px 1.2fr 1fr 1fr 1fr 1fr 88px", gap: "10px", padding: "10px 12px 6px", borderBlockEnd: "1px solid var(--color-line)", marginBlockStart: "8px" }}><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.hDate}</span><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.hType}</span><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hDist}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hTime}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hPace}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hHr}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hSpark}</span></div><div style={{ display: "flex", flexDirection: "column" }}>{rows.map((a, _i7) => (<React.Fragment key={_i7}><a className="actrow dc-hover-bg" href={a.id ? `/activities/${a.id}` : "/activities/demo?demo=1"} style={{ display: "grid", gridTemplateColumns: "64px 1.2fr 1fr 1fr 1fr 1fr 88px", gap: "10px", alignItems: "center", padding: "8px 12px", borderRadius: "var(--radius-control)", ...(a.pb ? { boxShadow: "inset 0 0 0 1px var(--color-gold)", background: "var(--color-gold-soft)" } : null) }}><span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{a.date}</span><span style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "7px", height: "7px", borderRadius: "2px", background: a.dot, display: "inline-block" }}></span><span style={{ fontSize: "12.5px", fontWeight: "500" }}>{a.name}</span>{a.pb ? (<span className="num" title={copy.pbTitle} style={{ fontSize: "9px", fontWeight: "600", letterSpacing: ".07em", textTransform: "uppercase", background: "var(--color-gold)", color: "var(--color-canvas)", borderRadius: "var(--radius-pill)", padding: "2px 7px", whiteSpace: "nowrap" }}>{a.pb}</span>) : null}</span><span className="num" style={{ fontSize: "12px", textAlign: "end" }}>{a.km} km</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)", textAlign: "end" }}>{a.time}</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)", textAlign: "end" }}>{a.pace}</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)", textAlign: "end" }}>{a.hr}</span><svg className="hide-m" width="80" height="24" viewBox="0 0 80 24" style={{ justifySelf: "end" }}><path d={a.spark} fill="none" stroke={a.sparkColor} strokeWidth="1.4" /></svg></a></React.Fragment>))}</div></section></div>
  );
}

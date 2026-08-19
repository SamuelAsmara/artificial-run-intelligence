"use client";

/**
 * Activities — a 1:1 port of
 * design_handoff_ari_athlete_app/ARI Activities.dc.html.
 * Markup converted mechanically; do not restyle by hand.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import { ACT_COPY, buildActivities, fmtPace, type Act } from "@/lib/screens/activities";

export function ActivitiesView({ data }: { data?: { acts: Act[]; weekKm: number[]; wp: number[]; pb10k?: string | null } } = {}) {
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
  const avgPace = acts.reduce((s, a) => s + a.paceSec * a.kmN, 0) / totalKm;
  const avgHr = Math.round(acts.reduce((s, a) => s + +a.hr, 0) / totalRuns);

  const stats = [
    { v: String(totalRuns), unit: "runs", name: "Completed · 4 weeks", divider: "transparent" },
    { v: Math.round(totalKm) + "", unit: "km", name: "Total distance", divider: "var(--color-line)" },
    { v: fmtPace(avgPace), unit: "/km", name: "Average pace", divider: "var(--color-line)" },
    { v: String(avgHr), unit: "bpm", name: "Average heart rate", divider: "var(--color-line)" },
    // The athlete's own 10 km best, from the same source the dashboard reads.
    // It used to be the string "47:12", which is how one screen came to show a
    // different record from the other.
    { v: data ? (data.pb10k ?? "\u2014") : "47:12", unit: "", name: "10K personal best", divider: "var(--color-line)" },
  ];

  const maxW = Math.max(...weekKm);
  const volBars = weekKm.map((k, i) => ({
    km: k,
    h: Math.max(6, Math.round((k / maxW) * 62)),
    op: i === 3 ? "0.45" : "1",
    title: "Week " + (i + 1) + " · " + k + " km" + (i === 3 ? " so far" : ""),
  }));
  const volLabels = [{ t: "W1" }, { t: "W2" }, { t: "W3" }, { t: "W4 · so far" }];

  /* pace trend — lower is faster, so the y axis is not inverted here:
     the chart plots seconds/km directly and the caption says "faster ↑". */
  const pMin = 320, pMax = 344, X0 = 34, X1 = 536, Y0 = 10, Y1 = 82;
  const px = (i: number) => X0 + (i / (wp.length - 1)) * (X1 - X0);
  const py = (v: number) => Y0 + ((v - pMin) / (pMax - pMin)) * (Y1 - Y0);
  const pacePath = wp.map((v, i) => (i ? "L" : "M") + px(i).toFixed(1) + " " + py(v).toFixed(1)).join("");
  const paceArea = pacePath + "L" + X1 + " " + Y1 + "L" + X0 + " " + Y1 + "Z";
  const paceDots = wp.map((v, i) => ({ x: px(i).toFixed(1), y: py(v).toFixed(1) }));
  const paceGrid = [325, 340].map((v) => ({
    y: py(v).toFixed(1), ty: (py(v) + 3).toFixed(1), label: fmtPace(v),
  }));

  return (
<div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }}></span><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}><a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a><a href="#" style={{ color: "var(--color-ink)" }}>{copy.navActivities}</a><a href="/plan" style={{ color: "var(--color-muted)" }}>{copy.navPlan}</a><a href="/settings" style={{ color: "var(--color-muted)" }}>{copy.navSettings}</a></nav><div style={{ flex: "1" }}></div><div style={{ textAlign: "end" }}><h1 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{copy.title}</h1><p style={{ margin: "0", fontSize: "11.5px", color: "var(--color-muted)" }}>{copy.subtitle}</p></div></header><section className="card stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "16px", padding: "16px 22px" }}>{stats.map((s, _i1) => (<React.Fragment key={_i1}><div style={{ borderInlineStart: `1px solid ${s.divider}`, paddingInlineStart: "16px" }}><p className="num" style={{ margin: "0", fontSize: "20px", fontWeight: "500" }}>{s.v}<span style={{ fontSize: "11px", color: "var(--color-faint)" }}> {s.unit}</span></p><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{s.name}</p></div></React.Fragment>))}</section><section className="grid2"><div className="card" style={{ padding: "16px 20px" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.volTitle}</h2><div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "90px", marginBlockStart: "14px" }}>{volBars.map((v, _i2) => (<React.Fragment key={_i2}><div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}><span className="num" style={{ fontSize: "10px", color: "var(--color-muted)" }}>{v.km}</span><div title={v.title} style={{ width: "100%", height: `${v.h}px`, background: "var(--color-accent)", opacity: v.op, borderRadius: "3px 3px 0 0" }}></div></div></React.Fragment>))}</div><div style={{ display: "flex", gap: "6px", marginBlockStart: "6px" }}>{volLabels.map((l, _i3) => (<React.Fragment key={_i3}><span className="num" style={{ flex: "1", textAlign: "center", fontSize: "9.5px", color: "var(--color-faint)" }}>{l.t}</span></React.Fragment>))}</div></div><div className="card" style={{ padding: "16px 20px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.paceTitle}</h2><span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{copy.paceSub}</span></div><svg viewBox="0 0 540 96" style={{ width: "100%", height: "auto", marginBlockStart: "12px" }}>{paceGrid.map((g, _i4) => (<React.Fragment key={_i4}><g><line x1="34" x2="536" y1={g.y} y2={g.y} stroke="var(--color-line)" strokeWidth="1" /><text x="28" y={g.ty} fill="var(--color-faint)" fontSize="8.5" fontFamily="IBM Plex Mono" textAnchor="end">{g.label}</text></g></React.Fragment>))}<path d={paceArea} fill="var(--color-accent)" opacity="0.10" /><path d={pacePath} fill="none" stroke="var(--color-accent)" strokeWidth="2" />{paceDots.map((d, _i5) => (<React.Fragment key={_i5}><circle cx={d.x} cy={d.y} r="3" fill="var(--color-accent)" /></React.Fragment>))}</svg></div></section><section className="card" style={{ padding: "16px 20px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.histTitle}</h2><div style={{ display: "flex", gap: "6px" }}>{filters.map((f, _i6) => (<React.Fragment key={_i6}><button className="tag" type="button" onClick={f.pick} style={{ cursor: "pointer", border: `1px solid ${f.border}`, background: f.bg, color: f.color }}>{f.name}</button></React.Fragment>))}</div></div><div className="num actrow" style={{ display: "grid", gridTemplateColumns: "64px 1.2fr 1fr 1fr 1fr 1fr 88px", gap: "10px", padding: "10px 12px 6px", borderBlockEnd: "1px solid var(--color-line)", marginBlockStart: "8px" }}><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.hDate}</span><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.hType}</span><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hDist}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hTime}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hPace}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hHr}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hSpark}</span></div><div style={{ display: "flex", flexDirection: "column" }}>{rows.map((a, _i7) => (<React.Fragment key={_i7}><a className="actrow dc-hover-bg" href={a.id ? `/activities/${a.id}` : "/activities/demo?demo=1"} style={{ display: "grid", gridTemplateColumns: "64px 1.2fr 1fr 1fr 1fr 1fr 88px", gap: "10px", alignItems: "center", padding: "8px 12px", borderRadius: "var(--radius-control)" }}><span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{a.date}</span><span style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "7px", height: "7px", borderRadius: "2px", background: a.dot, display: "inline-block" }}></span><span style={{ fontSize: "12.5px", fontWeight: "500" }}>{a.name}</span></span><span className="num" style={{ fontSize: "12px", textAlign: "end" }}>{a.km} km</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)", textAlign: "end" }}>{a.time}</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)", textAlign: "end" }}>{a.pace}</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)", textAlign: "end" }}>{a.hr}</span><svg className="hide-m" width="80" height="22" viewBox="0 0 80 22" style={{ justifySelf: "end" }}><path d={a.spark} fill="none" stroke={a.sparkColor} strokeWidth="1.4" /></svg></a></React.Fragment>))}</div></section></div>
  );
}

"use client";

/**
 * Activity detail — a 1:1 port of
 * design_handoff_ari_athlete_app/ARI Activity Detail.dc.html.
 * Markup converted mechanically; do not restyle by hand.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import {
  AD_COPY, buildPaths, buildStreams, fmt, GEOM, PLANNED_PACE, PVA_STATES, SUMMARY,
} from "@/lib/screens/activityDetail";

export function ActivityDetailView({
  coachView = false,
  paceState = "ontarget" as keyof typeof PVA_STATES,
}: {
  coachView?: boolean;
  paceState?: keyof typeof PVA_STATES;
}) {
  const { s, splits: rawSplits } = useMemo(() => buildStreams(), []);
  const [hi, setHi] = useState(-1);
  const [xMode, setXMode] = useState<"dist" | "time">("dist");
  const [showPace, setShowPace] = useState(true);
  const [showHr, setShowHr] = useState(true);
  const [showElev, setShowElev] = useState(true);

  const copy = AD_COPY;
  const summary = SUMMARY;
  const g = useMemo(() => buildPaths(s, xMode), [s, xMode]);
  const { pacePath, hrPath, elevArea, gridY, gridX } = g;
  const { n, dist, vel, hr, alt, time } = s;
  const hovering = hi >= 0;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * 1180;
    const xr = xMode === "dist" ? dist : time;
    const xmax = xr[n - 1];
    const frac = Math.max(0, Math.min(1, (fx - GEOM.X0) / (GEOM.X1 - GEOM.X0)));
    const target = frac * xmax;
    let lo = 0, hiI = n - 1;
    while (hiI - lo > 1) {
      const m = (lo + hiI) >> 1;
      if (xr[m] < target) lo = m; else hiI = m;
    }
    setHi(lo);
  };
  const onLeave = () => setHi(-1);

  /* planned-pace band (coach view highlights it) */
  const pyOf = (p: number) =>
    GEOM.Y0 + ((p - GEOM.PACE_MIN) / (GEOM.PACE_MAX - GEOM.PACE_MIN)) * (GEOM.Y1 - GEOM.Y0);
  const planY = pyOf(PLANNED_PACE).toFixed(1);
  const planYTop = pyOf(PLANNED_PACE - 10).toFixed(1);
  const planYH = (pyOf(PLANNED_PACE + 10) - pyOf(PLANNED_PACE - 10)).toFixed(1);
  const planLabelY = (pyOf(PLANNED_PACE - 10) - 4).toFixed(1);

  /* hover tooltip */
  const hx = hovering ? g.X(hi) : 0;
  const dp = hovering ? Math.round(1000 / vel[hi] - PLANNED_PACE) : 0;
  const tipDelta = "vs plan " + (dp > 0 ? "+" : "") + dp + " s/km";
  const tipDeltaColor = Math.abs(dp) <= 10 ? "var(--color-positive)" : "var(--color-caution)";
  const tipX = hovering ? hx.toFixed(1) : "0";
  const tipPaceY = hovering ? g.pY(vel[hi]).toFixed(1) : "0";
  const tipHrY = hovering ? g.hY(hr[hi]).toFixed(1) : "0";
  const tipLeft = hovering ? ((hx / 1180) * 100).toFixed(1) + "%" : "0%";
  const tipShift = hx > 900 ? "translateX(-110%)" : "translateX(12px)";
  const tipHead = hovering ? (dist[hi] / 1000).toFixed(2) + " km · " + fmt(time[hi]) : "";
  const tipPace = hovering ? "Pace " + fmt(1000 / vel[hi]) + " /km" : "";
  const tipHr = hovering ? "HR " + Math.round(hr[hi]) + " bpm" : "";
  const tipElev = hovering ? "Elev " + Math.round(alt[hi]) + " m" : "";

  /* splits — bar length ∝ speed; fastest and slowest km stand out */
  const spMin = Math.min(...rawSplits), spMax = Math.max(...rawSplits);
  const splits = rawSplits.map((sp, i) => {
    const fastest = sp === spMin, slowest = sp === spMax;
    return {
      km: String(i + 1),
      w: ((1 / sp / (1 / spMin)) * 100).toFixed(1),
      bg: fastest ? "var(--color-accent)" : slowest ? "var(--color-caution)" : "var(--color-line-strong)",
      txt: fastest ? "var(--color-accent)" : slowest ? "var(--color-caution)" : "var(--color-muted)",
      pace: fmt(sp),
    };
  });

  const { pvaLabel, pvaColor, pvaBg, pvaNote } = PVA_STATES[paceState];

  const sel = "var(--color-accent)", selInk = "var(--color-accent-ink)";
  const onB = "var(--color-line-strong)", offB = "transparent";
  const setDist = () => { setXMode("dist"); setHi(-1); };
  const setTime = () => { setXMode("time"); setHi(-1); };
  const distBg = xMode === "dist" ? sel : "transparent";
  const distColor = xMode === "dist" ? selInk : "var(--color-muted)";
  const timeBg = xMode === "time" ? sel : "transparent";
  const timeColor = xMode === "time" ? selInk : "var(--color-muted)";

  const togglePace = () => setShowPace(!showPace);
  const toggleHr = () => setShowHr(!showHr);
  const toggleElev = () => setShowElev(!showElev);
  const paceBorder = showPace ? onB : offB, paceOp = showPace ? "1" : "0.38";
  const hrBorder = showHr ? onB : offB, hrOp = showHr ? "1" : "0.38";
  const elevBorder = showElev ? onB : offB, elevOp = showElev ? "1" : "0.38";
  const paceVis = showPace ? "1" : "0";
  const hrVis = showHr ? "1" : "0";
  const hrVis85 = showHr ? "0.85" : "0";
  const elevVis = showElev ? "1" : "0";
  const paceRow = showPace ? "block" : "none";
  const hrRow = showHr ? "block" : "none";
  const elevRow = showElev ? "block" : "none";

  return (
<div style={{ maxWidth: "1280px", marginInline: "auto", padding: "18px 24px 48px", display: "flex", flexDirection: "column", gap: "14px" }}>{(coachView) ? (<><div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "10px 16px", border: "1px solid var(--color-accent-soft)", background: "var(--color-accent-soft)", borderRadius: "var(--radius-control)" }}><span className="tag" style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}>{copy.coachViewTag}</span><p style={{ margin: "0", fontSize: "12.5px", color: "var(--color-ink)", flex: "1" }}>{copy.coachViewMsg}</p><a className="btn btn-secondary" href="/coach" style={{ padding: "6px 12px", fontSize: "12px" }}>{copy.coachBack}</a></div></>) : null}<header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }}></span><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}><a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a><a href="/activities" style={{ color: "var(--color-ink)" }}>{copy.navActivities}</a><a href="/plan" style={{ color: "var(--color-muted)" }}>{copy.navPlan}</a><a href="/settings" style={{ color: "var(--color-muted)" }}>{copy.navSettings}</a></nav><div style={{ flex: "1" }}></div><a href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-muted)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>{copy.back}</a></header><section className="card" style={{ padding: "22px 26px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}><div><h1 style={{ margin: "0", fontSize: "19px", fontWeight: "600" }}>{copy.runTitle}</h1><p className="num" style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--color-faint)" }}>{copy.runDate}</p></div><span className="tag" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>{copy.runType}</span></div><div className="sumrow" style={{ display: "flex", gap: "40px", marginBlockStart: "18px" }}>{summary.map((s, _i1) => (<React.Fragment key={_i1}><div><p className="num" style={{ margin: "0", fontSize: "24px", fontWeight: "500" }}>{s.v}<span style={{ fontSize: "12px", color: "var(--color-faint)" }}> {s.unit}</span></p><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{s.name}</p></div></React.Fragment>))}</div></section><section className="card" style={{ padding: "20px 26px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "24px", alignItems: "center" }}><div><p style={{ margin: "0", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.pvaTitle}</p><p className="num" style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--color-muted)" }}>{copy.pvaPlanned}</p><p className="num" style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--color-ink)" }}>{copy.pvaActual}</p></div><div style={{ height: "100%", borderInlineStart: "1px solid var(--color-line)" }}></div><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}><span className="tag" style={{ background: pvaBg, color: pvaColor }}>{pvaLabel}</span><p style={{ margin: "0", fontSize: "12px", color: "var(--color-muted)", maxWidth: "340px", textAlign: "end", textWrap: "pretty" }}>{pvaNote}</p></div></section><section className="card" style={{ padding: "20px 26px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}><div><h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{copy.chartTitle}</h2><p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>{copy.chartSub}</p></div><div style={{ display: "flex", alignItems: "center", gap: "16px" }}><div style={{ display: "flex", gap: "8px", fontSize: "11px", color: "var(--color-muted)" }}><button className="tag" type="button" onClick={togglePace} style={{ cursor: "pointer", gap: "6px", background: "var(--color-elevated)", color: "var(--color-ink)", border: `1px solid ${paceBorder}`, opacity: paceOp }}><span style={{ width: "12px", height: "2px", background: "var(--color-accent)", display: "inline-block" }}></span>{copy.legPace}</button><button className="tag" type="button" onClick={toggleHr} style={{ cursor: "pointer", gap: "6px", background: "var(--color-elevated)", color: "var(--color-ink)", border: `1px solid ${hrBorder}`, opacity: hrOp }}><span style={{ width: "12px", height: "2px", background: "var(--color-tsb)", display: "inline-block" }}></span>{copy.legHr}</button><button className="tag" type="button" onClick={toggleElev} style={{ cursor: "pointer", gap: "6px", background: "var(--color-elevated)", color: "var(--color-ink)", border: `1px solid ${elevBorder}`, opacity: elevOp }}><span style={{ width: "12px", height: "7px", background: "var(--color-elevated)", border: "1px solid var(--color-line-strong)", display: "inline-block" }}></span>{copy.legElev}</button></div><div style={{ display: "flex", border: "1px solid var(--color-line-strong)", borderRadius: "var(--radius-control)", overflow: "hidden" }}><button className="num" type="button" onClick={setDist} style={{ fontSize: "11px", padding: "5px 12px", border: "none", cursor: "pointer", background: distBg, color: distColor }}>{copy.xDist}</button><button className="num" type="button" onClick={setTime} style={{ fontSize: "11px", padding: "5px 12px", border: "none", cursor: "pointer", background: timeBg, color: timeColor }}>{copy.xTime}</button></div></div></div><div style={{ position: "relative", marginBlockStart: "14px" }}><svg viewBox="0 0 1180 300" style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove} onMouseLeave={onLeave}><text x="6" y="14" fill="var(--color-faint)" fontSize="9" fontFamily="IBM Plex Mono">{copy.paceAxis}</text><text x="1174" y="14" fill="var(--color-faint)" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="end">{copy.hrAxis}</text>{gridY.map((g, _i2) => (<React.Fragment key={_i2}><g><line x1="44" x2="1136" y1={g.y} y2={g.y} stroke="var(--color-line)" strokeWidth="1" /><text x="38" y={g.ty} fill="var(--color-faint)" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="end">{g.pace}</text><text x="1142" y={g.ty} fill="var(--color-faint)" fontSize="9" fontFamily="IBM Plex Mono">{g.hr}</text></g></React.Fragment>))}{gridX.map((g, _i3) => (<React.Fragment key={_i3}><text x={g.x} y="296" fill="var(--color-faint)" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">{g.label}</text></React.Fragment>))}<rect x="44" y={planYTop} width="1092" height={planYH} fill="var(--color-accent)" opacity="0.06" /><line x1="44" x2="1136" y1={planY} y2={planY} stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="6 4" opacity="0.55" /><text x="48" y={planLabelY} fill="var(--color-accent)" fontSize="9" fontFamily="IBM Plex Mono" opacity="0.85">{copy.planLine}</text><path d={elevArea} fill="var(--color-elevated)" stroke="var(--color-line-strong)" strokeWidth="1" opacity={elevVis} /><path d={hrPath} fill="none" stroke="var(--color-tsb)" strokeWidth="1.3" opacity={hrVis85} /><path d={pacePath} fill="none" stroke="var(--color-accent)" strokeWidth="1.8" opacity={paceVis} />{(hovering) ? (<><g><line x1={tipX} x2={tipX} y1="20" y2="284" stroke="var(--color-faint)" strokeWidth="1" strokeDasharray="3 3" /><circle cx={tipX} cy={tipPaceY} r="3.5" fill="var(--color-accent)" opacity={paceVis} /><circle cx={tipX} cy={tipHrY} r="3" fill="var(--color-tsb)" opacity={hrVis} /></g></>) : null}</svg>{(hovering) ? (<><div className="num" style={{ position: "absolute", top: "12px", left: tipLeft, transform: tipShift, background: "var(--color-elevated)", border: "1px solid var(--color-line-strong)", borderRadius: "var(--radius-control)", padding: "8px 12px", fontSize: "11px", pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,.5)" }}><div style={{ color: "var(--color-faint)", marginBlockEnd: "3px" }}>{tipHead}</div><div style={{ color: "var(--color-accent)", display: paceRow }}>{tipPace}</div><div style={{ color: "var(--color-tsb)", display: hrRow }}>{tipHr}</div><div style={{ color: "var(--color-muted)", display: elevRow }}>{tipElev}</div><div style={{ color: tipDeltaColor, borderBlockStart: "1px solid var(--color-line)", marginBlockStart: "4px", paddingBlockStart: "4px" }}>{tipDelta}</div></div></>) : null}</div></section><section className="grid"><div className="card c7" style={{ padding: "20px 26px" }}><h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{copy.splitsTitle}</h2><div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBlockStart: "14px" }}>{splits.map((s, _i4) => (<React.Fragment key={_i4}><div style={{ display: "grid", gridTemplateColumns: "28px 1fr 52px", alignItems: "center", gap: "12px" }}><span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>{s.km}</span><div style={{ height: "16px", background: "var(--color-elevated)", borderRadius: "3px", overflow: "hidden" }}><div style={{ width: `${s.w}%`, height: "16px", background: s.bg, borderRadius: "3px" }}></div></div><span className="num" style={{ fontSize: "11.5px", color: s.txt, textAlign: "end" }}>{s.pace}</span></div></React.Fragment>))}</div><p style={{ margin: "14px 0 0", fontSize: "12.5px", color: "var(--color-muted)", textWrap: "pretty" }}>{copy.splitsNote}</p></div><div className="card c5" style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: "12px" }}><div><span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>{copy.aiTag}</span></div><p style={{ margin: "0", fontSize: "14px", lineHeight: "1.6", textWrap: "pretty" }}>{copy.aiNote}</p><div style={{ marginBlockStart: "auto", display: "flex", gap: "10px" }}><button className="btn btn-secondary" type="button">{copy.btnReason}</button></div></div></section></div>
  );
}

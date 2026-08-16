"use client";

/**
 * Training plan — a 1:1 port of
 * design_handoff_ari_athlete_app/ARI Plan.dc.html.
 * Markup converted mechanically; do not restyle by hand.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import {
  MONTH_NAMES, PLAN_COPY, PURPOSE, planSegsFor, planWeeks,
} from "@/lib/screens/plan";

export function PlanView() {
  const W = useMemo(() => planWeeks(), []);
  const [openWeek, setOpenWeek] = useState(3);
  const [selDay, setSelDay] = useState(-1);

  const copy = PLAN_COPY;
  const P = "var(--color-positive)", N = "var(--color-negative)",
    F = "var(--color-faint)", M = "var(--color-muted)",
    AC = "var(--color-accent)", CA = "var(--color-caution)",
    I = "var(--color-ink)", LN = "var(--color-line)";
  const phC: Record<string, string> = {
    Base: M, Build: AC, Recovery: P, Peak: CA, Sharpen: AC, Taper: P,
  };

  const groups = W.map((wk, w) => {
    const open = openWeek === w;
    const wkStatus = w < 3 ? "Done" : w === 3 ? "Current" : "";
    const days = wk.days.map((d, i) => ({
      day: d.day + " " + d.dateNum,
      name: d.name,
      dist: d.type === "rest" ? "—" : d.dist + " km",
      status: d.status === "Adjusted" ? "ADJ" : d.status,
      statusColor: d.status === "Done" ? P : d.status === "Missed" ? N
        : d.status === "Today" ? AC : d.status === "Adjusted" ? CA : F,
      nameColor: d.missed || d.type === "rest" ? F : I,
      dayColor: d.today ? AC : F,
      bg: d.today || (open && selDay === i) ? "var(--color-elevated)" : "transparent",
      edge: d.today ? AC : d.status === "Adjusted" ? CA
        : open && selDay === i ? "var(--color-faint)" : LN,
      select: () => {
        setSelDay(openWeek === w && selDay === i ? -1 : i);
        setOpenWeek(w);
      },
    }));

    const sel = open && selDay >= 0 ? wk.days[selDay] : null;
    const segs = sel ? planSegsFor(sel.type) : [];
    const tot = segs.reduce((s, x) => s + x.m, 0) || 1;
    const barBg = sel ? (sel.missed ? "var(--color-line-strong)" : sel.done ? AC : CA) : "transparent";
    const dur = sel && sel.dist
      ? Math.round(sel.dist * (sel.type === "int" ? 4.9 : sel.type === "tempo" ? 4.9 : 5.6))
      : 0;

    return {
      w, open, days, km: wk.km, label: wk.label, range: wk.range,
      phase: wk.phase, monName: wk.monName, monIdx: wk.monIdx,
      phaseColor: phC[wk.phase] || M,
      border: w === 3 ? "var(--color-accent-soft)" : "var(--color-line)",
      numColor: w === 3 ? AC : I,
      status: wkStatus,
      statusColor: wkStatus === "Done" ? P : wkStatus === "Current" ? AC : F,
      toggle: () => { setOpenWeek(openWeek === w ? -1 : w); setSelDay(-1); },
      hasSel: !!sel,
      selTitle: sel ? sel.name + " · " + sel.day + " " + sel.mon + " " + sel.dateNum : "",
      selMeta: sel
        ? sel.type === "rest" ? "Recovery day"
          : sel.dist + " km @ " + sel.pace + "/km · ~" + dur + " min"
        : "",
      selStatus: sel ? sel.status || "Planned" : "",
      selStatusColor: sel
        ? sel.status === "Done" ? P : sel.status === "Missed" ? N
          : sel.status === "Today" ? AC : sel.status === "Adjusted" ? CA : M
        : M,
      selHasBar: !!sel && sel.type !== "rest",
      selSegments: segs.map((s) => ({
        w: ((s.m / tot) * 100).toFixed(2), h: s.h, bg: barBg, title: s.t,
      })),
      selSegStart: sel && sel.type === "int" ? "Warm-up 10 min · 5:45"
        : sel && sel.type === "tempo" ? "Warm-up 10 min" : "",
      selSegMid: sel && sel.type === "int" ? "6 × 800 m @ 4:15 · 90 s jog"
        : sel && sel.type === "tempo" ? "20 min @ 4:45/km"
          : sel && sel.dist ? sel.dist + " km @ " + sel.pace + "/km" : "",
      selSegEnd: sel && (sel.type === "int" || sel.type === "tempo") ? "Cool-down 10 min" : "",
      selPurpose: sel ? PURPOSE[sel.type] : "",
      selAdjusted: !!sel && sel.status === "Adjusted",
      selReason: "Downgraded from intervals — acute load climbed 12% this week; protecting Saturday’s long run.",
    };
  });

  type Group = (typeof groups)[number];
  const months: { idx: number; name: string; weeks: Group[] }[] = [];
  groups.forEach((g) => {
    let m = months[months.length - 1];
    if (!m || m.idx !== g.monIdx) {
      m = { idx: g.monIdx, name: MONTH_NAMES[g.monIdx] + " 2026", weeks: [] };
      months.push(m);
    }
    m.weeks.push(g);
  });

  const totalKm = W.reduce((s, w) => s + w.km, 0);
  const planStats = [
    { v: "12 weeks", name: "Plan length · 4 completed", divider: "transparent" },
    { v: totalKm + " km", name: "Total planned volume", divider: "var(--color-line)" },
    { v: "74 km", name: "Peak week (W9)", divider: "var(--color-line)" },
    { v: "61 days", name: "To race day", divider: "var(--color-line)" },
  ];

  return (
<div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }}></span><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}><a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a><a href="/activities" style={{ color: "var(--color-muted)" }}>{copy.navActivities}</a><a href="#" style={{ color: "var(--color-ink)" }}>{copy.navPlan}</a><a href="/settings" style={{ color: "var(--color-muted)" }}>{copy.navSettings}</a></nav><div style={{ flex: "1" }}></div><div style={{ textAlign: "end" }}><h1 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{copy.title}</h1><p style={{ margin: "0", fontSize: "11.5px", color: "var(--color-muted)" }}>{copy.subtitle}</p></div></header><section className="card stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px", padding: "16px 22px" }}>{planStats.map((s, _i1) => (<React.Fragment key={_i1}><div style={{ borderInlineStart: `1px solid ${s.divider}`, paddingInlineStart: "16px" }}><p className="num" style={{ margin: "0", fontSize: "20px", fontWeight: "500" }}>{s.v}</p><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{s.name}</p></div></React.Fragment>))}</section>{months.map((mo, _i2) => (<React.Fragment key={_i2}><section><h2 className="num" style={{ margin: "10px 0 8px", fontSize: "12px", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-faint)" }}>{mo.name}</h2><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{mo.weeks.map((w, _i3) => (<React.Fragment key={_i3}><div className="card" style={{ overflow: "hidden", borderColor: w.border }}><button className="wk-row" type="button" onClick={w.toggle} style={{ width: "100%", display: "grid", gridTemplateColumns: "96px 1fr auto auto auto", alignItems: "center", gap: "16px", padding: "13px 18px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--color-ink)", textAlign: "start" }}><span className="num" style={{ fontSize: "13px", fontWeight: "500", color: w.numColor }}>{w.label}</span><span className="num hide-m" style={{ fontSize: "11.5px", color: "var(--color-faint)" }}>{w.range}</span><span className="tag hide-m" style={{ background: "var(--color-elevated)", color: w.phaseColor }}>{w.phase}</span><span className="num" style={{ fontSize: "12px", color: "var(--color-muted)", minWidth: "56px", textAlign: "end" }}>{w.km} km</span><span className="num" style={{ fontSize: "10px", letterSpacing: ".06em", textTransform: "uppercase", color: w.statusColor, minWidth: "64px", textAlign: "end" }}>{w.status}</span></button>{(w.open) ? (<><div style={{ borderBlockStart: "1px solid var(--color-line)", padding: "14px 18px 16px" }}><div className="wk-days" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "8px" }}>{w.days.map((d, _i4) => (<React.Fragment key={_i4}><button className="dc-hover-border" type="button" onClick={d.select} style={{ textAlign: "start", fontFamily: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", gap: "6px", padding: "10px 11px", borderRadius: "var(--radius-control)", background: d.bg, border: `1px solid ${d.edge}`, minHeight: "92px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "6px", width: "100%" }}><span className="num" style={{ fontSize: "10px", letterSpacing: ".1em", textTransform: "uppercase", color: d.dayColor, whiteSpace: "nowrap" }}>{d.day}</span><span className="num" style={{ fontSize: "8.5px", letterSpacing: ".04em", textTransform: "uppercase", color: d.statusColor, whiteSpace: "nowrap", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis" }}>{d.status}</span></div><div style={{ flex: "1" }}><p style={{ margin: "0", fontSize: "12px", fontWeight: "500", color: d.nameColor }}>{d.name}</p><p className="num" style={{ margin: "2px 0 0", fontSize: "10.5px", color: "var(--color-faint)" }}>{d.dist}</p></div></button></React.Fragment>))}</div>{(w.hasSel) ? (<><div style={{ marginBlockStart: "12px", borderBlockStart: "1px solid var(--color-line)", paddingBlockStart: "14px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}><div><h3 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{w.selTitle}</h3><p className="num" style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-muted)" }}>{w.selMeta}</p></div><span className="tag" style={{ background: "var(--color-elevated)", color: w.selStatusColor }}>{w.selStatus}</span></div>{(w.selHasBar) ? (<><div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "48px", marginBlockStart: "12px" }}>{w.selSegments.map((s, _i5) => (<React.Fragment key={_i5}><div title={s.title} style={{ width: `${s.w}%`, height: `${s.h}px`, background: s.bg, borderRadius: "3px 3px 0 0" }}></div></React.Fragment>))}</div><div className="num" style={{ display: "flex", justifyContent: "space-between", marginBlockStart: "5px" }}><span style={{ fontSize: "10px", color: "var(--color-faint)" }}>{w.selSegStart}</span><span style={{ fontSize: "10px", color: "var(--color-muted)" }}>{w.selSegMid}</span><span style={{ fontSize: "10px", color: "var(--color-faint)" }}>{w.selSegEnd}</span></div></>) : null}<p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-muted)", textWrap: "pretty" }}>{w.selPurpose}</p>{(w.selAdjusted) ? (<><p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--color-caution)" }}>{w.selReason}</p></>) : null}</div></>) : null}</div></>) : null}</div></React.Fragment>))}</div></section></React.Fragment>))}<section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "13px 20px", borderColor: "var(--color-accent-soft)" }}><div style={{ display: "flex", alignItems: "center", gap: "12px" }}><span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>{copy.raceTag}</span><p className="num" style={{ margin: "0", fontSize: "13px" }}>{copy.raceLine}</p></div><span className="num" style={{ fontSize: "12px", color: "var(--color-muted)" }}>{copy.raceTarget}</span></section></div>
  );
}

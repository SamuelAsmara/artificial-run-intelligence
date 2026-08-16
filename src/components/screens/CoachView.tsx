"use client";

/**
 * Coach dashboard — a 1:1 port of
 * design_handoff_ari_athlete_app/ARI Coach.dc.html.
 * Markup converted mechanically; do not restyle by hand.
 *
 * NOTE: roster and alerts map to real tables (coach_athletes,
 * readiness_snapshots). Messages and plan codes are demo-only — no tables yet.
 */

import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { ImageSlot } from "@/components/ui/ImageSlot";
import {
  ATHLETES, COACH_COPY, cmpSeries, coachQrPath, INITIAL_THREADS,
  PLAN_CODES, RACE_TIMELINE, type Thread,
} from "@/lib/screens/coach";

export function CoachView() {
  const copy = COACH_COPY;
  const qrPath = useMemo(() => coachQrPath(), []);
  const cs = useMemo(() => cmpSeries(), []);

  const [g, setG] = useState("All");
  const [l, setL] = useState("All");
  const [r, setR] = useState("All");
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePlan, setSharePlan] = useState("Marathon · 12 wk");
  const [copied, setCopied] = useState(false);
  const [cmpOn, setCmpOn] = useState<Record<string, boolean>>({
    SC: true, NB: true, YP: true, GA: true,
  });
  const [mSel, setMSel] = useState(0);
  const [mInput, _setMInput] = useState("");
  const [threads_, setThreads] = useState<Thread[]>(INITIAL_THREADS);
  const mt = useRef<ReturnType<typeof setTimeout> | null>(null);

  const P = "var(--color-positive)", N = "var(--color-negative)",
    CA = "var(--color-caution)", M = "var(--color-muted)", AC = "var(--color-accent)";

  const mkF = (opts: string[], val: string, set: (v: string) => void) =>
    opts.map((n) => ({
      name: n,
      pick: () => set(n),
      bg: val === n ? "var(--color-accent)" : "transparent",
      color: val === n ? "var(--color-accent-ink)" : "var(--color-muted)",
      border: val === n ? "transparent" : "var(--color-line-strong)",
    }));

  const all = ATHLETES;
  const filtered = all.filter(
    (a) =>
      (g === "All" || (g === "Men" ? a[1] === "M" : a[1] === "F")) &&
      (l === "All" || a[3] === l) &&
      (r === "All" || a[4] === r),
  );

  const rows = filtered.map((a) => ({
    name: a[0],
    initials: a[0].split(" ").map((x) => x[0]).join(""),
    slotId: "ath-" + a[0].toLowerCase().replace(/[^a-z]+/g, "-"),
    meta: (a[1] === "M" ? "Male" : "Female") + " · " + a[2],
    level: a[3], race: a[4], raceDate: a[5],
    readiness: String(a[6]),
    readyColor: a[6] >= 70 ? P : a[6] >= 40 ? CA : N,
    acwr: a[7].toFixed(2),
    acwrColor: a[7] > 1.5 ? N : a[7] > 1.3 ? CA : M,
    km: a[8] + " km",
    status: a[9],
    statusColor: a[9] === "At risk" ? N : a[9] === "Watch" ? CA : a[9] === "New" ? AC : P,
  }));

  const atRisk = all.filter((a) => a[7] > 1.5).length;
  const stats = [
    { v: String(all.length), name: "Athletes on roster", divider: "transparent", color: "var(--color-ink)" },
    { v: String(atRisk), name: "At injury risk (ACWR > 1.5)", divider: "var(--color-line)", color: N },
    { v: "46", name: "Workouts completed this week", divider: "var(--color-line)", color: "var(--color-ink)" },
    { v: "3", name: "Races in the next 30 days", divider: "var(--color-line)", color: "var(--color-ink)" },
  ];

  const planOpts = ["Marathon · 12 wk", "Half · 10 wk", "10K · 8 wk"].map((n) => ({
    name: n,
    pick: () => { setSharePlan(n); setCopied(false); },
    bg: sharePlan === n ? "var(--color-accent)" : "transparent",
    color: sharePlan === n ? "var(--color-accent-ink)" : "var(--color-muted)",
    border: sharePlan === n ? "transparent" : "var(--color-line-strong)",
  }));

  const alerts = [
    { name: "Lior Katz", msg: "ACWR 1.66 — load spiked 24% this week. Recommend cutting Saturday’s long run.", kind: "Injury risk", dot: N, edge: N },
    { name: "Noa Bar", msg: "ACWR 1.58 and readiness 38 — two red flags in one week.", kind: "Injury risk", dot: N, edge: N },
    { name: "Dana Levi", msg: "Taper starts Monday — Half marathon on Sep 20. Review race-week plan.", kind: "Final weeks", dot: AC, edge: "var(--color-accent-soft)" },
    { name: "Maya Golan", msg: "Race in 14 days — 10K on Aug 30. Confirm pacing target (46:30?).", kind: "Final weeks", dot: CA, edge: "transparent" },
    { name: "Gal Amir", msg: "Joined 3 days ago — no plan assigned yet.", kind: "New athlete", dot: AC, edge: "transparent" },
  ];

  /* fitness comparison chart */
  const X0 = 26, X1 = 600, Y0 = 10, Y1 = 172, vMin = 30, vMax = 66;
  const cx = (i: number) => X0 + (i / 11) * (X1 - X0);
  const cy = (v: number) => Y0 + (1 - (v - vMin) / (vMax - vMin)) * (Y1 - Y0);
  const cmpLines = cs.filter((c) => cmpOn[c.id]).map((c) => ({
    d: c.v.map((v, i) => (i ? "L" : "M") + cx(i).toFixed(1) + " " + cy(v).toFixed(1)).join(""),
    color: c.color, initials: c.initials, ey: (cy(c.v[11]) + 3).toFixed(1),
  }));
  const cmpChips = cs.map((c) => ({
    name: c.name, color: c.color,
    pick: () => setCmpOn({ ...cmpOn, [c.id]: !cmpOn[c.id] }),
    border: cmpOn[c.id] ? "var(--color-line-strong)" : "transparent",
    op: cmpOn[c.id] ? "1" : "0.38",
  }));
  const cmpGrid = [35, 45, 55, 65].map((v) => ({
    y: cy(v).toFixed(1), ty: (cy(v) + 3).toFixed(1), label: String(v),
  }));

  const races = RACE_TIMELINE.map((rc, i) => ({
    date: rc[0], who: rc[1], race: rc[2], days: "in " + rc[3] + " d",
    bg: i === 0 ? "var(--color-elevated)" : "transparent",
    edge: i === 0 ? AC : "transparent",
    dateColor: i === 0 ? AC : "var(--color-faint)",
  }));

  /* messages */
  const sel = threads_[mSel];
  const threads = threads_.map((t, i) => ({
    name: t.name,
    last: t.msgs[t.msgs.length - 1].text,
    dot: t.unread ? AC : "transparent",
    bg: i === mSel ? "var(--color-elevated)" : "transparent",
    pick: () => {
      setThreads(threads_.map((x, j) => (j === i ? { ...x, unread: false } : x)));
      setMSel(i);
    },
  }));
  const selMsgs = sel.msgs.map((m) => ({
    text: m.text,
    align: m.who === "c" ? "flex-end" : "flex-start",
    bg: m.who === "c" ? "var(--color-accent)" : "var(--color-elevated)",
    fg: m.who === "c" ? "var(--color-accent-ink)" : "var(--color-ink)",
  }));
  const selThreadName = sel.name;
  const selThreadHref = "/dashboard?coach=1";
  const setMInput = (e: React.ChangeEvent<HTMLInputElement>) => _setMInput(e.target.value);
  const mSend = () => {
    const t = mInput.trim();
    if (!t) return;
    setThreads((prev) =>
      prev.map((x, j) => (j === mSel ? { ...x, msgs: [...x.msgs, { who: "c" as const, text: t }] } : x)),
    );
    _setMInput("");
    if (mt.current) clearTimeout(mt.current);
    mt.current = setTimeout(() => {
      setThreads((prev) =>
        prev.map((x, j) =>
          j === mSel ? { ...x, msgs: [...x.msgs, { who: "a" as const, text: "Got it — thanks coach!" }] } : x,
        ),
      );
    }, 900);
  };
  const mKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") mSend();
  };

  const gFilters = mkF(["All", "Men", "Women"], g, setG);
  const lFilters = mkF(["All", "Beginner", "Intermediate", "Advanced"], l, setL);
  const rFilters = mkF(["All", "5K", "10K", "Half", "Marathon"], r, setR);
  const shownCount = rows.length + " of " + all.length + " athletes";

  const openShare = () => { setShareOpen(true); setCopied(false); };
  const closeShare = () => setShareOpen(false);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const shareCode = PLAN_CODES[sharePlan];
  const copyCode = () => setCopied(true);
  const copyLabel = copied ? "Copied ✓" : "Copy code";

  return (
<div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }}></span><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span><span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)", marginInlineStart: "4px" }}>{copy.coachTag}</span></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}><span style={{ color: "var(--color-ink)" }}>{copy.navAthletes}</span><a href="/plan" style={{ color: "var(--color-muted)" }}>{copy.navPlans}</a><a href="/settings" style={{ color: "var(--color-muted)" }}>{copy.navSettings}</a></nav><div style={{ flex: "1" }}></div><button className="btn btn-primary" type="button" onClick={openShare}>{copy.sharePlan}</button><div style={{ textAlign: "end" }}><h1 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{copy.greeting}</h1><p style={{ margin: "0", fontSize: "11.5px", color: "var(--color-muted)" }}>{copy.context}</p></div></header><section className="card stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px", padding: "16px 22px" }}>{stats.map((s, _i1) => (<React.Fragment key={_i1}><div style={{ borderInlineStart: `1px solid ${s.divider}`, paddingInlineStart: "16px" }}><p className="num" style={{ margin: "0", fontSize: "20px", fontWeight: "500", color: s.color }}>{s.v}</p><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{s.name}</p></div></React.Fragment>))}</section><section className="card" style={{ padding: "16px 20px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.alertsTitle}</h2><span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{copy.alertsSub}</span></div><div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBlockStart: "10px" }}>{alerts.map((al, _i2) => (<React.Fragment key={_i2}><a className="dc-hover-bg" href="/dashboard?coach=1" style={{ display: "grid", gridTemplateColumns: "auto minmax(120px,auto) 1fr auto", alignItems: "center", gap: "12px", padding: "8px 12px", borderRadius: "var(--radius-control)", borderInlineStart: `2px solid ${al.edge}` }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: al.dot, display: "inline-block" }}></span><span style={{ fontSize: "12.5px", fontWeight: "500" }}>{al.name}</span><span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{al.msg}</span><span className="num" style={{ fontSize: "10px", letterSpacing: ".05em", textTransform: "uppercase", color: al.dot }}>{al.kind}</span></a></React.Fragment>))}</div></section><section className="grid2" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "12px" }}><div className="card" style={{ padding: "16px 20px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}><div><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.cmpTitle}</h2><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>{copy.cmpSub}</p></div><div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{cmpChips.map((c, _i3) => (<React.Fragment key={_i3}><button className="tag" type="button" onClick={c.pick} style={{ cursor: "pointer", gap: "6px", border: `1px solid ${c.border}`, background: "var(--color-elevated)", color: "var(--color-ink)", opacity: c.op }}><span style={{ width: "10px", height: "2px", background: c.color, display: "inline-block" }}></span>{c.name}</button></React.Fragment>))}</div></div><svg viewBox="0 0 640 190" style={{ width: "100%", height: "auto", marginBlockStart: "12px" }}>{cmpGrid.map((g, _i4) => (<React.Fragment key={_i4}><g><line x1="26" x2="600" y1={g.y} y2={g.y} stroke="var(--color-line)" strokeWidth="1" /><text x="20" y={g.ty} fill="var(--color-faint)" fontSize="8.5" fontFamily="IBM Plex Mono" textAnchor="end">{g.label}</text></g></React.Fragment>))}{cmpLines.map((l, _i5) => (<React.Fragment key={_i5}><g><path d={l.d} fill="none" stroke={l.color} strokeWidth="1.8" /><text x="606" y={l.ey} fill={l.color} fontSize="9.5" fontFamily="IBM Plex Mono">{l.initials}</text></g></React.Fragment>))}</svg></div><div className="card" style={{ padding: "16px 20px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.racesTitle}</h2><span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{copy.racesSub}</span></div><div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBlockStart: "10px" }}>{races.map((r, _i6) => (<React.Fragment key={_i6}><div style={{ display: "grid", gridTemplateColumns: "52px 1fr auto auto", alignItems: "center", gap: "10px", padding: "6px 10px", borderRadius: "var(--radius-control)", background: r.bg, borderInlineStart: `2px solid ${r.edge}` }}><span className="num" style={{ fontSize: "10.5px", color: r.dateColor }}>{r.date}</span><span style={{ fontSize: "12px", fontWeight: "500", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.who}</span><span className="tag" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>{r.race}</span><span className="num" style={{ fontSize: "10px", color: "var(--color-faint)", minWidth: "44px", textAlign: "end" }}>{r.days}</span></div></React.Fragment>))}</div></div></section><section className="card msg-grid" style={{ display: "grid", gridTemplateColumns: "250px 1fr", minHeight: "280px", overflow: "hidden" }}><div style={{ borderInlineEnd: "1px solid var(--color-line)", padding: "14px 10px 14px 16px", display: "flex", flexDirection: "column", gap: "2px" }}><h2 style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: "600" }}>{copy.msgTitle}</h2>{threads.map((t, _i7) => (<React.Fragment key={_i7}><button type="button" onClick={t.pick} style={{ fontFamily: "inherit", cursor: "pointer", textAlign: "start", display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px", alignItems: "center", padding: "8px 10px", border: "none", borderRadius: "var(--radius-control)", background: t.bg }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: t.dot, display: "inline-block" }}></span><span style={{ minWidth: "0" }}><span style={{ display: "block", fontSize: "12.5px", fontWeight: "500", color: "var(--color-ink)" }}>{t.name}</span><span style={{ display: "block", fontSize: "10.5px", color: "var(--color-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last}</span></span></button></React.Fragment>))}</div><div style={{ display: "flex", flexDirection: "column" }}><div style={{ padding: "12px 18px", borderBlockEnd: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: "13px", fontWeight: "600" }}>{selThreadName}</span><a className="num" href={selThreadHref} style={{ fontSize: "10.5px", color: "var(--color-accent)" }}>{copy.msgView}</a></div><div style={{ flex: "1", overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: "8px" }}>{selMsgs.map((m, _i8) => (<React.Fragment key={_i8}><div style={{ alignSelf: m.align, maxWidth: "78%", padding: "8px 12px", borderRadius: "11px", background: m.bg, color: m.fg, fontSize: "12.5px", lineHeight: "1.5" }}>{m.text}</div></React.Fragment>))}</div><div style={{ display: "flex", gap: "8px", padding: "12px 18px", borderBlockStart: "1px solid var(--color-line)" }}><input className="field" style={{ flex: "1" }} value={mInput} onChange={setMInput} onKeyDown={mKey} placeholder={copy.msgPlaceholder} /><button className="btn btn-primary" type="button" onClick={mSend}>{copy.msgSend}</button></div></div></section><section className="card" style={{ padding: "16px 20px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.rosterTitle}</h2><div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}><div style={{ display: "flex", alignItems: "center", gap: "6px" }}><span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.fGender}</span>{gFilters.map((f, _i9) => (<React.Fragment key={_i9}><button className="tag" type="button" onClick={f.pick} style={{ cursor: "pointer", border: `1px solid ${f.border}`, background: f.bg, color: f.color }}>{f.name}</button></React.Fragment>))}</div><div style={{ display: "flex", alignItems: "center", gap: "6px" }}><span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.fLevel}</span>{lFilters.map((f, _i10) => (<React.Fragment key={_i10}><button className="tag" type="button" onClick={f.pick} style={{ cursor: "pointer", border: `1px solid ${f.border}`, background: f.bg, color: f.color }}>{f.name}</button></React.Fragment>))}</div><div style={{ display: "flex", alignItems: "center", gap: "6px" }}><span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.fRace}</span>{rFilters.map((f, _i11) => (<React.Fragment key={_i11}><button className="tag" type="button" onClick={f.pick} style={{ cursor: "pointer", border: `1px solid ${f.border}`, background: f.bg, color: f.color }}>{f.name}</button></React.Fragment>))}</div></div></div><div className="roster num" style={{ padding: "10px 12px 6px", borderBlockEnd: "1px solid var(--color-line)", marginBlockStart: "10px" }}><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.hAthlete}</span><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.hLevel}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.hRace}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.hRaceDate}</span><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hReadiness}</span><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hAcwr}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hKm}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hStatus}</span></div><div style={{ display: "flex", flexDirection: "column" }}>{rows.map((a, _i12) => (<React.Fragment key={_i12}><a className="roster dc-hover-bg" href="/dashboard?coach=1" style={{ padding: "8px 12px", borderRadius: "var(--radius-control)" }}><span style={{ display: "flex", alignItems: "center", gap: "10px" }}><ImageSlot style={{ width: "32px", height: "32px", flex: "none" }} label="{{ a.initials }}" /><span><span style={{ display: "block", fontSize: "12.5px", fontWeight: "500" }}>{a.name}</span><span className="num" style={{ display: "block", fontSize: "10px", color: "var(--color-faint)" }}>{a.meta}</span></span></span><span className="tag" style={{ background: "var(--color-elevated)", color: "var(--color-muted)", justifySelf: "start" }}>{a.level}</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)" }}>{a.race}</span><span className="num hide-m" style={{ fontSize: "11px", color: "var(--color-faint)" }}>{a.raceDate}</span><span className="num" style={{ fontSize: "13px", fontWeight: "500", textAlign: "end", color: a.readyColor }}>{a.readiness}</span><span className="num" style={{ fontSize: "12px", textAlign: "end", color: a.acwrColor }}>{a.acwr}</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)", textAlign: "end" }}>{a.km}</span><span className="num hide-m" style={{ fontSize: "10px", letterSpacing: ".05em", textTransform: "uppercase", textAlign: "end", color: a.statusColor }}>{a.status}</span></a></React.Fragment>))}</div><p className="num" style={{ margin: "10px 0 0", fontSize: "10.5px", color: "var(--color-faint)" }}>{shownCount}</p></section>{(shareOpen) ? (<><div style={{ position: "fixed", inset: "0", background: "rgba(0,0,0,.62)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "60" }} onClick={closeShare}><div className="card" style={{ width: "min(420px,92vw)", padding: "24px 26px" }} onClick={stop}><h3 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{copy.shareTitle}</h3><p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>{copy.shareSub}</p><div style={{ marginBlockStart: "14px" }}><span style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.sharePlanField}</span><div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{planOpts.map((p, _i13) => (<React.Fragment key={_i13}><button className="tag" type="button" onClick={p.pick} style={{ cursor: "pointer", border: `1px solid ${p.border}`, background: p.bg, color: p.color }}>{p.name}</button></React.Fragment>))}</div></div><div style={{ display: "flex", alignItems: "center", gap: "16px", marginBlockStart: "16px" }}><svg width="108" height="108" viewBox="0 0 96 96" style={{ flex: "none", background: "var(--color-ink)", borderRadius: "8px" }}><path d={qrPath} fill="var(--color-canvas)" /></svg><div style={{ flex: "1" }}><p style={{ margin: "0 0 6px", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)" }}>{copy.shareCode}</p><p className="num" style={{ margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: ".08em" }}>{shareCode}</p><button className="btn btn-secondary" type="button" onClick={copyCode} style={{ marginBlockStart: "10px", padding: "7px 13px", fontSize: "12px" }}>{copyLabel}</button></div></div><p style={{ margin: "14px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>{copy.shareNote}</p><div style={{ display: "flex", justifyContent: "flex-end", marginBlockStart: "14px" }}><button className="btn btn-primary" type="button" onClick={closeShare}>{copy.done}</button></div></div></div></>) : null}</div>
  );
}

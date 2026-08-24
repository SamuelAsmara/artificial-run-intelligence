"use client";

/**
 * Training plan — a 1:1 port of
 * design_handoff_ari_athlete_app/ARI Plan.dc.html.
 * Markup converted mechanically; do not restyle by hand.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import {
  MONTHS_LONG, PLAN_COPY, PLAN_EMPTY, PURPOSE, planSegsFor, planWeeks, realPlanWeeks,
  type PlanDay,
} from "@/lib/screens/plan";
import { RACE_LABEL } from "@/lib/coach/templates";
import { BuildPlanCard } from "@/components/plan/BuildPlanCard";
import { plannedMinutes, sessionShape } from "@/lib/planning/sessionShape";
import type { RealPlan } from "@/lib/dashboard/realPlan";
import type { RaceType } from "@/types/database.types";
import { dayCellStyle, SESSION_EDGE, EmptyState, StatTile, STAT_ICONS, type DayState, type SessionType } from "@/components/ui";
import { DayCellFull, FilterChip } from "@/components/ui";
import { monthGrid, monthsOf } from "@/lib/ui/monthGrid";

/** a calendar page — the plan is a schedule before it is anything else */
const CAL_ICON = "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z";

const RACE_KM: Record<string, string> = {
  "5k": "5 km", "10k": "10 km", half: "21.1 km", full: "42.2 km",
};

export interface PlanScreenData {
  plan: RealPlan | null;
  race: { raceType: string; raceDate: string; targetTime: string | null } | null;
  /**
   * Today, as `YYYY-MM-DD`, computed on the server in the athlete's timezone.
   *
   * This screen used to build it from `new Date()` in the component body. It is
   * a client component rendered on the server first, so that ran twice — once
   * in UTC and once in the browser's zone — and between local midnight and
   * 03:00 the countdown said "61 days to race" on the server and "60" after
   * hydration. React logs it as a mismatch; the athlete watches the number
   * change under their eyes.
   */
  today: string;
}


/** Monday first, like every other week in the product. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08" -> "August 2026" */
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

/**
 * A month cell's state.
 *
 * A day with no session is `empty`, not `rest` — a rest day is something the
 * plan decided, and a blank Tuesday in a month that has not started is not.
 */
function monthState(c: { inMonth: boolean; item: PlanDay | null }): DayState {
  const d = c.item;
  if (!d) return "empty";
  if (d.status === "Done") return "done";
  if (d.status === "Missed") return "missed";
  if (d.status === "Today" || d.today) return "today";
  if (d.status === "Adjusted") return "adjusted";
  if (d.type === "rest") return "rest";
  return "planned";
}

function monthType(c: { item: PlanDay | null }): SessionType {
  const t = c.item?.type ?? "rest";
  return t === "int" ? "intervals" : t;
}

export function PlanView({ data }: { data?: PlanScreenData } = {}) {
  /**
   * True when this screen is showing the athlete's own plan.
   *
   * Without `data` at all we are on the reference render, which is the only
   * place `planWeeks()` — the prototype's twelve invented weeks — belongs.
   */
  const isReal = data !== undefined;
  const realPlan = data?.plan ?? null;
  const race = data?.race ?? null;
  const todayIso = () => data?.today ?? "1970-01-01";

  const W = useMemo(
    () => (isReal ? (realPlan ? realPlanWeeks(realPlan.weeks) : []) : planWeeks()),
    [isReal, realPlan],
  );
  const hasPlan = W.length > 0;
  const currentWeek = realPlan?.currentWeek ?? 3;

  const [openWeek, setOpenWeek] = useState(currentWeek);
  const [selDay, setSelDay] = useState(-1);
  /*
   * Weeks or month.
   *
   * The week list is the working view — it opens a week, shows the seven days
   * and the analysis of the one you picked. The month grid answers a different
   * question: what does the shape of this block look like? Where do the long
   * runs fall, how are the hard days spaced, which week is light. Neither
   * replaces the other, so both are here and the athlete picks.
   */
  const [view, setView] = useState<"weeks" | "month">("weeks");

  const copy = PLAN_COPY;
  const P = "var(--color-positive)", N = "var(--color-negative)",
    F = "var(--color-faint)", M = "var(--color-muted)",
    AC = "var(--color-accent)", CA = "var(--color-caution)",
    I = "var(--color-ink)";
  const phC: Record<string, string> = {
    Base: M, Build: AC, Recovery: P, Peak: CA, Sharpen: AC, Taper: P,
  };

  const groups = W.map((wk, w) => {
    const open = openWeek === w;
    const wkStatus = w < currentWeek ? "Done" : w === currentWeek ? "Current" : "";
    const days = wk.days.map((d, i) => {
      // Colour comes from the shared kit now, so a Tuesday in the plan, in the
      // dashboard week strip and on the coach's board are the same object.
      const state: DayState =
        d.status === "Done" ? "done"
          : d.status === "Missed" ? "missed"
            : d.status === "Today" || d.today ? "today"
              : d.status === "Adjusted" ? "adjusted"
                : d.type === "rest" ? "rest"
                  : "planned";
      const k = dayCellStyle(state);
      const selected = open && selDay === i;
      const type: SessionType = d.type === "int" ? "intervals" : d.type;
      return {
        day: d.day + " " + d.dateNum,
        name: d.name,
        dist: d.type === "rest" ? "—" : d.dist + " km",
        status: d.status === "Adjusted" ? "ADJ" : d.status,
        statusColor: k.statusColor,
        nameColor: k.nameColor,
        dayColor: k.dayColor,
        opacity: k.opacity,
        bg: selected ? "var(--color-elevated)" : k.bg,
        // The session-type stripe, and the state ring inset so selecting a day
        // never nudges the six days beside it by a pixel.
        edge: SESSION_EDGE[type],
        ring: selected ? "inset 0 0 0 1px var(--color-line-strong)" : k.ring,
        select: () => {
          setSelDay(openWeek === w && selDay === i ? -1 : i);
          setOpenWeek(w);
        },
      };
    });

    const sel = open && selDay >= 0 ? wk.days[selDay] : null;
    /*
     * A real session is drawn from its own distance and pace.
     *
     * `planSegsFor` hard-codes "800 m rep @ 4:15" — the prototype athlete's
     * track workout — and drew it over every interval day whatever the plan
     * said. It stays for the reference render only.
     */
    const segs = !sel
      ? []
      : isReal
        ? sessionShape({ type: sel.type, distanceKm: sel.dist, pace: sel.pace || null })
        : planSegsFor(sel.type);
    const tot = segs.reduce((s, x) => s + x.m, 0) || 1;
    const barBg = sel ? (sel.missed ? "var(--color-line-strong)" : sel.done ? AC : CA) : "transparent";
    // From the session's own target pace, not from 4.9 or 5.6 minutes per
    // kilometre — two constants that belonged to the prototype's athlete and
    // ignored the pace printed immediately beside them.
    const dur = sel ? plannedMinutes(sel.dist, sel.pace || null) : null;

    return {
      w, open, days, km: wk.km, label: wk.label, range: wk.range,
      phase: wk.phase, monName: wk.monName, monIdx: wk.monIdx,
      phaseColor: phC[wk.phase] || M,
      border: w === currentWeek ? "var(--color-accent-soft)" : "var(--color-line)",
      numColor: w === currentWeek ? AC : I,
      status: wkStatus,
      statusColor: wkStatus === "Done" ? P : wkStatus === "Current" ? AC : F,
      toggle: () => { setOpenWeek(openWeek === w ? -1 : w); setSelDay(-1); },
      hasSel: !!sel,
      selTitle: sel ? sel.name + " · " + sel.day + " " + sel.mon + " " + sel.dateNum : "",
      selMeta: sel
        ? sel.type === "rest"
          ? "Recovery day"
          : [
              `${sel.dist} km`,
              sel.pace ? `@ ${sel.pace}/km` : null,
              dur ? `~${dur} min` : null,
            ].filter(Boolean).join(" · ")
        : "",
      selStatus: sel ? sel.status || "Planned" : "",
      selStatusColor: sel
        ? sel.status === "Done" ? P : sel.status === "Missed" ? N
          : sel.status === "Today" ? AC : sel.status === "Adjusted" ? CA : M
        : M,
      selHasBar: !!sel && sel.type !== "rest" && segs.length > 0,
      selSegments: segs.map((s) => ({
        w: ((s.m / tot) * 100).toFixed(2), h: s.h, bg: barBg, title: s.t,
      })),
      // The prototype spelled out "6 × 800 m @ 4:15 · 90 s jog". We store a
      // type, a distance and a pace — not a rep structure — so a real plan
      // describes what it actually knows.
      selSegStart: isReal ? "" : sel && sel.type === "int" ? "Warm-up 10 min · 5:45"
        : sel && sel.type === "tempo" ? "Warm-up 10 min" : "",
      selSegMid: isReal
        ? sel && sel.dist ? sel.dist + " km" + (sel.pace ? " @ " + sel.pace + "/km" : "") : ""
        : sel && sel.type === "int" ? "6 × 800 m @ 4:15 · 90 s jog"
          : sel && sel.type === "tempo" ? "20 min @ 4:45/km"
            : sel && sel.dist ? sel.dist + " km @ " + sel.pace + "/km" : "",
      selSegEnd: isReal ? "" : sel && (sel.type === "int" || sel.type === "tempo") ? "Cool-down 10 min" : "",
      selPurpose: sel ? PURPOSE[sel.type] : "",
      // An adjustment reason is a specific claim about a specific week. We do
      // not store one per session yet, so a real plan does not assert one.
      /*
       * The real reason, when the engine wrote one.
       *
       * This used to be a fixed sentence — "acute load climbed 12% this week;
       * protecting Saturday's long run" — shown under any adjusted session,
       * describing a week that never happened. Migration 0014 stores the actual
       * reason, and a session a coach set says so instead.
       */
      selAdjusted: !!sel && (!!sel.reason || !!sel.byPerson || (!isReal && sel.status === "Adjusted")),
      selReason: sel?.reason
        ? sel.reason
        : sel?.byPerson
          ? "Set by hand — ARI will not adjust this session automatically."
          : isReal
            ? ""
            : "Downgraded from intervals — acute load climbed 12% this week; protecting Saturday’s long run.",
    };
  });

  /*
   * The year a month heading belongs to.
   *
   * A plan crossing New Year would otherwise print "January 2026" above weeks
   * that are in 2027 — the heading used to have "2026" written into it. The
   * plan's own start month decides: months at or after it are in the start
   * year, months before it have wrapped into the next.
   */
  const planStartMonth = W[0]?.monIdx ?? 0;
  const planStartYear = realPlan
    ? new Date(Date.parse(todayIso())).getFullYear() -
      (currentWeek > 0 && W[0] && W[0].monIdx > (W[Math.min(currentWeek, W.length - 1)]?.monIdx ?? 0) ? 1 : 0)
    : 2026;
  const yearOf = (monIdx: number) => (monIdx < planStartMonth ? planStartYear + 1 : planStartYear);

  /*
   * The page title, subtitle and race banner.
   *
   * All three used to be constants: "Marathon Plan", "Oct 11, 2026 · Target
   * 3:45:00", "Sun Oct 11, 2026 · Marathon · 42.2 km". An athlete training for
   * a 10K in March was shown a marathon in October with a target they never
   * entered — and the required pace under it was derived from that target.
   */
  const raceName = race ? (RACE_LABEL[race.raceType as RaceType] ?? "Race") : null;
  const planTitle = isReal ? (raceName ? `${raceName} plan` : "Training plan") : copy.title;
  const planSubtitle = isReal
    ? race
      ? [race.raceDate, race.targetTime ? `Target ${race.targetTime}` : null]
          .filter(Boolean)
          .join(" \u00b7 ")
      : "No goal race set"
    : copy.subtitle;

  const showRaceBanner = isReal ? !!race : true;
  const raceLine = isReal && race
    ? `${race.raceDate} \u00b7 ${raceName} \u00b7 ${RACE_KM[race.raceType] ?? ""}`.trim()
    : copy.raceLine;
  const raceTargetLine = isReal
    ? race?.targetTime
      ? `Target ${race.targetTime}`
      : "No target time set"
    : copy.raceTarget;

  type Group = (typeof groups)[number];
  const months: { idx: number; name: string; weeks: Group[] }[] = [];
  groups.forEach((g) => {
    let m = months[months.length - 1];
    if (!m || m.idx !== g.monIdx) {
      m = { idx: g.monIdx, name: `${MONTHS_LONG[g.monIdx]} ${yearOf(g.monIdx)}`, weeks: [] };
      months.push(m);
    }
    m.weeks.push(g);
  });

  /*
   * Every plan day, flat, for the month grid.
   *
   * Deliberately the same objects the week rows use — a month view built from
   * a second source is a month view that will one day disagree with the week
   * beneath it.
   */
  // A day with no ISO date cannot be placed in a grid; drop it rather than
  // guessing, so a half-dated plan shows fewer cells instead of wrong ones.
  const allDays = useMemo(() => W.flatMap((wk) => wk.days).filter((d) => d.date), [W]);
  const monthGrids = useMemo(
    () => monthsOf(allDays).map((m) => ({ month: m, grid: monthGrid(m, allDays) })),
    [allDays],
  );

  const totalKm = W.reduce((s, w) => s + w.km, 0);

  // Every figure below used to be a literal: "12 weeks · 4 completed",
  // "74 km · Peak week (W9)", and a "61 days" that was simply 11 Aug to 11 Oct
  // 2026 and would have read 61 days forever.
  const peak = W.reduce((best, w, i) => (w.km > (W[best]?.km ?? -1) ? i : best), 0);
  const daysToRace = race
    ? Math.round((Date.parse(race.raceDate) - Date.parse(todayIso())) / 86_400_000)
    : null;

  // Figure and unit are separate now — the kit's stat tile sets the figure at
  // 25px and drops the unit to 11px beside it, which is where the hierarchy
  // comes from. Merged strings like "12 weeks" would set the word at 25px too.
  const planStats: { v: string | null; unit?: string; name: string; icon: string }[] = isReal
    ? [
        { v: String(W.length), unit: W.length === 1 ? "week" : "weeks", name: `Plan length · ${Math.max(0, currentWeek)} done`, icon: STAT_ICONS.clock },
        { v: String(totalKm), unit: "km", name: "Total planned volume", icon: STAT_ICONS.chart },
        { v: String(W[peak]?.km ?? 0), unit: "km", name: `Peak week (W${peak + 1})`, icon: STAT_ICONS.flame },
        {
          v: daysToRace === null ? null : String(Math.max(0, daysToRace)),
          unit: "days",
          name: "To race day",
          icon: STAT_ICONS.trophy,
        },
      ]
    : [
        { v: "12", unit: "weeks", name: "Plan length · 4 done", icon: STAT_ICONS.clock },
        { v: String(totalKm), unit: "km", name: "Total planned volume", icon: STAT_ICONS.chart },
        { v: "74", unit: "km", name: "Peak week (W9)", icon: STAT_ICONS.flame },
        { v: "61", unit: "days", name: "To race day", icon: STAT_ICONS.trophy },
      ];

  return (
<div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }}></span><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span></div><div style={{ textAlign: "start" }}><h1 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{planTitle}</h1><p style={{ margin: "0", fontSize: "11.5px", color: "var(--color-muted)" }}>{planSubtitle}</p></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}><a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a><a href="/plan" style={{ color: "var(--color-ink)" }}>{copy.navPlan}</a><a href="/activities" style={{ color: "var(--color-muted)" }}>{copy.navActivities}</a><a href="/settings" style={{ color: "var(--color-muted)" }}>{copy.navSettings}</a></nav><div style={{ flex: "1" }}></div></header>{(!hasPlan) ? (isReal ? (<BuildPlanCard hasRace={race !== null} raceLine={raceLine} />) : (<EmptyState icon={CAL_ICON} message={<><span style={{ display: "block", fontSize: "15px", fontWeight: 600, color: "var(--color-ink)", marginBlockEnd: "8px" }}>{PLAN_EMPTY.title}</span>{PLAN_EMPTY.body}</>} style={{ maxWidth: "620px", marginInline: "auto", width: "100%" }} action={<a className="btn btn-primary" href="/settings">{PLAN_EMPTY.cta}</a>} />)) : null}{(hasPlan) ? (<><section className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>{planStats.map((s, _i1) => (<React.Fragment key={_i1}><StatTile value={s.v} unit={s.unit} label={s.name} icon={s.icon} /></React.Fragment>))}</section><div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", marginBlockStart: "4px" }}><FilterChip active={view === "weeks"} onClick={() => setView("weeks")}>{copy.viewWeeks}</FilterChip><FilterChip active={view === "month"} onClick={() => setView("month")}>{copy.viewMonth}</FilterChip></div>{view === "weeks" ? (<>{months.map((mo, _i2) => (<React.Fragment key={_i2}><section><h2 className="num" style={{ margin: "10px 0 8px", fontSize: "12px", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-faint)" }}>{mo.name}</h2><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{mo.weeks.map((w, _i3) => (<React.Fragment key={_i3}><div className="card" style={{ overflow: "hidden", borderColor: w.border }}><button className="wk-row" type="button" onClick={w.toggle} style={{ width: "100%", display: "grid", gridTemplateColumns: "96px 1fr auto auto auto", alignItems: "center", gap: "16px", padding: "13px 18px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--color-ink)", textAlign: "start" }}><span className="num" style={{ fontSize: "13px", fontWeight: "500", color: w.numColor }}>{w.label}</span><span className="num hide-m" style={{ fontSize: "11.5px", color: "var(--color-faint)" }}>{w.range}</span>{(w.phase) ? (<span className="tag hide-m" style={{ background: "var(--color-elevated)", color: w.phaseColor }}>{w.phase}</span>) : (<span className="hide-m" />)}<span className="num" style={{ fontSize: "12px", color: "var(--color-muted)", minWidth: "56px", textAlign: "end" }}>{w.km} km</span><span className="num" style={{ fontSize: "10px", letterSpacing: ".06em", textTransform: "uppercase", color: w.statusColor, minWidth: "64px", textAlign: "end" }}>{w.status}</span></button>{(w.open) ? (<><div style={{ borderBlockStart: "1px solid var(--color-line)", padding: "14px 18px 16px" }}><div className="wk-days" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "8px" }}>{w.days.map((d, _i4) => (<React.Fragment key={_i4}><button className="dc-hover-border" type="button" onClick={d.select} style={{ textAlign: "start", fontFamily: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", gap: "6px", padding: "10px 11px", borderRadius: "var(--radius-control)", background: d.bg, border: "none", borderInlineStart: `2px solid ${d.edge}`, boxShadow: d.ring, opacity: d.opacity, minHeight: "92px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "6px", width: "100%" }}><span className="num" style={{ fontSize: "10px", letterSpacing: ".1em", textTransform: "uppercase", color: d.dayColor, whiteSpace: "nowrap" }}>{d.day}</span><span className="num" style={{ fontSize: "8.5px", letterSpacing: ".04em", textTransform: "uppercase", color: d.statusColor, whiteSpace: "nowrap", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis" }}>{d.status}</span></div><div style={{ flex: "1" }}><p style={{ margin: "0", fontSize: "12px", fontWeight: "500", color: d.nameColor }}>{d.name}</p><p className="num" style={{ margin: "2px 0 0", fontSize: "10.5px", color: "var(--color-faint)" }}>{d.dist}</p></div></button></React.Fragment>))}</div>{(w.hasSel) ? (<><div style={{ marginBlockStart: "12px", borderBlockStart: "1px solid var(--color-line)", paddingBlockStart: "14px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}><div><h3 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{w.selTitle}</h3><p className="num" style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-muted)" }}>{w.selMeta}</p></div><span className="tag" style={{ background: "var(--color-elevated)", color: w.selStatusColor }}>{w.selStatus}</span></div>{(w.selHasBar) ? (<><div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "48px", marginBlockStart: "12px" }}>{w.selSegments.map((s, _i5) => (<React.Fragment key={_i5}><div title={s.title} style={{ width: `${s.w}%`, height: `${s.h}px`, background: s.bg, borderRadius: "3px 3px 0 0" }}></div></React.Fragment>))}</div><div className="num" style={{ display: "flex", justifyContent: "space-between", marginBlockStart: "5px" }}><span style={{ fontSize: "10px", color: "var(--color-faint)" }}>{w.selSegStart}</span><span style={{ fontSize: "10px", color: "var(--color-muted)" }}>{w.selSegMid}</span><span style={{ fontSize: "10px", color: "var(--color-faint)" }}>{w.selSegEnd}</span></div></>) : null}<p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-muted)", textWrap: "pretty" }}>{w.selPurpose}</p>{(w.selAdjusted) ? (<><p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--color-caution)" }}>{w.selReason}</p></>) : null}</div></>) : null}</div></>) : null}</div></React.Fragment>))}</div></section></React.Fragment>))}</>) : (<>{monthGrids.map((mg) => (<React.Fragment key={mg.month}><section><h2 className="num" style={{ margin: "10px 0 8px", fontSize: "12px", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-faint)" }}>{monthLabel(mg.month)}</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px" }}>{WEEKDAYS.map((wd) => (<span key={wd} className="num" style={{ fontSize: "9px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "center", paddingBlockEnd: "2px" }}>{wd}</span>))}{mg.grid.cells.map((c) => (<DayCellFull key={c.iso} day={String(c.dayOfMonth)} state={monthState(c)} type={monthType(c)} name={c.item ? c.item.name : ""} meta={c.item && c.item.type !== "rest" ? `${c.item.dist} km` : undefined} style={{ minHeight: "78px", ...(c.inMonth ? null : { opacity: 0.38 }) }} />))}</div></section></React.Fragment>))}</>)}{(showRaceBanner) ? (<section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "13px 20px", borderColor: "var(--color-accent-soft)" }}><div style={{ display: "flex", alignItems: "center", gap: "12px" }}><span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>{copy.raceTag}</span><p className="num" style={{ margin: "0", fontSize: "13px" }}>{raceLine}</p></div><span className="num" style={{ fontSize: "12px", color: "var(--color-muted)" }}>{raceTargetLine}</span></section>) : null}</>) : null}</div>
  );
}

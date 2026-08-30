"use client";

/**
 * Training plan — a calendar, not an accordion.
 *
 * This used to be two views: a stacked list of every week in the plan (each
 * one expandable), and a toggle that stacked every month's grid underneath
 * it instead. Both put the whole plan on one page — a sixteen-week plan was
 * sixteen cards, or four month-grids, one after another, and finding "what
 * does next Tuesday look like" meant scrolling past everything between here
 * and there.
 *
 * A real calendar shows one month and lets you turn the page. That is the
 * whole change: one `monthGrid`, Previous/Next, and the day you tap opens
 * its detail underneath — the same session detail the old week view showed,
 * just reached by tapping a date instead of opening an accordion row.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import {
  PLAN_COPY, PLAN_EMPTY, PURPOSE, planSegsFor, planWeeks, realPlanWeeks,
  type PlanDay,
} from "@/lib/screens/plan";
import { RACE_LABEL } from "@/lib/coach/templates";
import { BuildPlanCard } from "@/components/plan/BuildPlanCard";
import { plannedMinutes, sessionShape } from "@/lib/planning/sessionShape";
import type { RealPlan } from "@/lib/dashboard/realPlan";
import type { RaceType } from "@/types/database.types";
import { dayCellStyle, EmptyState, StatTile, STAT_ICONS, type DayState, type SessionType } from "@/components/ui";
import { DayCellFull } from "@/components/ui";
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

/** Sunday first, like every other week in the product. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
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

/*
 * The phase palette — the same colours the old week list's chips used, so
 * "Build is blue, Peak is amber" survives the redesign.
 */
const PHASE_COLOR: Record<string, string> = {
  Base: "var(--color-line-strong)",
  Build: "var(--color-accent)",
  Recovery: "var(--color-positive)",
  Peak: "var(--color-caution)",
  Sharpen: "var(--color-accent)",
  Taper: "var(--color-positive)",
};

/** Bar colours are fills; labels need to be readable, so Base lightens. */
function phaseText(phase: string): string {
  if (phase === "Base") return "var(--color-muted)";
  return PHASE_COLOR[phase] ?? "var(--color-muted)";
}

/**
 * The arc of the plan — base → build → peak → taper — as one slim timeline
 * with a marker riding the current week.
 *
 * Built from the phases stored on the plan's own rows (migration 0020), so the
 * segment widths are the proportions the generator — or the coach's template —
 * actually decided, not a re-derivation. A plan whose rows predate the
 * migration has no phases, and the bar hides itself rather than inventing an
 * arc; rebuilding the plan brings it back.
 */
function PhaseTimeline({
  weeks,
  currentWeek,
}: {
  weeks: { phase: string }[];
  currentWeek: number;
}) {
  const spans = useMemo(() => {
    const out: { phase: string; from: number; to: number }[] = [];
    weeks.forEach((w, i) => {
      const last = out[out.length - 1];
      if (last && last.phase === w.phase) last.to = i;
      else out.push({ phase: w.phase, from: i, to: i });
    });
    return out;
  }, [weeks]);

  const total = weeks.length;
  if (total === 0 || spans.some((s) => !s.phase)) return null;

  const now = Math.min(Math.max(0, currentWeek), total - 1);
  const current = weeks[now]?.phase ?? "";
  const pct = ((now + 0.5) / total) * 100;

  return (
    <section className="card" style={{ padding: "14px 20px 12px" }} aria-label="Plan phases">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-faint)" }}>
          Where you are in the plan
        </span>
        <span className="num" style={{ fontSize: "11.5px", color: phaseText(current) }}>
          Week {now + 1} of {total} · {current}
        </span>
      </div>
      <div style={{ position: "relative", marginBlockStart: "12px", paddingBlockStart: "6px" }}>
        <div style={{ display: "flex", gap: "3px" }}>
          {spans.map((s) => (
            <div
              key={s.from}
              title={`${s.phase} · W${s.from + 1}${s.to === s.from ? "" : `–${s.to + 1}`}`}
              style={{
                flexGrow: s.to - s.from + 1,
                flexBasis: 0,
                height: "7px",
                borderRadius: "var(--radius-pill)",
                background: PHASE_COLOR[s.phase] ?? "var(--color-line-strong)",
                opacity: s.from <= now && now <= s.to ? 1 : 0.38,
              }}
            />
          ))}
        </div>
        {/* the "you are here" dot, centred on the current week */}
        <div
          aria-hidden
          style={{
            position: "absolute", top: "5px", left: `${pct}%`, transform: "translateX(-50%)",
            width: "9px", height: "9px", borderRadius: "50%",
            background: "var(--color-ink)", border: "2px solid var(--color-canvas)",
            boxShadow: "0 0 0 1px var(--color-line-strong)",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: "3px", marginBlockStart: "7px" }}>
        {spans.map((s) => {
          const weeksIn = s.to - s.from + 1;
          const on = s.from <= now && now <= s.to;
          // A one-week sliver has no room for a caption; its tooltip carries it.
          const roomy = weeksIn / total >= 0.14;
          return (
            <div key={s.from} style={{ flexGrow: weeksIn, flexBasis: 0, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
              {roomy ? (
                <>
                  <span style={{ fontSize: "10.5px", fontWeight: on ? 600 : 500, color: phaseText(s.phase) }}>{s.phase}</span>
                  <span className="num" style={{ fontSize: "9.5px", color: "var(--color-faint)", marginInlineStart: "5px" }}>
                    {weeksIn === 1 ? `W${s.from + 1}` : `W${s.from + 1}–${s.to + 1}`}
                  </span>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
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

  const W = useMemo(
    () => (isReal ? (realPlan ? realPlanWeeks(realPlan.weeks) : []) : planWeeks()),
    [isReal, realPlan],
  );
  const hasPlan = W.length > 0;
  const currentWeek = realPlan?.currentWeek ?? 3;

  const copy = PLAN_COPY;
  const P = "var(--color-positive)", N = "var(--color-negative)",
    M = "var(--color-muted)", AC = "var(--color-accent)", CA = "var(--color-caution)";

  /*
   * Every plan day, flat, with its own ISO date — the one source both the
   * month picker and the grid read from, so they can never disagree about
   * which months exist or what falls on a given date.
   */
  const allDays = useMemo(() => W.flatMap((wk) => wk.days).filter((d) => d.date), [W]);

  /** Every month the plan touches, in order — "2026-08", "2026-09", ... */
  const availableMonths = useMemo(() => monthsOf(allDays), [allDays]);

  /** The month today falls in, when today is inside the plan at all. */
  const todayMonth = useMemo(() => {
    if (isReal) return data?.today ? data.today.slice(0, 7) : null;
    const t = allDays.find((d) => d.today);
    return t ? t.date.slice(0, 7) : null;
  }, [isReal, data?.today, allDays]);

  const [monthIndex, setMonthIndex] = useState(() => {
    const i = todayMonth ? availableMonths.indexOf(todayMonth) : -1;
    return i >= 0 ? i : 0;
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const currentMonth = availableMonths[monthIndex] ?? null;
  const grid = useMemo(
    () => (currentMonth ? monthGrid(currentMonth, allDays) : null),
    [currentMonth, allDays],
  );

  const stepMonth = (delta: number) => {
    setMonthIndex((i) => Math.min(availableMonths.length - 1, Math.max(0, i + delta)));
    setSelectedDate(null);
  };
  const todayMonthIndex = todayMonth ? availableMonths.indexOf(todayMonth) : -1;
  const showTodayButton = todayMonthIndex >= 0 && monthIndex !== todayMonthIndex;
  const jumpToday = () => {
    if (todayMonthIndex < 0) return;
    setMonthIndex(todayMonthIndex);
    setSelectedDate(null);
  };

  const selDayData: PlanDay | null = useMemo(
    () => (selectedDate ? allDays.find((d) => d.date === selectedDate) ?? null : null),
    [selectedDate, allDays],
  );

  /*
   * The selected day's detail — its segment bar, its purpose, and the real
   * reason behind any adjustment. The same shape the old week view computed
   * per open row, now computed once for whichever date was tapped.
   */
  const selDisplay = useMemo(() => {
    const sel = selDayData;
    if (!sel) return null;
    const segs = isReal
      ? sessionShape({ type: sel.type, distanceKm: sel.dist, pace: sel.pace || null })
      : planSegsFor(sel.type);
    const tot = segs.reduce((s, x) => s + x.m, 0) || 1;
    const barBg = sel.missed ? "var(--color-line-strong)" : sel.done ? AC : CA;
    const dur = plannedMinutes(sel.dist, sel.pace || null);
    return {
      title: `${sel.name} · ${sel.day} ${sel.mon} ${sel.dateNum}`,
      meta: sel.type === "rest"
        ? "Recovery day"
        : [`${sel.dist} km`, sel.pace ? `@ ${sel.pace}/km` : null, dur ? `~${dur} min` : null]
            .filter(Boolean)
            .join(" · "),
      status: sel.status || "Planned",
      statusColor: sel.status === "Done" ? P : sel.status === "Missed" ? N
        : sel.status === "Today" ? AC : sel.status === "Adjusted" ? CA : M,
      hasBar: sel.type !== "rest" && segs.length > 0,
      segments: segs.map((s) => ({ w: ((s.m / tot) * 100).toFixed(2), h: s.h, bg: barBg, title: s.t })),
      // The prototype spelled out "6 × 800 m @ 4:15 · 90 s jog". We store a
      // type, a distance and a pace — not a rep structure — so a real plan
      // describes what it actually knows.
      segStart: isReal ? "" : sel.type === "int" ? "Warm-up 10 min · 5:45"
        : sel.type === "tempo" ? "Warm-up 10 min" : "",
      segMid: isReal
        ? (sel.dist ? sel.dist + " km" + (sel.pace ? " @ " + sel.pace + "/km" : "") : "")
        : sel.type === "int" ? "6 × 800 m @ 4:15 · 90 s jog"
          : sel.type === "tempo" ? "20 min @ 4:45/km"
            : sel.dist ? sel.dist + " km @ " + sel.pace + "/km" : "",
      segEnd: isReal ? "" : (sel.type === "int" || sel.type === "tempo") ? "Cool-down 10 min" : "",
      purpose: PURPOSE[sel.type],
      // An adjustment reason is a specific claim about a specific week. We do
      // not store one per session yet, so a real plan does not assert one.
      adjusted: !!sel.reason || !!sel.byPerson || (!isReal && sel.status === "Adjusted"),
      reason: sel.reason
        ? sel.reason
        : sel.byPerson
          ? "Set by hand — ARI will not adjust this session automatically."
          : isReal
            ? ""
            : "Downgraded from intervals — acute load climbed 12% this week; protecting Saturday’s long run.",
    };
  }, [selDayData, isReal]);

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
          .join(" · ")
      : "No goal race set"
    : copy.subtitle;

  const showRaceBanner = isReal ? !!race : true;
  const raceLine = isReal && race
    ? `${race.raceDate} · ${raceName} · ${RACE_KM[race.raceType] ?? ""}`.trim()
    : copy.raceLine;
  const raceTargetLine = isReal
    ? race?.targetTime
      ? `Target ${race.targetTime}`
      : "No target time set"
    : copy.raceTarget;

  const totalKm = W.reduce((s, w) => s + w.km, 0);

  // Every figure below used to be a literal: "12 weeks · 4 completed",
  // "74 km · Peak week (W9)", and a "61 days" that was simply 11 Aug to 11 Oct
  // 2026 and would have read 61 days forever.
  const peak = W.reduce((best, w, i) => (w.km > (W[best]?.km ?? -1) ? i : best), 0);
  const daysToRace = race
    ? Math.round((Date.parse(race.raceDate) - Date.parse(data?.today ?? "1970-01-01")) / 86_400_000)
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
<div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }}></span><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span></div><div style={{ textAlign: "start" }}><h1 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{planTitle}</h1><p style={{ margin: "0", fontSize: "11.5px", color: "var(--color-muted)" }}>{planSubtitle}</p></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}><a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a><a href="/plan" style={{ color: "var(--color-ink)" }}>{copy.navPlan}</a><a href="/activities" style={{ color: "var(--color-muted)" }}>{copy.navActivities}</a><a href="/settings" style={{ color: "var(--color-muted)" }}>{copy.navSettings}</a></nav><div style={{ flex: "1" }}></div></header>{(!hasPlan) ? (isReal ? (<BuildPlanCard hasRace={race !== null} raceLine={raceLine} />) : (<EmptyState icon={CAL_ICON} message={<><span style={{ display: "block", fontSize: "15px", fontWeight: 600, color: "var(--color-ink)", marginBlockEnd: "8px" }}>{PLAN_EMPTY.title}</span>{PLAN_EMPTY.body}</>} style={{ maxWidth: "620px", marginInline: "auto", width: "100%" }} action={<a className="btn btn-primary" href="/settings">{PLAN_EMPTY.cta}</a>} />)) : null}{(hasPlan) ? (<><section className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>{planStats.map((s, _i1) => (<React.Fragment key={_i1}><StatTile value={s.v} unit={s.unit} label={s.name} icon={s.icon} /></React.Fragment>))}</section><PhaseTimeline weeks={W} currentWeek={currentWeek} /><section className="card" style={{ padding: "16px 18px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}><h2 className="num" style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{currentMonth ? monthLabel(currentMonth) : ""}</h2><div style={{ display: "flex", alignItems: "center", gap: "8px" }}>{(showTodayButton) ? (<button className="btn btn-secondary" type="button" onClick={jumpToday} style={{ padding: "5px 10px", fontSize: "11.5px" }}>Today</button>) : null}<button className="btn btn-secondary" type="button" onClick={() => stepMonth(-1)} disabled={monthIndex <= 0} style={{ padding: "5px 10px" }} aria-label="Previous month"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button><span className="num" style={{ fontSize: "11px", color: "var(--color-faint)", minWidth: "46px", textAlign: "center" }}>{monthIndex + 1} / {availableMonths.length}</span><button className="btn btn-secondary" type="button" onClick={() => stepMonth(1)} disabled={monthIndex >= availableMonths.length - 1} style={{ padding: "5px 10px" }} aria-label="Next month"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></button></div></div><div className="cal-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px", marginBlockStart: "14px" }}>{WEEKDAYS.map((wd) => (<span key={wd} className="num" style={{ fontSize: "9px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "center", paddingBlockEnd: "2px" }}>{wd}</span>))}{(grid?.cells ?? []).map((c) => (<DayCellFull key={c.iso} day={String(c.dayOfMonth)} state={monthState(c)} type={monthType(c)} name={c.item ? c.item.name : ""} meta={c.item && c.item.type !== "rest" ? <>{c.item.dist}<span className="cal-unit"> km</span></> : undefined} onClick={() => setSelectedDate(c.iso)} style={{ minHeight: 76, ...(c.inMonth ? null : { opacity: 0.35 }), boxShadow: selectedDate === c.iso ? "inset 0 0 0 2px var(--color-accent)" : dayCellStyle(monthState(c)).ring }} />))}</div></section>{(selDisplay) ? (<section className="card" style={{ padding: "16px 20px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}><div><h3 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{selDisplay.title}</h3><p className="num" style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-muted)" }}>{selDisplay.meta}</p></div><span className="tag" style={{ background: "var(--color-elevated)", color: selDisplay.statusColor }}>{selDisplay.status}</span></div>{(selDisplay.hasBar) ? (<><div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "48px", marginBlockStart: "12px" }}>{selDisplay.segments.map((s, _i5) => (<React.Fragment key={_i5}><div title={s.title} style={{ width: `${s.w}%`, height: `${s.h}px`, background: s.bg, borderRadius: "3px 3px 0 0" }}></div></React.Fragment>))}</div><div className="num" style={{ display: "flex", justifyContent: "space-between", marginBlockStart: "5px" }}><span style={{ fontSize: "10px", color: "var(--color-faint)" }}>{selDisplay.segStart}</span><span style={{ fontSize: "10px", color: "var(--color-muted)" }}>{selDisplay.segMid}</span><span style={{ fontSize: "10px", color: "var(--color-faint)" }}>{selDisplay.segEnd}</span></div></>) : null}<p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-muted)", textWrap: "pretty" }}>{selDisplay.purpose}</p>{(selDisplay.adjusted) ? (<><p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--color-caution)" }}>{selDisplay.reason}</p></>) : null}</section>) : null}{(showRaceBanner) ? (<section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "13px 20px", borderColor: "var(--color-accent-soft)" }}><div style={{ display: "flex", alignItems: "center", gap: "12px" }}><span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>{copy.raceTag}</span><p className="num" style={{ margin: "0", fontSize: "13px" }}>{raceLine}</p></div><span className="num" style={{ fontSize: "12px", color: "var(--color-muted)" }}>{raceTargetLine}</span></section>) : null}</>) : null}</div>
  );
}

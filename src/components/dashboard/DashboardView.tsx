"use client";

/**
 * Athlete dashboard — the home screen.
 *
 * Renders the readiness score, today's narrative, the fitness / fatigue / form
 * chart, the current plan week, the next session and the right-hand rail
 * (calendar, weekly volume, race countdown, recent runs, personal records).
 * Every number comes from `DashboardData`, which the page computes on the
 * server from the athlete's own rows; a section with nothing behind it says so
 * rather than inventing a figure.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { ReasoningPanel } from "@/components/dashboard/ReasoningPanel";
import { sessionLine } from "@/lib/dashboard/sessionLine";
import type { Narrative } from "@/lib/narrative/buildNarrative";
import { realSessionSegments, relativeDay, type RealPlan } from "@/lib/dashboard/realPlan";
import type { PersonalRecord } from "@/lib/dashboard/personalRecords";
import type { RaceCountdown, VolumeBar } from "@/lib/dashboard/rail";
import {
  BrandMark,
  Entrance,
  MiniBars,
  dayCellStyle,
  SESSION_EDGE,
  type DayState,
  type SessionType,
} from "@/components/ui";
import { BAR_BOX_RAIL } from "@/components/ui/MiniBars";
import { NO_VALUE } from "@/lib/dashboard/presentation";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/time/week";
import { ICON as NB_ICON, NUMBERS_HUE } from "@/lib/screens/numbers";
import { sessionShape } from "@/lib/planning/sessionShape";
import { buildPmc, calHead, calendar, COPY, type Week } from "@/lib/dashboard/model";

const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Stable empty lists, so a dashboard with no plan or no runs does not re-memoise every render. */
const NO_WEEKS: Week[] = [];
const NO_VOLUMES: VolumeBar[] = [];

/**
 * The athlete's own data, computed on the server from readiness_snapshots,
 * activities and plan_workouts. Optional fields are sections the athlete may
 * not have yet — no plan, no runs, no goal race — and each renders its own
 * empty wording.
 */
export interface DashboardData {
  /** fitness / fatigue / form, oldest first, with an ISO date per point */
  pmcSeries: { C: number[]; A: number[]; T: number[]; D: string[] };
  /** acute:chronic load ratio, or null when history is too short */
  loadRatio: number | null;
  recentActivities?: {
    /** the activity's own id — every row must link to its own run */
    id?: string;
    date: string;
    km: string;
    pace: string;
    spark: string;
    sparkColor: string;
  }[];
  /** Today's coaching narrative, computed by src/lib/narrative/buildNarrative. */
  narrative?: Narrative;
  /** The athlete's own training plan, from `plan_workouts`; absent when they have none. */
  plan?: RealPlan;
  /**
   * Personal records derived from stored per-activity best efforts. A row with
   * a null time renders as a dash — we never estimate one distance from
   * another and label the result a record.
   */
  personalRecords?: PersonalRecord[];
  /** heart-rate drift on the most recent qualifying run, in percent */
  cardiacDriftPct?: number;
  /** The photo they uploaded in Settings, from `profiles.avatar_url`. */
  avatarUrl?: string | null;
  /**
   * Today, as `YYYY-MM-DD` in the athlete's timezone, computed on the server.
   *
   * Anything on this screen that needs "what day is it" reads this rather than
   * calling `new Date()` — see the note on `calCursor`.
   */
  today: string;
  /**
   * The date of the newest stored readiness snapshot.
   *
   * The screen presents `series[series.length - 1]` as if it were today's, with
   * no date attached. When an API key expires the nightly job stops writing and
   * the whole dashboard — ring, fitness/fatigue/form, narrative — keeps showing
   * the last good day, indefinitely, looking perfectly healthy. Knowing *when*
   * the number is from is the difference between a reading and a fossil.
   */
  readinessAsOf: string;
  /** the athlete's own name, for the greeting */
  athleteName?: string | null;
  /** the right-hand rail, computed from real runs and the real plan */
  rail?: {
    volumes: VolumeBar[];
    volumeSummary: { km: number; changePct: number | null };
    calendarDots: Record<number, string>;
    streak: number;
    race: RaceCountdown | null;
    /** the athlete's own goal time, or null when they never set one */
    raceTarget: string | null;
    /** Riegel prediction from the athlete's longest personal best, with a word on how it sits against the target */
    racePrediction?: {
      text: string;
      label: string;
      tone: "positive" | "caution" | "neutral";
    } | null;
  };
}

export function DashboardView({
  readinessScore,
  data,
}: {
  /** today's readiness score, or undefined when no snapshot has one */
  readinessScore?: number;
  data: DashboardData;
}) {
  const pmc = useMemo(() => buildPmc(data.pmcSeries), [data.pmcSeries]);
  const realPlan = data.plan;
  const W = realPlan?.weeks ?? NO_WEEKS;
  const hasPlan = W.length > 0;
  // The next session, when there is a real plan.
  const next = realPlan?.next ?? null;
  const segments = useMemo(() => (next ? realSessionSegments(next) : []), [next]);
  // The next session as a stepped pace line. See lib/dashboard/sessionLine.
  const nextLine = useMemo(() => sessionLine(segments), [segments]);

  const rail = data.rail;
  const vols = rail?.volumes ?? NO_VOLUMES;
  const activities = data.recentActivities ?? [];
  const { ctlPath, atlPath, tsbPath, ctlArea, tsbArea, pmcGrid, pmcWeeks, pmcEnds } = pmc;

  const [weekView, setWeekView] = useState(realPlan?.currentWeek ?? 0);
  const [selD, setSelD] = useState(-1);
  /*
   * The month the little calendar opens on.
   *
   * Seeded from `data.today` — a string the server already computed in the
   * athlete's timezone — rather than from `new Date()` in the browser. This is a
   * client component that renders on the server first, so a bare `new Date()`
   * is evaluated once in UTC and again during hydration in the athlete's zone,
   * and between local midnight and 03:00 the two disagree about which month it
   * is. React calls that a hydration mismatch; the athlete sees the calendar
   * jump to a different month a moment after it appears.
   */
  const [calCursor, setCalCursor] = useState(() => ({
    year: Number(data.today.slice(0, 4)),
    month: Number(data.today.slice(5, 7)) - 1,
  }));
  const [pmcHi, setPmcHi] = useState(-1);
  const [reasonOpen, setReasonOpen] = useState(false);

  const copy = COPY;
  // No default. A dashboard with no stored score shows a dash.
  const score = Math.round(readinessScore ?? NaN);

  /*
   * Volume strip, on the shared kit's bar chart. Twelve calendar weeks, so the
   * strip can be read against a diary — and no week is ever dropped, because a
   * week with nothing in it is data, not an absence of it.
   *
   * Only every third week is labelled. Twelve 9px axis figures inside a 256-unit
   * viewBox come out at about 5px on a 288px rail and are unreadable; four of
   * them plus "now" tell the eye where it is without the crowding.
   */
  const volBars = useMemo(
    () =>
      vols.map((v, i) => {
        const isNow = i === vols.length - 1;
        return {
          value: Math.round(v.km * 10) / 10,
          label: isNow ? "now" : i % 3 === 0 ? `W${v.isoWeek}` : "",
          current: isNow,
        };
      }),
    [vols],
  );
  const volNowLabel = rail?.race
    ? `▲ W${rail.race.isoWeek} · ${rail.race.weekNumber}/${rail.race.totalWeeks}`
    : `▲ W${vols[vols.length - 1]?.isoWeek ?? ""}`;

  // Header, countdown and streak.
  // "0 day streak" says nothing worth a flame; the indicator appears only once a streak exists.
  const streakLabel = rail && rail.streak > 0 ? `${rail.streak} day streak` : "";
  const greeting = data.athleteName ? `Hello, ${data.athleteName}` : "Hello";
  const raceDays = rail?.race ? `${rail.race.days} days` : NO_VALUE;
  const raceName = rail?.race ? rail.race.label : "no goal race set";
  const raceProgLabel = rail?.race
    ? `Plan progress · W${rail.race.isoWeek} · ${rail.race.weekNumber} of ${rail.race.totalWeeks}`
    : "No plan yet";
  const raceProgPct = rail?.race ? `${rail.race.progressPct}%` : NO_VALUE;
  const raceProgWidth = rail?.race ? `${rail.race.progressPct}%` : "0%";
  /*
   * The line under the greeting: the race countdown when there is a goal race,
   * otherwise the date and nothing else.
   */
  const headerContext = rail?.race
    ? rail.race.label.replace("to race day · ", "")
    : new Intl.DateTimeFormat(APP_LOCALE, {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: APP_TIME_ZONE,
      }).format(new Date());

  // Personal records from what was actually run. A distance never covered shows
  // a dash rather than a fabricated time.
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const prBand = (data.personalRecords ?? []).map((r, i) => {
    const d = r.date ? new Date(r.date + "T00:00:00") : null;
    return {
      key: r.key,
      dist: r.label,
      time: r.time ?? "—",
      date: d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : "not yet run",
      note: r.time === null ? "" : r.isNew ? "New PB" : "PB",
      noteColor: r.isNew ? "var(--color-gold)" : "var(--color-faint)",
      divider: i === 0 ? "transparent" : "var(--color-line)",
      href: r.activityId ? `/activities/${r.activityId}` : null,
    };
  });

  /**
   * How many days behind today the newest snapshot is.
   *
   * One day is normal: the nightly job writes yesterday's completed picture.
   * Two or more means nothing has been written since, and the athlete is
   * looking at history labelled as the present.
   */
  const staleDays = Math.round(
    (Date.parse(data.today + "T00:00:00Z") - Date.parse(data.readinessAsOf + "T00:00:00Z")) /
      86_400_000,
  );
  const staleNote = staleDays >= 2 ? `As of ${data.readinessAsOf} — nothing newer has synced.` : "";

  // Today's narrative, when the engine has produced one.
  const narrative = data.narrative;
  const narrativeText = narrative?.body ?? "";
  const nextTitle = next ? `Next session · ${next.name}` : "";
  const nextMeta = next
    ? [
        relativeDay(next.date),
        `${(next.distanceM / 1000).toFixed(1)} km`,
        next.pace ? `${next.pace}/km` : null,
        next.durationSec ? `~${Math.round(next.durationSec / 60)} min` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  // Whether there is a real session to draw; otherwise the card explains how to get one.
  const showNextCard = next !== null;

  // The caption under the readiness ring names today's session. With no plan
  // there is no session to name, so it says nothing.
  const todayLine = next
    ? `${relativeDay(next.date)} · ${next.name} ${(next.distanceM / 1000).toFixed(1)} km`
    : "";

  // A target is the athlete's own number; a prediction comes from their PBs.
  const raceTargetText = rail?.raceTarget ?? "—";
  const racePredText = rail?.racePrediction?.text ?? "—";
  const racePredLabelText = rail?.racePrediction?.label ?? "Needs a personal best";
  const racePredColor = rail?.racePrediction
    ? rail.racePrediction.tone === "positive"
      ? "var(--color-positive)"
      : rail.racePrediction.tone === "caution"
        ? "var(--color-caution)"
        : "var(--color-ink)"
    : "var(--color-faint)";

  const toggleReason = () => setReasonOpen((v) => !v);
  const closeReason = () => setReasonOpen(false);
  /*
   * "Show reasoning" needs a score to explain.
   *
   * The panel prints "Weighted total → {score}", and `score` is
   * `Math.round(readinessScore ?? NaN)` on a dashboard with no stored score.
   * The hero correctly showed a dash; the panel behind it opened and said
   * "Weighted total → NaN".
   */
  const canExplain = !!narrative && Number.isFinite(score);

  const AC = "var(--color-accent)",
    P = "var(--color-positive)",
    N = "var(--color-negative)",
    CA = "var(--color-caution)",
    F = "var(--color-faint)",
    M = "var(--color-muted)",
    I = "var(--color-ink)",
    LN = "var(--color-line)";

  // A missing score is a missing score: a dash and "No score yet".
  const hasScore = Number.isFinite(score);
  const scoreText = hasScore ? String(score) : "—";
  const statusLabel = !hasScore
    ? "No score yet"
    : score >= 70
      ? "Ready to load"
      : score >= 40
        ? "Ease off today"
        : "Rest day";
  const statusTone = !hasScore ? M : score >= 70 ? P : score >= 40 ? CA : N;

  // The last point of whatever series we have. Reading index 83 assumed every
  // athlete had 84 days of history; anyone newer got NaN, and anyone older got
  // yesterday while the chart's own end-label showed today.
  const tsbNow = Math.round(pmc.T[pmc.n - 1]);
  const metrics = [
    (() => {
      // Derived per activity from its stream. Null until a run is long and
      // steady enough for decoupling to mean anything — a dash, not a guess.
      const d = data.cardiacDriftPct;
      if (d === undefined) {
        return {
          v: "—",
          unit: "",
          name: "Cardiac Drift",
          interp: "No steady run yet",
          tone: M,
          border: LN,
        };
      }
      return {
        v: d.toFixed(1),
        unit: "%",
        name: "Cardiac Drift",
        interp: d <= 3 ? "Low — good" : d <= 8 ? "Mild" : "High — that run cost you",
        tone: d <= 3 ? P : d <= 8 ? M : CA,
        border: LN,
      };
    })(),
    (() => {
      const v = rail?.volumeSummary;
      if (!v) {
        return {
          v: "—",
          unit: "km",
          name: "Weekly Volume",
          interp: "No runs yet",
          tone: M,
          border: LN,
        };
      }
      return {
        v: String(v.km),
        unit: "km",
        name: "Weekly Volume",
        interp:
          v.changePct === null
            ? "first week of running"
            : `${v.changePct >= 0 ? "+" : ""}${v.changePct}% vs last week`,
        tone: v.changePct === null || Math.abs(v.changePct) < 30 ? P : CA,
        border: LN,
      };
    })(),
    (() => {
      // Descriptive only. The literature does not support presenting this as
      // an injury-risk verdict — see docs/research/02-fitness-fatigue-and-acwr.md.
      const lr = data.loadRatio;
      if (lr === null) {
        return {
          v: "—",
          unit: "",
          name: "Load Ratio",
          interp: "Building your baseline",
          tone: M,
          border: LN,
        };
      }
      const pct = Math.round((lr - 1) * 100);
      return {
        v: lr.toFixed(2),
        unit: "",
        name: "Load Ratio",
        interp:
          Math.abs(pct) < 10
            ? "About your usual level"
            : pct > 0
              ? `${pct}% above your usual`
              : `${Math.abs(pct)}% below your usual`,
        tone: Math.abs(pct) < 25 ? P : CA,
        border: LN,
      };
    })(),
    // The same bands the readiness score uses: +5…+20 is fresh, −10…+5 is
    // normal training, below −10 is carrying load, above +20 is detraining.
    {
      v: (tsbNow >= 0 ? "+" : "") + tsbNow,
      unit: "",
      name: "Form (TSB)",
      interp:
        tsbNow > 20
          ? "Very fresh — detraining?"
          : tsbNow >= 5
            ? "Fresh"
            : tsbNow >= -10
              ? "Normal training"
              : tsbNow >= -30
                ? "Carrying load"
                : "Heavily loaded",
      tone: tsbNow > 20 ? CA : tsbNow >= 5 ? P : tsbNow >= -10 ? M : tsbNow >= -30 ? CA : CA,
      border: LN,
    },
  ];

  /*
   * Each metric wears the icon and hue its tile has on the Numbers board, so
   * the same figure looks the same on both screens, and each cell is a link
   * to that tile — the home screen states the number, the board explains it.
   */
  const METRIC_IDS = ["drift", "volume", "acwr", "tsb"] as const;
  const METRIC_ICONS: Record<(typeof METRIC_IDS)[number], string> = {
    drift: NB_ICON.drift,
    volume: NB_ICON.volume,
    acwr: NB_ICON.ratio,
    tsb: NB_ICON.form,
  };
  const metricCells = metrics.map((m, i) => {
    const id = METRIC_IDS[i] ?? "drift";
    return {
      ...m,
      id,
      icon: METRIC_ICONS[id],
      hue: NUMBERS_HUE[id],
      // The figure itself carries the state, so the eye lands on the number
      // rather than on the sentence beneath it.
      figColor: m.tone === CA ? CA : m.tone === M ? I : I,
      divider: i === 0 ? "transparent" : LN,
    };
  });

  const wk = hasPlan ? W[Math.min(weekView, W.length - 1)] : null;
  const plan = (wk?.days ?? []).map((d, i) => {
    // Same day cell as the plan page and the coach's board — the rules live in
    // lib/ui/dayCell so three screens cannot drift apart on what "missed" looks
    // like.
    const state: DayState =
      d.status === "Done"
        ? "done"
        : d.status === "Missed"
          ? "missed"
          : d.status === "Today" || d.today
            ? "today"
            : d.status === "Adjusted"
              ? "adjusted"
              : d.type === "rest"
                ? "rest"
                : "planned";
    const k = dayCellStyle(state);
    const selected = selD === i;
    const type: SessionType = d.type === "int" ? "intervals" : d.type;
    return {
      key: d.date ?? `${d.day}-${d.dateNum}`,
      day: d.day + " " + d.dateNum,
      name: d.name,
      dist: d.type === "rest" ? "—" : d.dist + " km",
      tag: d.tag,
      tagColor: d.type === "int" ? AC : d.type === "rest" ? F : M,
      status: d.status,
      statusShort: d.status === "Adjusted" ? "ADJ" : d.status,
      statusColor: k.statusColor,
      nameColor: k.nameColor,
      dayColor: k.dayColor,
      opacity: k.opacity,
      bg: selected ? "var(--color-elevated)" : k.bg,
      edge: SESSION_EDGE[type],
      ring: selected ? "inset 0 0 0 1px var(--color-line-strong)" : k.ring,
      select: () => setSelD(selD === i ? -1 : i),
    };
  });

  const sel = wk && selD >= 0 ? (wk.days[selD] ?? null) : null;
  // A selected day gets a bar built from its own distance and pace.
  const segsRaw = sel
    ? sessionShape({ type: sel.type, distanceKm: sel.dist, pace: sel.pace || null })
    : [];
  const segTot = segsRaw.reduce((s, x) => s + x.m, 0) || 1;
  const barBg = sel
    ? sel.missed
      ? "var(--color-line-strong)"
      : sel.done
        ? AC
        : CA
    : "transparent";

  const hasSel = !!sel;
  const selTitle = sel ? sel.name + " · " + sel.day + " " + sel.mon + " " + sel.dateNum : "";
  // "8 km @ /km" is what this printed when the plan had no target pace.
  const selMeta = sel
    ? sel.type === "rest"
      ? "Recovery day — no training load."
      : sel.pace
        ? sel.dist + " km @ " + sel.pace + "/km"
        : sel.dist + " km"
    : "";
  const selStatus = sel ? sel.status || "Planned" : "";
  const selStatusColor = sel
    ? sel.status === "Done"
      ? P
      : sel.status === "Missed"
        ? N
        : sel.status === "Today"
          ? AC
          : sel.status === "Adjusted"
            ? CA
            : M
    : M;
  const selHasBar = !!sel && sel.type !== "rest" && segsRaw.length > 0;
  const selSegments = segsRaw.map((s) => ({
    w: ((s.m / segTot) * 100).toFixed(2),
    h: s.h,
    bg: barBg,
    title: s.t,
  }));
  /*
   * The caption has to be honest about what the bar is.
   *
   * "Completed session — structure as executed" was a claim we cannot make:
   * nothing reads back what was actually run, and the plan stores a type, a
   * distance and a pace but no structure at all. The bar is a suggested shape
   * at the athlete's own numbers, and now says so.
   */
  const selCaption = sel
    ? sel.missed
      ? "Missed session — not counted toward weekly load."
      : sel.type === "rest"
        ? ""
        : sel.pace
          ? "Suggested shape — target pace " + sel.pace + "/km."
          : "Suggested shape for this session."
    : "";

  const weekLabel = wk ? wk.label + " · " + wk.range : "No plan yet";
  const prevWeek = () => {
    setWeekView(Math.max(0, weekView - 1));
    setSelD(-1);
  };
  const nextWeek = () => {
    setWeekView(Math.min(W.length - 1, weekView + 1));
    setSelD(-1);
  };

  /* --- PMC hover --- */
  const Yv = (v: number) => pmc.yT + (1 - (v - pmc.mn) / (pmc.mx - pmc.mn)) * (pmc.yB - pmc.yT);
  const pmcHover = pmcHi >= 0;
  const lastI = pmc.n - 1;
  const hx = pmc.x0 + (lastI > 0 ? pmcHi / lastI : 0) * (pmc.x1 - pmc.x0);
  // The hovered point's own date; every point of a real series has one.
  const hIso = pmcHover ? pmc.D[pmcHi] : undefined;
  const hDate = hIso ? new Date(hIso + "T00:00:00") : null;
  const pmcX = pmcHover ? hx.toFixed(1) : "0";
  const pmcCtlY = pmcHover ? Yv(pmc.C[pmcHi]).toFixed(1) : "0";
  const pmcAtlY = pmcHover ? Yv(pmc.A[pmcHi]).toFixed(1) : "0";
  const pmcTsbY = pmcHover ? Yv(pmc.T[pmcHi]).toFixed(1) : "0";
  const pmcTipLeft = pmcHover ? ((hx / 1220) * 100).toFixed(1) + "%" : "0%";
  const pmcTipShift = hx > 950 ? "translateX(-110%)" : "translateX(12px)";
  const pmcTipHead = hDate ? MO[hDate.getMonth()] + " " + hDate.getDate() : "";
  const pmcTipCtl = pmcHover ? "Fitness " + Math.round(pmc.C[pmcHi]) : "";
  const pmcTipAtl = pmcHover ? "Fatigue " + Math.round(pmc.A[pmcHi]) : "";
  const pmcTipTsb = pmcHover
    ? "Form " + (pmc.T[pmcHi] >= 0 ? "+" : "") + Math.round(pmc.T[pmcHi])
    : "";
  const onPmcMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * 1220;
    setPmcHi(Math.max(0, Math.min(lastI, Math.round(((fx - 30) / (1150 - 30)) * lastI))));
  };
  const onPmcLeave = () => setPmcHi(-1);

  /* --- calendar --- */
  // Dots from the athlete's plan and runs; the colours come from presentation.ts.
  const calendarDots = rail?.calendarDots;
  const raceDateIso = rail?.race?.dateIso ?? null;
  const { calLabel, calCells } = useMemo(
    () =>
      calendar(
        calCursor.month,
        calendarDots ?? {},
        new Date(),
        raceDateIso ? new Date(raceDateIso + "T00:00:00") : null,
        calCursor.year,
      ),
    [calCursor, calendarDots, raceDateIso],
  );
  // The calendar rolls over the year like a calendar.
  const stepMonth = (delta: number) =>
    setCalCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const calPrev = () => stepMonth(-1);
  const calNext = () => stepMonth(1);

  /*
   * "Ask Runi" lives in components/insights/AskRuniLauncher, mounted once in
   * the root layout, so the same button and the same panel follow the athlete
   * to every page — the plan, a run, the Numbers board.
   */

  return (
    <div
      data-entrance-root
      style={{
        maxWidth: "1280px",
        marginInline: "auto",
        padding: "16px 24px 36px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <Entrance />
      <header
        style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <BrandMark />
          <span
            className="num"
            style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}
          >
            {copy.brand}
          </span>
        </div>
        <div style={{ textAlign: "start" }}>
          <h1
            style={{
              margin: "0",
              fontSize: "24px",
              fontWeight: "700",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            {greeting}
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>
            {headerContext}
          </p>
        </div>
        <nav
          className="topnav"
          style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}
        >
          <Link href="/dashboard" style={{ color: "var(--color-ink)" }}>
            {copy.navHome}
          </Link>
          <Link href="/plan" style={{ color: "var(--color-muted)" }}>
            {copy.navPlan}
          </Link>
          <Link href="/activities" style={{ color: "var(--color-muted)" }}>
            {copy.navActivities}
          </Link>
          <Link href="/numbers" style={{ color: "var(--color-muted)" }}>
            Numbers
          </Link>
          <Link href="/settings" style={{ color: "var(--color-muted)" }}>
            {copy.navSettings}
          </Link>
        </nav>
        <div style={{ flex: "1" }}></div>
        {streakLabel ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--color-muted)",
              fontSize: "12px",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </svg>
            <span className="num">{streakLabel}</span>
          </div>
        ) : null}
      </header>
      <div
        className="rail-grid"
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 288px", gap: "12px" }}
      >
        <section
          className="card hero-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "260px 1fr",
            gap: "20px",
            padding: "20px 24px",
            alignItems: "center",
            gridColumn: "1",
            minWidth: "0",
          }}
        >
          <div
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}
          >
            <Avatar
              src={data?.avatarUrl ?? null}
              name={data?.athleteName ?? undefined}
              size={116}
              zoomable
            />
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span
                className="num"
                style={{ fontSize: "30px", fontWeight: "500", lineHeight: "1", color: statusTone }}
              >
                {scoreText}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  letterSpacing: ".14em",
                  textTransform: "uppercase",
                  color: "var(--color-faint)",
                }}
              >
                {copy.readinessLabel}
              </span>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}
            >
              <p
                className="num"
                style={{
                  margin: "0",
                  fontSize: "12.5px",
                  fontWeight: "500",
                  color: statusTone,
                  whiteSpace: "nowrap",
                }}
              >
                {statusLabel}
              </p>
              {todayLine ? (
                <p
                  className="num"
                  style={{
                    margin: "0",
                    fontSize: "11px",
                    color: "var(--color-faint)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {todayLine}
                </p>
              ) : null}
              {staleNote ? (
                <p
                  className="num"
                  style={{
                    margin: "0",
                    fontSize: "10.5px",
                    color: "var(--color-caution)",
                    textAlign: "center",
                    textWrap: "pretty",
                  }}
                >
                  {staleNote}
                </p>
              ) : null}
            </div>
          </div>
          <div
            style={{
              borderInlineStart: "1px solid var(--color-line)",
              paddingInlineStart: "28px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              alignSelf: "stretch",
              justifyContent: "center",
            }}
          >
            <div>
              <span
                className="tag"
                style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
              >
                {copy.aiTag}
              </span>
            </div>
            <p
              style={{
                margin: "0",
                fontSize: "16px",
                lineHeight: "1.55",
                maxWidth: "640px",
                textWrap: "pretty",
              }}
            >
              {narrativeText}
            </p>
            <div
              style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBlockStart: "4px" }}
            >
              <Link className="btn btn-primary" href="/plan">
                {copy.btnSession}
              </Link>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={toggleReason}
                disabled={!canExplain}
                aria-expanded={reasonOpen}
                title={canExplain ? undefined : "Available once your own data has been synced"}
              >
                {copy.btnReason}
              </button>
            </div>
          </div>
          <div
            className="kpi-grid"
            style={{
              gridColumn: "1 / -1",
              borderBlockStart: "1px solid var(--color-line)",
              marginBlockStart: "4px",
              paddingBlockStart: "12px",
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
            }}
            aria-label="Key metrics"
          >
            {metricCells.map((m) => (
              <React.Fragment key={m.id}>
                <Link
                  className="kpi-cell"
                  href={`/numbers#${m.id}`}
                  title={`How ${m.name} is computed`}
                  style={{
                    padding: "4px 10px",
                    borderInlineStart: `1px solid ${m.divider}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    textAlign: "center",
                    color: "inherit",
                    textDecoration: "none",
                    borderRadius: "var(--radius-control)",
                    ["--hue" as string]: m.hue,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg
                      className={`nb-icon nb-icon-${m.id}`}
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={m.hue}
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d={m.icon} />
                    </svg>
                    <span
                      className="num"
                      style={{
                        fontSize: "22px",
                        fontWeight: "500",
                        letterSpacing: "-0.02em",
                        lineHeight: "1",
                        color: m.figColor,
                      }}
                    >
                      {m.v}
                    </span>
                    <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>
                      {m.unit}
                    </span>
                  </div>
                  <p
                    className="num"
                    style={{
                      margin: "0",
                      fontSize: "9px",
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: m.hue,
                      fontWeight: "600",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.name}
                  </p>
                  <p
                    className="num"
                    style={{ margin: "0", fontSize: "10px", color: m.tone, whiteSpace: "nowrap" }}
                  >
                    {m.interp}
                  </p>
                </Link>
              </React.Fragment>
            ))}
          </div>
        </section>
        {reasonOpen && narrative ? (
          <ReasoningPanel narrative={narrative} score={score} onClose={closeReason} />
        ) : null}
        <section className="grid" style={{ gridColumn: "1", minWidth: "0" }}>
          <div className="card c12" style={{ padding: "20px 22px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>
                  {copy.pmcTitle}
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>
                  {copy.pmcSub}
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  fontSize: "11px",
                  color: "var(--color-muted)",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      width: "14px",
                      height: "2px",
                      background: "var(--color-ctl)",
                      display: "inline-block",
                    }}
                  ></span>
                  {copy.legCtl}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      width: "14px",
                      height: "2px",
                      background: "var(--color-atl)",
                      display: "inline-block",
                    }}
                  ></span>
                  {copy.legAtl}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <svg width="14" height="2">
                    <line
                      x1="0"
                      y1="1"
                      x2="14"
                      y2="1"
                      stroke="var(--color-tsb)"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                    />
                  </svg>
                  {copy.legTsb}
                </span>
              </div>
            </div>
            <div style={{ position: "relative", marginBlockStart: "14px" }}>
              <svg
                viewBox="0 0 1220 148"
                style={{ width: "100%", height: "auto", display: "block" }}
                role="img"
                aria-label="Fitness, fatigue and form over 12 weeks"
                onMouseMove={onPmcMove}
                onMouseLeave={onPmcLeave}
              >
                <defs>
                  <linearGradient id="ctlfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-ctl)" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="var(--color-ctl)" stopOpacity="0" />
                  </linearGradient>
                  <filter id="pmcGlow" x="-20%" y="-40%" width="140%" height="180%">
                    <feGaussianBlur stdDeviation="4" />
                  </filter>
                </defs>
                {pmcGrid.map((g, _i2) => (
                  <React.Fragment key={_i2}>
                    <g>
                      <line
                        x1="30"
                        x2="1150"
                        y1={g.y}
                        y2={g.y}
                        stroke="var(--color-line)"
                        strokeWidth="1"
                        strokeDasharray={g.dash}
                      />
                      <text
                        x="24"
                        y={g.ty}
                        fill="var(--color-faint)"
                        fontSize="9"
                        fontFamily="IBM Plex Mono"
                        textAnchor="end"
                      >
                        {g.label}
                      </text>
                    </g>
                  </React.Fragment>
                ))}
                <text
                  x="24"
                  y="8"
                  fill="var(--color-faint)"
                  fontSize="8.5"
                  fontFamily="IBM Plex Mono"
                  textAnchor="end"
                >
                  {copy.pmcAxisUnit}
                </text>
                {pmcWeeks.map((w, _i3) => (
                  <React.Fragment key={_i3}>
                    <text
                      x={w.x}
                      y="144"
                      fill="var(--color-faint)"
                      fontSize="9"
                      fontFamily="IBM Plex Mono"
                      textAnchor="middle"
                    >
                      {w.label}
                    </text>
                  </React.Fragment>
                ))}
                <path d={tsbArea} fill="var(--color-tsb)" opacity="0.06" />
                <path d={ctlArea} fill="url(#ctlfill)" />
                <path
                  d={atlPath}
                  fill="none"
                  stroke="var(--color-atl)"
                  strokeWidth="1.4"
                  opacity="0.9"
                />
                <path
                  d={tsbPath}
                  fill="none"
                  stroke="var(--color-tsb)"
                  strokeWidth="1.6"
                  strokeDasharray="5 4"
                />
                <path
                  d={ctlPath}
                  fill="none"
                  stroke="var(--color-ctl)"
                  strokeWidth="5"
                  opacity="0.45"
                  filter="url(#pmcGlow)"
                />
                <path d={ctlPath} fill="none" stroke="var(--color-ctl)" strokeWidth="2.4" />
                {pmcEnds.map((e, _i4) => (
                  <React.Fragment key={_i4}>
                    <text
                      x="1158"
                      y={e.y}
                      fill={e.color}
                      fontSize="11"
                      fontWeight="500"
                      fontFamily="IBM Plex Mono"
                    >
                      {e.text}
                    </text>
                  </React.Fragment>
                ))}
                {pmcHover ? (
                  <>
                    <g>
                      <line
                        x1={pmcX}
                        x2={pmcX}
                        y1="6"
                        y2="126"
                        stroke="var(--color-faint)"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <circle cx={pmcX} cy={pmcCtlY} r="3.5" fill="var(--color-ctl)" />
                      <circle cx={pmcX} cy={pmcAtlY} r="3" fill="var(--color-atl)" />
                      <circle cx={pmcX} cy={pmcTsbY} r="3" fill="var(--color-tsb)" />
                    </g>
                  </>
                ) : null}
              </svg>
              {pmcHover ? (
                <>
                  <div
                    className="num"
                    style={{
                      position: "absolute",
                      top: "8px",
                      left: pmcTipLeft,
                      transform: pmcTipShift,
                      background: "var(--color-elevated)",
                      border: "1px solid var(--color-line-strong)",
                      borderRadius: "var(--radius-control)",
                      padding: "8px 12px",
                      fontSize: "11px",
                      pointerEvents: "none",
                      whiteSpace: "nowrap",
                      boxShadow: "0 4px 16px rgba(0,0,0,.5)",
                      zIndex: "5",
                    }}
                  >
                    <div style={{ color: "var(--color-faint)", marginBlockEnd: "3px" }}>
                      {pmcTipHead}
                    </div>
                    <div style={{ color: "var(--color-ctl)" }}>{pmcTipCtl}</div>
                    <div style={{ color: "var(--color-atl)" }}>{pmcTipAtl}</div>
                    <div style={{ color: "var(--color-tsb)" }}>{pmcTipTsb}</div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>
        <section className="card" style={{ padding: "20px 22px", gridColumn: "1", minWidth: "0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{copy.planTitle}</h2>
            <div
              className="plan-pager"
              style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}
            >
              <div
                className="hide-m"
                style={{
                  display: "flex",
                  gap: "14px",
                  fontSize: "11px",
                  color: "var(--color-muted)",
                  marginInlineEnd: "8px",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <BrandMark />
                  {copy.legDone}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      width: "10px",
                      height: "10px",
                      background: "var(--color-caution)",
                      borderRadius: "2px",
                      display: "inline-block",
                    }}
                  ></span>
                  {copy.legPlanned}
                </span>
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={prevWeek}
                disabled={!hasPlan || weekView <= 0}
                style={{ padding: "5px 10px" }}
                aria-label="Previous week"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <span
                className="num"
                style={{
                  fontSize: "11.5px",
                  color: "var(--color-muted)",
                  minWidth: "170px",
                  textAlign: "center",
                }}
              >
                {weekLabel}
              </span>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={nextWeek}
                disabled={!hasPlan || weekView >= W.length - 1}
                style={{ padding: "5px 10px" }}
                aria-label="Next week"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
          <div
            className="week-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,1fr)",
              gap: "8px",
              marginBlockStart: "14px",
            }}
          >
            {plan.map((p) => (
              <React.Fragment key={p.key}>
                <button
                  className="dc-hover-border"
                  type="button"
                  onClick={p.select}
                  style={{
                    textAlign: "start",
                    fontFamily: "inherit",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "7px",
                    padding: "10px 11px",
                    borderRadius: "var(--radius-control)",
                    background: p.bg,
                    border: "none",
                    borderInlineStart: `2px solid ${p.edge}`,
                    boxShadow: p.ring,
                    opacity: p.opacity,
                    minHeight: "102px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "6px",
                      width: "100%",
                    }}
                  >
                    <span
                      className="num"
                      style={{
                        fontSize: "10px",
                        letterSpacing: ".1em",
                        textTransform: "uppercase",
                        color: p.dayColor,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.day}
                    </span>
                    <span
                      className="num"
                      style={{
                        fontSize: "8.5px",
                        letterSpacing: ".04em",
                        textTransform: "uppercase",
                        color: p.statusColor,
                        whiteSpace: "nowrap",
                        minWidth: "0",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.statusShort}
                    </span>
                  </div>
                  <div style={{ flex: "1" }}>
                    <p
                      style={{
                        margin: "0",
                        fontSize: "12.5px",
                        fontWeight: "500",
                        color: p.nameColor,
                      }}
                    >
                      {p.name}
                    </p>
                    <p
                      className="num"
                      style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-faint)" }}
                    >
                      {p.dist}
                    </p>
                  </div>
                  <span
                    className="tag"
                    style={{ background: "var(--color-elevated)", color: p.tagColor }}
                  >
                    {p.tag}
                  </span>
                </button>
              </React.Fragment>
            ))}
          </div>
          {!hasPlan ? (
            <p
              style={{
                margin: "14px 0 0",
                fontSize: "12.5px",
                color: "var(--color-muted)",
                lineHeight: "1.6",
              }}
            >
              {
                "No training plan yet. Set a goal race and Runi will build one \u2014 until then there is nothing here to show you."
              }
            </p>
          ) : null}
          {hasSel ? (
            <>
              <div
                style={{
                  marginBlockStart: "14px",
                  borderBlockStart: "1px solid var(--color-line)",
                  paddingBlockStart: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <div>
                    <h3 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{selTitle}</h3>
                    <p
                      className="num"
                      style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-muted)" }}
                    >
                      {selMeta}
                    </p>
                  </div>
                  <span
                    className="tag"
                    style={{ background: "var(--color-elevated)", color: selStatusColor }}
                  >
                    {selStatus}
                  </span>
                </div>
                {selHasBar ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: "2px",
                        height: "52px",
                        marginBlockStart: "14px",
                      }}
                    >
                      {selSegments.map((s, _i6) => (
                        <React.Fragment key={_i6}>
                          <div
                            title={s.title}
                            style={{
                              width: `${s.w}%`,
                              height: `${s.h}px`,
                              background: s.bg,
                              borderRadius: "3px 3px 0 0",
                            }}
                          ></div>
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                ) : null}
                <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>
                  {selCaption}
                </p>
              </div>
            </>
          ) : null}
        </section>
        <section className="grid" style={{ gridColumn: "1", minWidth: "0" }}>
          {showNextCard ? (
            <div className="card c12" style={{ padding: "20px 22px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div>
                  <h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{nextTitle}</h2>
                  <p
                    className="num"
                    style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-muted)" }}
                  >
                    {nextMeta}
                  </p>
                </div>
              </div>
              {nextLine ? (
                <svg
                  viewBox="0 0 560 96"
                  style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                    marginBlockStart: "12px",
                  }}
                >
                  <defs>
                    <linearGradient id="nsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.26" />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                    </linearGradient>
                    <filter id="nsGlow" x="-20%" y="-40%" width="140%" height="180%">
                      <feGaussianBlur stdDeviation="3" />
                    </filter>
                  </defs>
                  <line
                    x1="4"
                    y1="84"
                    x2="556"
                    y2="84"
                    stroke="var(--color-line)"
                    strokeWidth="1"
                  />
                  <path d={nextLine.area} fill="url(#nsFill)" />
                  <path
                    d={nextLine.path}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="4"
                    opacity="0.45"
                    filter="url(#nsGlow)"
                  />
                  <path
                    d={nextLine.path}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  {nextLine.dots.map((d, _id) => (
                    <React.Fragment key={_id}>
                      <g>
                        <circle cx={d.x} cy={d.y} r="5" fill="var(--color-accent)" opacity="0.25" />
                        <circle
                          cx={d.x}
                          cy={d.y}
                          r="2.5"
                          fill="var(--color-canvas)"
                          stroke="var(--color-accent)"
                          strokeWidth="1.4"
                        />
                        <text
                          x={d.x}
                          y={d.ly}
                          fill="var(--color-muted)"
                          fontSize="8.5"
                          fontFamily="var(--font-mono)"
                          textAnchor="middle"
                        >
                          {d.l}
                        </text>
                      </g>
                    </React.Fragment>
                  ))}
                </svg>
              ) : null}
            </div>
          ) : (
            <div className="card c12" style={{ padding: "20px 22px" }}>
              <h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>
                {copy.nextTitleEmpty}
              </h2>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "12.5px",
                  color: "var(--color-muted)",
                  lineHeight: "1.6",
                }}
              >
                {copy.nextBodyEmpty}
              </p>
              <Link
                className="btn btn-primary"
                href="/plan"
                style={{ display: "inline-block", marginBlockStart: "14px" }}
              >
                {copy.nextCtaEmpty}
              </Link>
            </div>
          )}
        </section>
        <div className="card" style={{ padding: "14px 16px", gridColumn: "2", gridRow: "1" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={calPrev}
              style={{ padding: "6px 9px" }}
              aria-label="Previous month"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <h2 className="num" style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>
              {calLabel}
            </h2>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={calNext}
              style={{ padding: "6px 9px" }}
              aria-label="Next month"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,1fr)",
              gap: "2px",
              marginBlockStart: "12px",
            }}
          >
            {calHead.map((h, _i8) => (
              <React.Fragment key={_i8}>
                <span
                  className="num"
                  style={{
                    fontSize: "9px",
                    color: "var(--color-faint)",
                    textAlign: "center",
                    paddingBlock: "2px",
                  }}
                >
                  {h.t}
                </span>
              </React.Fragment>
            ))}
            {calCells.map((c, _i9) => (
              <React.Fragment key={_i9}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "3px",
                    padding: "5px 0 3px",
                    borderRadius: "6px",
                    background: c.bg,
                  }}
                >
                  <span
                    className="num"
                    style={{ fontSize: "11px", lineHeight: "1", color: c.color }}
                  >
                    {c.n}
                  </span>
                  <span
                    style={{ width: "4px", height: "4px", borderRadius: "50%", background: c.dot }}
                  ></span>
                </div>
              </React.Fragment>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBlockStart: "10px",
              fontSize: "10px",
              color: "var(--color-faint)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span
                style={{
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  background: "var(--color-accent)",
                }}
              ></span>
              {copy.legDone}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span
                style={{
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  background: "var(--color-caution)",
                }}
              ></span>
              {copy.legPlanned}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span
                style={{
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  background: "var(--color-negative)",
                }}
              ></span>
              {copy.legMissed}
            </span>
          </div>
        </div>
        <div className="card" style={{ padding: "14px 16px", gridColumn: "2", gridRow: "2" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap" }}>
              {copy.volTitle}
            </h2>
            <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>
              {copy.volMeta}
            </span>
          </div>
          <div style={{ marginBlockStart: "10px" }}>
            <MiniBars
              data={volBars}
              idPrefix="railvol"
              box={BAR_BOX_RAIL}
              ariaLabel="Weekly volume, last 12 weeks"
            />
          </div>
          <div
            className="num"
            style={{ display: "flex", justifyContent: "flex-end", marginBlockStart: "2px" }}
          >
            <span style={{ fontSize: "9px", color: "var(--color-accent)" }}>{volNowLabel}</span>
          </div>
        </div>
        <div className="card" style={{ padding: "14px 16px", gridColumn: "2", gridRow: "3" }}>
          <p
            className="num"
            style={{
              margin: "0",
              fontSize: "9.5px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--color-faint)",
            }}
          >
            {raceName}
          </p>
          <div
            style={{ display: "flex", alignItems: "baseline", gap: "7px", marginBlockStart: "4px" }}
          >
            <span
              className="num"
              style={{
                fontSize: "42px",
                fontWeight: "500",
                letterSpacing: "-0.03em",
                lineHeight: "1",
              }}
            >
              {raceDays}
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--color-muted)" }}>
              {copy.raceDaysUnit}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "5px",
              marginBlockStart: "14px",
            }}
          >
            <div
              className="num"
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "10px",
                color: "var(--color-faint)",
              }}
            >
              <span>{raceProgLabel}</span>
              <span>{raceProgPct}</span>
            </div>
            <div
              style={{
                height: "5px",
                background: "var(--color-elevated)",
                borderRadius: "var(--radius-pill)",
              }}
            >
              <div
                style={{
                  width: raceProgWidth,
                  height: "5px",
                  background: "var(--color-accent)",
                  borderRadius: "var(--radius-pill)",
                }}
              ></div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBlockStart: "14px",
              paddingBlockStart: "12px",
              borderBlockStart: "1px solid var(--color-line)",
            }}
          >
            <div>
              <p className="num" style={{ margin: "0", fontSize: "14px" }}>
                {raceTargetText}
              </p>
              <p
                className="num"
                style={{ margin: "1px 0 0", fontSize: "10px", color: "var(--color-faint)" }}
              >
                {copy.raceTargetLabel}
              </p>
            </div>
            <div style={{ textAlign: "end" }}>
              <p className="num" style={{ margin: "0", fontSize: "14px", color: racePredColor }}>
                {racePredText}
              </p>
              <p
                className="num"
                style={{ margin: "1px 0 0", fontSize: "10px", color: "var(--color-faint)" }}
              >
                {racePredLabelText}
              </p>
            </div>
          </div>
        </div>
        <div
          className="card"
          style={{ padding: "14px 16px", gridColumn: "2", gridRow: "4 / span 2" }}
        >
          <h2 style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: "600" }}>
            {copy.actsTitle}
          </h2>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {activities.map((a, i) => (
              <React.Fragment key={a.id ?? i}>
                <Link
                  className="dc-hover-bg"
                  href={a.id ? `/activities/${a.id}` : "/activities"}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr auto auto",
                    alignItems: "center",
                    gap: "8px",
                    padding: "5px 6px",
                    borderRadius: "var(--radius-control)",
                  }}
                >
                  <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>
                    {a.date}
                  </span>
                  <div>
                    <span
                      className="num"
                      style={{ fontSize: "12px", fontWeight: "500", color: "var(--color-ink)" }}
                    >
                      {a.km}
                    </span>
                    <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>
                      {" "}
                      km
                    </span>
                  </div>
                  <span className="num" style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                    {a.pace}
                  </span>
                  <svg width="56" height="20" viewBox="0 0 80 24" preserveAspectRatio="none">
                    <path d={a.spark} fill="none" stroke={a.sparkColor} strokeWidth="1.6" />
                  </svg>
                </Link>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
      <section
        className="card"
        aria-label="Personal records"
        style={{
          padding: "13px 20px",
          border: "1px solid var(--color-gold)",
          borderBlockStart: "2px solid var(--color-gold)",
          background: "linear-gradient(180deg,var(--color-gold-soft),var(--color-surface) 60%)",
        }}
      >
        <h2
          style={{
            margin: "0 0 10px",
            fontSize: "13px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            color: "var(--color-gold)",
            letterSpacing: ".04em",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="6" />
            <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
          </svg>
          {copy.pbTitle}
        </h2>
        <div className="pb-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)" }}>
          {prBand.map((b) => (
            <React.Fragment key={b.key}>
              <a
                className={b.href ? "pb-cell" : undefined}
                href={b.href ?? undefined}
                title={b.href ? "Open the run that set it" : undefined}
                style={{
                  paddingInline: "20px",
                  paddingBlock: "4px",
                  borderInlineStart: `1px solid ${b.divider}`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  color: "inherit",
                  textDecoration: "none",
                  borderRadius: "var(--radius-control)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    className="num"
                    style={{
                      fontSize: "11px",
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--color-faint)",
                    }}
                  >
                    {b.dist}
                  </span>
                  <span
                    className="num"
                    style={{
                      fontSize: "9px",
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      color: b.noteColor,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.note}
                  </span>
                </div>
                <p
                  className="num"
                  style={{
                    margin: "6px 0 2px",
                    fontSize: "21px",
                    fontWeight: "500",
                    lineHeight: "1",
                  }}
                >
                  {b.time}
                </p>
                <p
                  className="num"
                  style={{ margin: "0", fontSize: "10px", color: "var(--color-faint)" }}
                >
                  {b.date}
                </p>
              </a>
            </React.Fragment>
          ))}
        </div>
      </section>
    </div>
  );
}

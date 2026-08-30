"use client";

/**
 * Athlete dashboard — a 1:1 port of
 * design_handoff_ari_athlete_app/ARI Dashboard.dc.html.
 *
 * The markup below was converted mechanically from the prototype so layout,
 * spacing, type scale and chart geometry match the design exactly.
 * Do not restyle it by hand. To change the look, change a token in
 * globals.css or update the design file and re-port.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ReasoningPanel } from "@/components/dashboard/ReasoningPanel";
import { InsightsPanel } from "@/components/insights/InsightsPanel";
import { sessionLine } from "@/lib/dashboard/sessionLine";
import type { Narrative } from "@/lib/narrative/buildNarrative";
import {
  realSessionSegments, relativeDay, type RealPlan,
} from "@/lib/dashboard/realPlan";
import type { PersonalRecord } from "@/lib/dashboard/personalRecords";
import type { RaceCountdown, VolumeBar } from "@/lib/dashboard/rail";
import { BrandMark, Entrance, MiniBars, dayCellStyle, SESSION_EDGE, type DayState, type SessionType } from "@/components/ui";
import { BAR_BOX_RAIL } from "@/components/ui/MiniBars";
import { NO_VALUE } from "@/lib/dashboard/presentation";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/time/week";
import { sessionShape } from "@/lib/planning/sessionShape";
import {
  acts, buildPmc, calHead, calendar, COPY,
  nextSessionSegments, pbs, segsFor, volumes, weeks,
} from "@/lib/dashboard/model";

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Real data from readiness_snapshots, when the athlete has any.
 * Everything is optional: whatever is missing falls back to the demo model, so
 * a brand-new account still renders a complete screen.
 */
export interface DashboardData {
  /** fitness / fatigue / form, oldest first */
  pmcSeries?: { C: number[]; A: number[]; T: number[]; D?: string[] };
  /** acute:chronic load ratio, or null when history is too short */
  loadRatio?: number | null;
  recentActivities?: {
    /** the activity's own id — every row must link to its own run */
    id?: string;
    date: string; km: string; pace: string; spark: string; sparkColor: string;
  }[];
  /** true once at least one real snapshot exists */
  isReal?: boolean;
  /**
   * Today's coaching narrative, computed by src/lib/narrative/buildNarrative.
   * Absent for the demo dataset, which keeps its own reference copy.
   */
  narrative?: Narrative;
  /**
   * The athlete's own training plan, from `plan_workouts`. When absent the
   * view keeps rendering the twelve-week reference plan from model.ts.
   */
  plan?: RealPlan;
  /**
   * Personal records derived from stored per-activity best efforts. A row with
   * a null time renders as a dash — we never estimate one distance from
   * another and label the result a record.
   */
  personalRecords?: PersonalRecord[];
  /** heart-rate drift on the most recent qualifying run, in percent */
  cardiacDriftPct?: number;
  /**
   * The photo they uploaded in Settings.
   *
   * Settings has had a working avatar editor writing `profiles.avatar_url` for
   * some time, and the activity page renders it. The dashboard — the one screen
   * with a 116px portrait on it — was still asking for `/avatar.jpg`, a file
   * that does not exist in `public/`, and falling through to a blue smiley.
   */
  avatarUrl?: string | null;
  /**
   * Today, as `YYYY-MM-DD` in the athlete's timezone, computed on the server.
   *
   * Anything on this screen that needs "what day is it" reads this rather than
   * calling `new Date()` — see the note on `calCursor`.
   */
  today?: string;
  /**
   * The date of the newest stored readiness snapshot.
   *
   * The screen presents `series[series.length - 1]` as if it were today's, with
   * no date attached. When an API key expires the nightly job stops writing and
   * the whole dashboard — ring, fitness/fatigue/form, narrative — keeps showing
   * the last good day, indefinitely, looking perfectly healthy. Knowing *when*
   * the number is from is the difference between a reading and a fossil.
   */
  readinessAsOf?: string;
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
  };
}

export function DashboardView({
  readinessScore,
  acwrRisk = false,
  coachView = false,
  data,
}: {
  readinessScore?: number;
  acwrRisk?: boolean;
  coachView?: boolean;
  data?: DashboardData;
}) {
  const pmc = useMemo(() => buildPmc(data?.pmcSeries), [data?.pmcSeries]);
  const realPlan = data?.plan;
  /**
   * True when this dashboard is showing somebody's own data.
   *
   * Every fallback below is gated on it. The rule the screen has to keep is
   * that a section with no real data behind it says so, rather than borrowing
   * the prototype's — an athlete with no plan was being shown twelve invented
   * weeks with "Done" and "Missed" statuses on them.
   */
  const isReal = !!data?.isReal;
  const W = useMemo(() => realPlan?.weeks ?? (isReal ? [] : weeks()), [realPlan, isReal]);
  const hasPlan = W.length > 0;
  const segments = useMemo(
    () => (data?.plan?.next ? realSessionSegments(data.plan.next) : nextSessionSegments()),
    [data?.plan?.next],
  );
  // Real bars when we have runs, the reference strip otherwise. Both are built
  // from the same appearance rules in presentation.ts.
  // The next session as a stepped pace line. See lib/dashboard/sessionLine.
  const nextLine = useMemo(() => sessionLine(segments), [segments]);

  const vols = useMemo(
    () => data?.rail?.volumes ?? (isReal ? [] : volumes()),
    [data?.rail?.volumes, isReal],
  );
  // The reference rows have no ids — a demo run has nothing to open — so they
  // are widened to the same shape and the link falls back to the list.
  const activities: { id?: string; date: string; km: string; pace: string; spark: string; sparkColor: string }[] =
    data?.recentActivities ?? (isReal ? [] : acts);
  const { ctlPath, atlPath, tsbPath, ctlArea, tsbArea, pmcGrid, pmcWeeks, pmcEnds } = pmc;

  const [weekView, setWeekView] = useState(realPlan?.currentWeek ?? 3);
  const [selD, setSelD] = useState(-1);
  // Month *and* year. The arrows used to clamp to [6, 9] — July to October —
  // because that is the window the prototype was drawn for, so in March the
  // "previous month" button jumped forward to July and in December "next"
  // jumped back to October.
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
  const [calCursor, setCalCursor] = useState(() => {
    if (data?.today) {
      return { year: Number(data.today.slice(0, 4)), month: Number(data.today.slice(5, 7)) - 1 };
    }
    return { year: 2026, month: 7 };
  });
  const [pmcHi, setPmcHi] = useState(-1);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  const copy = COPY;
  // No default. A real dashboard with no stored score shows a dash; only the
  // reference dataset gets the reference score.
  const score = Math.round(readinessScore ?? (data?.isReal ? NaN : 82));

  const rail = data?.rail;

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
    ? `\u25b2 W${rail.race.isoWeek} \u00b7 ${rail.race.weekNumber}/${rail.race.totalWeeks}`
    : rail
      ? `\u25b2 W${rail.volumes[rail.volumes.length - 1]?.isoWeek ?? ""}`
      : copy.volNow;

  // Header, countdown and streak. Each falls back to the reference copy so the
  // design keeps its shape before any data has arrived.
  const streakLabel = rail ? `${rail.streak} day streak` : isReal ? "" : copy.streak;
  // The prototype greets "Samuel" and captions "Tuesday · Intervals 9.6 km".
  // Both are somebody else's, so a real athlete gets their own name and the
  // caption only when there is a real session to name.
  const greeting = data?.athleteName
    ? `Hello, ${data.athleteName}`
    : isReal
      ? "Hello"
      : copy.greeting;
  const raceDays = rail?.race ? `${rail.race.days} days` : rail ? NO_VALUE : copy.raceDays;
  const raceName = rail?.race
    ? rail.race.label
    : rail
      ? "no goal race set"
      : copy.raceName;
  const raceProgLabel = rail?.race
    ? `Plan progress · W${rail.race.isoWeek} · ${rail.race.weekNumber} of ${rail.race.totalWeeks}`
    : rail
      ? "No plan yet"
      : copy.raceProgLabel;
  const raceProgPct = rail?.race ? `${rail.race.progressPct}%` : rail ? NO_VALUE : copy.raceProgPct;
  const raceProgWidth = rail?.race ? `${rail.race.progressPct}%` : rail ? "0%" : "33%";
  /*
   * The line under the greeting.
   *
   * `copy.context` is "Tuesday · Week 4 of 12 · Marathon" — the prototype's.
   * With no goal race there is no week-of and no distance, so a real athlete
   * gets the date and nothing else rather than someone else's race.
   */
  const headerContext = rail?.race
    ? rail.race.label.replace("to race day · ", "")
    : isReal
      ? new Intl.DateTimeFormat(APP_LOCALE, {
          weekday: "long", day: "numeric", month: "long", timeZone: APP_TIME_ZONE,
        }).format(new Date())
      : copy.context;

  // Personal records from what was actually run. A distance never covered shows
  // a dash rather than a fabricated time — the reference data had a marathon
  // best for an athlete who has never raced one.
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const prBand = data?.personalRecords
    ? data.personalRecords.map((r, i) => {
        const d = r.date ? new Date(r.date + "T00:00:00") : null;
        return {
          dist: r.label,
          time: r.time ?? "\u2014",
          date: d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : "not yet run",
          note: r.time === null ? "" : r.isNew ? "New PB" : "PB",
          noteColor: r.isNew ? "var(--color-gold)" : "var(--color-faint)",
          divider: i === 0 ? "transparent" : "var(--color-line)",
        };
      })
    : pbs;

  /**
   * How many days behind today the newest snapshot is.
   *
   * One day is normal: the nightly job writes yesterday's completed picture.
   * Two or more means nothing has been written since, and the athlete is
   * looking at history labelled as the present.
   */
  const staleDays = data?.readinessAsOf && data?.today
    ? Math.round(
        (Date.parse(data.today + "T00:00:00Z") - Date.parse(data.readinessAsOf + "T00:00:00Z")) /
          86_400_000,
      )
    : 0;
  const staleNote = staleDays >= 2
    ? `As of ${data!.readinessAsOf} — nothing newer has synced.`
    : "";

  // Real narrative when we have one, the design's reference copy otherwise.
  const narrative = data?.narrative;
  const narrativeText = narrative?.body ?? copy.narrative;
  // The next session, when there is a real plan. Falls back to the reference
  // session in COPY so the demo and the empty-plan case still render.
  const next = realPlan?.next ?? null;
  const nextTitle = next ? `Next session · ${next.name}` : copy.nextTitle;
  const nextMeta = next
    ? [
        relativeDay(next.date),
        `${(next.distanceM / 1000).toFixed(1)} km`,
        next.pace ? `${next.pace}/km` : null,
        next.durationSec ? `~${Math.round(next.durationSec / 60)} min` : null,
      ]
        .filter(Boolean)
        .join(" \u00b7 ")
    : copy.nextMeta;
  /*
   * Whether there is a real session to draw.
   *
   * Without this the card fell through to `COPY` for anyone with no plan — and
   * since nothing in the product could build a plan, that was everyone. Every
   * real athlete's dashboard announced "Next session · Intervals — 6 x 800 m",
   * an "Adjusted" tag, "Rep pace relaxed from 4:05 to 4:15 - fatigue is still
   * elevated after Sunday's long run", and a second card for "Tomorrow". All of
   * it belonged to the prototype's fictional athlete. Two inches above, the same
   * screen correctly said "No training plan yet".
   *
   * The reference render (no `data` at all) keeps the prototype session, which
   * is the one place it is honest.
   */
  const showNextCard = !isReal || next !== null;
  const showAdjTag = !next && !isReal;
  const nextReason = next ? "" : copy.nextReason;

  // The caption under the readiness ring names today's session. With no real
  // plan there is no session to name, so it says nothing rather than repeating
  // the prototype's "Tuesday · Intervals 9.6 km".
  const todayLine = next
    ? `${relativeDay(next.date)} \u00b7 ${next.name} ${(next.distanceM / 1000).toFixed(1)} km`
    : isReal
      ? ""
      : copy.todayLine;

  // A target is the athlete's own number and we have it. A predicted finish is
  // a claim we do not currently compute, and printing the prototype's 3:47:10
  // beside a real countdown is the least defensible number on the screen.
  const raceTargetText = rail ? (rail.raceTarget ?? "\u2014") : copy.raceTarget;
  const racePredText = rail ? "\u2014" : copy.racePred;
  const racePredLabelText = rail ? "No prediction yet" : copy.racePredLabel;

  const toggleReason = () => setReasonOpen((v) => !v);
  const closeReason = () => setReasonOpen(false);
  /*
   * "Show reasoning" needs a score to explain.
   *
   * The panel prints "Weighted total → {score}", and `score` is
   * `Math.round(readinessScore ?? NaN)` on a real dashboard with no stored
   * score. The hero correctly showed a dash; the panel behind it opened and
   * said "Weighted total → NaN".
   */
  const canExplain = !!narrative && Number.isFinite(score);

  const AC = "var(--color-accent)", P = "var(--color-positive)",
    N = "var(--color-negative)", CA = "var(--color-caution)",
    F = "var(--color-faint)", M = "var(--color-muted)",
    I = "var(--color-ink)", LN = "var(--color-line)";

  // A missing score is a missing score. It used to fall through to the
  // component's default of 82 and render a confident "Ready to load".
  const hasScore = Number.isFinite(score);
  const scoreText = hasScore ? String(score) : "\u2014";
  const statusLabel = !hasScore
    ? "No score yet"
    : score >= 70
      ? "Ready to load"
      : score >= 40
        ? "Ease off today"
        : "Rest day";
  const statusTone = !hasScore ? M : score >= 70 ? P : score >= 40 ? CA : N;
  const RING_C = 2 * Math.PI * 76;
  const ringDash = hasScore
    ? ((score / 100) * RING_C).toFixed(1) + " " + RING_C.toFixed(1)
    : "0 " + RING_C.toFixed(1);

  // The last point of whatever series we have. Reading index 83 assumed every
  // athlete had 84 days of history; anyone newer got NaN, and anyone older got
  // yesterday while the chart's own end-label showed today.
  const tsbNow = Math.round(pmc.T[pmc.n - 1]);
  const metrics = [
    (() => {
      // Derived per activity from its stream. Null until a run is long and
      // steady enough for decoupling to mean anything — a dash, not a guess.
      const d = data?.cardiacDriftPct;
      if (d === undefined) {
        return data?.isReal
          ? { v: "\u2014", unit: "", name: "Cardiac Drift", interp: "No steady run yet", tone: M, border: LN }
          : { v: "2.4", unit: "%", name: "Cardiac Drift", interp: "Low \u2014 good", tone: P, border: LN };
      }
      return {
        v: d.toFixed(1), unit: "%", name: "Cardiac Drift",
        interp: d <= 3 ? "Low \u2014 good" : d <= 8 ? "Mild" : "High \u2014 that run cost you",
        tone: d <= 3 ? P : d <= 8 ? M : CA, border: LN,
      };
    })(),
    (() => {
      const v = data?.rail?.volumeSummary;
      if (!v) return { v: "42", unit: "km", name: "Weekly Volume", interp: "+12% vs last week", tone: P, border: LN };
      return {
        v: String(v.km), unit: "km", name: "Weekly Volume",
        interp: v.changePct === null
          ? "first week of running"
          : `${v.changePct >= 0 ? "+" : ""}${v.changePct}% vs last week`,
        tone: v.changePct === null || Math.abs(v.changePct) < 30 ? P : CA,
        border: LN,
      };
    })(),
    (() => {
      // Descriptive only. The literature does not support presenting this as
      // an injury-risk verdict — see docs/research/02-fitness-fatigue-and-acwr.md.
      const lr = data?.loadRatio;
      if (lr === null) {
        return { v: "\u2014", unit: "", name: "Load Ratio", interp: "Building your baseline", tone: M, border: LN };
      }
      if (lr === undefined) {
        return acwrRisk
          ? { v: "1.62", unit: "", name: "Load Ratio", interp: "Well above your usual", tone: CA, border: LN }
          : { v: "1.08", unit: "", name: "Load Ratio", interp: "About your usual level", tone: P, border: LN };
      }
      const pct = Math.round((lr - 1) * 100);
      return {
        v: lr.toFixed(2), unit: "", name: "Load Ratio",
        interp: Math.abs(pct) < 10 ? "About your usual level"
          : pct > 0 ? `${pct}% above your usual` : `${Math.abs(pct)}% below your usual`,
        tone: Math.abs(pct) < 25 ? P : CA, border: LN,
      };
    })(),
    { v: (tsbNow >= 0 ? "+" : "") + tsbNow, unit: "", name: "Form (TSB)",
      interp: tsbNow >= 0 ? "Fresh" : "Fatigued", tone: CA, border: LN },
  ];

  /*
   * One line icon per metric, in the order the metrics are built.
   *
   * Thin strokes at 1.5, the same family as the streak flame and the calendar
   * arrows — an icon set that does not match the ones already on the page is
   * worse than no icons at all. They are decoration with a job: at a glance
   * the row reads as four different measurements rather than four numbers.
   *
   * A heart for drift, a road for volume, a scale for load, a battery for
   * form.
   */
  const METRIC_ICONS = [
    "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
    "M4 19h16M7 19V9m5 10V5m5 14v-6",
    "M12 3v18M5 8h14M7 8l-3 6h6ZM17 8l-3 6h6Z",
    "M3 8h14v8H3zM20 11v2",
  ];
  const metricCells = metrics.map((m, i) => ({
    ...m,
    icon: METRIC_ICONS[i] ?? METRIC_ICONS[0],
    // The figure itself carries the state, so the eye lands on the number
    // rather than on the sentence beneath it.
    figColor: m.tone === CA ? CA : m.tone === M ? I : I,
    divider: i === 0 ? "transparent" : LN,
  }));

  const wk = hasPlan ? W[Math.min(weekView, W.length - 1)] : null;
  const plan = (wk?.days ?? []).map((d, i) => {
    // Same day cell as the plan page and the coach's board — the rules live in
    // lib/ui/dayCell so three screens cannot drift apart on what "missed" looks
    // like.
    const state: DayState =
      d.status === "Done" ? "done"
        : d.status === "Missed" ? "missed"
          : d.status === "Today" || d.today ? "today"
            : d.status === "Adjusted" ? "adjusted"
              : d.type === "rest" ? "rest"
                : "planned";
    const k = dayCellStyle(state);
    const selected = selD === i;
    const type: SessionType = d.type === "int" ? "intervals" : d.type;
    return {
      day: d.day + " " + d.dateNum,
      name: d.name,
      dist: d.type === "rest" ? "\u2014" : d.dist + " km",
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

  const sel = wk && selD >= 0 ? wk.days[selD] ?? null : null;
  /*
   * Real plan days get a bar built from their own distance and pace.
   *
   * `segsFor` is the prototype's generator: clicking any real session — an 18 km
   * long run, a 5 km recovery jog — produced tooltips reading "Warm-up 10 min",
   * "800 m rep" and "90 s jog", because the shape was drawn from the session
   * *type* and somebody else's numbers. It stays for the reference render, which
   * is the one place that session is the truth.
   */
  const segsRaw = !sel
    ? []
    : isReal
      ? sessionShape({ type: sel.type, distanceKm: sel.dist, pace: sel.pace || null })
      : segsFor(sel.type);
  const segTot = segsRaw.reduce((s, x) => s + x.m, 0) || 1;
  const barBg = sel ? (sel.missed ? "var(--color-line-strong)" : sel.done ? AC : CA) : "transparent";

  const hasSel = !!sel;
  const selTitle = sel ? sel.name + " \u00b7 " + sel.day + " " + sel.mon + " " + sel.dateNum : "";
  // "8 km @ /km" is what this printed when the plan had no target pace.
  const selMeta = sel
    ? sel.type === "rest" ? "Recovery day \u2014 no training load."
      : sel.pace ? sel.dist + " km @ " + sel.pace + "/km" : sel.dist + " km"
    : "";
  const selStatus = sel ? sel.status || "Planned" : "";
  const selStatusColor = sel
    ? sel.status === "Done" ? P : sel.status === "Missed" ? N
      : sel.status === "Today" ? AC : sel.status === "Adjusted" ? CA : M
    : M;
  const selHasBar = !!sel && sel.type !== "rest" && segsRaw.length > 0;
  const selSegments = segsRaw.map((s) => ({
    w: ((s.m / segTot) * 100).toFixed(2), h: s.h, bg: barBg, title: s.t,
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
    ? sel.missed ? "Missed session \u2014 not counted toward weekly load."
      : sel.type === "rest" ? ""
        : sel.pace
          ? "Suggested shape \u2014 target pace " + sel.pace + "/km."
          : "Suggested shape for this session."
    : "";

  const weekLabel = wk ? wk.label + " \u00b7 " + wk.range : "No plan yet";
  const prevWeek = () => { setWeekView(Math.max(0, weekView - 1)); setSelD(-1); };
  const nextWeek = () => { setWeekView(Math.min(W.length - 1, weekView + 1)); setSelD(-1); };

  /* --- PMC hover --- */
  const Yv = (v: number) => pmc.yT + (1 - (v - pmc.mn) / (pmc.mx - pmc.mn)) * (pmc.yB - pmc.yT);
  const pmcHover = pmcHi >= 0;
  const lastI = pmc.n - 1;
  const hx = pmc.x0 + (lastI > 0 ? pmcHi / lastI : 0) * (pmc.x1 - pmc.x0);
  // The point's own date when the series is real. The fallback counts back from
  // today rather than from the prototype's frozen 11 August 2026.
  const hIso = pmc.D[pmcHi];
  const hDate = hIso
    ? new Date(hIso + "T00:00:00")
    : new Date(Date.now() - (lastI - pmcHi) * 86400000);
  const pmcX = pmcHover ? hx.toFixed(1) : "0";
  const pmcCtlY = pmcHover ? Yv(pmc.C[pmcHi]).toFixed(1) : "0";
  const pmcAtlY = pmcHover ? Yv(pmc.A[pmcHi]).toFixed(1) : "0";
  const pmcTsbY = pmcHover ? Yv(pmc.T[pmcHi]).toFixed(1) : "0";
  const pmcTipLeft = pmcHover ? ((hx / 1220) * 100).toFixed(1) + "%" : "0%";
  const pmcTipShift = hx > 950 ? "translateX(-110%)" : "translateX(12px)";
  const pmcTipHead = pmcHover ? MO[hDate.getMonth()] + " " + hDate.getDate() : "";
  const pmcTipCtl = pmcHover ? "Fitness " + Math.round(pmc.C[pmcHi]) : "";
  const pmcTipAtl = pmcHover ? "Fatigue " + Math.round(pmc.A[pmcHi]) : "";
  const pmcTipTsb = pmcHover
    ? "Form " + (pmc.T[pmcHi] >= 0 ? "+" : "") + Math.round(pmc.T[pmcHi]) : "";
  const onPmcMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * 1220;
    setPmcHi(Math.max(0, Math.min(lastI, Math.round(((fx - 30) / (1150 - 30)) * lastI))));
  };
  const onPmcLeave = () => setPmcHi(-1);

  /* --- calendar --- */
  // Real dots when the athlete has a plan and runs; the reference month
  // otherwise. Either way the dot colours come from presentation.ts.
  const { calLabel, calCells } = useMemo(
    () =>
      calendar(
        calCursor.month,
        rail?.calendarDots,
        rail ? new Date() : undefined,
        rail ? (rail.race ? new Date(rail.race.dateIso + "T00:00:00") : null) : undefined,
        calCursor.year,
      ),
    [calCursor, rail],
  );
  // The demo calendar still stays inside the months it has data for; a real one
  // rolls over the year like a calendar.
  const stepMonth = (delta: number) =>
    setCalCursor((c) => {
      if (!rail) return { year: c.year, month: Math.max(6, Math.min(9, c.month + delta)) };
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const calPrev = () => stepMonth(-1);
  const calNext = () => stepMonth(1);

  /* --- ask --- */
  /*
   * "Ask Runi" is the inverse of what used to be here.
   *
   * A mocked chat sat in this spot: a scripted exchange, three canned replies
   * cycled against whatever you typed, and every figure in them belonging to
   * the prototype's athlete. It was gated `!isReal`, so on a real dashboard it
   * never appeared — the feature could not run, and the code stayed to be read
   * by anybody opening the file.
   *
   * The panel that replaced it is gated the other way, on `isReal`, because it
   * answers questions from *this* athlete's runs and there is nothing to ask
   * about on the reference render. Every figure it shows comes from a pure
   * function with a test behind it, which is the difference between
   * demonstrating an intelligence and implying one.
   */
  const showAsk = isReal;
  const openAsk = () => setAskOpen(true);
  const closeAsk = () => setAskOpen(false);

  return (
<div data-entrance-root style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 36px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance />{(coachView) ? (<><div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "10px 16px", border: "1px solid var(--color-accent-soft)", background: "var(--color-accent-soft)", borderRadius: "var(--radius-control)" }}><span className="tag" style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}>{copy.coachViewTag}</span><p style={{ margin: "0", fontSize: "12.5px", color: "var(--color-ink)", flex: "1" }}>{copy.coachViewMsg}</p><a className="btn btn-secondary" href="/coach" style={{ padding: "6px 12px", fontSize: "12px" }}>{copy.coachBack}</a></div></>) : null}<header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><BrandMark /><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span></div><div style={{ textAlign: "start" }}><h1 style={{ margin: "0", fontSize: "24px", fontWeight: "700", letterSpacing: "-0.01em", lineHeight: 1.1 }}>{greeting}</h1><p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>{headerContext}</p></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}><a href="/dashboard" style={{ color: "var(--color-ink)" }}>{copy.navHome}</a><a href="/plan" style={{ color: "var(--color-muted)" }}>{copy.navPlan}</a><a href="/activities" style={{ color: "var(--color-muted)" }}>{copy.navActivities}</a><a href="/settings" style={{ color: "var(--color-muted)" }}>{copy.navSettings}</a></nav><div style={{ flex: "1" }}></div><div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--color-muted)", fontSize: "12px" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>{(streakLabel) ? (<span className="num">{streakLabel}</span>) : null}</div></header><div className="rail-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 288px", gap: "12px" }}><section className="card hero-grid" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "20px", padding: "20px 24px", alignItems: "center", gridColumn: "1", minWidth: "0" }}><div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}><Avatar src={data?.avatarUrl ?? null} name={data?.athleteName ?? undefined} size={116} zoomable /><div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}><span className="num" style={{ fontSize: "30px", fontWeight: "500", lineHeight: "1", color: statusTone }}>{scoreText}</span><span style={{ fontSize: "10px", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.readinessLabel}</span></div><div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}><p className="num" style={{ margin: "0", fontSize: "12.5px", fontWeight: "500", color: statusTone, whiteSpace: "nowrap" }}>{statusLabel}</p>{(todayLine) ? (<p className="num" style={{ margin: "0", fontSize: "11px", color: "var(--color-faint)", whiteSpace: "nowrap" }}>{todayLine}</p>) : null}{(staleNote) ? (<p className="num" style={{ margin: "0", fontSize: "10.5px", color: "var(--color-caution)", textAlign: "center", textWrap: "pretty" }}>{staleNote}</p>) : null}</div></div><div style={{ borderInlineStart: "1px solid var(--color-line)", paddingInlineStart: "28px", display: "flex", flexDirection: "column", gap: "12px", alignSelf: "stretch", justifyContent: "center" }}><div><span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>{copy.aiTag}</span></div><p style={{ margin: "0", fontSize: "16px", lineHeight: "1.55", maxWidth: "640px", textWrap: "pretty" }}>{narrativeText}</p><div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBlockStart: "4px" }}><a className="btn btn-primary" href="/plan">{copy.btnSession}</a><button className="btn btn-secondary" type="button" onClick={toggleReason} disabled={!canExplain} aria-expanded={reasonOpen} title={canExplain ? undefined : "Available once your own data has been synced"}>{copy.btnReason}</button></div></div><div className="kpi-grid" style={{ gridColumn: "1 / -1", borderBlockStart: "1px solid var(--color-line)", marginBlockStart: "4px", paddingBlockStart: "12px", display: "grid", gridTemplateColumns: "repeat(4,1fr)" }} aria-label="Key metrics">{metricCells.map((m, _im) => (<React.Fragment key={_im}><div style={{ padding: "2px 10px", borderInlineStart: `1px solid ${m.divider}`, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", textAlign: "center" }}><div style={{ display: "flex", alignItems: "center", gap: "6px" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={m.icon} /></svg><span className="num" style={{ fontSize: "22px", fontWeight: "500", letterSpacing: "-0.02em", lineHeight: "1", color: m.figColor }}>{m.v}</span><span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>{m.unit}</span></div><p className="num" style={{ margin: "0", fontSize: "9px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-faint)", fontWeight: "600", whiteSpace: "nowrap" }}>{m.name}</p><p className="num" style={{ margin: "0", fontSize: "10px", color: m.tone, whiteSpace: "nowrap" }}>{m.interp}</p></div></React.Fragment>))}</div></section>{(reasonOpen && narrative) ? (<ReasoningPanel narrative={narrative} score={score} onClose={closeReason} />) : null}<section className="grid" style={{ gridColumn: "1", minWidth: "0" }}><div className="card c12" style={{ padding: "20px 22px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}><div><h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{copy.pmcTitle}</h2><p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>{copy.pmcSub}</p></div><div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "var(--color-muted)" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "14px", height: "2px", background: "var(--color-ctl)", display: "inline-block" }}></span>{copy.legCtl}</span><span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "14px", height: "2px", background: "var(--color-atl)", display: "inline-block" }}></span>{copy.legAtl}</span><span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><svg width="14" height="2"><line x1="0" y1="1" x2="14" y2="1" stroke="var(--color-tsb)" strokeWidth="2" strokeDasharray="4 3" /></svg>{copy.legTsb}</span></div></div><div style={{ position: "relative", marginBlockStart: "14px" }}><svg viewBox="0 0 1220 148" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Fitness, fatigue and form over 12 weeks" onMouseMove={onPmcMove} onMouseLeave={onPmcLeave}><defs><linearGradient id="ctlfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-ctl)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--color-ctl)" stopOpacity="0" /></linearGradient><filter id="pmcGlow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="4" /></filter></defs>{pmcGrid.map((g, _i2) => (<React.Fragment key={_i2}><g><line x1="30" x2="1150" y1={g.y} y2={g.y} stroke="var(--color-line)" strokeWidth="1" strokeDasharray={g.dash} /><text x="24" y={g.ty} fill="var(--color-faint)" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="end">{g.label}</text></g></React.Fragment>))}<text x="24" y="8" fill="var(--color-faint)" fontSize="8.5" fontFamily="IBM Plex Mono" textAnchor="end">{copy.pmcAxisUnit}</text>{pmcWeeks.map((w, _i3) => (<React.Fragment key={_i3}><text x={w.x} y="144" fill="var(--color-faint)" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">{w.label}</text></React.Fragment>))}<path d={tsbArea} fill="var(--color-tsb)" opacity="0.06" /><path d={ctlArea} fill="url(#ctlfill)" /><path d={atlPath} fill="none" stroke="var(--color-atl)" strokeWidth="1.4" opacity="0.9" /><path d={tsbPath} fill="none" stroke="var(--color-tsb)" strokeWidth="1.6" strokeDasharray="5 4" /><path d={ctlPath} fill="none" stroke="var(--color-ctl)" strokeWidth="5" opacity="0.45" filter="url(#pmcGlow)" /><path d={ctlPath} fill="none" stroke="var(--color-ctl)" strokeWidth="2.4" />{pmcEnds.map((e, _i4) => (<React.Fragment key={_i4}><text x="1158" y={e.y} fill={e.color} fontSize="11" fontWeight="500" fontFamily="IBM Plex Mono">{e.text}</text></React.Fragment>))}{(pmcHover) ? (<><g><line x1={pmcX} x2={pmcX} y1="6" y2="126" stroke="var(--color-faint)" strokeWidth="1" strokeDasharray="3 3" /><circle cx={pmcX} cy={pmcCtlY} r="3.5" fill="var(--color-ctl)" /><circle cx={pmcX} cy={pmcAtlY} r="3" fill="var(--color-atl)" /><circle cx={pmcX} cy={pmcTsbY} r="3" fill="var(--color-tsb)" /></g></>) : null}</svg>{(pmcHover) ? (<><div className="num" style={{ position: "absolute", top: "8px", left: pmcTipLeft, transform: pmcTipShift, background: "var(--color-elevated)", border: "1px solid var(--color-line-strong)", borderRadius: "var(--radius-control)", padding: "8px 12px", fontSize: "11px", pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,.5)", zIndex: "5" }}><div style={{ color: "var(--color-faint)", marginBlockEnd: "3px" }}>{pmcTipHead}</div><div style={{ color: "var(--color-ctl)" }}>{pmcTipCtl}</div><div style={{ color: "var(--color-atl)" }}>{pmcTipAtl}</div><div style={{ color: "var(--color-tsb)" }}>{pmcTipTsb}</div></div></>) : null}</div></div></section><section className="card" style={{ padding: "20px 22px", gridColumn: "1", minWidth: "0" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}><h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{copy.planTitle}</h2><div className="plan-pager" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}><div className="hide-m" style={{ display: "flex", gap: "14px", fontSize: "11px", color: "var(--color-muted)", marginInlineEnd: "8px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><BrandMark />{copy.legDone}</span><span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", background: "var(--color-caution)", borderRadius: "2px", display: "inline-block" }}></span>{copy.legPlanned}</span></div><button className="btn btn-secondary" type="button" onClick={prevWeek} disabled={!hasPlan || weekView <= 0} style={{ padding: "5px 10px" }} aria-label="Previous week"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button><span className="num" style={{ fontSize: "11.5px", color: "var(--color-muted)", minWidth: "170px", textAlign: "center" }}>{weekLabel}</span><button className="btn btn-secondary" type="button" onClick={nextWeek} disabled={!hasPlan || weekView >= W.length - 1} style={{ padding: "5px 10px" }} aria-label="Next week"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></button></div></div><div className="week-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "8px", marginBlockStart: "14px" }}>{plan.map((p, _i5) => (<React.Fragment key={_i5}><button className="dc-hover-border" type="button" onClick={p.select} style={{ textAlign: "start", fontFamily: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", gap: "7px", padding: "10px 11px", borderRadius: "var(--radius-control)", background: p.bg, border: "none", borderInlineStart: `2px solid ${p.edge}`, boxShadow: p.ring, opacity: p.opacity, minHeight: "102px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "6px", width: "100%" }}><span className="num" style={{ fontSize: "10px", letterSpacing: ".1em", textTransform: "uppercase", color: p.dayColor, whiteSpace: "nowrap" }}>{p.day}</span><span className="num" style={{ fontSize: "8.5px", letterSpacing: ".04em", textTransform: "uppercase", color: p.statusColor, whiteSpace: "nowrap", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis" }}>{p.statusShort}</span></div><div style={{ flex: "1" }}><p style={{ margin: "0", fontSize: "12.5px", fontWeight: "500", color: p.nameColor }}>{p.name}</p><p className="num" style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>{p.dist}</p></div><span className="tag" style={{ background: "var(--color-elevated)", color: p.tagColor }}>{p.tag}</span></button></React.Fragment>))}</div>{(!hasPlan) ? (<p style={{ margin: "14px 0 0", fontSize: "12.5px", color: "var(--color-muted)", lineHeight: "1.6" }}>{"No training plan yet. Set a goal race and Runi will build one \u2014 until then there is nothing here to show you."}</p>) : null}{(hasSel) ? (<><div style={{ marginBlockStart: "14px", borderBlockStart: "1px solid var(--color-line)", paddingBlockStart: "16px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}><div><h3 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{selTitle}</h3><p className="num" style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-muted)" }}>{selMeta}</p></div><span className="tag" style={{ background: "var(--color-elevated)", color: selStatusColor }}>{selStatus}</span></div>{(selHasBar) ? (<><div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "52px", marginBlockStart: "14px" }}>{selSegments.map((s, _i6) => (<React.Fragment key={_i6}><div title={s.title} style={{ width: `${s.w}%`, height: `${s.h}px`, background: s.bg, borderRadius: "3px 3px 0 0" }}></div></React.Fragment>))}</div></>) : null}<p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>{selCaption}</p></div></>) : null}</section><section className="grid" style={{ gridColumn: "1", minWidth: "0" }}>{(showNextCard) ? (<div className="card c12" style={{ padding: "20px 22px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}><div><h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{nextTitle}</h2><p className="num" style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-muted)" }}>{nextMeta}</p></div>{(showAdjTag) ? (<span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>{copy.adjTag}</span>) : null}</div>{(nextReason) ? (<p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-caution)" }}>{nextReason}</p>) : null}{nextLine ? (<svg viewBox="0 0 560 96" style={{ width: "100%", height: "auto", display: "block", marginBlockStart: "12px" }}><defs><linearGradient id="nsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.26" /><stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" /></linearGradient><filter id="nsGlow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="3" /></filter></defs><line x1="4" y1="84" x2="556" y2="84" stroke="var(--color-line)" strokeWidth="1" /><path d={nextLine.area} fill="url(#nsFill)" /><path d={nextLine.path} fill="none" stroke="var(--color-accent)" strokeWidth="4" opacity="0.45" filter="url(#nsGlow)" /><path d={nextLine.path} fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinejoin="round" />{nextLine.dots.map((d, _id) => (<React.Fragment key={_id}><g><circle cx={d.x} cy={d.y} r="5" fill="var(--color-accent)" opacity="0.25" /><circle cx={d.x} cy={d.y} r="2.5" fill="var(--color-canvas)" stroke="var(--color-accent)" strokeWidth="1.4" /><text x={d.x} y={d.ly} fill="var(--color-muted)" fontSize="8.5" fontFamily="var(--font-mono)" textAnchor="middle">{d.l}</text></g></React.Fragment>))}</svg>) : null}{(next) ? null : (<div className="num" style={{ display: "flex", justifyContent: "space-between", marginBlockStart: "6px" }}><span style={{ fontSize: "10px", color: "var(--color-faint)" }}>{copy.segWu}</span><span style={{ fontSize: "10px", color: "var(--color-accent)" }}>{copy.segReps}</span><span style={{ fontSize: "10px", color: "var(--color-faint)" }}>{copy.segCd}</span></div>)}{(next) ? null : (<div style={{ borderBlockStart: "1px solid var(--color-line)", marginBlockStart: "16px", paddingBlockStart: "12px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><p style={{ margin: "0", fontSize: "12px", color: "var(--color-muted)" }}>{copy.next2Meta}</p><span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>{copy.next2Note}</span></div><div style={{ height: "22px", marginBlockStart: "8px", display: "flex" }}><div title={copy.next2Title} style={{ width: "100%", height: "22px", background: "var(--color-elevated)", border: "1px solid var(--color-line-strong)", borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center" }}><span className="num" style={{ fontSize: "10px", color: "var(--color-muted)" }}>{copy.next2Label}</span></div></div></div>)}</div>) : (<div className="card c12" style={{ padding: "20px 22px" }}><h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{copy.nextTitleEmpty}</h2><p style={{ margin: "8px 0 0", fontSize: "12.5px", color: "var(--color-muted)", lineHeight: "1.6" }}>{copy.nextBodyEmpty}</p><a className="btn btn-primary" href="/plan" style={{ display: "inline-block", marginBlockStart: "14px" }}>{copy.nextCtaEmpty}</a></div>)}</section><div className="card" style={{ padding: "14px 16px", gridColumn: "2", gridRow: "1" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><button className="btn btn-secondary" type="button" onClick={calPrev} style={{ padding: "4px 8px" }} aria-label="Previous month"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button><h2 className="num" style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{calLabel}</h2><button className="btn btn-secondary" type="button" onClick={calNext} style={{ padding: "4px 8px" }} aria-label="Next month"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px", marginBlockStart: "12px" }}>{calHead.map((h, _i8) => (<React.Fragment key={_i8}><span className="num" style={{ fontSize: "9px", color: "var(--color-faint)", textAlign: "center", paddingBlock: "2px" }}>{h.t}</span></React.Fragment>))}{calCells.map((c, _i9) => (<React.Fragment key={_i9}><div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", padding: "5px 0 3px", borderRadius: "6px", background: c.bg }}><span className="num" style={{ fontSize: "11px", lineHeight: "1", color: c.color }}>{c.n}</span><span style={{ width: "4px", height: "4px", borderRadius: "50%", background: c.dot }}></span></div></React.Fragment>))}</div><div style={{ display: "flex", gap: "12px", marginBlockStart: "10px", fontSize: "10px", color: "var(--color-faint)" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--color-accent)" }}></span>{copy.legDone}</span><span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--color-caution)" }}></span>{copy.legPlanned}</span><span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--color-negative)" }}></span>{copy.legMissed}</span></div></div><div className="card" style={{ padding: "14px 16px", gridColumn: "2", gridRow: "2" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap" }}>{copy.volTitle}</h2><span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{copy.volMeta}</span></div><div style={{ marginBlockStart: "10px" }}><MiniBars data={volBars} idPrefix="railvol" box={BAR_BOX_RAIL} ariaLabel="Weekly volume, last 12 weeks" /></div><div className="num" style={{ display: "flex", justifyContent: "flex-end", marginBlockStart: "2px" }}><span style={{ fontSize: "9px", color: "var(--color-accent)" }}>{volNowLabel}</span></div></div><div className="card" style={{ padding: "14px 16px", gridColumn: "2", gridRow: "3" }}><p className="num" style={{ margin: "0", fontSize: "9.5px", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-faint)" }}>{raceName}</p><div style={{ display: "flex", alignItems: "baseline", gap: "7px", marginBlockStart: "4px" }}><span className="num" style={{ fontSize: "42px", fontWeight: "500", letterSpacing: "-0.03em", lineHeight: "1" }}>{raceDays}</span><span style={{ fontSize: "11.5px", color: "var(--color-muted)" }}>{copy.raceDaysUnit}</span></div><div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBlockStart: "14px" }}><div className="num" style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--color-faint)" }}><span>{raceProgLabel}</span><span>{raceProgPct}</span></div><div style={{ height: "5px", background: "var(--color-elevated)", borderRadius: "var(--radius-pill)" }}><div style={{ width: raceProgWidth, height: "5px", background: "var(--color-accent)", borderRadius: "var(--radius-pill)" }}></div></div></div><div style={{ display: "flex", justifyContent: "space-between", marginBlockStart: "14px", paddingBlockStart: "12px", borderBlockStart: "1px solid var(--color-line)" }}><div><p className="num" style={{ margin: "0", fontSize: "14px" }}>{raceTargetText}</p><p className="num" style={{ margin: "1px 0 0", fontSize: "10px", color: "var(--color-faint)" }}>{copy.raceTargetLabel}</p></div><div style={{ textAlign: "end" }}><p className="num" style={{ margin: "0", fontSize: "14px", color: rail ? "var(--color-faint)" : "var(--color-caution)" }}>{racePredText}</p><p className="num" style={{ margin: "1px 0 0", fontSize: "10px", color: "var(--color-faint)" }}>{racePredLabelText}</p></div></div></div><div className="card" style={{ padding: "14px 16px", gridColumn: "2", gridRow: "4 / span 2" }}><h2 style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: "600" }}>{copy.actsTitle}</h2><div style={{ display: "flex", flexDirection: "column" }}>{activities.map((a, _i11) => (<React.Fragment key={_i11}><a className="dc-hover-bg" href={a.id ? `/activities/${a.id}` : "/activities"} style={{ display: "grid", gridTemplateColumns: "40px 1fr auto auto", alignItems: "center", gap: "8px", padding: "5px 6px", borderRadius: "var(--radius-control)" }}><span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>{a.date}</span><div><span className="num" style={{ fontSize: "12px", fontWeight: "500", color: "var(--color-ink)" }}>{a.km}</span><span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}> km</span></div><span className="num" style={{ fontSize: "11px", color: "var(--color-muted)" }}>{a.pace}</span><svg width="56" height="20" viewBox="0 0 80 24" preserveAspectRatio="none"><path d={a.spark} fill="none" stroke={a.sparkColor} strokeWidth="1.6" /></svg></a></React.Fragment>))}</div></div></div><section className="card" aria-label="Personal records" style={{ padding: "13px 20px", border: "1px solid var(--color-gold)", borderBlockStart: "2px solid var(--color-gold)", background: "linear-gradient(180deg,var(--color-gold-soft),var(--color-surface) 60%)" }}><h2 style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "var(--color-gold)", letterSpacing: ".04em" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>
      {copy.pbTitle}</h2><div className="pb-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)" }}>{prBand.map((b, _i12) => (<React.Fragment key={_i12}><div style={{ paddingInline: "20px", borderInlineStart: `1px solid ${b.divider}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "8px" }}><span className="num" style={{ fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{b.dist}</span><span className="num" style={{ fontSize: "9px", letterSpacing: ".05em", textTransform: "uppercase", color: b.noteColor, whiteSpace: "nowrap" }}>{b.note}</span></div><p className="num" style={{ margin: "6px 0 2px", fontSize: "21px", fontWeight: "500", lineHeight: "1" }}>{b.time}</p><p className="num" style={{ margin: "0", fontSize: "10px", color: "var(--color-faint)" }}>{b.date}</p></div></React.Fragment>))}</div></section>{(showAsk) ? (<button className="btn btn-primary" type="button" onClick={openAsk} style={{ position: "fixed", insetBlockEnd: "20px", insetInlineEnd: "20px", borderRadius: "var(--radius-pill)", padding: "11px 18px", boxShadow: "0 6px 24px rgba(0,0,0,.5)", zIndex: "40" }} aria-haspopup="dialog" aria-expanded={askOpen}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
    {copy.askBtn}
  </button>) : null}{(askOpen && showAsk) ? (<InsightsPanel onClose={closeAsk} />) : null}</div>
  );
}

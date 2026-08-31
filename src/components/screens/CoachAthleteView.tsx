"use client";

/**
 * One athlete, as their coach needs them.
 *
 * Three questions in order: how are they, what is coming, and what did they
 * actually do. The plan section is editable in place — a coach who has to leave
 * the page to change Thursday will not change Thursday.
 */

import { useMemo, useState, useTransition } from "react";
import { CoachNav } from "@/components/coach/CoachNav";
import { useRouter } from "next/navigation";
import { removeAthlete, updateWorkout, type AthleteDetail, type AthleteWorkout } from "@/actions/coach";
import { formatDuration, formatPace } from "@/lib/format/pace";
import { RACE_LABEL } from "@/lib/coach/templates";
import { Avatar } from "@/components/ui/Avatar";
import { Entrance, StatTile, STAT_ICONS, StatusChip } from "@/components/ui";
import { ICON as NB_ICON, NUMBERS_HUE } from "@/lib/screens/numbers";

/** why a past day does not open */
const PAST_HINT = "This session has already happened. Past weeks are a record, not a plan.";
import {
  addDays, APP_LOCALE, APP_TIME_ZONE, isoDate, weekDates, WEEKDAYS, weekStart,
} from "@/lib/time/week";
import {
  COACH_COPY, formColor, KIND_LABEL, loadColor,
  raceLabel, readinessColor, sinceLabel, sinceParts, toneColor, untilLabel,
} from "@/lib/screens/coachHome";

const WORKOUT_TYPES = ["easy", "long", "interval", "rest"] as const;
type WorkoutTypeName = (typeof WORKOUT_TYPES)[number];

const km = (m: number | null) => (m === null ? "—" : `${(m / 1000).toFixed(1)} km`);

/**
 * Seconds per kilometre, from the two figures the row already carried.
 *
 * The coach's run list showed distance, time and heart rate and left the
 * athlete to divide one by the other in their head — while the athlete's own
 * list two clicks away printed the pace outright. Pace is the number a coach
 * actually scans a week of running for; nothing needed fetching to show it.
 */
const pace = (distanceM: number | null, durationS: number | null) => {
  if (!distanceM || !durationS || distanceM <= 0 || durationS <= 0) return "—";
  return `${formatPace(durationS / (distanceM / 1000))}/km`;
};

export function CoachAthleteView({ detail, today }: { detail: AthleteDetail; today: string }) {
  const { athlete, trend, workouts, recentRuns, flags, email, level, age, targetTime } = detail;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ type: WorkoutTypeName; km: string }>({ type: "easy", km: "" });
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  /**
   * Two presses to end a coaching relationship.
   *
   * `removeAthlete` has existed since the coaching work landed and was called
   * from nowhere, so a coach could not take anybody off their roster — a
   * mistyped code or a relationship that ended stayed on the board for ever.
   *
   * A confirm step rather than a browser dialog: this is destructive from the
   * athlete's side too (they lose their coach without being asked), and a
   * `confirm()` blocks the page and reads as an interruption rather than a
   * decision.
   */
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const router = useRouter();

  const remove = () => {
    setRemoveError("");
    startTransition(async () => {
      const result = await removeAthlete(athlete.id);
      if (!result.ok) return setRemoveError(result.error);
      router.push("/coach/athletes");
      router.refresh();
    });
  };

  const open = (w: AthleteWorkout) => {
    setNote("");
    setEditing(w.id);
    setDraft({
      type: (WORKOUT_TYPES as readonly string[]).includes(w.workoutType)
        ? (w.workoutType as WorkoutTypeName)
        : "easy",
      km: w.plannedDistanceM ? String(Math.round((w.plannedDistanceM / 1000) * 10) / 10) : "",
    });
  };

  const save = (w: AthleteWorkout) => {
    const parsed = draft.km.trim() === "" ? null : Number(draft.km);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)) {
      setNote("Distance must be a number of kilometres between 0 and 100.");
      return;
    }
    startTransition(async () => {
      const result = await updateWorkout(w.id, {
        workoutType: draft.type,
        plannedDistanceM: draft.type === "rest" ? null : parsed === null ? null : Math.round(parsed * 1000),
      });
      setNote(result.ok ? "Saved." : result.error);
      if (result.ok) setEditing(null);
    });
  };

  // Fitness and fatigue over six weeks. Two lines, no axis furniture: the shape
  // is the message and the numbers are already in the metric row above.
  /*
   * Fitness and fatigue over six weeks.
   *
   * It used to be two bare lines — "the shape is the message". It isn't. A
   * coach asked what the vertical axis was and there was no answer on screen:
   * no unit, no values, and no dates, so a rise could have been from 30 to 32
   * or from 30 to 90 and the picture was identical. Three gridlines with their
   * figures, the unit, and the first and last date now say what is being
   * looked at.
   *
   * Three faults were hiding in the arithmetic:
   *
   * - With every `ctl`/`atl` null the section still rendered — an empty box, a
   *   legend, and two `<path d="">`. `hasTrend` now decides whether there is
   *   anything to draw at all.
   * - With every value equal, `hi - lo || 1` put the flat line at y = 92 in a
   *   100-tall viewBox: pinned to the very bottom edge rather than centred,
   *   which reads as a collapse rather than as steadiness. The range is now
   *   opened out around the value.
   * - `started` was never reset after a null, so a gap in the data was bridged
   *   with a straight line through it — a week with no snapshots was drawn as
   *   if fitness had moved smoothly across it. `sparkline.ts` lifts the pen for
   *   exactly this reason; this one did not.
   */
  const values = trend.flatMap((t) => [t.ctl, t.atl]).filter((v): v is number => v !== null);
  const hasTrend = values.length >= 2;
  const rawLo = values.length ? Math.min(...values) : 0;
  const rawHi = values.length ? Math.max(...values) : 1;
  // A degenerate range is opened out rather than clamped to 1, so a flat line
  // sits in the middle of the box.
  const pad = rawHi - rawLo < 1 ? Math.max(1, Math.abs(rawHi) * 0.1) : 0;
  const lo = rawLo - pad;
  const hi = rawHi + pad;
  const span = hi - lo || 1;
  // A gutter on the left for the axis figures, and a row at the bottom for the
  // dates. The plot itself keeps the height it had.
  const px = (i: number) => 34 + (i / Math.max(1, trend.length - 1)) * 558;
  // The plot starts below the unit caption. At y=8 the top gridline's figure
  // and the word "load" were drawn on top of each other.
  const py = (v: number) => 20 + (1 - (v - lo) / span) * 76;

  /** three lines: the bottom of the range, the middle, the top */
  const gridlines = [lo, (lo + hi) / 2, hi].map((v) => ({
    v,
    y: py(v),
    label: String(Math.round(v)),
  }));

  /** "9 Aug" — enough to place the ends of the window in the calendar */
  const shortDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(APP_LOCALE, {
      day: "numeric", month: "short", timeZone: APP_TIME_ZONE,
    });
  const path = (pick: (t: (typeof trend)[number]) => number | null) => {
    let d = "";
    let started = false;
    trend.forEach((t, i) => {
      const v = pick(t);
      if (v === null) {
        // Lift the pen. The next point starts a new stroke.
        started = false;
        return;
      }
      d += (started ? "L" : "M") + px(i).toFixed(1) + " " + py(v).toFixed(1);
      started = true;
    });
    return d;
  };

  /*
   * The four figures at the top of an athlete's page, on the shared stat tile.
   *
   * The colour the caller computes is a *state*, not a decoration, so it maps
   * onto the tile's tone rather than being painted straight onto the figure —
   * which is what keeps the coach's board and the athlete's home reading the
   * same way about the same number.
   */
  /**
   * A tile whose figure carries a unit — "3 · days ago" rather than the whole
   * sentence in the 25px slot, which overflowed the cell.
   */
  const metricUnit = (
    label: string,
    parts: { value: string | null; unit: string },
    icon?: string,
    hue?: string,
  ) => (
    <StatTile key={label} value={parts.value} unit={parts.unit} label={label} icon={icon} hue={hue} />
  );

  // The same icon and hue each figure wears on the athlete's own Numbers board.
  const metric = (label: string, value: string, color: string, icon?: string, hue?: string) => (
    <StatTile
      key={label}
      value={value === "\u2014" ? null : value}
      label={label}
      icon={icon}
      hue={hue}
      tone={
        color === "var(--color-negative)" ? "bad"
          : color === "var(--color-caution)" ? "warning"
            : color === "var(--color-positive)" ? "good"
              : "neutral"
      }
    />
  );

  /*
   * The plan, one week at a time.
   *
   * It used to be two flat lists — every upcoming session as a full row with a
   * Change button, then every past one underneath. On a fourteen-week plan that
   * is ninety-eight rows, all expanded, and finding Thursday meant scrolling.
   *
   * A week of seven squares is the vocabulary the athlete already sees on their
   * dashboard and plan screen, so coach and athlete are looking at the same
   * shape. One session opens at a time, underneath the day it belongs to.
   */
  const weeks = useMemo(() => {
    if (workouts.length === 0) return [] as { start: string; days: (AthleteWorkout | null)[] }[];
    const byDate = new Map(workouts.map((w) => [w.date, w]));
    const sorted = [...workouts].map((w) => w.date).sort();
    const first = weekStart(new Date(`${sorted[0]}T00:00:00`));
    const lastDay = new Date(`${sorted[sorted.length - 1]}T00:00:00`);

    const out: { start: string; days: (AthleteWorkout | null)[] }[] = [];
    for (let cursor = first; cursor <= lastDay; cursor = addDays(cursor, 7)) {
      const start = isoDate(cursor);
      out.push({
        start,
        days: weekDates(start).map((d) => byDate.get(d) ?? null),
      });
    }
    return out;
  }, [workouts]);

  /** The week containing today, or the last one the plan has. */
  const currentWeek = useMemo(() => {
    const i = weeks.findIndex((w) => weekDates(w.start).includes(today));
    return i >= 0 ? i : Math.max(0, weeks.length - 1);
  }, [weeks, today]);

  const [weekView, setWeekView] = useState<number | null>(null);
  const shownWeek = weekView ?? currentWeek;
  const week = weeks[shownWeek];

  const stepWeek = (delta: number) => {
    setWeekView(Math.min(weeks.length - 1, Math.max(0, shownWeek + delta)));
    setEditing(null);
    setNote("");
  };

  /** "10 – 16 August", for the strip's header. */
  const weekLabel = (start: string) => {
    const days = weekDates(start);
    const fmt = (iso: string, withMonth: boolean) =>
      new Date(`${iso}T00:00:00`).toLocaleDateString(APP_LOCALE, {
        day: "numeric",
        ...(withMonth ? { month: "long" as const } : {}),
        timeZone: APP_TIME_ZONE,
      });
    const sameMonth = days[0].slice(0, 7) === days[6].slice(0, 7);
    return `${fmt(days[0], !sameMonth)} – ${fmt(days[6], true)}`;
  };

  /** One day in the week strip. */
  const daySquare = (w: AthleteWorkout | null, iso: string, index: number) => {
    const isToday = iso === today;
    const ran = !!w && w.actualM !== null && w.actualM > 0;
    const missed = !!w && iso < today && w.workoutType !== "rest" && !ran;
    const selected = !!w && editing === w.id;
    /*
     * A past day is a record, not a plan.
     *
     * The server refuses the edit either way (see `updateWorkout`), but a cell
     * that opens an editor and then rejects the save is a worse experience
     * than one that never opened. Today stays editable — this evening's run
     * has not happened yet.
     */
    const past = iso < today;
    /*
     * A past day opens; it just does not open an editor.
     *
     * The first version of the guard disabled the cell entirely, which took
     * reading away along with writing — and reading is most of the job. "Why
     * did she miss Tuesday" is the question this screen exists to answer.
     */
    const openable = !!w;

    const label = !w
      ? "—"
      : w.workoutType === "rest"
        ? "Rest"
        : `${w.workoutType[0].toUpperCase()}${w.workoutType.slice(1)}`;

    return (
      <button
        key={iso}
        type="button"
        className="dc-hover-border"
        disabled={!openable}
        title={past && w ? PAST_HINT : undefined}
        onClick={() => (openable && w ? (selected ? setEditing(null) : open(w)) : undefined)}
        style={{
          textAlign: "start",
          fontFamily: "inherit",
          cursor: openable ? "pointer" : "default",
          display: "flex",
          flexDirection: "column",
          gap: "5px",
          padding: "8px 9px",
          minHeight: "84px",
          borderRadius: "var(--radius-control)",
          background: selected || isToday ? "var(--color-elevated)" : "transparent",
          border: `1px solid ${
            selected
              ? "var(--color-accent)"
              : isToday
                ? "var(--color-accent-soft)"
                : missed
                  ? "var(--color-negative)"
                  : "var(--color-line)"
          }`,
          opacity: w ? 1 : 0.45,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "4px" }}>
          <span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: isToday ? "var(--color-accent)" : "var(--color-faint)" }}>
            {WEEKDAYS[index]}
          </span>
          <span className="num" style={{ fontSize: "9.5px", color: "var(--color-faint)" }}>
            {iso.slice(8)}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: "11.5px", fontWeight: 500, color: w && w.workoutType !== "rest" ? "var(--color-ink)" : "var(--color-faint)" }}>
            {label}
          </p>
          {w && w.plannedDistanceM ? (
            <p className="num" style={{ margin: "1px 0 0", fontSize: "10px", color: "var(--color-faint)" }}>
              {(w.plannedDistanceM / 1000).toFixed(1)} km
            </p>
          ) : null}
        </div>
        <span className="num" style={{ fontSize: "9px", letterSpacing: ".04em", textTransform: "uppercase", color: ran ? "var(--color-positive)" : missed ? "var(--color-negative)" : "var(--color-faint)" }}>
          {ran ? `ran ${((w!.actualM as number) / 1000).toFixed(1)}` : missed ? "missed" : ""}
        </span>
      </button>
    );
  };

  /** The one session being changed, under the strip. */
  const editorPanel = () => {
    const w = workouts.find((x) => x.id === editing);
    if (!w) return null;
    // A day that has been run is shown, not edited.
    if (w.date < today) return <PastPanel w={w} />;
    return (
      <div
        style={{
          marginBlockStart: "12px",
          borderBlockStart: "1px solid var(--color-line)",
          paddingBlockStart: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <h3 style={{ margin: 0, fontSize: "12.5px", fontWeight: 600 }}>
            {new Date(`${w.date}T00:00:00`).toLocaleDateString(APP_LOCALE, {
              weekday: "long", day: "numeric", month: "long", timeZone: APP_TIME_ZONE,
            })}
          </h3>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setEditing(null)}
            style={{ padding: "4px 10px", fontSize: "11px" }}
          >
            {COACH_COPY.cancel}
          </button>
        </div>

        {/*
            What this session used to be, and why it is not that any more.

            Migration 0014 has been storing `origin`, `planned_distance_original`
            and `adjusted_reason` since it shipped and nothing ever read them, so
            a coach who shortened a long run and left a reason came back to a
            number with no history — indistinguishable from what the generator
            produced. The row below is the whole of that fix: it appears only
            when somebody actually changed the session.
        */}
        {w.origin !== "generated" && (w.originalDistanceM || w.adjustedReason) ? (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "8px",
              flexWrap: "wrap",
              padding: "8px 10px",
              borderRadius: "var(--radius-control)",
              background: "var(--color-elevated)",
            }}
          >
            <span
              className="tag"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
            >
              {w.origin === "coach" ? COACH_COPY.editedByCoach : COACH_COPY.editedByAthlete}
            </span>
            {w.originalDistanceM ? (
              <span className="num" style={{ fontSize: "11.5px", color: "var(--color-muted)" }}>
                {(w.originalDistanceM / 1000).toFixed(1)} km → {((w.plannedDistanceM ?? 0) / 1000).toFixed(1)} km
              </span>
            ) : null}
            {w.adjustedReason ? (
              <span style={{ fontSize: "11.5px", color: "var(--color-muted)" }}>{w.adjustedReason}</span>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {WORKOUT_TYPES.map((t) => (
            <button
              key={t}
              className="tag"
              type="button"
              onClick={() => setDraft((d) => ({ ...d, type: t }))}
              style={{
                cursor: "pointer",
                border: `1px solid ${draft.type === t ? "transparent" : "var(--color-line-strong)"}`,
                background: draft.type === t ? "var(--color-accent)" : "transparent",
                color: draft.type === t ? "var(--color-accent-ink)" : "var(--color-muted)",
              }}
            >
              {t}
            </button>
          ))}
          {draft.type !== "rest" && (
            <input
              className="field"
              inputMode="decimal"
              value={draft.km}
              onChange={(e) => setDraft((d) => ({ ...d, km: e.target.value }))}
              placeholder="km"
              style={{ width: "84px" }}
            />
          )}
          <button className="btn btn-primary" type="button" onClick={() => save(w)} disabled={pending} style={{ padding: "6px 13px", fontSize: "12px" }}>
            {pending ? COACH_COPY.saving : COACH_COPY.save}
          </button>
        </div>

        <p style={{ margin: 0, fontSize: "11px", color: "var(--color-faint)", lineHeight: 1.6 }}>
          {COACH_COPY.editNote}
        </p>
      </div>
    );
  };

  return (
    <div data-entrance-root style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance />
      <CoachNav active="athletes" />

      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <Avatar src={athlete.avatarUrl ?? null} name={athlete.name} size={44} zoomable />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>{athlete.name}</h1>
          <p className="num" style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>
            {[email, level, age ? `${age}` : null].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "end" }}>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>
            {athlete.raceType ? RACE_LABEL[athlete.raceType] : raceLabel(null)}
          </p>
          <p className="num" style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>
            {athlete.raceDate ? `${athlete.raceDate} · ${untilLabel(athlete.raceDate, today)}` : "—"}
            {targetTime ? ` · target ${targetTime}` : ""}
          </p>
        </div>
      </div>

      <section className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: "12px" }}>
        {metric(COACH_COPY.hReadiness, athlete.readiness === null ? "—" : String(athlete.readiness), readinessColor(athlete.readiness), NB_ICON.ready, readinessColor(athlete.readiness))}
        {metric(COACH_COPY.hForm, athlete.form === null ? "—" : athlete.form.toFixed(0), formColor(athlete.form), NB_ICON.form, NUMBERS_HUE.tsb)}
        {metric(COACH_COPY.hLoad, athlete.loadRatio === null ? "—" : athlete.loadRatio.toFixed(2), loadColor(athlete.loadRatio), NB_ICON.ratio, NUMBERS_HUE.acwr)}
        {metricUnit(COACH_COPY.hLastRun, sinceParts(athlete.lastRunAt, today), NB_ICON.pace, NUMBERS_HUE.pace)}
      </section>

      {flags.length > 0 && (
        <section className="card" style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {flags.map((f, i) => (
            <div key={`${f.kind}-${i}`} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "12px", padding: "5px 0" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: toneColor(f.tone), display: "inline-block" }} />
              <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{f.text}</span>
              <span className="num" style={{ fontSize: "10px", letterSpacing: ".05em", textTransform: "uppercase", color: toneColor(f.tone) }}>
                {KIND_LABEL[f.kind]}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* placed last on the page, below; see the roster footer */}
      {trend.length > 1 && hasTrend && (
        <section className="card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{COACH_COPY.trendTitle}</h2>
            <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{COACH_COPY.trendSub}</span>
          </div>
          <svg viewBox="0 0 600 116" style={{ width: "100%", height: "auto", marginBlockStart: "10px" }} role="img" aria-label="Fitness and fatigue over six weeks">
            {gridlines.map((g) => (
              <g key={g.label + g.y}>
                <line x1="34" x2="592" y1={g.y} y2={g.y} stroke="var(--color-line)" strokeWidth="1" />
                <text x="28" y={g.y + 3} fill="var(--color-faint)" fontSize="8.5" fontFamily="var(--font-mono)" textAnchor="end">
                  {g.label}
                </text>
              </g>
            ))}
            <text x="28" y="10" fill="var(--color-faint)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="end">
              {COACH_COPY.trendUnit}
            </text>
            <path d={path((t) => t.ctl)} fill="none" stroke="var(--color-accent)" strokeWidth="1.8" />
            <path d={path((t) => t.atl)} fill="none" stroke="var(--color-caution)" strokeWidth="1.4" strokeDasharray="3 3" />
            <text x="34" y="110" fill="var(--color-faint)" fontSize="8.5" fontFamily="var(--font-mono)">
              {shortDate(trend[0].date)}
            </text>
            <text x="592" y="110" fill="var(--color-faint)" fontSize="8.5" fontFamily="var(--font-mono)" textAnchor="end">
              {shortDate(trend[trend.length - 1].date)}
            </text>
          </svg>
          <div style={{ display: "flex", gap: "16px", marginBlockStart: "6px" }}>
            <span className="num" style={{ fontSize: "10px", color: "var(--color-accent)" }}>— Fitness</span>
            <span className="num" style={{ fontSize: "10px", color: "var(--color-caution)" }}>-- Fatigue</span>
          </div>
        </section>
      )}

      <section className="card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{COACH_COPY.planTitle}</h2>
          <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{COACH_COPY.planSub}</span>
        </div>
        {note && (
          <p className="num" style={{ margin: "8px 0 0", fontSize: "11px", color: note === "Saved." ? "var(--color-positive)" : "var(--color-negative)" }}>
            {note}
          </p>
        )}
        {workouts.length === 0 || !week ? (
          <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-faint)" }}>{COACH_COPY.planEmpty}</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBlockStart: "12px" }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => stepWeek(-1)}
                disabled={shownWeek <= 0}
                style={{ padding: "4px 10px", fontSize: "12px" }}
                aria-label="Previous week"
              >
                ‹
              </button>
              <span className="num" style={{ fontSize: "11.5px", color: "var(--color-muted)", textAlign: "center" }}>
                {weekLabel(week.start)}
                <span style={{ color: "var(--color-faint)" }}> · {shownWeek + 1}/{weeks.length}</span>
              </span>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => stepWeek(1)}
                disabled={shownWeek >= weeks.length - 1}
                style={{ padding: "4px 10px", fontSize: "12px" }}
                aria-label="Next week"
              >
                ›
              </button>
            </div>

            <div className="week-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px", marginBlockStart: "10px" }}>
              {weekDates(week.start).map((iso, i) => daySquare(week.days[i], iso, i))}
            </div>

            {editorPanel()}
          </>
        )}
      </section>

      <section className="card" style={{ padding: "16px 20px" }}>
        <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{COACH_COPY.runsTitle}</h2>
        {recentRuns.length === 0 ? (
          <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-faint)" }}>{COACH_COPY.runsEmpty}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginBlockStart: "8px" }}>
            {recentRuns.map((r) => (
              <a
                key={r.id}
                className="dc-hover-bg"
                href={`/activities/${r.id}?coach=1`}
                style={{ display: "grid", gridTemplateColumns: "96px 1fr auto auto auto", alignItems: "center", gap: "12px", padding: "7px 0", borderBlockEnd: "1px solid var(--color-line)" }}
              >
                <span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>
                  {r.startedAt ? r.startedAt.slice(0, 10) : "—"}
                </span>
                <span className="num" style={{ fontSize: "12.5px", fontWeight: 500 }}>{km(r.distanceM)}</span>
                <span className="num" style={{ fontSize: "12px", color: "var(--color-muted)" }}>{formatDuration(r.durationS)}</span>
                <span className="num" style={{ fontSize: "12px", color: "var(--color-ink)", minWidth: "62px", textAlign: "end" }}>
                  {pace(r.distanceM, r.durationS)}
                </span>
                <span className="num" style={{ fontSize: "11.5px", color: "var(--color-faint)", minWidth: "54px", textAlign: "end" }}>
                  {r.avgHr ? `${r.avgHr} bpm` : "—"}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "220px" }}>
          <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{COACH_COPY.removeTitle}</h2>
          <p style={{ margin: "3px 0 0", fontSize: "11.5px", color: "var(--color-muted)", lineHeight: 1.6 }}>
            {COACH_COPY.removeBody}
          </p>
        </div>
        {confirmRemove ? (
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setConfirmRemove(false)}
              style={{ padding: "6px 12px", fontSize: "12px" }}
            >
              {COACH_COPY.removeCancel}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={remove}
              disabled={pending}
              style={{ padding: "6px 12px", fontSize: "12px", color: "var(--color-negative)", borderColor: "var(--color-negative)" }}
            >
              {pending ? COACH_COPY.removing : COACH_COPY.removeConfirm}
            </button>
          </div>
        ) : (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setConfirmRemove(true)}
            style={{ padding: "6px 12px", fontSize: "12px" }}
          >
            {COACH_COPY.remove}
          </button>
        )}
        {removeError ? (
          <p style={{ margin: 0, width: "100%", fontSize: "11.5px", color: "var(--color-negative)" }}>{removeError}</p>
        ) : null}
      </section>
    </div>
  );
}

/**
 * A session that has already happened: planned against actual, read only.
 *
 * No fields and no Save — `updateWorkout` refuses a past date, and offering an
 * editor that the server will reject is worse than not offering one. What a
 * coach wants from a past day is the comparison: what was asked for, what was
 * run, and the gap between them.
 */
function PastPanel({ w }: { w: AthleteWorkout }) {
  const plannedKm = w.plannedDistanceM ? w.plannedDistanceM / 1000 : null;
  const actualKm = w.actualM ? w.actualM / 1000 : null;
  // Pace only where both numbers exist. A distance with no duration, or a
  // duration with no distance, is not a pace.
  const actualPace =
    w.actualM && w.actualS && w.actualM > 0 ? paceLabel(w.actualS / (w.actualM / 1000)) : null;
  const deltaKm = plannedKm !== null && actualKm !== null ? actualKm - plannedKm : null;
  const ran = actualKm !== null && actualKm > 0;

  return (
    <div
      style={{
        marginBlockStart: "12px",
        borderBlockStart: "1px solid var(--color-line)",
        paddingBlockStart: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "12.5px", fontWeight: 600 }}>
          {new Date(`${w.date}T00:00:00`).toLocaleDateString(APP_LOCALE, {
            weekday: "long", day: "numeric", month: "long", timeZone: APP_TIME_ZONE,
          })}
        </h3>
        <StatusChip tone={ran ? "good" : "bad"}>
          {ran ? COACH_COPY.pastRan : COACH_COPY.pastMissed}
        </StatusChip>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "82px 1fr", rowGap: "6px", columnGap: "14px", alignItems: "baseline" }}>
        <PastLabel>{COACH_COPY.pastPlanned}</PastLabel>
        <span className="num" style={{ fontSize: "12.5px", color: "var(--color-muted)" }}>
          {plannedKm === null ? "\u2014" : `${plannedKm.toFixed(1)} km`}
          {w.plannedPace ? ` \u00b7 ${w.plannedPace}` : ""}
        </span>

        <PastLabel>{COACH_COPY.pastActual}</PastLabel>
        <span className="num" style={{ fontSize: "12.5px", color: ran ? "var(--color-ink)" : "var(--color-faint)" }}>
          {actualKm === null ? COACH_COPY.pastNothing : `${actualKm.toFixed(1)} km`}
          {actualPace ? ` \u00b7 ${actualPace}` : ""}
          {w.actualHr ? ` \u00b7 ${w.actualHr} bpm` : ""}
        </span>

        {deltaKm !== null ? (
          <>
            <PastLabel>{COACH_COPY.pastGap}</PastLabel>
            <span
              className="num"
              style={{
                fontSize: "12.5px",
                // Within half a kilometre of the plan is the plan.
                color: Math.abs(deltaKm) < 0.5 ? "var(--color-positive)" : "var(--color-caution)",
              }}
            >
              {deltaKm > 0 ? "+" : ""}{deltaKm.toFixed(1)} km
            </span>
          </>
        ) : null}
      </div>

      <p style={{ margin: 0, fontSize: "11px", color: "var(--color-faint)", lineHeight: 1.55 }}>
        {PAST_HINT}
      </p>
    </div>
  );
}

function PastLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: "9.5px", fontWeight: 600, letterSpacing: ".09em",
      textTransform: "uppercase", color: "var(--color-faint)",
    }}>
      {children}
    </span>
  );
}

/** seconds per km as "5:12" */
function paceLabel(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return sec === 60 ? `${m + 1}:00` : `${m}:${String(sec).padStart(2, "0")}`;
}

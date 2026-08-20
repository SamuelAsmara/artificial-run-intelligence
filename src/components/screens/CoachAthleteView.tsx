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
import { formatDuration } from "@/lib/format/pace";
import { RACE_LABEL } from "@/lib/coach/templates";
import { Avatar } from "@/components/ui/Avatar";
import {
  addDays, APP_LOCALE, APP_TIME_ZONE, isoDate, weekDates, WEEKDAYS, weekStart,
} from "@/lib/time/week";
import {
  COACH_COPY, formColor, KIND_LABEL, loadColor,
  raceLabel, readinessColor, sinceLabel, toneColor, untilLabel,
} from "@/lib/screens/coachHome";

const WORKOUT_TYPES = ["easy", "long", "interval", "rest"] as const;
type WorkoutTypeName = (typeof WORKOUT_TYPES)[number];

const km = (m: number | null) => (m === null ? "—" : `${(m / 1000).toFixed(1)} km`);

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
   * Fitness and fatigue over six weeks. Two lines, no axis furniture: the shape
   * is the message and the numbers are already in the metric row above.
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
  const px = (i: number) => 8 + (i / Math.max(1, trend.length - 1)) * 584;
  const py = (v: number) => 8 + (1 - (v - lo) / span) * 84;
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

  const metric = (label: string, value: string, color: string) => (
    <div key={label}>
      <p className="num" style={{ margin: 0, fontSize: "20px", fontWeight: 500, color }}>{value}</p>
      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{label}</p>
    </div>
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
        disabled={!w}
        onClick={() => (w ? (selected ? setEditing(null) : open(w)) : undefined)}
        style={{
          textAlign: "start",
          fontFamily: "inherit",
          cursor: w ? "pointer" : "default",
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
    <div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}>
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

      <section className="card stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px,1fr))", gap: "16px", padding: "16px 22px" }}>
        {metric(COACH_COPY.hReadiness, athlete.readiness === null ? "—" : String(athlete.readiness), readinessColor(athlete.readiness))}
        {metric(COACH_COPY.hForm, athlete.form === null ? "—" : athlete.form.toFixed(0), formColor(athlete.form))}
        {metric(COACH_COPY.hLoad, athlete.loadRatio === null ? "—" : athlete.loadRatio.toFixed(2), loadColor(athlete.loadRatio))}
        {metric(COACH_COPY.hLastRun, sinceLabel(athlete.lastRunAt, today), "var(--color-ink)")}
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
          <svg viewBox="0 0 600 100" style={{ width: "100%", height: "auto", marginBlockStart: "10px" }}>
            <path d={path((t) => t.ctl)} fill="none" stroke="var(--color-accent)" strokeWidth="1.8" />
            <path d={path((t) => t.atl)} fill="none" stroke="var(--color-caution)" strokeWidth="1.4" strokeDasharray="3 3" />
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
                style={{ display: "grid", gridTemplateColumns: "96px 1fr auto auto", alignItems: "center", gap: "12px", padding: "7px 0", borderBlockEnd: "1px solid var(--color-line)" }}
              >
                <span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>
                  {r.startedAt ? r.startedAt.slice(0, 10) : "—"}
                </span>
                <span className="num" style={{ fontSize: "12.5px", fontWeight: 500 }}>{km(r.distanceM)}</span>
                <span className="num" style={{ fontSize: "12px", color: "var(--color-muted)" }}>{formatDuration(r.durationS)}</span>
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

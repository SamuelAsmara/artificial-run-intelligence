"use client";

/**
 * One athlete, as their coach needs them.
 *
 * Three questions in order: how are they, what is coming, and what did they
 * actually do. The plan section is editable in place — a coach who has to leave
 * the page to change Thursday will not change Thursday.
 */

import { useState, useTransition } from "react";
import { CoachNav } from "@/components/coach/CoachNav";
import { updateWorkout, type AthleteDetail, type AthleteWorkout } from "@/actions/coach";
import { formatDuration } from "@/lib/format/pace";
import { RACE_LABEL } from "@/lib/coach/templates";
import {
  COACH_COPY, formColor, initials, KIND_LABEL, loadColor,
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
  const values = trend.flatMap((t) => [t.ctl, t.atl]).filter((v): v is number => v !== null);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const span = hi - lo || 1;
  const px = (i: number) => 8 + (i / Math.max(1, trend.length - 1)) * 584;
  const py = (v: number) => 8 + (1 - (v - lo) / span) * 84;
  const path = (pick: (t: (typeof trend)[number]) => number | null) => {
    let d = "";
    let started = false;
    trend.forEach((t, i) => {
      const v = pick(t);
      if (v === null) return;
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

  const past = workouts.filter((w) => w.date < today);
  const ahead = workouts.filter((w) => w.date >= today);

  const workoutRow = (w: AthleteWorkout) => {
    const isEditing = editing === w.id;
    const ran = w.actualM !== null && w.actualM > 0;
    const missed = w.date < today && w.workoutType !== "rest" && !ran;

    return (
      <div
        key={w.id}
        style={{
          padding: "9px 12px",
          borderRadius: "var(--radius-control)",
          borderInlineStart: `2px solid ${missed ? "var(--color-negative)" : ran ? "var(--color-positive)" : "transparent"}`,
          background: isEditing ? "var(--color-elevated)" : "transparent",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "78px 1fr auto auto", alignItems: "center", gap: "12px" }}>
          <span className="num" style={{ fontSize: "11px", color: w.date === today ? "var(--color-accent)" : "var(--color-faint)" }}>
            {w.date.slice(5)}
          </span>
          <span style={{ fontSize: "12.5px", color: "var(--color-ink)" }}>
            {w.workoutType === "rest"
              ? "Rest"
              : `${w.workoutType[0].toUpperCase()}${w.workoutType.slice(1)}${w.plannedDistanceM ? ` ${(w.plannedDistanceM / 1000).toFixed(0)} km` : ""}`}
          </span>
          <span className="num" style={{ fontSize: "11.5px", color: ran ? "var(--color-positive)" : missed ? "var(--color-negative)" : "var(--color-faint)" }}>
            {ran ? `ran ${km(w.actualM)}` : missed ? "missed" : ""}
          </span>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => (isEditing ? setEditing(null) : open(w))}
            style={{ padding: "4px 10px", fontSize: "11px" }}
          >
            {isEditing ? COACH_COPY.cancel : COACH_COPY.change}
          </button>
        </div>

        {isEditing && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBlockStart: "10px" }}>
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
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <CoachNav active="athletes" />

      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <span className="num" style={{ width: "44px", height: "44px", flex: "none", borderRadius: "50%", background: "var(--color-elevated)", color: "var(--color-muted)", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {initials(athlete.name)}
        </span>
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

      {trend.length > 1 && (
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
        {workouts.length === 0 ? (
          <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-faint)" }}>{COACH_COPY.planEmpty}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBlockStart: "10px" }}>
            {ahead.map(workoutRow)}
            {past.length > 0 && (
              <>
                <p className="num" style={{ margin: "12px 0 4px", fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>
                  {COACH_COPY.planPast}
                </p>
                {past.map(workoutRow)}
              </>
            )}
          </div>
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
    </div>
  );
}

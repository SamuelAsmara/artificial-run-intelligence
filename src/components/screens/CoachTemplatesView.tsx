"use client";

/**
 * A coach's four templates — one per distance.
 *
 * The validation runs in the browser as the coach types, using exactly the
 * function the server uses on save. Not for speed: so the error appears next to
 * the field that caused it. "The phases add up to 15 weeks but the plan is 14"
 * is useful while you are looking at the phases and useless a page later.
 */

import { useMemo, useState, useTransition } from "react";
import { Entrance } from "@/components/ui";
import { CoachNav } from "@/components/coach/CoachNav";
import { saveCoachTemplate } from "@/actions/coach";
import { cyclesUsingTemplate, rebuildCyclePlans } from "@/actions/cycles";
import {
  MAX_WEEKS, MIN_WEEKS, PHASES, RACE_LABEL, SESSIONS,
  defaultTemplate, runningDays, validateTemplate, type CoachTemplate,
} from "@/lib/coach/templates";
import { templateWeeks, type TemplateAthlete } from "@/lib/coach/templateWeeks";
import { COACH_COPY } from "@/lib/screens/coachHome";
import Link from "next/link";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function CoachTemplatesView({
  templates, athletes = [], today,
}: {
  templates: CoachTemplate[];
  /** the roster, so each week can say who is standing in it */
  athletes?: TemplateAthlete[];
  /** ISO date; defaults to the server's day when the caller does not pass one */
  today?: string;
}) {
  const day = today ?? new Date().toISOString().slice(0, 10);
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  /*
   * Which templates are open for editing. All closed by default: four full
   * editors stacked open made the page a wall of counters, and a coach
   * touches one distance at a time. More than one can be open at once —
   * comparing two structures side by side is a real thing coaches do.
   */
  const [openTypes, setOpenTypes] = useState<Set<string>>(new Set());
  const toggleType = (rt: string) =>
    setOpenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(rt)) next.delete(rt); else next.add(rt);
      return next;
    });
  const [drafts, setDrafts] = useState<CoachTemplate[]>(templates);
  const [note, setNote] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  /*
   * A saved template reaches the next plan to be built — and, if the coach
   * wants, the plans already running in the cycles built from it. After a
   * save the cycles using this template are listed with one button each;
   * nothing is rebuilt without that click.
   */
  const [usage, setUsage] = useState<Record<string, { id: string; name: string; members: number }[]>>({});
  const rebuild = (raceType: string, cycleId: string) => {
    startTransition(async () => {
      const r = await rebuildCyclePlans(cycleId);
      setNote((n) => ({ ...n, [raceType]: r.ok ? `${r.data.rebuilt} plan${r.data.rebuilt === 1 ? "" : "s"} rebuilt from this week.${r.data.notes.length ? " " + r.data.notes.join(" ") : ""}` : r.error }));
      setUsage((u) => ({ ...u, [raceType]: (u[raceType] ?? []).filter((c) => c.id !== cycleId) }));
    });
  };

  const patch = (raceType: string, next: Partial<CoachTemplate>) => {
    setDrafts((ds) => ds.map((d) => (d.raceType === raceType ? { ...d, ...next } : d)));
    setNote((n) => ({ ...n, [raceType]: "" }));
  };

  const errors = useMemo(
    () => Object.fromEntries(drafts.map((d) => [d.raceType, validateTemplate(d)])),
    [drafts],
  );

  const save = (t: CoachTemplate) => {
    const invalid = validateTemplate(t);
    if (invalid) {
      setNote((n) => ({ ...n, [t.raceType]: invalid }));
      return;
    }
    startTransition(async () => {
      const result = await saveCoachTemplate(t);
      setNote((n) => ({ ...n, [t.raceType]: result.ok ? COACH_COPY.templateSaved : result.error }));
      if (result.ok) {
        setDrafts((ds) => ds.map((d) => (d.raceType === t.raceType ? { ...d, isDefault: false } : d)));
        const cycles = result.data.id ? await cyclesUsingTemplate(result.data.id) : [];
        setUsage((u) => ({ ...u, [t.raceType]: cycles.filter((c) => c.members > 0) }));
      }
    });
  };

  const counter = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    max = 30,
  ) => (
    <label key={label} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>
        {label}
      </span>
      <input
        className="field"
        type="number"
        min={0}
        max={max}
        value={String(value)}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Math.round(Number(e.target.value) || 0))))}
        style={{ width: "68px", textAlign: "center" }}
      />
    </label>
  );

  return (
    <div data-entrance-root style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance />
      <CoachNav active="templates" />

      <div>
        <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>{COACH_COPY.templatesTitle}</h1>
        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-muted)", maxWidth: "78ch", textWrap: "pretty" }}>
          {COACH_COPY.templatesSub}
        </p>
      </div>

      {drafts.map((t) => {
        const error = errors[t.raceType];
        const message = note[t.raceType];
        const phaseTotal = Object.values(t.phaseStructure).reduce((a, b) => a + b, 0);
        const mixTotal = Object.values(t.weeklyMix).reduce((a, b) => a + b, 0);

        const on = openTypes.has(t.raceType);
        return (
          <section
            key={t.raceType}
            className="card"
            style={{ padding: 0, overflow: "hidden", borderColor: on ? "var(--color-line-strong)" : undefined }}
          >
            <button
              type="button"
              onClick={() => toggleType(t.raceType)}
              aria-expanded={on}
              className="dc-hover-bg"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                padding: "14px 22px",
                background: on ? "var(--color-elevated)" : "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                color: "var(--color-ink)",
                textAlign: "start",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{RACE_LABEL[t.raceType]}</h2>
                <span
                  className="tag"
                  style={{
                    background: t.isDefault ? "var(--color-elevated)" : "var(--color-accent-soft)",
                    color: t.isDefault ? "var(--color-faint)" : "var(--color-accent)",
                  }}
                >
                  {t.isDefault ? COACH_COPY.usingDefault : COACH_COPY.yourOwn}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>
                  {t.weeks} weeks · {runningDays(t.weeklyMix)} {COACH_COPY.tRunningDays}
                </span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: on ? "rotate(180deg)" : "none", transition: "transform .15s" }}
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </button>

            {on ? (
            <div style={{ borderBlockStart: "1px solid var(--color-line)", padding: "16px 22px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>

            {/*
                The template as a shape, and who is standing in it.
                A template has no dates — week 1 to week N — and every athlete
                on this distance is somewhere inside it, having started on a
                different day. Without this the coach was editing a form with
                no way to see who the edit reached.
            */}
            <WeekStrip
              raceType={t.raceType}
              weeks={t.weeks}
              athletes={athletes}
              today={day}
              openWeek={openWeek}
              setOpenWeek={setOpenWeek}
            />

            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 220px" }}>
                <span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>
                  {COACH_COPY.tName}
                </span>
                <input
                  className="field"
                  value={t.name}
                  onChange={(e) => patch(t.raceType, { name: e.target.value })}
                  maxLength={60}
                />
              </label>
              {counter(COACH_COPY.tWeeks, t.weeks, (v) => patch(t.raceType, { weeks: v }), MAX_WEEKS)}
            </div>

            <div>
              <p className="num" style={{ margin: "0 0 6px", fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>
                {COACH_COPY.tPhases} — {phaseTotal}/{t.weeks} weeks
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {PHASES.map((ph) =>
                  counter(cap(ph), t.phaseStructure[ph] ?? 0, (v) =>
                    patch(t.raceType, { phaseStructure: { ...t.phaseStructure, [ph]: v } }),
                    MAX_WEEKS,
                  ),
                )}
              </div>
            </div>

            <div>
              <p className="num" style={{ margin: "0 0 6px", fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>
                {COACH_COPY.tMix} — {mixTotal}/7 days
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {SESSIONS.map((se) =>
                  counter(cap(se), t.weeklyMix[se] ?? 0, (v) =>
                    patch(t.raceType, { weeklyMix: { ...t.weeklyMix, [se]: v } }),
                    7,
                  ),
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => save(t)}
                disabled={pending || error !== null}
              >
                {pending ? COACH_COPY.saving : COACH_COPY.save}
              </button>
              {/* a template is a structure; a cycle is the structure applied to people on a date */}
              <Link className="btn btn-secondary" href={`/coach/cycles?new=1&race=${t.raceType}`} style={{ textDecoration: "none" }}>
                Start a cycle from this template →
              </Link>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  const d = defaultTemplate(t.raceType);
                  patch(t.raceType, { name: d.name, weeks: d.weeks, phaseStructure: d.phaseStructure, weeklyMix: d.weeklyMix });
                }}
              >
                {COACH_COPY.resetDefault}
              </button>
              <span
                className="num"
                style={{ fontSize: "11.5px", color: error ? "var(--color-negative)" : message === COACH_COPY.templateSaved ? "var(--color-positive)" : "var(--color-negative)" }}
              >
                {error ?? message ?? ""}
              </span>
            </div>
            {(usage[t.raceType] ?? []).length > 0 ? (
              <div className="card" style={{ marginBlockStart: "12px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", borderColor: "var(--color-accent-soft)", background: "var(--color-accent-soft)" }}>
                <span style={{ fontSize: "12px" }}>Cycles built from this template — rebuild their plans from this week?</span>
                {(usage[t.raceType] ?? []).map((c) => (
                  <button key={c.id} className="btn btn-secondary" type="button" onClick={() => rebuild(t.raceType, c.id)} disabled={pending} style={{ fontSize: "12px" }}>
                    {c.name} · {c.members}
                  </button>
                ))}
                <button className="btn btn-secondary" type="button" onClick={() => setUsage((u) => ({ ...u, [t.raceType]: [] }))} disabled={pending} style={{ fontSize: "12px" }}>Leave them</button>
              </div>
            ) : null}
            </div>
            ) : null}
          </section>
        );
      })}

      {/*
        This is now true.

        For a while it was not: the screen wrote to `plan_templates` and nothing
        read it back, so a coach could tune a structure, see "Saved", and change
        nothing about anybody's training. `generatePlan` takes the template as
        of the audit — proportions rather than week counts, so a 14-week
        structure given to somebody racing in nine becomes nine weeks that keep
        its shape.
      */}
      <p className="num" style={{ margin: 0, fontSize: "10.5px", color: "var(--color-faint)", maxWidth: "70ch", lineHeight: 1.6 }}>
        Editing a template does not touch plans already running — they keep the structure they
        were built with and your edit reaches the next athlete to start. If a cycle uses this
        template, saving offers to rebuild its members’ plans from this week on; weeks already
        run stay as they were.
      </p>
      <p className="num" style={{ margin: 0, fontSize: "10.5px", color: "var(--color-faint)", maxWidth: "70ch", lineHeight: 1.6 }}>
        The phase lengths are read as proportions, not as a fixed schedule — a 14-week structure
        given to an athlete racing in nine weeks becomes nine weeks with the same shape.
      </p>
      <p className="num" style={{ margin: 0, fontSize: "10.5px", color: "var(--color-faint)" }}>
        Between {MIN_WEEKS} and {MAX_WEEKS} weeks. Phases must total the plan length; the week must
        total seven days and include a rest day and a long run.
      </p>
    </div>
  );
}

/**
 * Week 1 … week N, with a head count on each.
 *
 * Weeks nobody can still reach are drawn faint and say so: an athlete already
 * past week 5 has run week 5, and a coach who edits it should not leave
 * believing they have changed that person's training.
 */
function WeekStrip({
  raceType, weeks, athletes, today, openWeek, setOpenWeek,
}: {
  raceType: string;
  weeks: number;
  athletes: TemplateAthlete[];
  today: string;
  openWeek: string | null;
  setOpenWeek: (v: string | null) => void;
}) {
  const strip = useMemo(
    () => templateWeeks(athletes, raceType, weeks, today),
    [athletes, raceType, weeks, today],
  );

  const inGroup = strip.reduce((s, w) => s + w.athletes.length, 0);
  const openId = openWeek?.startsWith(`${raceType}:`) ? openWeek : null;
  const shown = openId ? strip[Number(openId.split(":")[1]) - 1] : null;

  return (
    <div>
      <p className="num" style={{ margin: "0 0 7px", fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>
        {COACH_COPY.tStrip} — {inGroup} {inGroup === 1 ? COACH_COPY.tAthlete : COACH_COPY.tAthletes}
      </p>

      <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
        {strip.map((w) => {
          const id = `${raceType}:${w.number}`;
          const open = openId === id;
          const has = w.athletes.length > 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setOpenWeek(open ? null : id)}
              aria-expanded={open}
              title={w.editable ? undefined : COACH_COPY.tPastWeek}
              style={{
                flex: "1 1 42px", minWidth: "42px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
                padding: "6px 2px", cursor: "pointer", fontFamily: "inherit",
                border: "none", borderRadius: "var(--radius-control)",
                background: open ? "var(--color-accent-soft)" : "var(--color-elevated)",
                boxShadow: open ? "inset 0 0 0 1px var(--color-accent)" : "inset 0 0 0 1px var(--color-line)",
                // A week nobody can still reach is history, and reads as history.
                opacity: w.editable ? 1 : 0.45,
              }}
            >
              <span className="num" style={{ fontSize: "9px", color: open ? "var(--color-accent)" : "var(--color-faint)" }}>
                {w.number}
              </span>
              <span
                className="num"
                style={{
                  fontSize: "11.5px", fontWeight: 500,
                  color: has ? "var(--color-ink)" : "var(--color-faint)",
                }}
              >
                {has ? w.athletes.length : "\u2014"}
              </span>
            </button>
          );
        })}
      </div>

      {shown ? (
        <div style={{
          marginBlockStart: "8px", padding: "9px 12px",
          borderRadius: "var(--radius-control)", background: "var(--color-elevated)",
        }}>
          <p className="num" style={{ margin: 0, fontSize: "10px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-faint)" }}>
            {COACH_COPY.tWeekN} {shown.number}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--color-ink)", lineHeight: 1.6 }}>
            {shown.athletes.length === 0
              ? COACH_COPY.tWeekEmpty
              : shown.athletes.map((a) => a.name).join(" \u00b7 ")}
          </p>
          {!shown.editable ? (
            <p style={{ margin: "6px 0 0", fontSize: "11.5px", color: "var(--color-caution)", lineHeight: 1.55 }}>
              {COACH_COPY.tPastWeek}
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
          The "an edit reaches only the weeks still ahead" note used to sit here,
          which meant a coach read the same sentence four times on one screen —
          once per distance. It is said once now, at the foot of the page, where
          it belongs to the screen rather than to any one template.
      */}
    </div>
  );
}

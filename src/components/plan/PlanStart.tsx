"use client";

/**
 * /plan with no plan: the three ways to get one.
 *
 *   1. With a coach — enter their code; the plan arrives when they put you in
 *      a cycle. If you already have a coach, this says so and what to expect.
 *   2. Runi's plan — pick the race, see the plan before it exists (length,
 *      phases, one week with paces, the peak it climbs to, all sized to you),
 *      then apply it.
 *   3. Your own — describe one week, say how many, Runi lays it on the
 *      calendar. No race needed; a block of steady running is a plan too.
 *
 * One path open at a time; the open one closes on a second click. Nothing
 * here needs a run on file: with no runs the Runi path asks for two numbers
 * instead of refusing, and paces come from the target time until the watch
 * arrives.
 */

import type * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinCoach } from "@/actions/coach";
import { previewRuniPlan, startRuniPlan, type RuniPlanPreview } from "@/actions/ownPlan";
import { createOwnPlan } from "@/actions/ownPlan";
import type { PlanStart as PlanStartInfo } from "@/actions/plan";
import { OWN_PLAN_LIMITS, rampFactor, type OwnPlanDay } from "@/lib/planning/ownPlan";
import { PLAN_EMPTY } from "@/lib/screens/plan";
import { FilterChip } from "@/components/ui";
import type { RaceType, WorkoutType } from "@/types/database.types";

type Path = "coach" | "runi" | "own";

const PATHS: { key: Path; title: string; body: string; icon: string }[] = [
  { key: "coach", title: "With a coach", body: "Enter your coach’s code. Your plan comes from the cycle they put you in.", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
  { key: "runi", title: "Runi’s plan", body: "Pick a race. See the whole plan — sized to you, with your paces — before you apply it.", icon: "M12 2a10 10 0 1 0 10 10M12 6v6l4 2M22 2l-5 5M17 2h5v5" },
  { key: "own", title: "Your own plan", body: "Describe one week, say how many. No race needed — a block of steady running is a plan too.", icon: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPE_LABEL: Record<WorkoutType, string> = { easy: "Easy", interval: "Intervals", long: "Long", rest: "Rest" };
const TYPES: WorkoutType[] = ["easy", "interval", "long", "rest"];
const PHASE_LABEL: Record<string, string> = { base: "Base", build: "Build", peak: "Peak", taper: "Taper" };

const isoIn = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

export function PlanStart({ info }: { info: PlanStartInfo }) {
  const [open, setOpen] = useState<Path | null>(info.coach ? "coach" : null);
  const pick = (p: Path) => setOpen((o) => (o === p ? null : p));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div className="card" style={{ padding: "22px 26px 6px", textAlign: "center" }}>
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>No plan yet — three ways to get one</h2>
        <p style={{ margin: "8px auto 0", fontSize: "12.5px", color: "var(--color-muted)", maxWidth: "58ch", lineHeight: 1.65 }}>
          Your runs, records and readiness work either way — a plan is what turns them into next week. Pick the one that fits.
        </p>
        <div className="ps-paths">
          {PATHS.map((p) => {
            const on = open === p.key;
            return (
              <button key={p.key} type="button" className={`card ps-path${on ? " is-open" : ""}`} onClick={() => pick(p.key)} aria-expanded={on} aria-controls={`ps-${p.key}`}>
                <span className="ps-path-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={p.icon} /></svg>
                </span>
                <span style={{ fontSize: "13.5px", fontWeight: 600 }}>{p.title}</span>
                <span style={{ fontSize: "11.5px", color: "var(--color-muted)", lineHeight: 1.55 }}>{p.body}</span>
                {p.key === "coach" && info.coach ? <span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)", marginBlockStart: "4px" }}>Coached by {info.coach.name}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {open === "coach" ? <div id="ps-coach" className="ps-panel"><CoachPath info={info} /></div> : null}
      {open === "runi" ? <div id="ps-runi" className="ps-panel"><RuniPath runsOnFile={info.runsOnFile} /></div> : null}
      {open === "own" ? <div id="ps-own" className="ps-panel"><OwnPath /></div> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 1. coach                                                            */
/* ------------------------------------------------------------------ */

function CoachPath({ info }: { info: PlanStartInfo }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const join = () => {
    const trimmed = code.trim();
    if (!trimmed) return setError("Paste the code your coach gave you.");
    setError("");
    startTransition(async () => {
      const result = await joinCoach(trimmed);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  };

  if (info.coach) {
    return (
      <section className="card" style={{ padding: "20px 24px" }}>
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>You are coached by {info.coach.name}</h3>
        <p style={{ margin: "8px 0 0", fontSize: "12.5px", color: "var(--color-muted)", lineHeight: 1.65, maxWidth: "60ch" }}>
          {info.coach.cycleName
            ? <>You are in <strong style={{ color: "var(--color-ink)", fontWeight: 600 }}>{info.coach.cycleName}</strong>. Your plan appears here the moment your coach starts it for you.</>
            : <>Your coach has not put you in a cycle yet. When they do, the plan appears here — built from their template, starting on your week one. Until then you can still build your own below.</>}
        </p>
      </section>
    );
  }

  return (
    <section className="card" style={{ padding: "20px 24px" }}>
      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>Join your coach</h3>
      <p style={{ margin: "6px 0 0", fontSize: "12.5px", color: "var(--color-muted)", lineHeight: 1.6 }}>They give you a short code. Once you are linked they see how you train, put you in a cycle, and your plan arrives here.</p>
      <div style={{ display: "flex", gap: "8px", marginBlockStart: "14px", maxWidth: "420px" }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="coach code" style={INPUT} aria-label="Coach code" onKeyDown={(e) => { if (e.key === "Enter") join(); }} />
        <button className="btn btn-primary" type="button" onClick={join} disabled={pending} style={{ whiteSpace: "nowrap" }}>{pending ? "Joining…" : "Join"}</button>
      </div>
      {error ? <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-negative)" }}>{error}</p> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Runi's plan, previewed                                           */
/* ------------------------------------------------------------------ */

function RuniPath({ runsOnFile }: { runsOnFile: number }) {
  const router = useRouter();
  const [raceType, setRaceType] = useState<RaceType>("10k");
  const [raceDate, setRaceDate] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [weeklyKm, setWeeklyKm] = useState("");
  const [longestKm, setLongestKm] = useState("");
  const [preview, setPreview] = useState<RuniPlanPreview | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const input = () => ({
    raceType, raceDate, targetTime: targetTime.trim() || undefined,
    currentWeeklyKm: runsOnFile === 0 && weeklyKm ? Number(weeklyKm) : undefined,
    longestRecentKm: runsOnFile === 0 && longestKm ? Number(longestKm) : undefined,
  });

  const show = () => {
    setError(""); setPreview(null);
    if (!raceDate) return setError(PLAN_EMPTY.raceDateMissing);
    if (runsOnFile === 0 && (!weeklyKm || !longestKm)) return setError("Tell Runi roughly how far you run in a week, and your longest recent run.");
    startTransition(async () => {
      const r = await previewRuniPlan(input());
      if (r.error) setError(r.error); else setPreview(r.data!);
    });
  };
  const apply = () => {
    setError("");
    startTransition(async () => {
      const r = await startRuniPlan(input());
      if (r.error) setError(r.error); else router.refresh();
    });
  };

  return (
    <section className="card" style={{ padding: "20px 24px" }}>
      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{PLAN_EMPTY.raceHeading}</h3>
      <p style={{ margin: "6px 0 0", fontSize: "12.5px", color: "var(--color-muted)", lineHeight: 1.6, maxWidth: "62ch" }}>{PLAN_EMPTY.raceBody}</p>

      <div className="ps-form">
        <Field label={PLAN_EMPTY.raceDistance}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {PLAN_EMPTY.raceTypes.map((r) => (
              <FilterChip key={r.id} active={raceType === r.id} onClick={() => { setRaceType(r.id as RaceType); setPreview(null); }}>
                {r.label}<span className="num" style={{ marginInlineStart: "6px", fontSize: "10.5px", opacity: 0.7 }}>{r.km}</span>
              </FilterChip>
            ))}
          </div>
        </Field>
        <div className="ps-grid">
          <Field label={PLAN_EMPTY.raceDate}><input type="date" value={raceDate} min={isoIn(28)} onChange={(e) => { setRaceDate(e.target.value); setPreview(null); }} style={INPUT} /></Field>
          <Field label={PLAN_EMPTY.raceTarget} hint={runsOnFile === 0 ? "sets your paces until your runs arrive" : PLAN_EMPTY.raceTargetHint}>
            <input type="text" inputMode="numeric" value={targetTime} onChange={(e) => { setTargetTime(e.target.value); setPreview(null); }} placeholder={PLAN_EMPTY.raceTargetPlaceholder} style={INPUT} />
          </Field>
        </div>
        {runsOnFile === 0 ? (
          <div className="ps-grid">
            <Field label="Your week now" hint="km, roughly"><input type="number" inputMode="decimal" min={0} value={weeklyKm} onChange={(e) => { setWeeklyKm(e.target.value); setPreview(null); }} placeholder="25" style={INPUT} /></Field>
            <Field label="Longest recent run" hint="km"><input type="number" inputMode="decimal" min={0} value={longestKm} onChange={(e) => { setLongestKm(e.target.value); setPreview(null); }} placeholder="10" style={INPUT} /></Field>
          </div>
        ) : (
          <p className="num" style={{ margin: "12px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>Sized from your last four weeks of running ({runsOnFile} runs on file).</p>
        )}
        {!preview ? (
          <button className="btn btn-primary" type="button" onClick={show} disabled={pending} style={{ marginBlockStart: "16px" }}>{pending ? "Laying it out…" : "Show me the plan"}</button>
        ) : null}
      </div>

      {preview ? <Preview p={preview} raceType={raceType} onApply={apply} onBack={() => setPreview(null)} pending={pending} /> : null}
      {error ? <p style={{ margin: "12px 0 0", fontSize: "12px", color: "var(--color-negative)", lineHeight: 1.6 }}>{error}</p> : null}
    </section>
  );
}

function Preview({ p, raceType, onApply, onBack, pending }: { p: RuniPlanPreview; raceType: RaceType; onApply: () => void; onBack: () => void; pending: boolean }) {
  const label = PLAN_EMPTY.raceTypes.find((r) => r.id === raceType)?.label ?? raceType;
  const total = p.phases.reduce((s, x) => s + x.weeks, 0);
  return (
    <div style={{ marginBlockStart: "18px", paddingBlockStart: "16px", borderBlockStart: "1px solid var(--color-line)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <h4 style={{ margin: 0, fontSize: "13.5px", fontWeight: 600 }}>{label} · {p.totalWeeks} weeks</h4>
        <span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>sized from {p.sizedFrom} · paces from {p.pacesFrom}</span>
      </div>

      {/* the arc: four phases, widths in weeks */}
      <div className="ps-phases" aria-label="Phases">
        {p.phases.map((ph) => (
          <div key={ph.phase} className={`ps-phase ps-phase-${ph.phase}`} style={{ flex: ph.weeks / total }}>
            <span className="ps-phase-name">{PHASE_LABEL[ph.phase]}</span>
            <span className="num ps-phase-weeks">{ph.weeks} wk</span>
          </div>
        ))}
      </div>

      <p className="num" style={{ margin: "14px 0 6px", fontSize: "9.5px", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-faint)", fontWeight: 600 }}>A week in the build phase</p>
      <div className="ps-week">
        {p.week.map((d) => (
          <div key={d.day} className={`ps-day ps-day-${d.type}`}>
            <span className="num ps-day-name">{d.day}</span>
            <span className="ps-day-type">{TYPE_LABEL[d.type]}</span>
            {d.km != null ? <span className="num ps-day-km">{d.km} km</span> : <span className="num ps-day-km" style={{ opacity: 0.5 }}>—</span>}
            {d.pace ? <span className="num ps-day-pace">{d.pace}/km</span> : null}
          </div>
        ))}
      </div>

      <div className="ps-peaks num">
        <span>peak week <strong>{p.peakWeekKm} km</strong></span>
        <span>longest run <strong>{p.peakLongRunKm} km</strong></span>
        <span style={{ color: p.achievable ? "var(--color-positive)" : "var(--color-caution)" }}>{p.achievable ? "reachable in the time you have" : "tight for the time you have"}</span>
      </div>
      {p.notes.length ? (
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
          {p.notes.map((n) => <li key={n} style={{ fontSize: "12px", color: "var(--color-caution)", lineHeight: 1.55 }}>{n}</li>)}
        </ul>
      ) : null}

      <div style={{ display: "flex", gap: "10px", marginBlockStart: "16px", flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="button" onClick={onApply} disabled={pending}>{pending ? "Building…" : "Apply this plan"}</button>
        <button className="btn btn-secondary" type="button" onClick={onBack} disabled={pending}>Change the race</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. your own                                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_PATTERN: OwnPlanDay[] = [
  { type: "easy", km: 6, pace: "" },
  { type: "rest", km: null, pace: "" },
  { type: "interval", km: 8, pace: "" },
  { type: "easy", km: 6, pace: "" },
  { type: "rest", km: null, pace: "" },
  { type: "long", km: 14, pace: "" },
  { type: "rest", km: null, pace: "" },
];

function OwnPath() {
  const router = useRouter();
  const [name, setName] = useState("My plan");
  const [startDate, setStartDate] = useState(isoIn(0));
  const [weeks, setWeeks] = useState("8");
  const [ramp, setRamp] = useState(true);
  const [pattern, setPattern] = useState<OwnPlanDay[]>(DEFAULT_PATTERN);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const set = (i: number, patch: Partial<OwnPlanDay>) => setPattern((p) => p.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const weekKm = pattern.reduce((s, d) => s + (d.type === "rest" ? 0 : d.km ?? 0), 0);
  const n = Math.max(1, Math.min(OWN_PLAN_LIMITS.maxWeeks, Number(weeks) || 1));
  const bars = Array.from({ length: n }, (_, i) => Math.round(weekKm * rampFactor(i + 1, ramp) * 10) / 10);
  const maxBar = Math.max(1, ...bars);

  const save = () => {
    setError("");
    startTransition(async () => {
      const r = await createOwnPlan({ name, startDate, weeks: n, ramp, pattern: pattern.map((d) => ({ ...d, km: d.type === "rest" ? null : d.km, pace: d.pace || null })) });
      if (r.error) setError(r.error); else router.refresh();
    });
  };

  return (
    <section className="card" style={{ padding: "20px 24px" }}>
      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>Write your own week</h3>
      <p style={{ margin: "6px 0 0", fontSize: "12.5px", color: "var(--color-muted)", lineHeight: 1.6, maxWidth: "62ch" }}>
        Set each day, how far, and — if you want — at what pace. Runi repeats the week for as long as you say and, if you let it, grows it the way the generated plans do: seven percent a week, a step back every fourth.
      </p>

      <div className="ps-grid ps-grid-3" style={{ marginBlockStart: "4px" }}>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} style={INPUT} /></Field>
        <Field label="Starts"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={INPUT} /></Field>
        <Field label="Weeks" hint={`${OWN_PLAN_LIMITS.minWeeks}–${OWN_PLAN_LIMITS.maxWeeks}`}><input type="number" min={OWN_PLAN_LIMITS.minWeeks} max={OWN_PLAN_LIMITS.maxWeeks} value={weeks} onChange={(e) => setWeeks(e.target.value)} style={INPUT} /></Field>
      </div>

      <div className="ps-week ps-week-edit" style={{ marginBlockStart: "16px" }}>
        {pattern.map((d, i) => (
          <div key={DAYS[i]} className={`ps-day ps-day-${d.type}`}>
            <span className="num ps-day-name">{DAYS[i]}</span>
            <select value={d.type} onChange={(e) => set(i, { type: e.target.value as WorkoutType, km: e.target.value === "rest" ? null : d.km ?? 6 })} style={SELECT} aria-label={`${DAYS[i]} session`}>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            {d.type !== "rest" ? (
              <>
                <input type="number" inputMode="decimal" min={OWN_PLAN_LIMITS.minKm} max={OWN_PLAN_LIMITS.maxKm} step={0.5} value={d.km ?? ""} onChange={(e) => set(i, { km: e.target.value === "" ? null : Number(e.target.value) })} style={SMALL} aria-label={`${DAYS[i]} kilometres`} placeholder="km" />
                <input type="text" inputMode="numeric" value={d.pace ?? ""} onChange={(e) => set(i, { pace: e.target.value })} style={SMALL} aria-label={`${DAYS[i]} pace`} placeholder="5:30" />
              </>
            ) : <span className="num ps-day-km" style={{ opacity: 0.5 }}>—</span>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBlockStart: "14px" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--color-muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={ramp} onChange={(e) => setRamp(e.target.checked)} />
          Grow the week gently (+7% a week, every 4th week −25%)
        </label>
        <span className="num" style={{ fontSize: "11.5px", color: "var(--color-muted)" }}>week 1 · <strong style={{ color: "var(--color-ink)", fontWeight: 500 }}>{Math.round(weekKm * 10) / 10} km</strong>{ramp ? <> · peak <strong style={{ color: "var(--color-ink)", fontWeight: 500 }}>{Math.max(...bars)} km</strong></> : null}</span>
      </div>

      {/* kilometres per week, so the ramp is a picture rather than a promise */}
      <div className="ps-bars" aria-label="Kilometres per week">
        {bars.map((b, i) => (
          <div key={i} className="ps-bar" title={`Week ${i + 1} · ${b} km`}>
            <div className="ps-bar-fill" style={{ height: `${Math.max(6, (b / maxBar) * 100)}%`, opacity: (i + 1) % 4 === 0 && ramp ? 0.55 : 1 }} />
            <span className="num ps-bar-n">{i + 1}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBlockStart: "16px", flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : `Start ${n} week${n === 1 ? "" : "s"}`}</button>
        {error ? <span style={{ fontSize: "12px", color: "var(--color-negative)" }}>{error}</span> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const INPUT: React.CSSProperties = {
  width: "100%", height: "38px", padding: "0 11px", borderRadius: "var(--radius-control)",
  border: "1px solid var(--color-line-strong)", background: "var(--color-elevated)", color: "var(--color-ink)",
  fontFamily: "var(--font-mono)", fontSize: "13px", boxSizing: "border-box",
};
const SELECT: React.CSSProperties = { ...INPUT, height: "32px", padding: "0 6px", fontFamily: "inherit", fontSize: "12px" };
const SMALL: React.CSSProperties = { ...INPUT, height: "32px", padding: "0 8px", fontSize: "12px" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBlockStart: "14px", minWidth: 0 }}>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: "6px", fontSize: "10px", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-faint)" }}>
        {label}
        {hint ? <span style={{ letterSpacing: 0, textTransform: "none", fontWeight: 400, opacity: 0.8 }}>{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

"use client";

/**
 * Preparation cycles — the coach's real unit of work.
 *
 * Squares at the top, one per cycle. Choosing one (or several) filters the list
 * below. Choosing none shows everybody, because a filter panel that hides the
 * roster when nothing is ticked is one people stop trusting.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CoachNav } from "@/components/coach/CoachNav";
import type { CoachWorkspace } from "@/actions/coach";
import { assignToCycle, createCycle, removeFromCycle, type CoachCycle, type TemplateOption } from "@/actions/cycles";
import type { RaceType } from "@/types/database.types";
import { buildCycles, cyclesSummary } from "@/lib/coach/programs";
import { colorFor } from "@/lib/coach/calendar";
import { RACE_LABEL } from "@/lib/coach/templates";
import { Entrance, EmptyState, FilterChip } from "@/components/ui";

/** two figures — a cycle is a group of athletes, not a document */
const GROUP_ICON = "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M16 20h6a5 5 0 0 0-4-4.9";
import {
  COACH_COPY, formColor, initials, loadColor, readinessColor, sinceLabel, untilLabel,
} from "@/lib/screens/coachHome";

export function CoachCyclesView({ data, today, cycles: managed = [], templates = [] }: {
  data: CoachWorkspace; today: string;
  /** the cycles the coach has created, with their members */
  cycles?: CoachCycle[];
  /** one template option per distance, for the new-cycle form */
  templates?: TemplateOption[];
}) {
  const { athletes, flags, preferences } = data;
  const flaggedIds = useMemo(() => new Set(flags.map((f) => f.athleteId)), [flags]);
  /*
   * Athletes already in a managed cycle leave the derived grouping: what is
   * left are suggestions — people whose goal race says they are preparing
   * together but whom the coach has not put in a cycle yet.
   */
  const inCycle = useMemo(() => new Set(managed.flatMap((c) => c.members.map((m) => m.athleteId))), [managed]);
  const { cycles, withoutRace } = useMemo(
    () => buildCycles(athletes.filter((a) => !inCycle.has(a.id)), today, flaggedIds),
    [athletes, today, flaggedIds, inCycle],
  );
  const router = useRouter();

  /*
   * One filter, by distance. Several cycles can share a race type now (two
   * marathon groups on different dates), so "show me everything marathon" is
   * a question again. Nothing selected shows everything; the derived groups
   * and the athletes without a race follow the same filter.
   */
  const [raceFilter, setRaceFilter] = useState<RaceType | null>(null);
  const shownManaged = raceFilter ? managed.filter((c) => c.raceType === raceFilter) : managed;
  const shownDerived = raceFilter ? cycles.filter((c) => c.raceType === raceFilter) : cycles;
  const distancesInUse = useMemo(() => {
    const set = new Set<RaceType>();
    managed.forEach((c) => set.add(c.raceType));
    cycles.forEach((c) => set.add(c.raceType));
    return (["5k", "10k", "half", "full"] as RaceType[]).filter((rt) => set.has(rt));
  }, [managed, cycles]);

  // ?new=1&race=half — arriving from a template's "Start a cycle" button
  const [creating, setCreating] = useState<{ raceType: RaceType; raceDate?: string } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("new") === "1") setCreating({ raceType: (q.get("race") as RaceType) || "half" });
  }, []);

  /*
   * Cycles open one at a time, and start closed.
   *
   * Every cycle used to render its full athlete list. A coach with five race
   * groups and twenty athletes got twenty rows down the page before they could
   * see what the second group even was, which defeats the point of grouping
   * them. The header row carries what a coach scans for — the race, how many
   * athletes, how long until race day — and the roster is one click away.
   *
   * The nearest race opens by default, because that is the group with the
   * least time left to change anything.
   */
  const [openIds, setOpenIds] = useState<string[] | null>(null);
  const isOpen = (id: string, index: number) =>
    openIds === null ? index === 0 : openIds.includes(id);
  const toggleOpen = (id: string, index: number) =>
    setOpenIds((prev) => {
      const base = prev ?? (cycles[0] ? [cycles[0].id] : []);
      void index;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  const showOrphans = withoutRace.length > 0;

  return (
    <div data-entrance-root style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance />
      <CoachNav active="cycles" />

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>{COACH_COPY.cyclesTitle}</h1>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>{COACH_COPY.cyclesSub}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="num hide-m" style={{ fontSize: "11px", color: "var(--color-faint)" }}>
            {managed.length} {managed.length === 1 ? "cycle" : "cycles"} · {cyclesSummary(cycles, withoutRace.length).replace(/ · \d+ cycles?/, "")} not yet in one
          </span>
          <button className="btn btn-primary" type="button" onClick={() => setCreating((c) => (c ? null : { raceType: "half" }))} aria-expanded={!!creating}>
            {creating ? "Close" : "New cycle"}
          </button>
        </div>
      </div>

      {creating ? (
        <NewCycleForm
          initialRace={creating.raceType}
          initialDate={creating.raceDate ?? ""}
          templates={templates}
          onDone={() => { setCreating(null); router.refresh(); }}
        />
      ) : null}

      {distancesInUse.length > 1 ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }} role="group" aria-label="Filter cycles by distance">
          <FilterChip active={raceFilter === null} onClick={() => setRaceFilter(null)}>All</FilterChip>
          {distancesInUse.map((rt) => (
            <FilterChip key={rt} active={raceFilter === rt} onClick={() => setRaceFilter((f) => (f === rt ? null : rt))}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", background: colorFor(rt, preferences.raceColors), marginInlineEnd: "6px", verticalAlign: "middle" }} />
              {RACE_LABEL[rt]}
              <span className="num" style={{ marginInlineStart: "6px", fontSize: "10px", opacity: 0.7 }}>
                {managed.filter((c) => c.raceType === rt).length + cycles.filter((c) => c.raceType === rt).length}
              </span>
            </FilterChip>
          ))}
        </div>
      ) : null}

      {shownManaged.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {shownManaged.map((c) => (
            <ManagedCycle key={c.id} cycle={c} today={today} color={colorFor(c.raceType, preferences.raceColors)}
              candidates={athletes.filter((a) => !c.members.some((m) => m.athleteId === a.id))} />
          ))}
        </div>
      ) : null}

      {(shownDerived.length > 0 || (withoutRace.length > 0 && !raceFilter)) && managed.length > 0 ? (
        <p className="num" style={{ margin: "8px 0 0", fontSize: "9.5px", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-faint)", fontWeight: 600 }}>
          Not in a cycle yet — grouped by their goal race
        </p>
      ) : null}

      {/*
        The athletes with no goal race are the actionable half of this screen,
        and they used to be rendered *inside* the `cycles.length > 0` branch. A
        coach with five athletes, none of whom had picked a race, saw "No cycles
        yet" and never the five people who needed one — precisely the case the
        screen exists to surface.
      */}
      {cycles.length === 0 && withoutRace.length === 0 && managed.length === 0 && !creating ? (
        <EmptyState
          icon={GROUP_ICON}
          message={COACH_COPY.cycleEmpty}
          style={{ maxWidth: "620px", marginInline: "auto", width: "100%" }}
        />
      ) : shownDerived.length === 0 && (withoutRace.length === 0 || raceFilter) ? null : shownDerived.length === 0 ? (
        <section className="card" style={{ padding: "16px 20px", borderColor: "var(--color-caution)" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 600 }}>{COACH_COPY.noRaceGroup}</h2>
          <p style={{ margin: "0 0 10px", fontSize: "11.5px", color: "var(--color-muted)" }}>
            No plan can be generated until they pick a distance and a date.
          </p>
          <AthleteRows athletes={withoutRace} today={today} flaggedIds={flaggedIds} />
        </section>
      ) : (
        <>
          {/*
              One cycle per row, the full width of the page, and the roster
              opens inside the row you clicked.

              This has now been rebuilt twice, which earns an explanation. The
              first version was a grid of selector cards *and* a separate stack
              of open sections. The second collapsed those into a row of tiles —
              but a row of tiles wraps, and a coach with four cycles saw three
              tiles and then one alone on a second line, with the open roster
              appearing somewhere below all of them. Asymmetric, and the
              connection between the tile you pressed and the list that opened
              was spatial guesswork.

              A stacked accordion has neither problem: every cycle is the same
              width whatever their number, and the roster opens attached to the
              row that owns it — the same vocabulary as the plan screen's rows.
          */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {shownDerived.map((c, ci) => {
              const on = isOpen(c.id, ci);
              const color = colorFor(c.raceType, preferences.raceColors);
              return (
                <section
                  key={c.id}
                  className="card"
                  style={{
                    padding: 0,
                    overflow: "hidden",
                    borderInlineStart: `3px solid ${color}`,
                    borderColor: on ? "var(--color-line-strong)" : undefined,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleOpen(c.id, ci)}
                    aria-expanded={on}
                    className="dc-hover-bg cycrow"
                    style={{
                      width: "100%",
                      display: "grid",
                      gridTemplateColumns: "minmax(150px,auto) auto minmax(0,1fr) auto auto",
                      alignItems: "center",
                      gap: "16px",
                      padding: "13px 18px",
                      background: on ? "var(--color-elevated)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "var(--color-ink)",
                      textAlign: "start",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: color, flex: "none" }} />
                      <span style={{ fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.label}
                      </span>
                    </span>
                    <span className="num" style={{ fontSize: "12px", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
                      {c.athletes.length} {c.athletes.length === 1 ? "athlete" : "athletes"}
                    </span>
                    <span
                      className="num hide-m"
                      style={{
                        fontSize: "10.5px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: c.needAttention > 0 ? "var(--color-caution)" : "var(--color-faint)",
                      }}
                    >
                      {c.needAttention > 0
                        ? `${c.needAttention} ${c.needAttention === 1 ? COACH_COPY.flagOne : COACH_COPY.flagMany}`
                        : c.meanReadiness === null
                          ? COACH_COPY.noScores
                          : `${COACH_COPY.meanReadiness} ${c.meanReadiness}`}
                    </span>
                    <span className="num" style={{ fontSize: "11px", whiteSpace: "nowrap", color: c.daysAway < 0 ? "var(--color-faint)" : "var(--color-accent)" }}>
                      {untilLabel(c.raceDate, today)}
                    </span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-faint)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ transform: on ? "rotate(180deg)" : "none", transition: "transform .15s" }}
                      aria-hidden
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {on ? (
                    <div style={{ borderBlockStart: "1px solid var(--color-line)", padding: "12px 18px 16px" }}>
                      <AthleteRows athletes={c.athletes} today={today} flaggedIds={flaggedIds} />
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBlockStart: "10px", flexWrap: "wrap" }}>
                        <button className="btn btn-secondary" type="button" onClick={() => { setCreating({ raceType: c.raceType, raceDate: c.raceDate }); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ fontSize: "12px" }}>
                          Make this a cycle
                        </button>
                        <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>
                          Same race, same day — give it a name and a template, then add them to it.
                        </span>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          {showOrphans && !raceFilter && (
            <section className="card" style={{ padding: "16px 20px", borderColor: "var(--color-caution)" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 600 }}>{COACH_COPY.noRaceGroup}</h2>
              <p style={{ margin: "0 0 10px", fontSize: "11.5px", color: "var(--color-muted)" }}>
                No plan can be generated until they pick a distance and a date.
              </p>
              <AthleteRows athletes={withoutRace} today={today} flaggedIds={flaggedIds} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function AthleteRows({
  athletes,
  today,
  flaggedIds,
}: {
  athletes: CoachWorkspace["athletes"];
  today: string;
  flaggedIds: ReadonlySet<string>;
}) {
  const COLS = "minmax(150px,1.4fr) .7fr .7fr .9fr .9fr";
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/*
          A header row.
          Without it the coach reads "93 · 14 · 0.88 · Yesterday" and has to
          remember which column is which — and the whole point of this screen
          is scanning it quickly.
      */}
      <div
        className="num"
        style={{
          display: "grid", gridTemplateColumns: COLS, gap: "10px",
          padding: "0 6px 7px", borderBlockEnd: "1px solid var(--color-line)",
          marginBlockEnd: "2px",
          fontSize: "9px", letterSpacing: ".09em", textTransform: "uppercase",
          color: "var(--color-faint)",
        }}
      >
        <span>{COACH_COPY.colAthlete}</span>
        <span style={{ textAlign: "end" }}>{COACH_COPY.colReadiness}</span>
        <span style={{ textAlign: "end" }}>{COACH_COPY.colForm}</span>
        <span style={{ textAlign: "end" }}>{COACH_COPY.colLoad}</span>
        <span style={{ textAlign: "end" }}>{COACH_COPY.colLastRun}</span>
      </div>
      {athletes.map((a) => (
        <a
          key={a.id}
          className="dc-hover-bg"
          href={`/coach/athletes/${a.id}`}
          style={{ display: "grid", gridTemplateColumns: COLS, gap: "10px", alignItems: "center", padding: "8px 10px", borderRadius: "var(--radius-control)" }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}>
            <span className="num" style={{ width: "26px", height: "26px", flex: "none", borderRadius: "50%", background: "var(--color-elevated)", color: "var(--color-muted)", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {initials(a.name)}
            </span>
            <span style={{ fontSize: "12.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.name}
            </span>
            {flaggedIds.has(a.id) && (
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-negative)", flex: "none" }} />
            )}
          </span>
          <span className="num" style={{ fontSize: "12.5px", textAlign: "end", color: readinessColor(a.readiness) }}>
            {a.readiness ?? "—"}
          </span>
          <span className="num" style={{ fontSize: "12.5px", textAlign: "end", color: formColor(a.form) }}>
            {a.form === null ? "—" : a.form.toFixed(0)}
          </span>
          <span className="num" style={{ fontSize: "12.5px", textAlign: "end", color: loadColor(a.loadRatio) }}>
            {a.loadRatio === null ? "—" : a.loadRatio.toFixed(2)}
          </span>
          <span className="num" style={{ fontSize: "11px", textAlign: "end", color: "var(--color-muted)" }}>
            {sinceLabel(a.lastRunAt, today)}
          </span>
        </a>
      ))}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* a managed cycle                                                     */
/* ------------------------------------------------------------------ */

function ManagedCycle({ cycle, today, color, candidates }: {
  cycle: CoachCycle; today: string; color: string; candidates: CoachWorkspace["athletes"];
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const add = () => {
    if (!adding) return;
    setNote(null);
    startTransition(async () => {
      const r = await assignToCycle(cycle.id, adding);
      if (r.ok) { setNote(r.data.note); setAdding(""); router.refresh(); }
      else setNote(r.error);
    });
  };
  const remove = (athleteId: string) => {
    setNote(null);
    startTransition(async () => {
      const r = await removeFromCycle(athleteId);
      if (r.ok) router.refresh(); else setNote(r.error);
    });
  };

  const daysAway = Math.round((Date.parse(cycle.raceDate) - Date.parse(today)) / 86_400_000);
  return (
    <section className="card" style={{ padding: 0, overflow: "hidden", borderInlineStart: `3px solid ${color}`, borderColor: open ? "var(--color-line-strong)" : undefined }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="dc-hover-bg cycrow"
        style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(150px,auto) auto minmax(0,1fr) auto auto", alignItems: "center", gap: "16px", padding: "13px 18px", background: open ? "var(--color-elevated)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--color-ink)", textAlign: "start" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: color, flex: "none" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cycle.name}</span>
        </span>
        <span className="num" style={{ fontSize: "12px", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
          {cycle.members.length} {cycle.members.length === 1 ? "athlete" : "athletes"}
        </span>
        <span className="num hide-m" style={{ fontSize: "10.5px", color: "var(--color-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {RACE_LABEL[cycle.raceType]} · {cycle.raceDate}{cycle.templateName ? ` · ${cycle.templateName}` : ""}
        </span>
        <span className="num" style={{ fontSize: "11px", whiteSpace: "nowrap", color: daysAway < 0 ? "var(--color-faint)" : "var(--color-accent)" }}>{untilLabel(cycle.raceDate, today)}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open ? (
        <div style={{ borderBlockStart: "1px solid var(--color-line)", padding: "12px 18px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {cycle.members.length === 0 ? (
            <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)" }}>Nobody in this cycle yet. Add the first athlete below — their plan is built from the template the moment they join.</p>
          ) : (
            <div className="cy-members">
              {cycle.members.map((m) => (
                <div key={m.athleteId} className="cy-member">
                  <a href={`/coach/athletes/${m.athleteId}`} style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0, color: "inherit", textDecoration: "none" }}>
                    <span className="num" style={{ width: "26px", height: "26px", flex: "none", borderRadius: "50%", background: "var(--color-elevated)", color: "var(--color-muted)", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(m.name)}</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                  </a>
                  {/* the week they are on — the reason two people in one cycle are not the same */}
                  {m.week != null && m.weeks != null ? (
                    <span className="cy-week num" title={m.planFromCycle ? "Plan built from this cycle" : "A plan they already had"}>
                      <span className="cy-week-bar" aria-hidden><span style={{ width: `${Math.round((m.week / m.weeks) * 100)}%` }} /></span>
                      week {m.week} of {m.weeks}
                    </span>
                  ) : (
                    <span className="num" style={{ fontSize: "10.5px", color: "var(--color-caution)" }}>no plan yet</span>
                  )}
                  <button type="button" className="cy-remove" onClick={() => remove(m.athleteId)} disabled={pending} aria-label={`Remove ${m.name} from ${cycle.name}`} title="Remove from cycle">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingBlockStart: "6px", borderBlockStart: "1px solid var(--color-line)" }}>
            <select value={adding} onChange={(e) => setAdding(e.target.value)} className="cy-select" aria-label={`Add an athlete to ${cycle.name}`} disabled={candidates.length === 0}>
              <option value="">{candidates.length ? "Add an athlete…" : "Everyone is in this cycle"}</option>
              {candidates.map((a) => <option key={a.id} value={a.id}>{a.name}{a.raceType ? ` · ${RACE_LABEL[a.raceType]}` : ""}</option>)}
            </select>
            <button className="btn btn-secondary" type="button" onClick={add} disabled={!adding || pending} style={{ fontSize: "12px" }}>{pending ? "Adding…" : "Add"}</button>
            {note ? <span className="num" style={{ fontSize: "11px", color: "var(--color-muted)" }}>{note}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* the new-cycle form                                                  */
/* ------------------------------------------------------------------ */

function NewCycleForm({ initialRace, initialDate = "", templates, onDone }: { initialRace: RaceType; initialDate?: string; templates: TemplateOption[]; onDone: () => void }) {
  const [raceType, setRaceType] = useState<RaceType>(initialRace);
  const [name, setName] = useState("");
  const [raceDate, setRaceDate] = useState(initialDate);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const template = templates.find((t) => t.raceType === raceType) ?? null;

  const submit = () => {
    setError("");
    if (!raceDate) return setError("Pick the race day.");
    startTransition(async () => {
      const r = await createCycle({ name: name.trim() || `${RACE_LABEL[raceType]} prep · ${raceDate}`, raceType, raceDate, templateId: template?.id ?? null });
      if (r.ok) onDone(); else setError(r.error);
    });
  };

  return (
    <section className="card" style={{ padding: "18px 22px", boxShadow: "inset 0 0 0 1px var(--color-accent-soft)" }}>
      <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>New cycle</h2>
      <p style={{ margin: "4px 0 12px", fontSize: "12px", color: "var(--color-muted)", maxWidth: "64ch", lineHeight: 1.6 }}>
        A race day and the template it is built from. Everyone you add gets a plan from that template, starting on the week they join — so the cycle shares a race, not a week number.
      </p>
      <div className="cy-form">
        <label className="cy-field"><span>Distance</span>
          <select value={raceType} onChange={(e) => setRaceType(e.target.value as RaceType)} className="cy-select">
            {(["5k", "10k", "half", "full"] as RaceType[]).map((rt) => <option key={rt} value={rt}>{RACE_LABEL[rt]}</option>)}
          </select>
        </label>
        <label className="cy-field"><span>Race day</span><input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} className="cy-input" /></label>
        <label className="cy-field cy-field-wide"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${RACE_LABEL[raceType]} prep · Tel Aviv`} className="cy-input" /></label>
        <div className="cy-field"><span>Template</span>
          <span className="cy-input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{template ? `${template.name} · ${template.weeks} wk` : "—"}</span>
            <a href="/coach/templates" className="num" style={{ fontSize: "10.5px", color: "var(--color-accent)", whiteSpace: "nowrap" }}>{template?.own ? "edit" : "write yours"}</a>
          </span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBlockStart: "14px", flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="button" onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create cycle"}</button>
        <button className="btn btn-secondary" type="button" onClick={onDone} disabled={pending}>Cancel</button>
        {error ? <span className="num" style={{ fontSize: "11.5px", color: "var(--color-negative)" }}>{error}</span> : null}
      </div>
    </section>
  );
}

"use client";

/**
 * Preparation cycles — the coach's real unit of work.
 *
 * Squares at the top, one per cycle. Choosing one (or several) filters the list
 * below. Choosing none shows everybody, because a filter panel that hides the
 * roster when nothing is ticked is one people stop trusting.
 */

import { useMemo, useState } from "react";
import { CoachNav } from "@/components/coach/CoachNav";
import type { CoachWorkspace } from "@/actions/coach";
import { buildCycles, cyclesSummary } from "@/lib/coach/programs";
import { colorFor } from "@/lib/coach/calendar";
import { RACE_LABEL } from "@/lib/coach/templates";
import {
  COACH_COPY, formColor, initials, loadColor, readinessColor, sinceLabel, untilLabel,
} from "@/lib/screens/coachHome";

export function CoachCyclesView({ data, today }: { data: CoachWorkspace; today: string }) {
  const { athletes, flags, preferences } = data;
  const flaggedIds = useMemo(() => new Set(flags.map((f) => f.athleteId)), [flags]);
  const { cycles, withoutRace } = useMemo(
    () => buildCycles(athletes, today, flaggedIds),
    [athletes, today, flaggedIds],
  );

  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const shown = useMemo(() => {
    if (selected.length === 0) return cycles;
    return cycles.filter((c) => selected.includes(c.id));
  }, [cycles, selected]);

  const showOrphans = selected.length === 0 && withoutRace.length > 0;

  return (
    <div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <CoachNav active="cycles" />

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>{COACH_COPY.cyclesTitle}</h1>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>{COACH_COPY.cyclesSub}</p>
        </div>
        <span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>
          {cyclesSummary(cycles, withoutRace.length)}
        </span>
      </div>

      {cycles.length === 0 ? (
        <section className="card" style={{ padding: "34px 26px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--color-muted)" }}>{COACH_COPY.cycleEmpty}</p>
        </section>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "10px" }}>
            {cycles.map((c) => {
              const on = selected.includes(c.id);
              const color = colorFor(c.raceType, preferences.raceColors);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="card dc-hover-border"
                  style={{
                    cursor: "pointer",
                    textAlign: "start",
                    fontFamily: "inherit",
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    borderColor: on ? color : "var(--color-line)",
                    background: on ? "var(--color-elevated)" : "var(--color-surface)",
                    borderInlineStart: `3px solid ${color}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-ink)" }}>
                      {RACE_LABEL[c.raceType]}
                    </span>
                    <span className="num" style={{ fontSize: "10.5px", color: c.daysAway < 0 ? "var(--color-faint)" : "var(--color-accent)" }}>
                      {untilLabel(c.raceDate, today)}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    <span className="num" style={{ fontSize: "22px", fontWeight: 500, color: "var(--color-ink)" }}>
                      {c.athletes.length}
                    </span>
                    <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>
                      {c.athletes.length === 1 ? "athlete" : "athletes"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <span className="num" style={{ fontSize: "10.5px", color: "var(--color-muted)" }}>
                      {c.meanReadiness === null ? "no scores yet" : `mean readiness ${c.meanReadiness}`}
                    </span>
                    {c.needAttention > 0 && (
                      <span className="num" style={{ fontSize: "10.5px", color: "var(--color-negative)" }}>
                        {c.needAttention} flagged
                      </span>
                    )}
                  </div>

                  <span className="num" style={{ fontSize: "9.5px", color: "var(--color-faint)" }}>
                    {c.daysAway < 0 ? "already run" : `${Math.max(0, c.weeksAway)} weeks out`}
                  </span>
                </button>
              );
            })}
          </div>

          {selected.length > 0 && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setSelected([])}
              style={{ alignSelf: "flex-start", padding: "5px 12px", fontSize: "11.5px" }}
            >
              {COACH_COPY.clearAll}
            </button>
          )}

          {shown.map((c) => (
            <section key={c.id} className="card" style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBlockEnd: "10px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: colorFor(c.raceType, preferences.raceColors) }} />
                <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{c.label}</h2>
                <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>
                  {c.athletes.length} · {untilLabel(c.raceDate, today)}
                </span>
              </div>
              <AthleteRows athletes={c.athletes} today={today} flaggedIds={flaggedIds} />
            </section>
          ))}

          {showOrphans && (
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
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {athletes.map((a) => (
        <a
          key={a.id}
          className="dc-hover-bg"
          href={`/coach/athletes/${a.id}`}
          style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.4fr) .7fr .7fr .9fr .9fr", gap: "10px", alignItems: "center", padding: "8px 10px", borderRadius: "var(--radius-control)" }}
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

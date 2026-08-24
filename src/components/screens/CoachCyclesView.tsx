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
import { EmptyState } from "@/components/ui";

/** two figures — a cycle is a group of athletes, not a document */
const GROUP_ICON = "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M16 20h6a5 5 0 0 0-4-4.9";
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

      {/*
        The athletes with no goal race are the actionable half of this screen,
        and they used to be rendered *inside* the `cycles.length > 0` branch. A
        coach with five athletes, none of whom had picked a race, saw "No cycles
        yet" and never the five people who needed one — precisely the case the
        screen exists to surface.
      */}
      {cycles.length === 0 && withoutRace.length === 0 ? (
        <EmptyState
          icon={GROUP_ICON}
          message={COACH_COPY.cycleEmpty}
          style={{ maxWidth: "620px", marginInline: "auto", width: "100%" }}
        />
      ) : cycles.length === 0 ? (
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
              One row of tiles, and the roster opens beneath it.

              There used to be two mechanisms here doing the same job: a grid of
              selector cards that wrapped to three-then-one and looked broken,
              and a separate stack of collapsible sections. Now the tiles *are*
              the accordion — one row, click a tile, that cycle's athletes open
              below it.
          */}
          <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBlockEnd: "2px" }}>
            {cycles.map((c, ci) => {
              const on = isOpen(c.id, ci);
              const color = colorFor(c.raceType, preferences.raceColors);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleOpen(c.id, ci)}
                  aria-pressed={on}
                  className="dc-hover-border"
                  style={{
                    cursor: "pointer",
                    textAlign: "start",
                    fontFamily: "inherit",
                    flex: "1 1 0",
                    minWidth: "168px",
                    padding: "11px 13px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                    border: "none",
                    borderRadius: "var(--radius-card)",
                    borderInlineStart: `3px solid ${color}`,
                    background: on ? "var(--color-elevated)" : "var(--color-surface)",
                    // Inset, so opening a cycle does not shift the row.
                    boxShadow: on
                      ? `inset 0 0 0 1px ${color}`
                      : "inset 0 0 0 1px var(--color-line)",
                    transition: "background .15s, box-shadow .15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--color-ink)", whiteSpace: "nowrap" }}>
                      {RACE_LABEL[c.raceType]}
                    </span>
                    <span className="num" style={{ fontSize: "10px", whiteSpace: "nowrap", color: c.daysAway < 0 ? "var(--color-faint)" : "var(--color-accent)" }}>
                      {untilLabel(c.raceDate, today)}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
                    <span className="num" style={{ fontSize: "20px", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: "var(--color-ink)" }}>
                      {c.athletes.length}
                    </span>
                    <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>
                      {c.athletes.length === 1 ? "athlete" : "athletes"}
                    </span>
                  </div>

                  {/*
                      The one line worth carrying on a closed tile: whether
                      anybody in this group needs the coach this morning.
                  */}
                  <span
                    className="num"
                    style={{
                      fontSize: "10px",
                      whiteSpace: "nowrap",
                      color: c.needAttention > 0 ? "var(--color-caution)" : "var(--color-faint)",
                    }}
                  >
                    {c.needAttention > 0
                      ? `${c.needAttention} ${c.needAttention === 1 ? COACH_COPY.flagOne : COACH_COPY.flagMany}`
                      : c.meanReadiness === null
                        ? COACH_COPY.noScores
                        : `${COACH_COPY.meanReadiness} ${c.meanReadiness}`}
                  </span>
                </button>
              );
            })}
          </div>

          {cycles.map((c, ci) => {
            if (!isOpen(c.id, ci)) return null;
            const open = true;
            return (
              <section key={c.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "13px 20px 4px" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "3px", flexShrink: 0, background: colorFor(c.raceType, preferences.raceColors) }} />
                  <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{c.label}</h2>
                  <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>
                    {c.athletes.length} · {untilLabel(c.raceDate, today)}
                  </span>
                </div>
                {open ? (
                  <div style={{ padding: "0 20px 16px" }}>
                    <AthleteRows athletes={c.athletes} today={today} flaggedIds={flaggedIds} />
                  </div>
                ) : null}
              </section>
            );
          })}

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

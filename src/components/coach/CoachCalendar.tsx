"use client";

/**
 * The coach's calendar, at three zoom levels.
 *
 * Year, month and week are the same data drawn at different distances, and each
 * answers a different question. The year answers "where is the season heavy" —
 * so it is density, not detail. The month answers "who is doing what this
 * fortnight" — so it is coloured dots per group. The week answers "what is
 * actually on for Thursday" — so it names people.
 *
 * Colour always means the same thing at every level: which race an athlete is
 * preparing for. That consistency is what lets a coach learn the palette once.
 */

import { useMemo, useState } from "react";
import {
  colorFor, DEFAULT_RACE_COLORS, densityOpacity, monthView, NO_RACE_COLOR,
  weekView, yearView, type CalendarSession,
} from "@/lib/coach/calendar";
import { RACE_LABEL } from "@/lib/coach/templates";
import { RACE_TYPES } from "@/lib/coach/templates";
import { FilterChip } from "@/components/ui";
import Link from "next/link";

type Zoom = "year" | "month" | "week";

const FAINT = "var(--color-faint)";
const MUTED = "var(--color-muted)";

export function CoachCalendar({
  sessions,
  today,
  raceColors,
  from,
  to,
}: {
  sessions: CalendarSession[];
  today: string;
  raceColors: Record<string, string>;
  /** first day loaded, inclusive — see the note on `step` */
  from: string;
  /** last day loaded, inclusive */
  to: string;
}) {
  const [zoom, setZoom] = useState<Zoom>("month");
  const [cursor, setCursor] = useState(() => new Date(today + "T00:00:00"));

  const month = useMemo(
    () => monthView(cursor.getFullYear(), cursor.getMonth(), sessions, today, raceColors),
    [cursor, sessions, today, raceColors],
  );
  const week = useMemo(
    () => weekView(cursorIso(cursor), sessions, today, raceColors),
    [cursor, sessions, today, raceColors],
  );
  const year = useMemo(
    () => yearView(cursor.getFullYear(), sessions, today, raceColors),
    [cursor, sessions, today, raceColors],
  );

  const busiest = useMemo(
    () => year.reduce((n, m) => Math.max(n, ...m.days.map((d) => d.count)), 1),
    [year],
  );

  /*
   * Navigation stops at the edge of what was fetched.
   *
   * The page loads one calendar year of sessions and this cursor was free to
   * walk anywhere, so pressing "›" in year view showed an entirely empty next
   * year and paging into January showed an empty month. The sessions existed;
   * they had simply never been asked for, and an empty grid is indistinguishable
   * from "nobody is training". Refusing to leave the loaded window is honest;
   * silently showing nothing is not.
   */
  const stepTo = (delta: number) => {
    const next = new Date(cursor);
    if (zoom === "year") next.setFullYear(next.getFullYear() + delta);
    else if (zoom === "month") next.setMonth(next.getMonth() + delta);
    else next.setDate(next.getDate() + delta * 7);
    return next;
  };

  const inWindow = (d: Date) => {
    // Year view is judged by the year; the other two by the day landed on.
    if (zoom === "year") {
      return d.getFullYear() >= Number(from.slice(0, 4)) && d.getFullYear() <= Number(to.slice(0, 4));
    }
    const iso = cursorIso(d);
    return iso >= from && iso <= to;
  };

  const canStep = (delta: number) => inWindow(stepTo(delta));

  const step = (delta: number) => {
    const next = stepTo(delta);
    if (!inWindow(next)) return;
    setCursor(next);
  };

  const title = zoom === "year" ? String(cursor.getFullYear()) : zoom === "month" ? month.label : week.label;

  return (
    <section className="card" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button className="btn btn-secondary" type="button" onClick={() => step(-1)} disabled={!canStep(-1)} style={{ padding: "5px 10px" }} aria-label="Previous">
            ‹
          </button>
          <h2 className="num" style={{ margin: 0, fontSize: "14px", fontWeight: 600, minWidth: "168px", textAlign: "center" }}>
            {title}
          </h2>
          <button className="btn btn-secondary" type="button" onClick={() => step(1)} disabled={!canStep(1)} style={{ padding: "5px 10px" }} aria-label="Next">
            ›
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setCursor(new Date(today + "T00:00:00"))}
            style={{ padding: "5px 11px", fontSize: "11.5px" }}
          >
            Today
          </button>
        </div>

        {/*
            Zoom is membership — which of three views is on — so it takes the
            kit's filter pill rather than a filled button, which would read as
            an action about to happen.
        */}
        <div style={{ display: "flex", gap: "6px" }}>
          {(["week", "month", "year"] as Zoom[]).map((z) => (
            <FilterChip key={z} active={zoom === z} onClick={() => setZoom(z)} style={{ textTransform: "capitalize" }}>
              {z}
            </FilterChip>
          ))}
        </div>
      </div>

      <div style={{ marginBlockStart: "14px" }}>
        {zoom === "month" && <MonthGrid view={month} />}
        {zoom === "week" && <WeekGrid view={week} raceColors={raceColors} />}
        {zoom === "year" && <YearGrid months={year} busiest={busiest} />}
      </div>

      <Legend raceColors={raceColors} />
    </section>
  );
}

const cursorIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ------------------------------------------------------------------ */

function MonthGrid({ view }: { view: ReturnType<typeof monthView> }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px", marginBlockEnd: "6px" }}>
        {view.headers.map((h, i) => (
          <span key={i} className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: FAINT, textAlign: "center" }}>
            {h}
          </span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px" }}>
        {view.weeks.flat().map((cell, i) => (
          <div
            key={i}
            title={cell.sessions.length ? `${cell.sessions.length} sessions` : undefined}
            style={{
              minHeight: "68px",
              borderRadius: "var(--radius-control)",
              // Inset, so marking today cannot nudge the six cells beside it.
              boxShadow: `inset 0 0 0 1px ${cell.isToday ? "var(--color-accent)" : "var(--color-line)"}`,
              background: cell.isToday ? "var(--color-accent-soft)" : cell.inMonth ? "var(--color-surface)" : "transparent",
              padding: "5px 6px",
              opacity: cell.inMonth ? 1 : 0.34,
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span className="num" style={{ fontSize: "10.5px", color: cell.isToday ? "var(--color-accent)" : cell.inMonth ? MUTED : FAINT }}>
              {cell.label}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
              {cell.groups.map((g, gi) => (
                <span
                  key={gi}
                  title={`${g.raceType ? RACE_LABEL[g.raceType] : "No race set"} · ${g.done}/${g.count} done`}
                  className="num"
                  style={{
                    fontSize: "9px",
                    lineHeight: 1,
                    padding: "3px 5px",
                    borderRadius: "3px",
                    background: g.color,
                    // A finished group loses its fill and keeps its outline:
                    // done work should recede without disappearing.
                    opacity: g.done === g.count ? 0.42 : 1,
                    color: "#08101c",
                    fontWeight: 600,
                  }}
                >
                  {g.count}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function WeekGrid({
  view,
  raceColors,
}: {
  view: ReturnType<typeof weekView>;
  raceColors: Record<string, string>;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px", overflowX: "auto" }}>
      {view.days.map((day) => (
        <div
          key={day.date}
          style={{
            minHeight: "190px",
            borderRadius: "var(--radius-control)",
            boxShadow: `inset 0 0 0 1px ${day.isToday ? "var(--color-accent)" : "var(--color-line)"}`,
            background: day.isToday ? "var(--color-accent-soft)" : "var(--color-surface)",
            padding: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: day.isToday ? "var(--color-accent)" : FAINT }}>
              {day.weekday}
            </span>
            <span className="num" style={{ fontSize: "11px", color: day.isToday ? "var(--color-accent)" : MUTED }}>
              {day.label}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            {day.sessions
              .filter((s) => s.workoutType !== "rest")
              .map((s, i) => (
                <Link
                  key={i}
                  href={`/coach/athletes/${s.athleteId}`}
                  title={`${s.athleteName} · ${s.workoutType}`}
                  style={{
                    display: "block",
                    padding: "4px 6px",
                    borderRadius: "4px",
                    background: "var(--color-elevated)",
                    // Month view and the legend honour the coach's overrides;
                    // this one call did not, so recolouring "Marathon" in
                    // Settings changed the calendar everywhere but here.
                    borderInlineStart: `3px solid ${colorFor(s.raceType, raceColors)}`,
                    opacity: s.done ? 0.55 : 1,
                  }}
                >
                  <span style={{ display: "block", fontSize: "10.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.athleteName}
                  </span>
                  <span className="num" style={{ display: "block", fontSize: "9.5px", color: FAINT }}>
                    {s.workoutType}
                    {s.plannedDistanceM ? ` ${(s.plannedDistanceM / 1000).toFixed(0)} km` : ""}
                    {s.done ? " ✓" : ""}
                  </span>
                </Link>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function YearGrid({
  months,
  busiest,
}: {
  months: ReturnType<typeof yearView>;
  busiest: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
      {months.map((m) => (
        <div key={m.month}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBlockEnd: "5px" }}>
            <span className="num" style={{ fontSize: "10.5px", letterSpacing: ".08em", textTransform: "uppercase", color: MUTED }}>
              {m.label}
            </span>
            <span className="num" style={{ fontSize: "9.5px", color: FAINT }}>{m.total || ""}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
            {m.days.map((d) => (
              <span
                key={d.date}
                title={`${d.date} · ${d.count} sessions`}
                style={{
                  aspectRatio: "1",
                  borderRadius: "2px",
                  background: d.color ?? "var(--color-elevated)",
                  opacity: d.color ? densityOpacity(d.count, busiest) : 0.5,
                  outline: d.isToday ? "1.5px solid var(--color-accent)" : "none",
                  outlineOffset: "1px",
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Legend({ raceColors }: { raceColors: Record<string, string> }) {
  return (
    <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBlockStart: "12px", paddingBlockStart: "10px", borderBlockStart: "1px solid var(--color-line)" }}>
      {RACE_TYPES.map((r) => (
        <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: colorFor(r, raceColors), display: "inline-block" }} />
          <span className="num" style={{ fontSize: "10px", color: FAINT }}>{RACE_LABEL[r]}</span>
        </span>
      ))}
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: NO_RACE_COLOR, display: "inline-block" }} />
        <span className="num" style={{ fontSize: "10px", color: FAINT }}>No race set</span>
      </span>
    </div>
  );
}

export { DEFAULT_RACE_COLORS };

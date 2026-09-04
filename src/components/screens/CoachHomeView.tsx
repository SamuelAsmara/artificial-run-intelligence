"use client";

/**
 * The coach's home.
 *
 * Ordered by how soon it changes what they do: who needs them, then what is on
 * this week, then the calendar. The roster itself lives a click away — a list
 * of thirty names is a reference, not a morning briefing.
 */

import { useMemo } from "react";
import { CoachNav } from "@/components/coach/CoachNav";
import { CoachCalendar } from "@/components/coach/CoachCalendar";
import { Reminders } from "@/components/coach/Reminders";
import { JoinCode } from "@/components/coach/JoinCode";
import type { CoachWorkspace } from "@/actions/coach";
import { buildCycles } from "@/lib/coach/programs";
import { RACE_LABEL } from "@/lib/coach/templates";
import {
  buildHighlights, COACH_COPY, FLAG_LIMIT, initials, KIND_LABEL, toneColor, untilParts,
} from "@/lib/screens/coachHome";
import { weekDates } from "@/lib/coach/roster";
import { Entrance, StatTile, STAT_ICONS, EmptyState } from "@/components/ui";
import { NUMBERS_HUE } from "@/lib/screens/numbers";
import Link from "next/link";

/** two figures — the roster is people before it is anything else */
const ROSTER_ICON = "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M16 20h6a5 5 0 0 0-4-4.9";

const TONE: Record<string, string> = {
  negative: "var(--color-negative)",
  caution: "var(--color-caution)",
  accent: "var(--color-accent)",
  muted: "var(--color-muted)",
};

export function CoachHomeView({ data, today }: { data: CoachWorkspace; today: string }) {
  const { athletes, summary, flags, code, preferences, reminders, sessions, coachName } = data;

  const flaggedIds = useMemo(() => new Set(flags.map((f) => f.athleteId)), [flags]);
  const { cycles, withoutRace } = useMemo(
    () => buildCycles(athletes, today, flaggedIds),
    [athletes, today, flaggedIds],
  );

  const week = useMemo(() => weekDates(today), [today]);
  const weekSessions = useMemo(
    () => sessions.filter((s) => s.date >= week[0] && s.date <= week[6] && s.workoutType !== "rest"),
    [sessions, week],
  );

  const highlights = useMemo(
    () =>
      buildHighlights({
        athleteCount: athletes.length,
        flagCount: flags.length,
        needAttention: flaggedIds.size,
        nextRace: summary.upcoming[0]
          ? { name: summary.upcoming[0].athleteName, daysAway: summary.upcoming[0].daysAway }
          : null,
        thisWeekPlanned: weekSessions.length,
        thisWeekDone: weekSessions.filter((s) => s.done).length,
        withoutRace: withoutRace.length,
      }),
    [athletes.length, flags.length, flaggedIds.size, summary.upcoming, weekSessions, withoutRace.length],
  );

  const shownFlags = flags.slice(0, FLAG_LIMIT);

  return (
    <div data-entrance-root style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance />
      <CoachNav active="home" />

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>
          {COACH_COPY.hello}
          {coachName ? `, ${coachName}` : ""}
        </h1>
        <span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>
          {new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(
            new Date(today + "T00:00:00"),
          )}
        </span>
      </div>

      {/* the numbers a coach quotes without thinking */}
      <section className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: "12px" }}>
        <Stat value={String(summary.total)} label={summary.total === 1 ? "Athlete" : "Athletes"} icon={STAT_ICONS.pulse} hue={NUMBERS_HUE.hr} />
        <Stat value={String(cycles.length)} label={cycles.length === 1 ? "Cycle" : "Cycles"} icon={STAT_ICONS.chart} hue={NUMBERS_HUE.acwr} />
        <Stat
          // "0/0" is not a fact about training, it is the absence of one.
          value={
            weekSessions.length === 0
              ? "—"
              : `${weekSessions.filter((s) => s.done).length}/${weekSessions.length}`
          }
          label="Sessions this week"
          icon={STAT_ICONS.clock}
          hue={NUMBERS_HUE.volume}
        />
        {/*
            Figure and unit, not one string.
            `untilLabel` returns "in 8 d", which put a phrase in the slot the
            tile sets at 25px and overflowed the cell.
        */}
        <Stat
          value={summary.upcoming[0] ? untilParts(summary.upcoming[0].raceDate, today).value : null}
          unit={summary.upcoming[0] ? untilParts(summary.upcoming[0].raceDate, today).unit : undefined}
          label={summary.upcoming[0] ? `Next race · ${RACE_LABEL[summary.upcoming[0].raceType]}` : "No race scheduled"}
          icon={STAT_ICONS.trophy}
          hue={NUMBERS_HUE.riegel}
        />
      </section>

      {/*
          Reordered by the coach's actual morning: the figures, then the week
          itself — the calendar with the reminders pad beside it — and only
          then the narrative sections. "Worth knowing" and "Needs you" are
          prose; the calendar is the thing a coach checks before answering a
          single message.
      */}
      <div className="rail-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 288px", gap: "12px", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
          {athletes.length === 0 ? (
            <EmptyState
              icon={ROSTER_ICON}
              message={
                <>
                  <span style={{ display: "block", fontSize: "15px", fontWeight: 600, color: "var(--color-ink)", marginBlockEnd: "8px" }}>
                    {COACH_COPY.boardEmptyTitle}
                  </span>
                  {COACH_COPY.boardEmptyBody}
                </>
              }
            />
          ) : (
            <CoachCalendar sessions={sessions} today={today} raceColors={preferences.raceColors} from={data.from} to={data.to} />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Reminders
            reminders={reminders}
            today={today}
            athletes={athletes.map((a) => ({ id: a.id, name: a.name }))}
          />
          <JoinCode code={code} />
        </div>
      </div>

      {highlights.length > 0 && (
        <section className="card" style={{ padding: "14px 20px" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 600 }}>{COACH_COPY.highlightsTitle}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {highlights.map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: TONE[h.tone], flex: "none" }} />
                <span style={{ fontSize: "12.5px", color: "var(--color-ink)" }}>{h.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {shownFlags.length > 0 && (
        <section className="card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{COACH_COPY.attentionTitle}</h2>
            {flags.length > shownFlags.length && (
              <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>
                {flags.length - shownFlags.length} more on their pages
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBlockStart: "10px" }}>
            {shownFlags.map((f, i) => (
              <Link
                key={`${f.athleteId}-${f.kind}-${i}`}
                className="dc-hover-bg flagrow"
                href={`/coach/athletes/${f.athleteId}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(110px,auto) 1fr auto",
                  alignItems: "center",
                  gap: "12px",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-control)",
                  borderInlineStart: `2px solid ${toneColor(f.tone)}`,
                }}
              >
                <span className="num" style={{ width: "24px", height: "24px", flex: "none", borderRadius: "50%", background: "var(--color-elevated)", color: "var(--color-muted)", fontSize: "9.5px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {initials(f.athleteName)}
                </span>
                <span style={{ fontSize: "12.5px", fontWeight: 500 }}>{f.athleteName}</span>
                <span className="flagwhy" style={{ fontSize: "12px", color: "var(--color-muted)" }}>{f.text}</span>
                <span className="num" style={{ fontSize: "10px", letterSpacing: ".05em", textTransform: "uppercase", color: toneColor(f.tone) }}>
                  {KIND_LABEL[f.kind]}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

/**
 * The coach's summary figures, on the shared stat tile.
 *
 * `divided` used to draw a hairline between cells inside one card. The tiles
 * are their own cards now, so the gap does that work and the prop is kept only
 * so the call sites did not all have to change.
 */
function Stat({ value, label, icon, unit, hue }: { value: string | null; label: string; divided?: boolean; icon?: string; unit?: string; hue?: string }) {
  // An em dash is what the callers pass when there is nothing to report; the
  // tile understands null, so hand it through rather than printing a dash the
  // tile would then colour as if it were a reading.
  return <StatTile value={value === "\u2014" ? null : value} unit={unit} label={label} icon={icon} hue={hue} />;
}

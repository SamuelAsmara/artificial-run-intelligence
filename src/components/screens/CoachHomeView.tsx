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
  buildHighlights, COACH_COPY, FLAG_LIMIT, initials, KIND_LABEL, toneColor, untilLabel,
} from "@/lib/screens/coachHome";
import { weekDates } from "@/lib/coach/roster";

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
    <div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}>
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
      <section className="card stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: "16px", padding: "16px 22px" }}>
        <Stat value={String(summary.total)} label={summary.total === 1 ? "Athlete" : "Athletes"} />
        <Stat value={String(cycles.length)} label={cycles.length === 1 ? "Cycle" : "Cycles"} divided />
        <Stat
          value={`${weekSessions.filter((s) => s.done).length}/${weekSessions.length}`}
          label="Sessions this week"
          divided
        />
        <Stat
          value={summary.upcoming[0] ? untilLabel(summary.upcoming[0].raceDate, today) : "—"}
          label={summary.upcoming[0] ? `Next race · ${RACE_LABEL[summary.upcoming[0].raceType]}` : "No race scheduled"}
          divided
        />
      </section>

      <div className="rail-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 288px", gap: "12px", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
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
                  <a
                    key={`${f.athleteId}-${f.kind}-${i}`}
                    className="dc-hover-bg"
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
                    <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{f.text}</span>
                    <span className="num" style={{ fontSize: "10px", letterSpacing: ".05em", textTransform: "uppercase", color: toneColor(f.tone) }}>
                      {KIND_LABEL[f.kind]}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {athletes.length === 0 ? (
            <section className="card" style={{ padding: "34px 26px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{COACH_COPY.boardEmptyTitle}</h2>
              <p style={{ margin: 0, fontSize: "12.5px", color: "var(--color-muted)", maxWidth: "44ch", lineHeight: 1.6 }}>
                {COACH_COPY.boardEmptyBody}
              </p>
            </section>
          ) : (
            <CoachCalendar sessions={sessions} today={today} raceColors={preferences.raceColors} />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Reminders reminders={reminders} today={today} />
          <JoinCode code={code} />
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label, divided }: { value: string; label: string; divided?: boolean }) {
  return (
    <div style={divided ? { borderInlineStart: "1px solid var(--color-line)", paddingInlineStart: "16px" } : undefined}>
      <p className="num" style={{ margin: 0, fontSize: "22px", fontWeight: 500 }}>{value}</p>
      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{label}</p>
    </div>
  );
}

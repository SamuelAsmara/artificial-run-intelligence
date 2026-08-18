/**
 * The roster: who you coach, what they are training for, and how they are.
 *
 * The header answers the questions a coach asks about the group rather than the
 * individual — how many, at what distances, and who races next — because those
 * are the ones that decide how the week is planned.
 */

import { CoachNav } from "@/components/coach/CoachNav";
import type { CoachHome } from "@/actions/coach";
import { RACE_LABEL } from "@/lib/coach/templates";
import {
  COACH_COPY, formColor, initials, loadColor, raceLabel,
  readinessColor, sinceLabel, untilLabel,
} from "@/lib/screens/coachHome";

export function CoachAthletesView({ home, today }: { home: CoachHome; today: string }) {
  const { athletes, summary, code } = home;

  const cell = (v: number | null, color: string, digits = 0) => (
    <span className="num" style={{ fontSize: "12.5px", fontWeight: 500, textAlign: "end", color }}>
      {v === null ? "—" : v.toFixed(digits)}
    </span>
  );

  return (
    <div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <CoachNav active="athletes" />

      <div>
        <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>{COACH_COPY.athletesTitle}</h1>
        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>{COACH_COPY.athletesSub}</p>
      </div>

      <section className="card stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "16px", padding: "16px 22px" }}>
        <div>
          <p className="num" style={{ margin: 0, fontSize: "22px", fontWeight: 500 }}>{summary.total}</p>
          <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>
            {summary.total === 1 ? "Athlete" : "Athletes"}
          </p>
        </div>
        {summary.byRace.map((g) => (
          <div key={g.raceType} style={{ borderInlineStart: "1px solid var(--color-line)", paddingInlineStart: "16px" }}>
            <p className="num" style={{ margin: 0, fontSize: "22px", fontWeight: 500 }}>{g.count}</p>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{RACE_LABEL[g.raceType]}</p>
          </div>
        ))}
        {summary.withoutRace > 0 && (
          <div style={{ borderInlineStart: "1px solid var(--color-line)", paddingInlineStart: "16px" }}>
            <p className="num" style={{ margin: 0, fontSize: "22px", fontWeight: 500, color: "var(--color-caution)" }}>
              {summary.withoutRace}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>No race set</p>
          </div>
        )}
      </section>

      <section className="card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{COACH_COPY.racesTitle}</h2>
          <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>
            {summary.upcoming.length > 0 ? `${summary.upcoming.length} scheduled` : ""}
          </span>
        </div>
        {summary.upcoming.length === 0 ? (
          <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-faint)" }}>{COACH_COPY.racesEmpty}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBlockStart: "10px" }}>
            {summary.upcoming.map((r, i) => (
              <a
                key={`${r.athleteId}-${r.raceDate}`}
                className="dc-hover-bg"
                href={`/coach/athletes/${r.athleteId}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "76px 1fr auto auto",
                  alignItems: "center",
                  gap: "10px",
                  padding: "7px 10px",
                  borderRadius: "var(--radius-control)",
                  background: i === 0 ? "var(--color-elevated)" : "transparent",
                  borderInlineStart: `2px solid ${i === 0 ? "var(--color-accent)" : "transparent"}`,
                }}
              >
                <span className="num" style={{ fontSize: "10.5px", color: i === 0 ? "var(--color-accent)" : "var(--color-faint)" }}>
                  {r.raceDate}
                </span>
                <span style={{ fontSize: "12.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.athleteName}
                </span>
                <span className="tag" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                  {RACE_LABEL[r.raceType]}
                </span>
                <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)", minWidth: "52px", textAlign: "end" }}>
                  {untilLabel(r.raceDate, today)}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      {athletes.length === 0 ? (
        <section className="card" style={{ padding: "30px 24px", textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{COACH_COPY.boardEmptyTitle}</h2>
          <p style={{ margin: "8px auto 0", fontSize: "12.5px", color: "var(--color-muted)", maxWidth: "44ch", lineHeight: 1.6 }}>
            {COACH_COPY.boardEmptyBody}
          </p>
          <p className="num" style={{ margin: "14px 0 0", fontSize: "22px", fontWeight: 500, letterSpacing: ".16em" }}>
            {code ?? "——————"}
          </p>
        </section>
      ) : (
        <section className="card" style={{ padding: "16px 20px", overflowX: "auto" }}>
          <div style={{ minWidth: "760px" }}>
            <div
              className="num"
              style={{ display: "grid", gridTemplateColumns: "minmax(170px,1.5fr) .9fr .8fr .7fr .7fr .9fr .8fr", gap: "10px", alignItems: "center", padding: "0 10px 8px", borderBlockEnd: "1px solid var(--color-line)" }}
            >
              {[COACH_COPY.hAthlete, COACH_COPY.hRace, COACH_COPY.hWhen, COACH_COPY.hReadiness, COACH_COPY.hForm, COACH_COPY.hLoad, COACH_COPY.hLastRun].map((h, i) => (
                <span key={h} style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: i >= 3 ? "end" : "start" }}>
                  {h}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {athletes.map((a) => (
                <a
                  key={a.id}
                  className="dc-hover-bg"
                  href={`/coach/athletes/${a.id}`}
                  style={{ display: "grid", gridTemplateColumns: "minmax(170px,1.5fr) .9fr .8fr .7fr .7fr .9fr .8fr", gap: "10px", alignItems: "center", padding: "9px 10px", borderRadius: "var(--radius-control)" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                    <span className="num" style={{ width: "30px", height: "30px", flex: "none", borderRadius: "50%", background: "var(--color-elevated)", color: "var(--color-muted)", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {initials(a.name)}
                    </span>
                    <span style={{ fontSize: "12.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.name}
                    </span>
                  </span>
                  <span className="tag" style={{ background: "var(--color-elevated)", color: a.raceType ? "var(--color-muted)" : "var(--color-faint)", justifySelf: "start" }}>
                    {raceLabel(a.raceType)}
                  </span>
                  <span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>
                    {a.raceDate ? untilLabel(a.raceDate, today) : "—"}
                  </span>
                  {cell(a.readiness, readinessColor(a.readiness))}
                  {cell(a.form, formColor(a.form))}
                  {cell(a.loadRatio, loadColor(a.loadRatio), 2)}
                  <span className="num" style={{ fontSize: "11px", color: "var(--color-muted)", textAlign: "end" }}>
                    {sinceLabel(a.lastRunAt, today)}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The coach's home: one week, every athlete, both halves of every day.
 *
 * The screen answers "who needs me?" before it answers anything else, so the
 * attention strip sits above the board and disappears entirely when it is
 * empty. A row of green ticks reading "all good" trains a coach to skim; an
 * absent section trains them to trust the one that is there.
 */

import { CoachNav } from "@/components/coach/CoachNav";
import { JoinCode } from "@/components/coach/JoinCode";
import type { CoachHome } from "@/actions/coach";
import {
  cellLook, COACH_COPY, DAY_INITIALS, dayNumber, FLAG_LIMIT,
  initials, KIND_LABEL, LEGEND, summaryLine, toneColor,
} from "@/lib/screens/coachHome";

export function CoachHomeView({ home, today }: { home: CoachHome; today: string }) {
  const { athletes, board, flags, week, code, summary } = home;
  const shown = flags.slice(0, FLAG_LIMIT);
  const hidden = flags.length - shown.length;

  return (
    <div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <CoachNav active="home" />

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>{COACH_COPY.homeTitle}</h1>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>{COACH_COPY.homeSub}</p>
        </div>
        <span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>{summaryLine(summary)}</span>
      </div>

      {athletes.length === 0 ? (
        <section className="card" style={{ padding: "34px 26px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{COACH_COPY.boardEmptyTitle}</h2>
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--color-muted)", maxWidth: "44ch", lineHeight: 1.6 }}>
            {COACH_COPY.boardEmptyBody}
          </p>
          <div style={{ marginBlockStart: "8px", width: "min(360px, 100%)" }}>
            <JoinCode code={code} />
          </div>
        </section>
      ) : (
        <>
          {shown.length > 0 && (
            <section className="card" style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{COACH_COPY.attentionTitle}</h2>
                {hidden > 0 && (
                  <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>
                    {hidden} more on their pages
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBlockStart: "10px" }}>
                {shown.map((f, i) => (
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
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: toneColor(f.tone), display: "inline-block" }} />
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

          <section className="card" style={{ padding: "16px 20px", overflowX: "auto" }}>
            <div style={{ minWidth: "720px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.2fr) repeat(7, 1fr)", gap: "6px", alignItems: "end", paddingBlockEnd: "8px", borderBlockEnd: "1px solid var(--color-line)" }}>
                <span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>
                  {COACH_COPY.hAthlete}
                </span>
                {week.map((d, i) => (
                  <span key={d} style={{ textAlign: "center" }}>
                    <span className="num" style={{ display: "block", fontSize: "9.5px", letterSpacing: ".08em", color: d === today ? "var(--color-accent)" : "var(--color-faint)" }}>
                      {DAY_INITIALS[i]}
                    </span>
                    <span className="num" style={{ display: "block", fontSize: "11px", color: d === today ? "var(--color-accent)" : "var(--color-muted)" }}>
                      {dayNumber(d)}
                    </span>
                  </span>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {board.map((row) => (
                  <div
                    key={row.athleteId}
                    style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.2fr) repeat(7, 1fr)", gap: "6px", alignItems: "stretch", paddingBlock: "6px", borderBlockEnd: "1px solid var(--color-line)" }}
                  >
                    <a
                      href={`/coach/athletes/${row.athleteId}`}
                      style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}
                    >
                      <span className="num" style={{ width: "26px", height: "26px", flex: "none", borderRadius: "50%", background: "var(--color-elevated)", color: "var(--color-muted)", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {initials(row.athleteName)}
                      </span>
                      <span style={{ fontSize: "12.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.athleteName}
                      </span>
                    </a>
                    {row.cells.map((c) => {
                      const look = cellLook(c.state);
                      return (
                        <div
                          key={c.date}
                          title={`${look.name}${c.planned ? ` · planned: ${c.planned}` : ""}${c.actualKm ? ` · ran ${c.actualKm} km` : ""}`}
                          style={{
                            background: look.bg,
                            borderInlineStart: `2px solid ${look.edge}`,
                            borderRadius: "var(--radius-control)",
                            padding: "5px 7px",
                            minHeight: "38px",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            gap: "1px",
                          }}
                        >
                          {c.planned && (
                            <span style={{ fontSize: "10.5px", color: look.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.planned}
                            </span>
                          )}
                          {c.actualKm !== null && (
                            <span className="num" style={{ fontSize: "10px", color: look.ink, opacity: 0.85 }}>
                              {c.actualKm} km
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBlockStart: "12px" }}>
                {LEGEND.map((s) => {
                  const look = cellLook(s);
                  return (
                    <span key={s} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: look.bg, borderInlineStart: `2px solid ${look.edge}`, display: "inline-block" }} />
                      <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>{look.name}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </section>

          <div style={{ width: "min(360px, 100%)" }}>
            <JoinCode code={code} />
          </div>
        </>
      )}
    </div>
  );
}

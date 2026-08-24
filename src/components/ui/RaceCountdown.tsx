import type { CSSProperties } from "react";

/**
 * Kit item 5b — the race countdown.
 *
 * The most emotional object in the product, and the one place it is allowed a
 * little feeling. A 64px figure at −0.03em with air around it reads as an event
 * approaching; the same number at 20px reads as a field in a form. Everything
 * else on the card stays quiet so the day count is the only loud thing.
 */
export function RaceCountdown({
  raceName,
  daysRemaining,
  dateLabel,
  weekLabel,
  progressPct,
  targetTime,
  style,
}: {
  raceName: string;
  /** null when there is no goal race — the card should not be rendered at all */
  daysRemaining: number;
  /** "Sunday, Dec 6 2026" */
  dateLabel: string;
  /** "week 4 of 16" */
  weekLabel?: string;
  /** 0–100; how much of the programme is done */
  progressPct?: number;
  /** "3:45:00" — shown only when the athlete actually set one */
  targetTime?: string | null;
  style?: CSSProperties;
}) {
  const pct = progressPct == null ? null : Math.max(0, Math.min(100, Math.round(progressPct)));
  const past = daysRemaining < 0;

  return (
    <div
      className="card"
      style={{
        padding: "34px 30px 28px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        textAlign: "center",
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-muted)",
        }}
      >
        {raceName}
      </span>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBlockStart: 6 }}>
        <span
          className="num"
          style={{ fontSize: 64, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          {past ? "—" : daysRemaining}
        </span>
        <span style={{ fontSize: 13, color: "var(--color-muted)" }}>
          {past ? "raced" : daysRemaining === 1 ? "day" : "days"}
        </span>
      </div>

      <span className="num" style={{ fontSize: 11.5, color: "var(--color-faint)" }}>
        {dateLabel}
        {weekLabel ? ` · ${weekLabel}` : ""}
      </span>

      {pct != null && (
        <>
          <div
            style={{
              width: "100%",
              height: 4,
              background: "var(--color-elevated)",
              borderRadius: "var(--radius-pill)",
              marginBlockStart: 18,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: 4,
                background: "var(--color-accent)",
                borderRadius: "var(--radius-pill)",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              width: "100%",
              marginBlockStart: 8,
            }}
          >
            <span className="num" style={{ fontSize: 10, color: "var(--color-faint)" }}>
              {pct}% of programme done
            </span>
            {targetTime && (
              <span className="num" style={{ fontSize: 10, color: "var(--color-muted)" }}>
                target{" "}
                <span style={{ color: "var(--color-ink)", fontWeight: 600 }}>{targetTime}</span>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

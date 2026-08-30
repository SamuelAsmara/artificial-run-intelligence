import type { CSSProperties, ReactNode } from "react";
import { dayCellStyle, SESSION_EDGE, type DayState, type SessionType } from "@/lib/ui/dayCell";

/**
 * Kit item 3 — the day cell, in two sizes.
 *
 * `compact` is the week strip; `full` is a month-grid cell, where the session
 * sits in its own inset block so a cell can hold a date and a workout without
 * the two competing.
 */

export type DayCellProps = {
  /** "Mon 17" in the compact strip, "18" in a month grid */
  day: string;
  state: DayState;
  type: SessionType;
  name: string;
  /** "8 km · 5:38" — the one line of detail. A node, so the calendar can
   * wrap the unit in a span the phone stylesheet hides. */
  meta?: ReactNode;
  /** what the session used to say before the coach changed it */
  wasMeta?: string;
  statusLabel?: string;
  onClick?: () => void;
  style?: CSSProperties;
};

export function DayCell({
  day,
  state,
  type,
  name,
  meta,
  statusLabel,
  onClick,
  style,
}: DayCellProps) {
  const s = dayCellStyle(state);
  const label = statusLabel ?? s.statusLabel;

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        background: s.bg,
        borderRadius: "var(--radius-control)",
        padding: "10px 12px",
        boxShadow: s.ring,
        borderInlineStart: `2px solid ${SESSION_EDGE[type]}`,
        opacity: s.opacity,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span
          className="num"
          style={{
            fontSize: 10,
            color: s.dayColor,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {day}
        </span>
        {label && (
          <span
            className="num"
            style={{
              fontSize: 9,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: s.statusColor,
            }}
          >
            {label}
          </span>
        )}
      </div>
      <p style={{ margin: "7px 0 0", fontSize: 12.5, fontWeight: 500, color: s.nameColor }}>
        {name}
      </p>
      {meta && (
        <p className="num" style={{ margin: "2px 0 0", fontSize: 10.5, color: "var(--color-faint)" }}>
          {meta}
        </p>
      )}
    </div>
  );
}

/** the month-grid form: a date, then the session in its own inset block */
export function DayCellFull({
  day,
  state,
  type,
  name,
  meta,
  wasMeta,
  onClick,
  style,
}: DayCellProps) {
  const s = dayCellStyle(state);
  const adjusted = state === "adjusted";

  return (
    <div
      className="card"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        minHeight: 120,
        padding: "10px 12px",
        boxShadow: s.ring,
        background: s.bg,
        opacity: s.opacity,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span
          className="num"
          style={{
            fontSize: 11,
            color: state === "today" ? "var(--color-accent)" : "var(--color-muted)",
            fontWeight: state === "today" ? 600 : 400,
          }}
        >
          {day}
        </span>
        {adjusted ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--color-caution)",
                display: "inline-block",
              }}
            />
            <span
              className="num"
              style={{
                fontSize: 8.5,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-caution)",
              }}
            >
              adjusted
            </span>
          </span>
        ) : state === "today" ? (
          <span
            className="num"
            style={{
              fontSize: 8.5,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-accent)",
            }}
          >
            today
          </span>
        ) : null}
      </div>

      {name && (
        <div
          style={{
            marginBlockStart: 8,
            background: "var(--color-elevated)",
            borderInlineStart: `2px solid ${SESSION_EDGE[type]}`,
            borderRadius: 4,
            padding: "5px 8px",
          }}
        >
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500 }}>{name}</p>
          {(meta || wasMeta) && (
            <p className="num" style={{ margin: "1px 0 0", fontSize: 9.5, color: "var(--color-faint)" }}>
              {wasMeta && (
                <>
                  <s style={{ color: "var(--color-faint)" }}>{wasMeta}</s>
                  {" → "}
                </>
              )}
              {meta}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

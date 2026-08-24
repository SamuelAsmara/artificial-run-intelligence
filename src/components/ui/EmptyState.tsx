import type { CSSProperties, ReactNode } from "react";

/**
 * Kit item 6 — the empty state. There are seven of these and they are the
 * first thing a new user meets, so each one says something true about what is
 * missing and offers exactly one way out.
 */
export function EmptyState({
  icon = "M3 11h4l3-8 4 16 3-8h4",
  message,
  action,
  style,
}: {
  /** an SVG path `d`, thin stroke */
  icon?: string;
  /** one honest sentence — not "nothing to see here" */
  message: ReactNode;
  action?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "44px 30px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        textAlign: "center",
        ...style,
      }}
    >
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "var(--color-elevated)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-faint)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d={icon} />
        </svg>
      </span>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-muted)", maxWidth: 320 }}>
        {message}
      </p>
      {action}
    </div>
  );
}

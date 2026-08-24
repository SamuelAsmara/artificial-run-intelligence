import type { CSSProperties, ReactNode } from "react";

/**
 * Kit item 5 — the section header. It already existed on every card, written
 * slightly differently each time. This is the one version: title, an optional
 * faint mono hint beside it, and an optional action pushed to the right.
 */
export function SectionHeader({
  title,
  hint,
  action,
  divider = false,
  style,
}: {
  title: ReactNode;
  /** "12 weeks", "updated 6:12 AM" — context, not instruction */
  hint?: ReactNode;
  action?: ReactNode;
  /** a hairline above, when the header opens a second block inside one card */
  divider?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        ...(divider
          ? { borderBlockStart: "1px solid var(--color-line)", paddingBlockStart: 16 }
          : null),
        ...style,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h3>
      {hint && (
        <span className="num" style={{ fontSize: 11, color: "var(--color-faint)" }}>
          {hint}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {action}
    </div>
  );
}

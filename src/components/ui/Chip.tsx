"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Kit item 4 — chips, in three jobs that must never be confusable.
 *
 * A filter is *membership*: a pill, and when it is on it takes a soft fill and
 * an inset ring. An action is a *verb*: squared corners, a border, a leading
 * icon, and when it is armed it takes the accent on its border and text but
 * still no fill — so an armed action can never be mistaken for an active
 * filter sitting next to it. A status carries state and is never clickable.
 */

export function FilterChip({
  children,
  active = false,
  onClick,
  style,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        font: "500 12px var(--font-sans)",
        padding: "6px 14px",
        borderRadius: "var(--radius-pill)",
        border: "none",
        cursor: "pointer",
        background: active ? "var(--color-accent-soft)" : "var(--color-elevated)",
        color: active ? "var(--color-accent)" : "var(--color-muted)",
        boxShadow: active ? "inset 0 0 0 1px var(--color-accent)" : "none",
        transition: "background 0.15s, color 0.15s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function ActionChip({
  children,
  armed = false,
  icon,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode;
  armed?: boolean;
  /** an SVG path `d`, thin stroke, same family as every other icon */
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        font: "500 12px var(--font-sans)",
        padding: "6px 12px",
        borderRadius: "var(--radius-control)",
        cursor: disabled ? "not-allowed" : "pointer",
        background: "transparent",
        color: armed ? "var(--color-accent)" : "var(--color-muted)",
        border: `1px solid ${armed ? "var(--color-accent)" : "var(--color-line-strong)"}`,
        opacity: disabled ? 0.5 : 1,
        transition: "border-color 0.15s, color 0.15s",
        ...style,
      }}
    >
      {icon && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d={icon} />
        </svg>
      )}
      {children}
    </button>
  );
}

export type StatusTone = "good" | "warning" | "bad" | "record" | "neutral";

const STATUS_STYLE: Record<StatusTone, { bg: string; color: string }> = {
  good: { bg: "color-mix(in oklab, var(--color-positive) 14%, transparent)", color: "var(--color-positive)" },
  warning: { bg: "color-mix(in oklab, var(--color-caution) 14%, transparent)", color: "var(--color-caution)" },
  bad: { bg: "color-mix(in oklab, var(--color-negative) 14%, transparent)", color: "var(--color-negative)" },
  // gold is reserved for personal records and nothing else
  record: { bg: "var(--color-gold-soft)", color: "var(--color-gold)" },
  neutral: { bg: "var(--color-elevated)", color: "var(--color-muted)" },
};

export function StatusChip({
  children,
  tone = "neutral",
  style,
}: {
  children: ReactNode;
  tone?: StatusTone;
  style?: CSSProperties;
}) {
  const s = STATUS_STYLE[tone];
  return (
    <span
      className="num"
      style={{
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: "var(--radius-pill)",
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export const CHIP_ICONS = {
  compare: "M8 3v18M16 3v18M3 8h18M3 16h18",
  autoPick:
    "M15 4V2m0 20v-2M4 15H2m20 0h-2M6.3 6.3 4.9 4.9m14.2 14.2-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4",
  filter: "M3 5h18M6 12h12M10 19h4",
} as const;

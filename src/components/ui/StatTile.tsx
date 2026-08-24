import type { CSSProperties, ReactNode } from "react";

/**
 * Kit item 1 — the stat tile. The first thing an athlete sees.
 *
 * Direction A from the design handoff: no display face, the presence comes
 * from size, tracking and air. A 25px mono figure at −0.02em over an 8.5px
 * uppercase letter-spaced label is a ~3x ratio, which is what makes a row of
 * five of these read as one instrument panel rather than five table cells.
 *
 * Centred deliberately — the tiles sit in a row of equal cells. Nothing longer
 * than a few words is ever centred anywhere else in the product.
 */

export type StatTone = "neutral" | "good" | "warning" | "bad" | "none";

/** thin 1.5-stroke line icons, the only icon family in the product */
export const STAT_ICONS = {
  pulse: "M22 12h-4l-3 9L9 3l-3 9H2",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  warning:
    "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  clock: "M12 7v5l3 2M4.9 19.1A10 10 0 1 1 19.1 4.9 10 10 0 0 1 4.9 19.1Z",
  gauge: "M4.9 19.1A10 10 0 1 1 19.1 4.9 10 10 0 0 1 4.9 19.1Z",
  distance: "M3 11h4l3-8 4 16 3-8h4",
  trophy:
    "M8 21h8M12 17v4M6 4h12v5a6 6 0 0 1-12 0V4ZM6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3",
  flame: "M12 22a7 7 0 0 0 7-7c0-5-4-6-4-10-3 1-4 4-4 6-1-1-1.5-2-1.5-3C7 10 5 12 5 15a7 7 0 0 0 7 7Z",
} as const;

const TONE_COLOR: Record<StatTone, string> = {
  neutral: "var(--color-muted)",
  good: "var(--color-positive)",
  warning: "var(--color-caution)",
  bad: "var(--color-negative)",
  none: "var(--color-faint)",
};

export function StatTile({
  value,
  unit,
  label,
  interpretation,
  tone = "neutral",
  icon,
  style,
}: {
  /** null means the data cannot support a figure — an em dash, never a zero */
  value: string | number | null | undefined;
  unit?: string;
  label: string;
  interpretation?: ReactNode;
  tone?: StatTone;
  /** an SVG path `d` — use a member of STAT_ICONS */
  icon?: string;
  style?: CSSProperties;
}) {
  const missing = value === null || value === undefined || value === "";
  const shown = missing ? "—" : String(value);
  // A bad reading is the one thing allowed to colour the figure itself. Every
  // other state colours only the interpretation line, so the row stays calm.
  const figColor = missing
    ? "var(--color-faint)"
    : tone === "bad"
      ? "var(--color-negative)"
      : "var(--color-ink)";

  return (
    <div
      className="card"
      style={{
        padding: "13px 10px 11px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        textAlign: "center",
        ...style,
      }}
    >
      {icon && (
        <svg
          width="13"
          height="13"
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
      )}
      <div>
        <span
          className="num"
          style={{
            fontSize: 25,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: figColor,
          }}
        >
          {shown}
        </span>
        {unit && !missing && (
          <span className="num" style={{ fontSize: 11, color: "var(--color-faint)" }}>
            {" "}
            {unit}
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 8.5,
          fontWeight: 500,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: "var(--color-faint)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        className="num"
        style={{
          fontSize: 10,
          color: TONE_COLOR[missing ? "none" : tone],
          minHeight: 12,
          lineHeight: 1.2,
        }}
      >
        {missing ? "No data yet" : interpretation}
      </span>
    </div>
  );
}

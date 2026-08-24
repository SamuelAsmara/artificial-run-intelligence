import { miniBars, type BarBox, type MiniBarInput, BAR_BOX } from "@/lib/ui/miniBars";

/** a narrower box for the dashboard rail, where 472 units of width would
 *  shrink the 9px axis labels to about 5px on screen */
export const BAR_BOX_RAIL: BarBox = { ...BAR_BOX, w: 256 };

/**
 * Kit item 2 — the small bar chart.
 *
 * Used for weekly volume on the athlete's home and weekly distance on the
 * activities page. A soft vertical fade instead of a solid block, a track
 * behind each bar so the chart keeps its shape on a quiet week, a glow on the
 * best completed week, and the in-progress period drawn as a dashed outline so
 * it cannot be misread as a bad week.
 *
 * `idPrefix` must be unique per chart on a page — SVG gradient and filter ids
 * are document-global, and two charts sharing one id make the second render
 * against the first's definitions.
 */
export function MiniBars({
  data,
  unit = "km",
  idPrefix = "mb",
  ariaLabel,
  box = BAR_BOX,
}: {
  data: MiniBarInput[];
  unit?: string;
  idPrefix?: string;
  ariaLabel?: string;
  /** BAR_BOX by default; BAR_BOX_RAIL in a narrow column */
  box?: BarBox;
}) {
  const chart = miniBars(data, unit, box);
  if (!chart) return null;

  const gid = `${idPrefix}-grad`;
  const fid = `${idPrefix}-glow`;

  return (
    <svg
      viewBox={`0 0 ${box.w} ${box.h}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label={ariaLabel ?? `bar chart, ${data.length} periods`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="1" />
        </linearGradient>
        <filter id={fid} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      {chart.bars.map((b, i) => (
        <g key={`${b.label}-${i}`}>
          <rect
            x={b.gx}
            y={chart.track.y}
            width={chart.trackW}
            height={chart.track.h}
            rx={chart.trackW / 2}
            fill="var(--color-elevated)"
          />
          {b.glowOp > 0 && (
            <rect
              x={b.px}
              y={b.y}
              width={chart.barW}
              height={b.h}
              rx={b.rx}
              fill={`url(#${gid})`}
              opacity={b.glowOp}
              filter={`url(#${fid})`}
            />
          )}
          <rect
            x={b.px}
            y={b.y}
            width={chart.barW}
            height={b.h}
            rx={b.rx}
            fill={`url(#${gid})`}
            // fillOpacity, not opacity: SVG `opacity` is group opacity, so
            // opacity=0 on the in-progress bar took its dashed outline with it
            // and the current week simply disappeared from the chart.
            fillOpacity={b.bodyOp}
            stroke={b.stroke}
            strokeWidth={1}
            strokeDasharray={b.dash || undefined}
          />
          {b.tip.opacity > 0 && (
            <g opacity={b.tip.opacity}>
              <rect
                x={b.tip.x}
                y={b.tip.y}
                width={44}
                height={18}
                rx={9}
                fill="var(--color-elevated)"
                stroke="var(--color-line-strong)"
                strokeWidth={1}
              />
              <text
                x={b.cx}
                y={b.tip.ty}
                fill="var(--color-ink)"
                fontSize={9.5}
                fontWeight={600}
                fontFamily="var(--font-mono)"
                textAnchor="middle"
              >
                {b.tip.text}
              </text>
            </g>
          )}
          <text
            x={b.cx}
            y={box.labelY}
            fill={b.labelColor}
            fontSize={9}
            fontFamily="var(--font-mono)"
            textAnchor="middle"
          >
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

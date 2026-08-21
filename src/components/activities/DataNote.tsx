/**
 * What this chart is made of, said in one consistent place.
 *
 * Sits directly under the chart, because that is where the question forms:
 * the athlete notices a lane is missing and looks down. A source chip, then
 * the sentence. Nothing here is an error state — a run entered by hand is a
 * legitimate run, and this line reads as a caption rather than a warning.
 *
 * Reuses the existing `tag` chip and the faint caption size already used
 * under the split strip; the point is that absence looks like part of the
 * product rather than something that broke.
 */

import type { Provenance } from "@/lib/activity/provenance";

export function DataNote({
  provenance,
  /** with no chart above it, the line becomes the content and centres */
  centred = false,
}: {
  provenance: Provenance;
  centred?: boolean;
}) {
  const { sourceLabel, note } = provenance;
  if (!note && !sourceLabel) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "9px",
        marginBlock: centred ? "28px" : "10px 0",
        flexWrap: "wrap",
        justifyContent: centred ? "center" : "flex-start",
        maxWidth: centred ? "620px" : undefined,
        marginInline: centred ? "auto" : undefined,
      }}
    >
      <span
        className="tag"
        style={{
          background: "var(--color-elevated)",
          color: "var(--color-faint)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {sourceLabel}
      </span>
      {note ? (
        <p
          style={{
            margin: 0,
            fontSize: "11px",
            color: "var(--color-faint)",
            lineHeight: "1.6",
            textAlign: centred ? "center" : "start",
            flex: centred ? "0 1 auto" : "1 1 260px",
            minWidth: 0,
          }}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

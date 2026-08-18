"use client";

/**
 * "Show reasoning" — what the readiness score is actually made of.
 *
 * ## Why this screen exists
 *
 * A 2025 review of fourteen composite readiness scores across ten manufacturers
 * found that none of them disclosed how the number was calculated, and almost
 * none offered any validation. That is the norm this project is arguing with.
 * Our score has fewer inputs than Garmin's; what it has instead is that it can
 * be checked, and disagreed with.
 *
 * So this panel shows, for every component that fed today's number: what it
 * read, what it scored out of 100, how much it counted, and one sentence on
 * what it means. The weakest contributor is marked, because that is the one
 * piece of information an athlete can act on.
 *
 * ## A note on the design
 *
 * The Claude Design handoff has the "Show reasoning" button but no panel behind
 * it. This is built entirely from the existing primitives — `.card`, `.tag`,
 * `.num`, the design tokens, and the same bar treatment the analyze script
 * uses — so it sits inside the system rather than beside it. If it later goes
 * back through Claude Design, nothing here is load-bearing.
 */

import type { Narrative } from "@/lib/narrative/buildNarrative";

export function ReasoningPanel({
  narrative,
  score,
  onClose,
}: {
  narrative: Narrative;
  score: number;
  onClose: () => void;
}) {
  return (
    <section
      className="card"
      aria-label="How this score was calculated"
      style={{ padding: "20px 22px", gridColumn: "1", minWidth: 0 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
            How today&rsquo;s score was calculated
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>
            Every input, what it read and how much it counted.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onClose}
          style={{ padding: "5px 12px", fontSize: "12px" }}
        >
          Hide
        </button>
      </div>

      {/* the full narrative, of which the hero shows only the two key sentences */}
      <p
        style={{
          margin: "14px 0 0",
          fontSize: "13px",
          lineHeight: 1.6,
          color: "var(--color-muted)",
          maxWidth: "78ch",
          textWrap: "pretty",
        }}
      >
        {narrative.full}
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          marginBlockStart: "18px",
          borderBlockStart: "1px solid var(--color-line)",
          paddingBlockStart: "16px",
        }}
      >
        {narrative.reasoning.map((r) => {
          const isLimiter = r.component === narrative.limiter;
          const tone = isLimiter
            ? "var(--color-caution)"
            : r.subscore >= 85
              ? "var(--color-positive)"
              : "var(--color-muted)";

          return (
            <div
              key={r.component}
              style={{
                display: "grid",
                gridTemplateColumns: "190px 1fr 132px 44px",
                alignItems: "center",
                gap: "12px",
                padding: "9px 10px",
                borderRadius: "var(--radius-control)",
                background: isLimiter ? "var(--color-elevated)" : "transparent",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: "12.5px", fontWeight: 500 }}>{r.label}</p>
                <p className="num" style={{ margin: "1px 0 0", fontSize: "10.5px", color: "var(--color-faint)" }}>
                  {r.reading}
                </p>
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: "11.5px",
                  lineHeight: 1.5,
                  color: "var(--color-faint)",
                  textWrap: "pretty",
                }}
              >
                {r.note}
              </p>

              {/* score bar, mirroring the one npm run analyze prints */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    flex: 1,
                    height: "5px",
                    background: "var(--color-elevated)",
                    borderRadius: "var(--radius-pill)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, r.subscore))}%`,
                      height: "5px",
                      background: tone,
                      borderRadius: "var(--radius-pill)",
                    }}
                  />
                </div>
                <span className="num" style={{ fontSize: "11.5px", color: tone, minWidth: "22px", textAlign: "end" }}>
                  {r.subscore}
                </span>
              </div>

              <span
                className="num"
                style={{ fontSize: "11px", color: "var(--color-faint)", textAlign: "end" }}
                title="How much this input counted toward the final score"
              >
                {r.weightPct}%
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBlockStart: "14px",
          borderBlockStart: "1px solid var(--color-line)",
          paddingBlockStart: "12px",
        }}
      >
        <p className="num" style={{ margin: 0, fontSize: "11.5px", color: "var(--color-muted)" }}>
          Weighted total &rarr; <span style={{ color: "var(--color-ink)" }}>{Math.round(score)}</span>
        </p>
        {narrative.limiter && (
          <p className="num" style={{ margin: 0, fontSize: "11px", color: "var(--color-caution)" }}>
            Held back most by:{" "}
            {narrative.reasoning.find((r) => r.component === narrative.limiter)?.label}
          </p>
        )}
      </div>

      {/* The honest caveat. It belongs on the screen, not only in the code. */}
      <p
        style={{
          margin: "12px 0 0",
          fontSize: "11px",
          lineHeight: 1.55,
          color: "var(--color-faint)",
          maxWidth: "84ch",
          textWrap: "pretty",
        }}
      >
        This score is a transparent combination of published training-load metrics. It has not
        been validated against injury or performance outcomes, and inputs with no data drop out
        rather than counting as zero. It is a starting point for a decision, not a verdict.
      </p>
    </section>
  );
}

"use client";

/**
 * "Ask Runi" — the panel that answers questions about the athlete's own data.
 *
 * ## Why this is a list of questions and not a text box
 *
 * A text box is a contract. Its shape says *ask me anything*, and the first
 * thing it cannot parse reads as broken rather than as ninety per cent covered
 * — and those failures cast doubt backwards over the answers that worked.
 *
 * So every affordance on this panel answers. The box at the top **filters these
 * questions**; it never accepts free text, and the list visibly shrinking as
 * you type is what makes that honest rather than hidden. You get the feel of
 * typing a question with none of the ways it can fail.
 *
 * This replaced a mocked chat that cycled canned replies and was never reachable
 * in the running product — `showChat` was `!isReal`, and both callers pass real
 * data. Where that panel implied an intelligence it did not have, this one
 * demonstrates the one it does.
 *
 * ## What it costs
 *
 * One fetch, on first open. An athlete who never opens the panel loads none of
 * it, and once it is open, moving between the ten questions is instant because
 * every answer is a pure function over data the browser already holds.
 */

import { useEffect, useMemo, useState } from "react";
import { getInsightData } from "@/actions/insights";
import { filterQuestions, questionById } from "@/lib/insights/questions";
import type { AnswerBar, InsightAnswer, InsightData, Tone } from "@/lib/insights/types";

const COPY = {
  tag: "Your data",
  title: "Ask Runi",
  close: "Close",
  filterPlaceholder: "Filter questions…",
  loading: "Reading your training…",
  noMatch: "No question matches that.",
  noMatchHint:
    "Runi answers a fixed set of questions from your own numbers. Clear the box to see all of them.",
  back: "All questions",
  footer: "Every figure is computed from your own runs. Nothing here is generated.",
  intro: "Pick a question. Each one is answered from your own runs.",
} as const;

const toneColor = (t: Tone): string =>
  t === "positive"
    ? "var(--color-positive)"
    : t === "caution"
      ? "var(--color-caution)"
      : t === "negative"
        ? "var(--color-negative)"
        : "var(--color-ink)";

/* ------------------------------------------------------------------ */
/* Bars                                                                */
/* ------------------------------------------------------------------ */

/**
 * A few bars read best lying down, many read best standing up.
 *
 * Two or four labelled quantities want their label, their bar and their figure
 * on one line. Fourteen days of a load ratio want to be a shape — putting a
 * caption on each would make a 380px column unreadable, and the shape is the
 * point.
 */
const HORIZONTAL_MAX = 5;

function Bars({
  bars, reference, baseline = "zero",
}: {
  bars: AnswerBar[];
  reference?: { value: number; label: string };
  baseline?: "zero" | "range";
}) {
  const values = bars.map((b) => (Number.isFinite(b.value) ? b.value : 0));
  const max = Math.max(...values, 0);
  if (max <= 0) return null;

  if (bars.length <= HORIZONTAL_MAX) {
    const lo = Math.min(...values);
    const base = baseline === "range" ? lo - (max - lo) * 0.35 : 0;
    const span = max - base || 1;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBlockStart: "14px" }}>
        {bars.map((b, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: "10px", alignItems: "center" }}>
            <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {b.label}
            </span>
            <span style={{ height: "8px", borderRadius: "var(--radius-pill)", background: "var(--color-elevated)", display: "block", overflow: "hidden" }}>
              <span
                style={{
                  display: "block",
                  height: "8px",
                  width: `${Math.max(4, ((b.value - base) / span) * 100)}%`,
                  borderRadius: "var(--radius-pill)",
                  background: b.tone ? toneColor(b.tone) : "var(--color-accent)",
                }}
              />
            </span>
            <span className="num" style={{ fontSize: "11px", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
              {b.caption}
            </span>
          </div>
        ))}
        {baseline === "range" ? (
          <p className="num" style={{ margin: "2px 0 0", fontSize: "9.5px", color: "var(--color-faint)" }}>
            Bar length compares these to each other, not to zero.
          </p>
        ) : null}
      </div>
    );
  }

  /*
   * A long series is scaled to its own range, not from zero.
   *
   * Fourteen days of a load ratio all sit between about 0.8 and 1.4. Drawn from
   * zero that is fourteen bars of the same height and the trend — the only
   * thing the chart is for — disappears. Scaled to the range it becomes a
   * shape, and the floor is printed beside it so nobody reads a short bar as
   * "nearly nothing".
   */
  const H = 56;
  const lo = Math.min(...values, reference ? reference.value : Infinity);
  const hi = Math.max(...values, reference ? reference.value : -Infinity);
  const pad = (hi - lo) * 0.12 || 0.1;
  const floor = lo - pad;
  const ceiling = hi + pad;
  const span = ceiling - floor || 1;
  const y = (v: number) => ((v - floor) / span) * H;

  return (
    <div style={{ marginBlockStart: "14px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
        <div style={{ position: "relative", flex: 1, height: `${H}px`, display: "flex", alignItems: "flex-end", gap: "3px" }}>
          {reference ? (
            <span
              aria-hidden
              style={{
                position: "absolute",
                insetInline: 0,
                bottom: `${y(reference.value)}px`,
                borderBlockStart: "1px dashed var(--color-negative)",
                opacity: 0.7,
              }}
            />
          ) : null}
          {bars.map((b, i) => (
            <span
              key={i}
              title={`${b.label} · ${b.caption}`}
              style={{
                flex: "1 1 0",
                height: `${Math.max(3, y(b.value))}px`,
                borderRadius: "2px 2px 0 0",
                background: b.tone ? toneColor(b.tone) : "var(--color-accent)",
                opacity: b.tone ? 1 : 0.75,
              }}
            />
          ))}
        </div>
        <div className="num" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: `${H}px`, fontSize: "9px", color: "var(--color-faint)", textAlign: "end" }}>
          <span>{ceiling.toFixed(2)}</span>
          <span>{floor.toFixed(2)}</span>
        </div>
      </div>
      <div className="num" style={{ display: "flex", justifyContent: "space-between", marginBlockStart: "5px", fontSize: "9.5px", color: "var(--color-faint)" }}>
        <span>{bars[0].label}</span>
        {reference ? (
          <span style={{ color: "var(--color-negative)" }}>{`--- ${reference.label} ${reference.value.toFixed(2)}`}</span>
        ) : null}
        <span>{bars[bars.length - 1].label}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One answer                                                          */
/* ------------------------------------------------------------------ */

function Answer({ answer }: { answer: InsightAnswer }) {
  return (
    <div>
      <p
        style={{
          margin: 0,
          fontSize: "15px",
          fontWeight: 600,
          lineHeight: 1.45,
          textWrap: "pretty",
          color: answer.insufficient ? "var(--color-muted)" : toneColor(answer.tone),
        }}
      >
        {answer.headline}
      </p>

      {answer.detail ? (
        <p style={{ margin: "8px 0 0", fontSize: "12.5px", lineHeight: 1.6, color: "var(--color-muted)", textWrap: "pretty" }}>
          {answer.detail}
        </p>
      ) : null}

      {answer.rows.length > 0 ? (
        <div style={{ marginBlockStart: "14px", display: "flex", flexDirection: "column" }}>
          {answer.rows.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "12px",
                padding: "7px 0",
                borderBlockStart: i === 0 ? "none" : "1px solid var(--color-line)",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{r.label}</span>
              <span className="num" style={{ fontSize: "12.5px", fontWeight: 500, whiteSpace: "nowrap", color: toneColor(r.tone ?? null) }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {answer.bars && answer.bars.length > 0 ? <Bars bars={answer.bars} reference={answer.reference} baseline={answer.baseline} /> : null}

      {answer.caveat ? (
        <p
          style={{
            margin: "16px 0 0",
            paddingBlockStart: "12px",
            borderBlockStart: "1px solid var(--color-line)",
            fontSize: "11px",
            lineHeight: 1.6,
            color: "var(--color-faint)",
            textWrap: "pretty",
          }}
        >
          {answer.caveat}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

export function InsightsPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<InsightData | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  /*
   * Fetched here rather than by the page, because the page must not pay for a
   * panel most visits never open. One request, on mount, and the ten answers
   * come out of it without another.
   */
  useEffect(() => {
    let live = true;
    getInsightData()
      .then((d) => {
        if (live) setData(d);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  // Escape closes, the same as the button — a panel over the page that traps
  // you until you find its X is a panel people stop opening.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => filterQuestions(query), [query]);
  const open = openId ? questionById(openId) : null;
  const answer = open && data ? open.answer(data) : null;

  return (
    <aside
      style={{
        position: "fixed",
        insetBlock: 0,
        insetInlineEnd: 0,
        width: "min(380px,100vw)",
        background: "var(--color-surface)",
        borderInlineStart: "1px solid var(--color-line)",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        boxShadow: "0 0 48px rgba(0,0,0,.6)",
      }}
      aria-label="Ask Runi about your data"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBlockEnd: "1px solid var(--color-line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>{COPY.tag}</span>
          <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{COPY.title}</h2>
        </div>
        <button className="btn btn-secondary" type="button" onClick={onClose} style={{ padding: "5px 9px" }} aria-label={COPY.close}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
        {failed ? (
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--color-muted)", lineHeight: 1.6 }}>
            Could not read your training just now. Close this and try again.
          </p>
        ) : !data ? (
          <p className="num" style={{ margin: 0, fontSize: "12px", color: "var(--color-faint)" }}>{COPY.loading}</p>
        ) : open && answer ? (
          <>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setOpenId(null)}
              style={{ padding: "5px 10px", fontSize: "11.5px", display: "inline-flex", alignItems: "center", gap: "6px", marginBlockEnd: "14px" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              {COPY.back}
            </button>
            <p style={{ margin: "0 0 10px", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-faint)" }}>
              {open.label}
            </p>
            <Answer answer={answer} />
          </>
        ) : (
          <>
            {/*
              `.field` rather than a hand-rolled input, so this box focuses and
              sits the same as every other field in the product — and
              `box-sizing` explicitly, because `.field` is `width: 100%` with
              padding and a border, which overflows its 18px gutter without it.
            */}
            <input
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={COPY.filterPlaceholder}
              aria-label={COPY.filterPlaceholder}
              style={{ boxSizing: "border-box" }}
            />
            <p style={{ margin: "10px 0 12px", fontSize: "11.5px", color: "var(--color-faint)", lineHeight: 1.6 }}>
              {COPY.intro}
            </p>

            {shown.length === 0 ? (
              <div>
                <p style={{ margin: 0, fontSize: "12.5px", color: "var(--color-ink)" }}>{COPY.noMatch}</p>
                <p style={{ margin: "6px 0 0", fontSize: "11.5px", color: "var(--color-faint)", lineHeight: 1.6, textWrap: "pretty" }}>
                  {COPY.noMatchHint}
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {shown.map((q) => (
                  <button
                    key={q.id}
                    className="dc-hover-bg"
                    type="button"
                    onClick={() => setOpenId(q.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      textAlign: "start",
                      width: "100%",
                      border: "none",
                      background: "transparent",
                      color: "var(--color-ink)",
                      font: "400 12.5px 'IBM Plex Sans',sans-serif",
                      lineHeight: 1.5,
                      padding: "10px 10px",
                      borderRadius: "var(--radius-control)",
                      cursor: "pointer",
                    }}
                  >
                    {q.label}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <p style={{ margin: 0, padding: "12px 18px", borderBlockStart: "1px solid var(--color-line)", fontSize: "10.5px", lineHeight: 1.6, color: "var(--color-faint)", textWrap: "pretty" }}>
        {COPY.footer}
      </p>
    </aside>
  );
}

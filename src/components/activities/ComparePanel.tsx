"use client";

/**
 * Two or three of the athlete's own runs, laid over each other.
 *
 * ## Why one chart and not three
 *
 * Side by side, the eye has to travel and compare shapes from memory, and a
 * difference of ten seconds a kilometre disappears in the journey. Overlaid,
 * the difference is the picture: the gap between the lines *is* the finding.
 * It is also the only arrangement that still works at three runs, where three
 * small charts would each be too small to read.
 *
 * ## The x axis is the run, not the clock
 *
 * Every curve is stretched onto the same axis — nought to one, start to
 * finish. An 8 km run and a 10 km one do not line up on time or on distance,
 * but they do line up on *how far through* they are, and that is what makes
 * "you faded in the last third, both times" a thing the athlete can see.
 *
 * ## The same chart, not a chart like it
 *
 * This does not imitate the analysis chart's look — it uses its geometry.
 * {@link VIEW}, {@link X0}, {@link X1}, the band top and bottom, the axis
 * rows and {@link layoutBands} are all imported, so the plot area, the
 * gutters, the inset and the value-to-pixel mapping are the same code that
 * draws a single run. The pace line keeps `--color-pace`, the colour it has
 * on that chart, so moving between the two screens the athlete is following
 * the same green line.
 *
 * What differs is only what has to: the x axis measures the fraction of the
 * run completed rather than kilometres, and there are two or three pace lines
 * where the analysis chart has one pace line and four other bands.
 */

import { useState } from "react";
import {
  VIEW, X0, X1, BAND_TOP, BAND_BOTTOM, AXIS_KM_Y, AXIS_TIME_Y, layoutBands,
} from "@/lib/activity/chartLayout";
import { compareSplits, type RunComparison } from "@/lib/activity/compareRuns";
import { formatPace } from "@/lib/format/pace";

/** Fractions of the run that get a vertical gridline, as the km ticks do. */
const X_TICKS = Array.from({ length: 21 }, (_, i) => i / 20);
/** Which of those carry a label and the heavier line — the km row's `major`. */
const MAJOR = new Set([0, 0.25, 0.5, 0.75, 1]);

/**
 * The subject keeps the pace colour it has on the analysis chart; the runs it
 * is measured against take the two neutrals the fitness chart uses for its
 * second and third series. Weight alone was not enough once they crossed.
 */
const SERIES = [
  { stroke: "var(--color-pace)", width: 1.8, dash: undefined },
  { stroke: "var(--color-atl)", width: 1.4, dash: undefined },
  { stroke: "var(--color-tsb)", width: 1.4, dash: "5 4" },
];

const MONO = "var(--font-mono)";

export function ComparePanel({
  comparison,
  onClose,
  copy,
}: {
  comparison: RunComparison;
  onClose: () => void;
  copy: {
    title: string; close: string; efficiency: string; noShape: string;
    axisStart: string; axisFinish: string; deltaLabel: string;
    axisRun: string; axisDist: string; bandTitle: string;
    hint: string; splitsBest: string; bandHr: string;
  };
}) {
  const { runs, paceRange, hrRange, points, verdict } = comparison;
  const [hover, setHover] = useState<number | null>(null);

  const hasShape = runs.some((r) => r.curve.some((v) => v !== null));
  const drawable = hasShape && paceRange !== null;

  /*
   * One or two bands, laid out by the same function that lays out five on the
   * analysis chart. A little padding on each range so the extreme points are
   * not drawn against the band's own edges.
   *
   * The heart-rate lane appears only when at least one of these runs has an
   * `hr_shape` — which, since migration 0018, means most of them will and the
   * older ones will once they re-derive. Half a chart is better than a lane
   * of flat lines pretending to be a measurement.
   */
  const pad = drawable ? Math.max(4, (paceRange.slow - paceRange.fast) * 0.08) : 0;
  const bands = drawable
    ? layoutBands([
        { id: "pace", lo: paceRange.fast - pad, hi: paceRange.slow + pad, inverted: true },
        ...(hrRange
          ? [{ id: "hr" as const, lo: hrRange.low - 4, hi: hrRange.high + 4 }]
          : []),
      ])
    : [];
  const band = bands.find((b) => b.id === "pace");

  /**
   * The two lanes, each knowing which curve it draws and how to write a value.
   *
   * Written as data rather than as two copies of the drawing code, because the
   * fills, the lines, the gutter figures and the crosshair dots all have to
   * agree about which curve belongs to which lane — and four places that each
   * decide that for themselves is four places to get it wrong.
   */
  const lanes = bands.map((b) => ({
    band: b,
    title: b.id === "hr" ? copy.bandHr : copy.bandTitle,
    curve: (r: (typeof runs)[number]) => (b.id === "hr" ? r.hrCurve : r.curve),
    format: (v: number) => (b.id === "hr" ? String(Math.round(v)) : formatPace(v)),
  }));

  const x = (i: number) => X0 + (i / (points - 1)) * (X1 - X0);
  const tickX = (t: number) => X0 + t * (X1 - X0);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VIEW.W;
    if (px < X0 || px > X1) return setHover(null);
    setHover(Math.round(((px - X0) / (X1 - X0)) * (points - 1)));
  };

  const hx = hover !== null ? x(hover) : 0;
  const subjectAt = hover !== null ? runs[0].curve[hover] : null;
  const subjectKm = runs[0].distanceM / 1000;
  const splits = compareSplits(comparison);

  /**
   * Every run's curve closed into an area, for the wash beneath it — in every
   * lane, not just the pace one.
   *
   * One per run rather than only the subject: on the analysis chart every
   * series carries its own fill, and filling only the leading line made the
   * other two read as annotations on it rather than as runs in their own
   * right. They are translucent and every line is drawn after every fill, so
   * the washes layer into depth instead of hiding each other.
   */
  const areaFor = (
    b: (typeof bands)[number],
    curve: (number | null)[],
  ): string => {
    let d = "";
    let open = false;
    let first: number | null = null;
    let last = X0;
    curve.forEach((v, j) => {
      if (v === null || !Number.isFinite(v)) { open = false; return; }
      if (first === null) first = x(j);
      last = x(j);
      d += `${open ? "L" : "M"}${x(j).toFixed(1)} ${b.y(v).toFixed(1)}`;
      open = true;
    });
    if (!d || first === null) return "";
    return `${d}L${last.toFixed(1)} ${b.plotBottom}L${(first as number).toFixed(1)} ${b.plotBottom}Z`;
  };

  const lineFor = (
    b: (typeof bands)[number],
    curve: (number | null)[],
  ): string => {
    let d = "";
    let open = false;
    curve.forEach((v, j) => {
      if (v === null || !Number.isFinite(v)) {
        // Lift the pen across a gap rather than drawing a line through data
        // that is not there.
        open = false;
        return;
      }
      d += `${open ? "L" : "M"}${x(j).toFixed(1)} ${b.y(v).toFixed(1)}`;
      open = true;
    });
    return d;
  };

  return (
    <div
      className="card"
      style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "10px" }}
    >
      {/* The analysis chart's header, to the letter: bold title, faint hint
          telling the reader what the axis does and what it responds to. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{copy.title}</h2>
        <div style={{ display: "flex", alignItems: "baseline", gap: "14px", marginInlineStart: "auto" }}>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--color-faint)" }}>{copy.hint}</p>
          <button
            className="btn btn-secondary" type="button" onClick={onClose}
            style={{ padding: "5px 11px", fontSize: "11.5px", flexShrink: 0 }}
          >
            {copy.close}
          </button>
        </div>
      </div>

      {verdict ? (
        <p style={{ margin: 0, fontSize: "12.5px", color: "var(--color-ink)", lineHeight: 1.55 }}>
          {verdict}
        </p>
      ) : null}

      {band ? (
        <>
        {/*
            The comparison's answer to the kilometre strip above the analysis
            chart: the run in quarters, each showing what the subject ran and
            how much that beat the others by. Aligned to the plot's gutters so
            a column sits over the stretch it describes.

            Quarters rather than kilometres because the axis is fractions of
            the run — two runs of different lengths share a quarter, and do
            not share a fourth kilometre in any meaningful way.
        */}
        <div style={{
          display: "flex", marginBlockStart: "12px",
          paddingInlineStart: `${(X0 / VIEW.W) * 100}%`,
          paddingInlineEnd: `${((VIEW.W - X1) / VIEW.W) * 100}%`,
        }}>
          {splits.parts.map((part, i) => {
            const best = i === splits.bestIndex;
            return (
              <div
                key={part.label}
                style={{
                  width: `${100 / splits.parts.length}%`,
                  minWidth: 0,
                  padding: "6px 2px",
                  textAlign: "center",
                  background: best ? "var(--color-accent-soft)" : "transparent",
                  borderBlockStart: `2px solid ${best ? "var(--color-accent)" : "var(--color-line-strong)"}`,
                  borderInlineEnd: i === splits.parts.length - 1 ? "none" : "1px solid var(--color-line)",
                }}
              >
                <p className="num" style={{ margin: 0, fontSize: "9.5px", color: "var(--color-faint)" }}>
                  {best ? `${part.label} \u00b7 ${copy.splitsBest}` : part.label}
                </p>
                <p className="num" style={{
                  margin: "1px 0 0", fontSize: "11.5px", fontWeight: 600,
                  color: best ? "var(--color-accent)" : "var(--color-ink)",
                }}>
                  {part.paces[0] !== null ? formatPace(part.paces[0]) : "—"}
                </p>
                {part.beats[0] !== null ? (
                  <p className="num" style={{ margin: "1px 0 0", fontSize: "9.5px", color: "var(--color-hr)" }}>
                    {Math.round(part.beats[0] as number)}bpm
                  </p>
                ) : null}
                {part.paces.slice(1).map((v, k) => {
                  const style = SERIES[k + 1] ?? SERIES[SERIES.length - 1];
                  const d = v !== null && part.paces[0] !== null ? (part.paces[0] as number) - v : null;
                  return (
                    <p key={k} className="num" style={{ margin: "1px 0 0", fontSize: "9.5px", color: style.stroke }}>
                      {d === null ? "—" : `${d < 0 ? "\u2212" : "+"}${Math.abs(Math.round(d))}s`}
                    </p>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ position: "relative", marginBlockStart: "6px" }}>
          <svg
            viewBox={`0 0 ${VIEW.W} ${VIEW.H}`}
            style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair", userSelect: "none" }}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            {/* vertical gridlines, the km row's two weights */}
            {X_TICKS.map((t) => (
              <line
                key={`g${t}`} x1={tickX(t)} x2={tickX(t)} y1={BAND_TOP} y2={BAND_BOTTOM}
                stroke="var(--color-line)" strokeWidth={MAJOR.has(t) ? 0.9 : 0.5}
              />
            ))}

            {/* alternating lane backgrounds, so two lanes read as two */}
            {bands.map((bd, i) => (
              <rect
                key={`bg-${bd.id}`}
                x={X0} y={bd.top} width={X1 - X0} height={bd.bottom - bd.top}
                fill={i % 2 ? "var(--color-elevated)" : "transparent"} opacity="0.45"
              />
            ))}

            {lanes.map(({ band: bd, title, curve, format }) => (
              <g key={bd.id}>
                {/*
                    Every wash, drawn before every line in this lane.

                    The analysis chart fills each series at 0.16, and dropping
                    the fill entirely was what made this chart look thinner
                    than that one. Fills are their own pass rather than being
                    drawn with their line, so no wash can ever cover a curve —
                    which is what went wrong the first time a fill was tried
                    here.

                    Lighter than 0.16, and lighter again because three of them
                    stack: there a fill covers a fifth of the height, here
                    each covers a whole lane, and at 0.16 the plot reads as an
                    area chart rather than as three runs with texture under
                    them.
                */}
                {[...runs].map((r, i) => ({ r, i })).reverse().map(({ r, i }) => {
                  const d = areaFor(bd, curve(r));
                  return d ? (
                    <path
                      key={`a-${r.id}`} d={d}
                      fill={(SERIES[i] ?? SERIES[SERIES.length - 1]).stroke}
                      opacity="0.06"
                    />
                  ) : null;
                })}

                {/* the series, newest drawn last so it sits on top */}
                {[...runs].map((r, i) => ({ r, i })).reverse().map(({ r, i }) => {
                  const style = SERIES[i] ?? SERIES[SERIES.length - 1];
                  return (
                    <path
                      key={r.id} d={lineFor(bd, curve(r))} fill="none"
                      stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash}
                    />
                  );
                })}

                {/* the lane's name inside it, and three figures in the gutter */}
                <text
                  x={X0 + 6} y={bd.top + 12} fill={bd.color}
                  fontSize="9.5" fontFamily={MONO} opacity="0.75"
                >
                  {title}
                </text>
                {/*
                    Top and middle for every lane; the floor only on the last.
                    Two lanes sit a few pixels apart, so one lane's bottom
                    figure and the next one's top figure land on the same line
                    and overprint — the analysis chart hit this first.
                */}
                {(bd === bands[bands.length - 1] ? [0, 0.5, 1] : [0, 0.5]).map((f) => {
                  const py = bd.plotTop + f * (bd.plotBottom - bd.plotTop);
                  return (
                    <text
                      key={f} x={X0 - 5} y={py} textAnchor="end" dominantBaseline="middle"
                      fill={f === 0.5 ? bd.color : "var(--color-faint)"}
                      fontSize={f === 0.5 ? "10" : "8.5"} fontFamily={MONO}
                    >
                      {format(bd.valueAt(py))}
                    </text>
                  );
                })}
              </g>
            ))}

            {/*
                Two x-axis rows, as on the analysis chart: how far through the
                run, and how far that is in kilometres.

                The unit sits in the last label rather than in a caption past
                X1. The analysis chart can put one there because its final
                kilometre tick rarely lands on the plot's right edge; here the
                last tick always does, and the caption printed straight over
                it.
            */}
            {X_TICKS.filter((t) => MAJOR.has(t)).map((t) => (
              <text
                key={`x${t}`} x={t === 1 ? X1 : tickX(t)} y={AXIS_KM_Y}
                textAnchor={t === 1 ? "end" : t === 0 ? "start" : "middle"}
                fill="var(--color-faint)" fontSize="9" fontFamily={MONO}
              >
                {t === 0 ? copy.axisStart : t === 1 ? copy.axisFinish : `${Math.round(t * 100)}% ${copy.axisRun}`}
              </text>
            ))}
            {X_TICKS.filter((t) => MAJOR.has(t)).map((t) => (
              <text
                key={`d${t}`} x={t === 1 ? X1 : tickX(t)} y={AXIS_TIME_Y}
                textAnchor={t === 1 ? "end" : t === 0 ? "start" : "middle"}
                fill="var(--color-faint)" fontSize="9" fontFamily={MONO}
              >
                {(subjectKm * t).toFixed(1)}{t === 1 ? ` ${copy.axisDist}` : ""}
              </text>
            ))}

            {/* crosshair */}
            {hover !== null ? (
              <g>
                <line
                  x1={hx} x2={hx} y1={BAND_TOP} y2={BAND_BOTTOM}
                  stroke="var(--color-faint)" strokeWidth="1" strokeDasharray="3 3"
                />
                {lanes.flatMap(({ band: bd, curve }) =>
                  runs.map((r, i) => {
                    const v = curve(r)[hover];
                    if (v === null || !Number.isFinite(v)) return null;
                    const style = SERIES[i] ?? SERIES[SERIES.length - 1];
                    return (
                      <circle key={`${bd.id}-${r.id}`} cx={hx} cy={bd.y(v)} r="2.6" fill={style.stroke} />
                    );
                  }),
                )}
                <rect
                  x={Math.min(X1 - 76, Math.max(X0, hx - 38))} y={AXIS_KM_Y - 11}
                  width="76" height="15" rx="3" fill="var(--color-accent)"
                />
                <text
                  x={Math.min(X1 - 38, Math.max(X0 + 38, hx))} y={AXIS_KM_Y - 3} textAnchor="middle"
                  fill="var(--color-accent-ink)" fontSize="9" fontFamily={MONO}
                >
                  {Math.round((hover / (points - 1)) * 100)}% · {(subjectKm * (hover / (points - 1))).toFixed(1)} km
                </text>
              </g>
            ) : null}
          </svg>

          {hover !== null ? (
            <div
              className="num"
              style={{
                position: "absolute", top: "8px",
                left: `${(hx / VIEW.W) * 100}%`,
                transform: hx > VIEW.W * 0.72 ? "translateX(-112%)" : "translateX(14px)",
                background: "var(--color-elevated)", border: "1px solid var(--color-line-strong)",
                borderRadius: "var(--radius-control)", padding: "8px 12px", fontSize: "11px",
                pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,.5)",
                display: "grid", gridTemplateColumns: "auto auto auto auto", gap: "3px 12px",
              }}
            >
              {runs.map((r, i) => {
                const v = r.curve[hover];
                const hr = r.hrCurve[hover];
                const style = SERIES[i] ?? SERIES[SERIES.length - 1];
                // The number the athlete came for is the gap, not the two paces.
                const delta =
                  i > 0 && v !== null && subjectAt !== null && Number.isFinite(v)
                    ? subjectAt - v
                    : null;
                return (
                  <div key={r.id} style={{ display: "contents" }}>
                    <span style={{ color: style.stroke }}>{r.label ?? r.date}</span>
                    <span style={{ color: "var(--color-ink)", textAlign: "end" }}>
                      {v !== null && Number.isFinite(v) ? `${formatPace(v)}/km` : "—"}
                    </span>
                    {/* Beside the pace, because "how fast" and "at what cost"
                        are one reading, not two. */}
                    <span style={{ color: "var(--color-hr)", textAlign: "end" }}>
                      {hr !== null && Number.isFinite(hr) ? `${Math.round(hr)}bpm` : "—"}
                    </span>
                    <span
                      style={{
                        textAlign: "end",
                        color:
                          delta === null ? "var(--color-faint)"
                          : delta < 0 ? "var(--color-positive)"
                          : "var(--color-caution)",
                      }}
                    >
                      {delta === null
                        ? i === 0 ? copy.deltaLabel : "—"
                        : `${delta < 0 ? "−" : "+"}${Math.abs(Math.round(delta))}s`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: "12px", color: "var(--color-faint)" }}>{copy.noShape}</p>
      )}

      {/*
          The key.
          
          Its whole job is to answer "which line is which run", so the date
          carries the line's own colour and its own weight rather than sitting
          in the same muted grey as the figures beside it. The swatch repeats
          the stroke width and dash pattern exactly, so a dashed line in the
          plot is a dashed line here.
      */}
      <div style={{
        display: "flex", flexDirection: "column", gap: "2px",
        marginBlockStart: "4px", paddingBlockStart: "10px",
        borderBlockStart: "1px solid var(--color-line)",
      }}>
        {runs.map((r, i) => {
          const style = SERIES[i] ?? SERIES[SERIES.length - 1];
          return (
            <div
              key={r.id}
              className="num"
              style={{
                display: "grid",
                gridTemplateColumns: "34px 92px 82px 92px 1fr",
                gap: "12px",
                alignItems: "center",
                fontSize: "11.5px",
                color: "var(--color-muted)",
                padding: "5px 6px",
                borderRadius: "var(--radius-control)",
                background: i === 0 ? "var(--color-elevated)" : "transparent",
              }}
            >
              <svg width="34" height="10" aria-hidden style={{ overflow: "visible" }}>
                <line
                  x1="0" x2="34" y1="5" y2="5"
                  stroke={style.stroke} strokeWidth={style.width + 0.8}
                  strokeDasharray={style.dash} strokeLinecap="round"
                />
              </svg>
              <span style={{ color: style.stroke, fontSize: "12.5px", fontWeight: 600, letterSpacing: ".01em" }}>
                {r.label ?? r.date}
              </span>
              <span style={{ color: "var(--color-ink)" }}>{(r.distanceM / 1000).toFixed(1)} km</span>
              <span>{formatPace(r.paceSec)}/km</span>
              <span>
                {r.avgHr !== null ? `${r.avgHr} bpm` : "—"}
                {r.efficiency !== null ? (
                  <span style={{ color: "var(--color-faint)" }}>
                    {" · "}{copy.efficiency} {r.efficiency.toFixed(0)}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

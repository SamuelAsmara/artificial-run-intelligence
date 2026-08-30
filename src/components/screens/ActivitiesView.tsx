"use client";

/**
 * Activities — a 1:1 port of
 * design_handoff_ari_athlete_app/ARI Activities.dc.html.
 * Markup converted mechanically; do not restyle by hand.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import { ACT_COPY, buildActivities, fmtPace, type Act, type PacePoint } from "@/lib/screens/activities";
import { ComparePanel } from "@/components/activities/ComparePanel";
import { MAX_RUNS, compareRuns, similarRuns, type ComparableRun } from "@/lib/activity/compareRuns";
import { Entrance, BrandMark, MiniBars, SectionHeader, StatTile, STAT_ICONS, FilterChip, ActionChip, CHIP_ICONS } from "@/components/ui";

export function ActivitiesView({
  data,
}: {
  data?: {
    acts: Act[];
    weekKm: number[];
    wp: PacePoint[];
    pb10k?: string | null;
    avgHr?: number | null;
    /**
     * The four-week summary, computed on the server over the window the label
     * promises. The view used to derive these from `acts`, which is every run
     * that was fetched — a row limit, not a date range.
     */
    summary?: { runs: number; totalKm: number; avgPaceSec: number | null };
    /** the same runs, in the shape the comparison engine reads */
    compare?: ComparableRun[];
  };
} = {}) {
  // Real runs when the athlete has them; the reference set otherwise.
  const { acts, weekKm, wp } = useMemo(
    () => data ?? buildActivities(),
    [data],
  );
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(0);

  /** how many runs one page of the history holds */
  const PAGE_SIZE = 15;

  // A filter change is a new list, so it starts at its own beginning.
  const pickFilter = (name: string) => {
    setFilter(name);
    setPage(0);
  };

  /*
   * Comparing runs.
   *
   * A mode rather than a separate screen: the athlete is already looking at
   * the list they want to pick from, and sending them somewhere else to pick
   * again would be work the app made up. Rows keep their markup and their
   * href — in compare mode the click is intercepted instead of followed, so
   * nothing about the list moves when the mode turns on.
   */
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const comparable = data?.compare ?? [];
  const byId = useMemo(
    () => new Map(comparable.map((r) => [r.id, r])),
    [comparable],
  );

  const toggle = (id?: string) => {
    if (!id) return;
    setPicked((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        // At the cap the earliest pick steps aside. Silently ignoring the
        // click would look like the row was broken.
        : cur.length >= MAX_RUNS
          ? [...cur.slice(1), id]
          : [...cur, id],
    );
  };

  /*
   * Runs worth putting next to the one already picked.
   *
   * Offered rather than applied: hunting sixty rows for a run of the same
   * kind and the same distance is work the app can do, but which runs to
   * compare is still the athlete's question. The button only appears when
   * there is something to offer, so it never leads to an empty answer.
   */
  const autoCandidates = useMemo(() => {
    if (!comparing || picked.length !== 1) return [];
    const subject = byId.get(picked[0]);
    return subject ? similarRuns(subject, comparable) : [];
  }, [comparing, picked, byId, comparable]);

  const comparison = useMemo(() => {
    if (!comparing || picked.length < 2) return null;
    const runs = picked
      .map((id) => byId.get(id))
      .filter((r): r is ComparableRun => Boolean(r))
      // Newest first: the subject of the comparison is the run the athlete is
      // asking about, and it gets the accent line.
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    return compareRuns(runs);
  }, [comparing, picked, byId]);


  const copy = ACT_COPY;
  const typeMap: Record<string, string | null> = {
    All: null, Easy: "easy", Tempo: "tempo", Intervals: "int", Long: "long",
  };
  const dot: Record<string, string> = {
    easy: "var(--color-positive)", tempo: "var(--color-caution)",
    int: "var(--color-accent)", long: "var(--color-atl)",
  };

  /*
   * The list, one page at a time.
   *
   * It used to render every matching run. With a month of demo data that is
   * eighteen rows and looks fine; with a real athlete's history it is several
   * hundred, the page never ends, and finding last Tuesday means scrolling past
   * two years. Fifteen is a screenful.
   */
  const matching = acts.filter((a) => !typeMap[filter] || a.type === typeMap[filter]);
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  // Changing the filter can leave the cursor past the end of the shorter list,
  // which would show an empty page rather than the first one.
  const pageIndex = Math.min(page, pageCount - 1);
  const from = pageIndex * PAGE_SIZE;

  const rows = matching
    .slice(from, from + PAGE_SIZE)
    .map((a) => ({
      ...a,
      dot: dot[a.type],
      sel: comparing && Boolean(a.id) && picked.includes(a.id as string),
      onPick: comparing
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            toggle(a.id);
          }
        : undefined,
    }));

  // Filters are membership, so the kit's pill carries them. Their colours used
  // to be spelled out here; the chip owns them now, and owning them in one
  // place is what keeps an active filter from looking like an armed action.
  const filters = ["All", "Easy", "Tempo", "Intervals", "Long"].map((n) => ({
    name: n,
    pick: () => pickFilter(n),
    active: filter === n,
  }));

  const totalKm = acts.reduce((s, a) => s + a.kmN, 0);
  const totalRuns = acts.length;
  // Distance-weighted, and only meaningful if some distance was covered — a
  // list of manually-entered runs with no distance would divide by zero and
  // print "NaN:NaN", because fmtPace has no finite guard.
  const avgPace = totalKm > 0 ? acts.reduce((s, a) => s + a.paceSec * a.kmN, 0) / totalKm : null;
  /*
   * Heart rate is computed on the server now, over the runs that have one.
   * It used to be `+a.hr` over every row — and `a.hr` is the *display* string,
   * an em dash when there is no strap, so `+"—"` is NaN and one strapless run
   * made the tile read "NaN bpm".
   */
  /*
   * `a.hr` is a *display* string and is an em dash when no strap was worn, so
   * `Number(a.hr)` is NaN and one strapless run poisoned the whole tile. The
   * reference branch now averages only the rows that parse, and reports
   * nothing rather than a number when none do.
   */
  const avgHr = data
    ? (data.avgHr ?? null)
    : (() => {
        const vals = acts.map((a) => Number(a.hr)).filter((v) => Number.isFinite(v));
        return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
      })();

  /*
   * The stats row, on the kit's stat tile. `v: null` is the honest reading when
   * there is nothing to average — the tile draws an em dash. It must never be a
   * zero, which an athlete would read as "I ran at 0:00/km".
   */
  /*
   * Prefer the server's windowed summary.
   *
   * The local reduce over `acts` is what made the tiles disagree with the bar
   * chart beside them: `acts` is every run that was fetched, and the label says
   * four weeks. It stays only for the reference render, which has no server.
   */
  const shownRuns = data?.summary?.runs ?? totalRuns;
  const shownKm = data?.summary?.totalKm ?? totalKm;
  const shownPace = data?.summary ? data.summary.avgPaceSec : avgPace;

  const stats: { v: string | null; unit?: string; name: string; icon: string }[] = [
    { v: String(shownRuns), unit: "runs", name: "Completed · 4 weeks", icon: STAT_ICONS.distance },
    { v: Math.round(shownKm) + "", unit: "km", name: "Total distance", icon: STAT_ICONS.chart },
    { v: shownPace === null ? null : fmtPace(shownPace), unit: "/km", name: "Average pace", icon: STAT_ICONS.clock },
    { v: avgHr === null || !Number.isFinite(avgHr) ? null : String(avgHr), unit: "bpm", name: "Average heart rate", icon: STAT_ICONS.pulse },
    // The athlete's own 10 km best, from the same source the dashboard reads.
    // It used to be the string "47:12", which is how one screen came to show a
    // different record from the other.
    { v: data ? (data.pb10k ?? null) : "47:12", name: "10K personal best", icon: STAT_ICONS.trophy },
  ];

  /*
   * `Math.max()` of four zeroes is 0, and `k / 0` is NaN — which reached the
   * DOM as `height: NaNpx`, an invalid declaration the browser drops, so all
   * four bars simply vanished and left an empty 90px box. An athlete with
   * imported history who has not run for five weeks saw exactly that.
   */
  // The bars come from the shared kit now: a soft vertical fade with a track
  // behind it, the best completed week glowing, and the week still being run
  // drawn as a dashed outline rather than a short solid block — so a Tuesday
  // cannot be misread as a bad week.
  const volBars = weekKm.map((k, i) => ({
    value: k,
    label: i === weekKm.length - 1 ? "now" : "W" + (i + 1),
    current: i === weekKm.length - 1,
  }));

  /*
   * Pace trend — lower is faster, so the y axis is not inverted here: the chart
   * plots seconds/km directly and the caption says "faster ↑".
   *
   * The range used to be the constants 320 and 344 — the prototype athlete's
   * easy-run band. A real athlete running 4:55/km sits at 295, well off the top
   * of a 320–344 window, so every point clipped to the edge and the line came
   * out as a jagged block. The range is now read from the data with a little
   * padding, and clamped so one bad point cannot flatten the rest.
   */
  /*
   * Two or more weeks, or no chart.
   *
   * With fewer the code used to draw a flat line at the median pace of *all*
   * runs and label it "Easy-run pace trend · weekly average" — a number the
   * athlete never ran, presented as a trend. A sentence saying there is not
   * enough history yet is worth more and claims nothing.
   */
  const hasPaceTrend = wp.length >= 2;
  const values = wp.map((p) => p.v);
  const pLo = hasPaceTrend ? Math.min(...values) : 0;
  const pHi = hasPaceTrend ? Math.max(...values) : 0;
  const pPad = Math.max(6, (pHi - pLo) * 0.25);
  const pMin = Math.floor((pLo - pPad) / 5) * 5;
  const pMax = Math.ceil((pHi + pPad) / 5) * 5;
  const X0 = 34, X1 = 536, Y0 = 10, Y1 = 82;
  // Positioned by week, not by index — see PacePoint.
  const px = (t: number) => X0 + Math.max(0, Math.min(1, t)) * (X1 - X0);
  const py = (v: number) => {
    const t = (v - pMin) / (pMax - pMin || 1);
    return Y0 + Math.max(0, Math.min(1, t)) * (Y1 - Y0);
  };
  const pacePath = wp
    .map((p, i) => (i ? "L" : "M") + px(p.t).toFixed(1) + " " + py(p.v).toFixed(1))
    .join("");
  const firstX = wp.length ? px(wp[0].t).toFixed(1) : String(X0);
  const lastX = wp.length ? px(wp[wp.length - 1].t).toFixed(1) : String(X1);
  const paceArea = pacePath + "L" + lastX + " " + Y1 + "L" + firstX + " " + Y1 + "Z";
  const paceDots = wp.map((p) => ({ x: px(p.t).toFixed(1), y: py(p.v).toFixed(1) }));
  // Two gridlines inside the range we actually drew, rather than 325 and 340.
  const paceGrid = [pMin + (pMax - pMin) / 3, pMin + ((pMax - pMin) * 2) / 3].map((v) => ({
    y: py(v).toFixed(1), ty: (py(v) + 3).toFixed(1), label: fmtPace(Math.round(v)),
  }));

  return (
<div data-entrance-root style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance /><header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><BrandMark /><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span></div><div style={{ textAlign: "start" }}><h1 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{copy.title}</h1><p style={{ margin: "0", fontSize: "11.5px", color: "var(--color-muted)" }}>{copy.subtitle}</p></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}><a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a><a href="/plan" style={{ color: "var(--color-muted)" }}>{copy.navPlan}</a><a href="/activities" style={{ color: "var(--color-ink)" }}>{copy.navActivities}</a><a href="/settings" style={{ color: "var(--color-muted)" }}>{copy.navSettings}</a></nav><div style={{ flex: "1" }}></div></header><section className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "12px" }}>{stats.map((s, _i1) => (<React.Fragment key={_i1}><StatTile value={s.v} unit={s.unit} label={s.name} icon={s.icon} /></React.Fragment>))}</section><section className="grid2"><div className="card" style={{ padding: "16px 20px" }}><SectionHeader title={copy.volTitle} hint="last 4 weeks · km" /><div style={{ marginBlockStart: "10px" }}><MiniBars data={volBars} idPrefix="actvol" ariaLabel="Weekly distance, last four weeks" /></div></div><div className="card" style={{ padding: "16px 20px" }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><h2 style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>{copy.paceTitle}</h2><span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{copy.paceSub}</span></div><p style={{ margin: "6px 0 0", fontSize: "11.5px", color: "var(--color-faint)", lineHeight: "1.6", maxWidth: "62ch", textWrap: "pretty" }}>{copy.paceExplain}</p>{(!hasPaceTrend) ? (<p style={{ margin: "14px 0 0", fontSize: "12px", color: "var(--color-muted)", lineHeight: "1.6" }}>{copy.paceEmpty}</p>) : (<svg viewBox="0 0 540 96" style={{ width: "100%", height: "auto", marginBlockStart: "12px" }}>{paceGrid.map((g, _i4) => (<React.Fragment key={_i4}><g><line x1="34" x2="536" y1={g.y} y2={g.y} stroke="var(--color-line)" strokeWidth="1" /><text x="28" y={g.ty} fill="var(--color-faint)" fontSize="8.5" fontFamily="IBM Plex Mono" textAnchor="end">{g.label}</text></g></React.Fragment>))}<path d={paceArea} fill="var(--color-accent)" opacity="0.10" /><path d={pacePath} fill="none" stroke="var(--color-accent)" strokeWidth="2" />{paceDots.map((d, _i5) => (<React.Fragment key={_i5}><circle cx={d.x} cy={d.y} r="3" fill="var(--color-accent)" /></React.Fragment>))}</svg>)}</div></section>{comparison ? (<ComparePanel comparison={comparison} onClose={() => { setComparing(false); setPicked([]); }} copy={{ title: copy.cmpTitle, close: copy.cmpClose, efficiency: copy.cmpEff, noShape: copy.cmpNoShape, axisStart: copy.cmpStartAxis, axisFinish: copy.cmpFinishAxis, deltaLabel: copy.cmpDelta, axisRun: copy.cmpAxisRun, axisDist: copy.cmpAxisDist, bandTitle: copy.cmpBand, bandHr: copy.cmpBandHr, hint: copy.cmpChartHint, splitsBest: copy.cmpBest }} />) : null}<section className="card" style={{ padding: "16px 20px" }}><SectionHeader title={copy.histTitle} style={{ flexWrap: "wrap", rowGap: "10px" }} action={<div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>{filters.map((f, _i6) => (<React.Fragment key={_i6}><FilterChip active={f.active} onClick={f.pick}>{f.name}</FilterChip></React.Fragment>))}{comparable.length >= 2 ? (<><span aria-hidden style={{ alignSelf: "stretch", width: "1px", background: "var(--color-line)", marginInline: "3px" }}></span>{comparing ? (<span style={{ alignSelf: "center", fontSize: "10.5px", color: "var(--color-faint)" }}>{copy.cmpHint}</span>) : null}{autoCandidates.length > 0 ? (<ActionChip icon={CHIP_ICONS.autoPick} onClick={() => setPicked([picked[0], ...autoCandidates.map((r) => r.id)])}>{copy.cmpAuto}</ActionChip>) : null}<ActionChip armed={comparing} icon={CHIP_ICONS.compare} onClick={() => { setComparing((v) => !v); setPicked([]); }}>{comparing ? copy.cmpExit : copy.cmpStart}</ActionChip></>) : null}</div>} /><div className="num actrow" style={{ display: "grid", gridTemplateColumns: "64px 1.2fr 1fr 1fr 1fr 1fr 88px", gap: "10px", padding: "10px 12px 6px", borderBlockEnd: "1px solid var(--color-line)", marginBlockStart: "8px" }}><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.hDate}</span><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{copy.hType}</span><span style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hDist}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hTime}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hPace}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hHr}</span><span className="hide-m" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)", textAlign: "end" }}>{copy.hSpark}</span></div><div style={{ display: "flex", flexDirection: "column" }}>{rows.map((a, _i7) => (<React.Fragment key={_i7}><a className="actrow dc-hover-bg" href={a.id ? `/activities/${a.id}` : "/activities/demo?demo=1"} onClick={a.onPick} style={{ display: "grid", gridTemplateColumns: "64px 1.2fr 1fr 1fr 1fr 1fr 88px", gap: "10px", alignItems: "center", padding: "8px 12px", borderRadius: "var(--radius-control)", ...(a.pb ? { boxShadow: "inset 0 0 0 1px var(--color-gold)", background: "var(--color-gold-soft)" } : null), ...(a.sel ? { boxShadow: "inset 0 0 0 1px var(--color-accent)", background: "var(--color-accent-soft)" } : null) }}><span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>{a.date}</span><span style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "7px", height: "7px", borderRadius: "2px", background: a.dot, display: "inline-block" }}></span><span style={{ fontSize: "12.5px", fontWeight: "500" }}>{a.name}</span>{a.pb ? (<span className="num" title={copy.pbTitle} style={{ fontSize: "9px", fontWeight: "600", letterSpacing: ".07em", textTransform: "uppercase", background: "var(--color-gold)", color: "var(--color-canvas)", borderRadius: "var(--radius-pill)", padding: "2px 7px", whiteSpace: "nowrap" }}>{a.pb}</span>) : null}</span><span className="num" style={{ fontSize: "12px", textAlign: "end" }}>{a.km} km</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)", textAlign: "end" }}>{a.time}</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)", textAlign: "end" }}>{a.pace}</span><span className="num hide-m" style={{ fontSize: "12px", color: "var(--color-muted)", textAlign: "end" }}>{a.hr}</span><svg className="hide-m" width="80" height="24" viewBox="0 0 80 24" style={{ justifySelf: "end" }}><path d={a.spark} fill="none" stroke={a.sparkColor} strokeWidth="1.4" /></svg></a></React.Fragment>))}</div>{pageCount > 1 ? (<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBlockStart: "14px", paddingBlockStart: "12px", borderBlockStart: "1px solid var(--color-line)" }}><span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>{copy.pageRange(from + 1, Math.min(from + PAGE_SIZE, matching.length), matching.length)}</span><div style={{ display: "flex", alignItems: "center", gap: "8px" }}><button className="btn btn-secondary" type="button" onClick={() => setPage(Math.max(0, pageIndex - 1))} disabled={pageIndex === 0} style={{ padding: "5px 10px" }} aria-label={copy.pagePrev}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button><span className="num" style={{ fontSize: "11.5px", color: "var(--color-muted)", minWidth: "76px", textAlign: "center" }}>{copy.pageOf(pageIndex + 1, pageCount)}</span><button className="btn btn-secondary" type="button" onClick={() => setPage(Math.min(pageCount - 1, pageIndex + 1))} disabled={pageIndex >= pageCount - 1} style={{ padding: "5px 10px" }} aria-label={copy.pageNext}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></button></div></div>) : null}</section></div>
  );
}

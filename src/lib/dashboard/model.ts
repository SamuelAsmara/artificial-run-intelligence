/**
 * Athlete dashboard model.
 *
 * A faithful port of the logic in
 * design_handoff_ari_athlete_app/ARI Dashboard.dc.html — same geometry, same
 * demo data, same thresholds. Keeping it identical is deliberate: the design
 * is the spec, and the numbers on screen must match the reference exactly.
 *
 * Every shape maps to a real table (see src/types/database.types.ts):
 *   pmc      -> readiness_snapshots.ctl / atl / tsb
 *   weeks    -> plan_workouts
 *   acts     -> activities (+ activity_streams for the sparkline)
 *   pbs      -> derived from activities
 *
 * When the readiness engine lands, replace these builders — not the view.
 */

export type WorkoutType = "easy" | "tempo" | "int" | "long" | "rest";

/* deterministic PRNG — server and client must render the same pixels */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MO_LONG = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];
const DN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ------------------------------------------------------------------ */
/* PMC — 84 daily samples                                              */
/* ------------------------------------------------------------------ */

export interface Pmc {
  C: number[]; A: number[]; T: number[];
  /**
   * How many points the chart actually has.
   *
   * The ported markup hard-coded 84 because the prototype's series was always
   * that long. A real athlete with three weeks of history has 21, and every
   * index built from the constant read off the end of the array — which is how
   * the Form tile came to render `NaN`.
   */
  n: number;
  /**
   * ISO date per point, when the series came from real snapshots.
   *
   * Empty for the demo series, whose points are not real days. The hover
   * tooltip used to derive its date by counting back from a hard-coded
   * 11 August 2026, so it was wrong for everybody on every other day.
   */
  D: string[];
  x0: number; x1: number; yT: number; yB: number; mn: number; mx: number;
  ctlPath: string; atlPath: string; tsbPath: string;
  ctlArea: string; tsbArea: string;
  pmcGrid: { y: string; ty: string; label: string; dash: string }[];
  pmcWeeks: { x: string; label: string }[];
  pmcEnds: { y: string; text: string; color: string }[];
}

/** The demo series. Replaced by real readiness_snapshots once they exist. */
function demoSeries(): { C: number[]; A: number[]; T: number[] } {
  const r = rng(42);
  const wk = [0, 78, 55, 88, 0, 118, 52];
  const load: number[] = [];
  for (let d = 0; d < 84; d++) {
    const rec = Math.floor(d / 7) % 4 === 3 ? 0.55 : 1;
    let t = wk[d % 7] * rec * (0.85 + r() * 0.3);
    if (d > 78) t *= 0.82;
    load.push(t);
  }

  let ctl = 40, atl = 36;
  const C: number[] = [], A: number[] = [], T: number[] = [];
  for (let d = 0; d < 84; d++) {
    T.push(ctl - atl);
    ctl += (load[d] - ctl) / 42;
    atl += (load[d] - atl) / 7;
    C.push(ctl); A.push(atl);
  }
  return { C, A, T };
}

export function buildPmc(series?: { C: number[]; A: number[]; T: number[]; D?: string[] }): Pmc {
  const real = series && series.C.length > 1;
  const { C, A, T } = real ? series : demoSeries();
  const D = real && series.D && series.D.length === C.length ? series.D : [];
  const n = C.length;

  const allV = [...C, ...A, ...T];
  const x0 = 30, x1 = 1150, yT = 8, yB = 196;
  const mn = Math.floor(Math.min(...allV) / 10) * 10 - 4;
  const mx = Math.ceil(Math.max(...allV) / 10) * 10 + 4;
  const X = (i: number) => x0 + (i / (n - 1)) * (x1 - x0);
  const Y = (v: number) => yT + (1 - (v - mn) / (mx - mn)) * (yB - yT);

  const sm = (arr: number[]) => {
    const P = arr.map((v, i) => [X(i), Y(v)] as [number, number]);
    let d = "M" + P[0][0].toFixed(1) + " " + P[0][1].toFixed(1);
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      d += "C" + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + " " +
        (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + " " +
        (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + " " +
        (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + " " +
        p2[0].toFixed(1) + " " + p2[1].toFixed(1);
    }
    return d;
  };

  const ctlArea = sm(C) + "L" + X(n - 1).toFixed(1) + " " + yB + "L" + X(0).toFixed(1) + " " + yB + "Z";
  const tsbArea = "M" + X(0).toFixed(1) + " " + Y(0).toFixed(1) +
    T.map((v, i) => "L" + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("") +
    "L" + X(n - 1).toFixed(1) + " " + Y(0).toFixed(1) + "Z";

  const ends = [
    { v: C[n - 1], text: String(Math.round(C[n - 1])), color: "var(--color-ctl)" },
    { v: A[n - 1], text: String(Math.round(A[n - 1])), color: "var(--color-atl)" },
    { v: T[n - 1], text: (T[n - 1] >= 0 ? "+" : "") + Math.round(T[n - 1]), color: "var(--color-tsb)" },
  ].map((e) => ({ ...e, y: Y(e.v) + 3 })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  }

  const pmcGrid: Pmc["pmcGrid"] = [];
  for (let v = Math.ceil(mn / 20) * 20; v <= mx; v += 20) {
    pmcGrid.push({
      y: Y(v).toFixed(1), ty: (Y(v) + 3).toFixed(1),
      label: String(v), dash: v === 0 ? "3 3" : "",
    });
  }

  /*
   * The x axis, in dates.
   *
   * It used to read W1 … W12 — twelve labels that say how many weeks the chart
   * is wide and nothing about *when*. The athlete looking at a dip cannot tell
   * whether it was last month or in the spring, and a screenshot of this chart
   * in a document is undated. The real dates were already here in `D`; only
   * the hover tooltip ever used them.
   *
   * Six labels rather than twelve: a date is three times the width of "W7",
   * and twelve of them collide. The last point is always labelled, because
   * "where does this end" is the first thing anyone asks of a trend.
   */
  const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dayLabel = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(d)} ${MO[Number(m) - 1] ?? ""}`.trim();
  };

  let pmcWeeks: Pmc["pmcWeeks"];
  if (D.length === n && n > 1) {
    const stops = 6;
    const idx = Array.from({ length: stops }, (_, k) =>
      Math.round((k / (stops - 1)) * (n - 1)),
    );
    pmcWeeks = [...new Set(idx)].map((i) => ({
      x: X(i).toFixed(0), label: dayLabel(D[i]),
    }));
  } else {
    // The reference series has no real days behind it, so it counts weeks and
    // says so rather than printing dates nobody ran.
    const weekCount = Math.max(1, Math.round(n / 7));
    pmcWeeks = Array.from({ length: weekCount }, (_, w) => ({
      x: X(Math.min(n - 1, w * 7)).toFixed(0), label: "W" + (w + 1),
    }));
  }

  return {
    C, A, T, n, D, x0, x1, yT, yB, mn, mx,
    ctlPath: sm(C), atlPath: sm(A), tsbPath: sm(T), ctlArea, tsbArea,
    pmcGrid, pmcWeeks,
    pmcEnds: ends.map((e) => ({ y: e.y.toFixed(1), text: e.text, color: e.color })),
  };
}

/* ------------------------------------------------------------------ */
/* Recent activities                                                    */
/* ------------------------------------------------------------------ */

function spark(fade: boolean, spiky: boolean, seed: number) {
  const rr = rng(seed);
  const n = 30;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    let p = 0.5 + (rr() - 0.5) * 0.34;
    if (fade && i > 15) p += (i - 15) * 0.045;
    if (spiky && i % 5 === 2) p += rr() > 0.5 ? 0.4 : -0.3;
    pts.push(Math.max(0.05, Math.min(1.35, p)));
  }
  const lo = Math.min(...pts), hi = Math.max(...pts);
  return pts.map((p, i) =>
    (i ? "L" : "M") + ((i / (n - 1)) * 78 + 1).toFixed(1) + " " +
    (2 + ((p - lo) / (hi - lo || 1)) * 20).toFixed(1)).join("");
}

const ACTS_RAW: [string, string, string, number, number][] = [
  ["Aug 15", "21.3", "5:41", 1, 0], ["Aug 13", "8.0", "4:52", 0, 0],
  ["Aug 12", "6.2", "5:24", 0, 0], ["Aug 10", "5.0", "5:48", 0, 0],
  ["Aug 09", "18.4", "5:39", 1, 0], ["Aug 07", "9.6", "4:58", 0, 1],
  ["Aug 05", "6.0", "5:35", 0, 0], ["Aug 03", "7.5", "4:55", 1, 0],
  ["Aug 01", "16.0", "5:44", 0, 0],
];

export const acts = ACTS_RAW.map((a, i) => ({
  date: a[0], km: a[1], pace: a[2],
  spark: spark(!!a[3], !!a[4], 100 + i),
  sparkColor: a[3] ? "var(--color-caution)" : "var(--color-muted)",
}));

/* ------------------------------------------------------------------ */
/* 12-week plan                                                         */
/* ------------------------------------------------------------------ */

export interface Day {
  type: WorkoutType; name: string; tag: string; dist: number; pace: string;
  day: string; dateNum: number; mon: string;
  status: string; done: boolean; missed: boolean; today: boolean;
  /**
   * Why ARI reduced this session, in the athlete's own words.
   *
   * The plan screen has had a slot for this line since the prototype and filled
   * it with an invented sentence about a long run that never happened. Written
   * by the adjustment engine as of migration 0014; absent on the reference
   * dataset and on anything the engine has not touched.
   */
  reason?: string | null;
  /** true when a coach or the athlete set these numbers, not the generator */
  byPerson?: boolean;
}
export interface Week { days: Day[]; label: string; range: string }

const NAMES: Record<WorkoutType, string> = {
  easy: "Easy Run", tempo: "Tempo Run", int: "Intervals",
  long: "Long Run", rest: "Rest",
};
const TAGS: Record<WorkoutType, string> = {
  easy: "Easy", tempo: "Moderate", int: "Hard", long: "Long", rest: "Rest",
};
const PACES: Partial<Record<WorkoutType, string>> = {
  easy: "5:30", tempo: "4:45", int: "4:15", long: "5:40",
};

const BASE: [WorkoutType, number][] = [
  ["easy", 5], ["tempo", 7], ["int", 9.6], ["easy", 6],
  ["easy", 8], ["rest", 0], ["long", 26],
];
const MULT = [0.82, 0.88, 0.61, 1.0, 1.05, 1.1, 0.66, 1.15, 1.2, 0.7, 0.95, 0.55];
export const PLAN_START = new Date(2026, 6, 19);
export const CURRENT_WEEK = 3;

let _weeks: Week[] | null = null;
export function weeks(): Week[] {
  if (_weeks) return _weeks;
  const W: Week[] = [];
  for (let w = 0; w < 12; w++) {
    const f = MULT[w];
    const days: Day[] = BASE.map(([type, km], d) => {
      const dt = new Date(PLAN_START.getTime() + (w * 7 + d) * 86400000);
      const dist = type === "rest" ? 0 : Math.round(km * f * 10) / 10;
      let status = "", done = false, missed = false;
      if (w < 3) {
        done = true; status = "Done";
        if (w === 1 && d === 1) { done = false; missed = true; status = "Missed"; }
      } else if (w === 3) {
        if (d === 0) { done = true; status = "Done"; }
        else if (d === 1) { missed = true; status = "Missed"; }
        else if (d === 2) status = "Today";
        else if (d === 3) status = "Adjusted";
      }
      if (type === "rest" && !done) {
        status = status === "Today" ? status : "";
        missed = false;
      }
      return {
        type, name: NAMES[type], tag: TAGS[type], dist, pace: PACES[type] ?? "",
        day: DN[d], dateNum: dt.getDate(), mon: MO[dt.getMonth()],
        status, done, missed, today: w === 3 && d === 2,
      };
    });
    const s = days[0], e = days[6];
    W.push({
      days, label: "Week " + (w + 1) + " of 12",
      range: s.mon + " " + s.dateNum + " – " + (e.mon === s.mon ? "" : e.mon + " ") + e.dateNum,
    });
  }
  _weeks = W;
  return W;
}

export function segsFor(type: WorkoutType): { m: number; h: number; t: string }[] {
  if (type === "easy") return [{ m: 1, h: 22, t: "Steady easy pace" }];
  if (type === "long") return [{ m: 1, h: 30, t: "Steady long-run pace" }];
  if (type === "tempo")
    return [
      { m: 10, h: 16, t: "Warm-up 10 min" },
      { m: 20, h: 44, t: "Tempo 20 min" },
      { m: 10, h: 16, t: "Cool-down 10 min" },
    ];
  if (type === "int") {
    const s = [{ m: 10, h: 16, t: "Warm-up 10 min" }];
    for (let i = 0; i < 6; i++) {
      s.push({ m: 3.4, h: 48, t: "800 m rep" });
      if (i < 5) s.push({ m: 1.5, h: 10, t: "90 s jog" });
    }
    s.push({ m: 10, h: 16, t: "Cool-down 10 min" });
    return s;
  }
  return [];
}

/** Next-session bar: WU 10' + 6×(800 m @4:15 ≈ 3.4') with 90 s jogs + CD 10'. */
export function nextSessionSegments() {
  const segs = [{ min: 10, h: 24, bg: "var(--color-atl)", title: "Warm-up · 10 min @ 5:45/km" }];
  for (let i = 0; i < 6; i++) {
    segs.push({ min: 3.4, h: 52, bg: "var(--color-accent)", title: "800 m @ 4:15/km" });
    if (i < 5) segs.push({ min: 1.5, h: 12, bg: "var(--color-line-strong)", title: "Recovery · 90 s jog" });
  }
  segs.push({ min: 10, h: 24, bg: "var(--color-atl)", title: "Cool-down · 10 min @ 5:45/km" });
  const tot = segs.reduce((s, x) => s + x.min, 0);
  return segs.map((s) => ({ w: ((s.min / tot) * 100).toFixed(2), h: s.h, bg: s.bg, title: s.title }));
}

/* ------------------------------------------------------------------ */
/* Rail: calendar, weekly volume, personal records                      */
/* ------------------------------------------------------------------ */

let _cal: Record<number, string> | null = null;
function calDots() {
  if (_cal) return _cal;
  const c: Record<number, string> = {};
  weeks().forEach((wkk, w) =>
    wkk.days.forEach((d, i) => {
      if (d.type === "rest") return;
      const dt = new Date(PLAN_START.getTime() + (w * 7 + i) * 86400000);
      c[dt.getMonth() * 100 + dt.getDate()] =
        d.missed ? "var(--color-negative)" : d.done ? "var(--color-accent)" : "var(--color-caution)";
    }),
  );
  _cal = c;
  return c;
}

/**
 * @param cm         month index
 * @param realDots   dot colours from the athlete's own plan and runs; when
 *                   omitted the reference dataset's dots are used instead
 * @param realToday  today's date, so the highlight follows the calendar rather
 *                   than the fixed date the prototype was drawn on
 * @param raceDate   the athlete's goal race, highlighted the same way
 * @param cy         the year being shown. The grid used to be laid out for 2026
 *                   whatever the athlete's actual year, so in March 2027 — a
 *                   Monday, where 2026's March started on a Sunday — every dot
 *                   sat one column away from its real weekday, under a heading
 *                   that said "March 2026".
 */
export function calendar(
  cm: number,
  realDots?: Record<number, string>,
  realToday?: Date,
  raceDate?: Date | null,
  cy: number = 2026,
) {
  const dots = realDots ?? calDots();
  const startDow = new Date(cy, cm, 1).getDay();
  const dim = new Date(cy, cm + 1, 0).getDate();
  const cells: { n: string; color: string; bg: string; dot: string }[] = [];
  for (let i = 0; i < startDow; i++)
    cells.push({ n: "", color: "transparent", bg: "transparent", dot: "transparent" });
  for (let n = 1; n <= dim; n++) {
    const today = realToday
      ? realToday.getFullYear() === cy && realToday.getMonth() === cm && realToday.getDate() === n
      : cm === 7 && n === 11;
    const race = raceDate !== undefined
      ? !!raceDate && raceDate.getFullYear() === cy && raceDate.getMonth() === cm && raceDate.getDate() === n
      : cm === 9 && n === 11;
    cells.push({
      n: String(n),
      color: today ? "var(--color-accent-ink)" : race ? "var(--color-accent)" : "var(--color-muted)",
      bg: today ? "var(--color-accent)" : race ? "var(--color-accent-soft)" : "transparent",
      // Real dots are keyed by year; the reference set is not.
      dot: today
        ? "var(--color-accent-ink)"
        : race
          ? "var(--color-accent)"
          : (realDots ? dots[cy * 10_000 + cm * 100 + n] : dots[cm * 100 + n]) || "transparent",
    });
  }
  return { calLabel: `${MO_LONG[cm]} ${cy}`, calCells: cells };
}

export const calHead = [{ t: "S" }, { t: "M" }, { t: "T" }, { t: "W" }, { t: "T" }, { t: "F" }, { t: "S" }];

export function volumes() {
  const volKm = weeks().map((w) => w.days.reduce((s, d) => s + (d.dist || 0), 0));
  const volMax = Math.max(...volKm);
  return volKm.map((km, w) => {
    const past = w < 3, cur = w === 3;
    return {
      h: Math.max(6, Math.round((km / volMax) * 72)),
      bg: past ? "var(--color-accent)" : cur ? "var(--color-caution)" : "var(--color-elevated)",
      border: past || cur ? "transparent" : "var(--color-line-strong)",
      title: "Week " + (w + 1) + " · " + Math.round(km) + " km" +
        (past ? " · done" : cur ? " · planned this week" : " · planned"),
    };
  });
}

export const pbs = [
  { dist: "5K", time: "21:48", date: "Jun 14, 2026", note: "PB", noteColor: "var(--color-faint)", divider: "transparent" },
  { dist: "10K", time: "47:12", date: "Aug 13, 2026", note: "New PB", noteColor: "var(--color-gold)", divider: "var(--color-line)" },
  { dist: "Half", time: "1:47:20", date: "Mar 29, 2026", note: "PB", noteColor: "var(--color-faint)", divider: "var(--color-line)" },
  { dist: "Marathon", time: "3:52:11", date: "Nov 2, 2025", note: "Goal 3:45", noteColor: "var(--color-caution)", divider: "var(--color-line)" },
];

/* ------------------------------------------------------------------ */
/* Copy — one block, so a translation pass touches one place            */
/* ------------------------------------------------------------------ */

export const COPY = {
  brand: "ARI",
  greeting: "Good morning, Samuel",
  context: "Tuesday · Week 4 of 12 · Marathon",
  streak: "6 day streak",
  navHome: "Home", navActivities: "Activities", navPlan: "Plan", navSettings: "Settings",
  coachViewTag: "Coach view",
  coachViewMsg: "You are viewing Samuel Cohen’s training data.",
  coachAdjust: "Adjust workout", coachBack: "Back to roster",
  readinessLabel: "Readiness",
  readinessSub: "Recovery and load are in balance.",
  todayLine: "Tuesday · Intervals 9.6 km",
  aiTag: "AI Coach",
  narrative:
    "You’ve done 3 hard sessions this week and your load climbed fast. I’ve downgraded tomorrow’s intervals to an easy 6 km so you arrive fresh for Saturday’s long run.",
  btnSession: "Get tomorrow’s session", btnReason: "Show reasoning",
  pmcTitle: "Fitness · Fatigue · Form",
  /*
   * The subtitle carries the unit, because the axis cannot.
   *
   * Three series share one axis and one of them is not the same kind of
   * number: Fitness and Fatigue are training load, Form is the difference
   * between them and is meaningful around zero. A bare "60" on the axis is
   * unreadable without that sentence.
   */
  pmcSub: "Daily training load. Form is Fitness minus Fatigue, so it reads against the zero line.",
  pmcAxisUnit: "load",
  legCtl: "Fitness (CTL)", legAtl: "Fatigue (ATL)", legTsb: "Form (TSB)",
  planTitle: "Training plan", planMeta: "",
  legDone: "Completed", legPlanned: "Planned", legMissed: "Missed",
  nextTitle: "Next session · Intervals — 6 × 800 m",
  /**
   * What the same card says when there is no plan to read a session from.
   *
   * It has to say *something*: an empty box where the next session belongs
   * reads as a loading failure. What it must not do is borrow the line above.
   */
  nextTitleEmpty: "No next session",
  nextBodyEmpty:
    "Once you have a training plan, the session ARI wants you to run next appears here — with its structure, its target pace, and the reason behind any change to it.",
  nextCtaEmpty: "Build a plan",
  nextMeta: "Today · 9.6 km · ~49 min",
  adjTag: "Adjusted",
  nextReason: "Rep pace relaxed from 4:05 to 4:15 — fatigue is still elevated after Sunday’s long run.",
  segWu: "Warm-up 10 min · 5:45", segReps: "6 × 800 m @ 4:15 · 90 s jog", segCd: "Cool-down 10 min · 5:45",
  next2Meta: "Tomorrow · Easy Run · 6 km @ 5:30/km",
  next2Note: "Adjusted · was intervals",
  next2Title: "Easy run — single steady segment",
  next2Label: "6 km @ 5:30 — steady",
  actsTitle: "Recent activities",
  pbTitle: "Personal Records",
  volTitle: "Weekly volume", volMeta: "km per week · 12 weeks", volNow: "▲ Week 4",
  raceDays: "61 days", raceName: "to race day · Marathon · Oct 11, 2026",
  raceProgLabel: "Plan progress · Week 4 of 12", raceProgPct: "33%",
  raceTarget: "3:45:00", raceTargetLabel: "Target",
  racePred: "3:47:10", racePredLabel: "Predicted · closing",
  chatBtn: "Ask ARI", chatTitle: "Coach chat",
  chatPlaceholder: "Ask about your plan…", chatSend: "Send",
  milestone: "New personal best — 10 km in 47:12.",
  milestoneSub: "Set during Thursday’s tempo run; your previous best stood for 5 months.",
};

export const CHAT_REPLIES = [
  "Your fitness (CTL) is up 9% over the last 4 weeks — right on schedule for a sub-3:45 marathon.",
  "Based on your recent tempo runs, I’d predict a 10k around 46:40 today.",
  "If you feel fresh Thursday, we can add 4 strides at the end — no change to total load.",
];

export const INITIAL_MSGS = [
  { role: "ai", text: "Morning. Your readiness is solid and tomorrow’s session was downgraded to an easy 6 km. Anything you want to know about the plan?" },
  { role: "user", text: "Why did you change tomorrow’s intervals?" },
  { role: "ai", text: "Three hard sessions in 6 days pushed your acute load up 12%. Swapping tomorrow to easy running keeps your ACWR at 1.08 — inside the safe range — and protects Saturday’s long run." },
];

/**
 * Athlete dashboard model.
 *
 * The geometry and the shapes the dashboard renders. Every shape maps to a
 * real table (see src/types/database.types.ts):
 *   pmc      -> readiness_snapshots.ctl / atl / tsb
 *   weeks    -> plan_workouts (built by src/lib/dashboard/realPlan.ts)
 *   calendar -> plan_workouts + activities (dots from src/lib/dashboard/rail.ts)
 */

export type WorkoutType = "easy" | "tempo" | "int" | "long" | "rest";

const MO_LONG = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];

/* ------------------------------------------------------------------ */
/* PMC — one sample per day                                            */
/* ------------------------------------------------------------------ */

export interface Pmc {
  C: number[]; A: number[]; T: number[];
  /**
   * How many points the chart actually has.
   *
   * A real athlete with three weeks of history has 21, and every index built
   * from a fixed 84 read off the end of the array — which is how the Form tile
   * came to render `NaN`.
   */
  n: number;
  /** ISO date per point, aligned with C / A / T */
  D: string[];
  x0: number; x1: number; yT: number; yB: number; mn: number; mx: number;
  ctlPath: string; atlPath: string; tsbPath: string;
  ctlArea: string; tsbArea: string;
  pmcGrid: { y: string; ty: string; label: string; dash: string }[];
  pmcWeeks: { x: string; label: string }[];
  pmcEnds: { y: string; text: string; color: string }[];
}

/**
 * Chart geometry for a readiness series. The series must have at least two
 * points — the page shows the empty state before it has that many.
 */
export function buildPmc(series: { C: number[]; A: number[]; T: number[]; D: string[] }): Pmc {
  const { C, A, T } = series;
  const D = series.D.length === C.length ? series.D : [];
  const n = C.length;

  const allV = [...C, ...A, ...T];
  /*
   * The plot box.
   *
   * 126 high rather than 196 — a third off. It was the tallest object on the
   * page and the first thing a beginner met, and the shape of a six-week trend
   * does not need 190 pixels to be legible.
   */
  const x0 = 30, x1 = 1150, yT = 6, yB = 126;
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
    // No dates to print, so count weeks instead.
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
/* Plan weeks                                                           */
/* ------------------------------------------------------------------ */

export interface Day {
  type: WorkoutType; name: string; tag: string; dist: number; pace: string;
  day: string; dateNum: number; mon: string;
  /**
   * ISO date, YYYY-MM-DD. Every day built from a real plan carries one; the
   * month grid needs it to place the day in a calendar.
   */
  date?: string;
  status: string; done: boolean; missed: boolean; today: boolean;
  /**
   * Why Runi reduced this session, in the athlete's own words. Written by the
   * adjustment engine (migration 0014); absent on anything it has not touched.
   */
  reason?: string | null;
  /** true when a coach or the athlete set these numbers, not the generator */
  byPerson?: boolean;
  /**
   * The periodization phase this session was generated into. Stored by the
   * generator as of migration 0020; null on rows written before it — the
   * phase timeline hides itself rather than guessing.
   */
  phase?: "base" | "build" | "peak" | "taper" | null;
}
export interface Week { days: Day[]; label: string; range: string }

/* ------------------------------------------------------------------ */
/* Rail: calendar                                                       */
/* ------------------------------------------------------------------ */

/**
 * @param cm        month index
 * @param dots      dot colours from the athlete's own plan and runs, keyed
 *                  `year * 10000 + month * 100 + day`
 * @param today     today's date, for the highlight
 * @param raceDate  the athlete's goal race, highlighted the same way
 * @param cy        the year being shown, so weekdays line up in every year
 */
export function calendar(
  cm: number,
  dots: Record<number, string>,
  today: Date,
  raceDate: Date | null,
  cy: number,
) {
  const startDow = new Date(cy, cm, 1).getDay();
  const dim = new Date(cy, cm + 1, 0).getDate();
  const cells: { n: string; color: string; bg: string; dot: string }[] = [];
  for (let i = 0; i < startDow; i++)
    cells.push({ n: "", color: "transparent", bg: "transparent", dot: "transparent" });
  for (let n = 1; n <= dim; n++) {
    const isToday = today.getFullYear() === cy && today.getMonth() === cm && today.getDate() === n;
    const race =
      !!raceDate && raceDate.getFullYear() === cy && raceDate.getMonth() === cm && raceDate.getDate() === n;
    cells.push({
      n: String(n),
      color: isToday ? "var(--color-accent-ink)" : race ? "var(--color-accent)" : "var(--color-muted)",
      bg: isToday ? "var(--color-accent)" : race ? "var(--color-accent-soft)" : "transparent",
      dot: isToday
        ? "var(--color-accent-ink)"
        : race
          ? "var(--color-accent)"
          : dots[cy * 10_000 + cm * 100 + n] || "transparent",
    });
  }
  return { calLabel: `${MO_LONG[cm]} ${cy}`, calCells: cells };
}

export const calHead = [{ t: "S" }, { t: "M" }, { t: "T" }, { t: "W" }, { t: "T" }, { t: "F" }, { t: "S" }];

/* ------------------------------------------------------------------ */
/* Copy — one block, so a translation pass touches one place            */
/* ------------------------------------------------------------------ */

export const COPY = {
  brand: "Runi",
  navHome: "Home", navActivities: "Activities", navPlan: "Plan", navSettings: "Settings",
  readinessLabel: "Readiness",
  aiTag: "AI Coach",
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
  planTitle: "Training plan",
  legDone: "Completed", legPlanned: "Planned", legMissed: "Missed",
  /**
   * What the next-session card says when there is no plan to read a session
   * from. It has to say *something*: an empty box where the next session
   * belongs reads as a loading failure.
   */
  nextTitleEmpty: "No next session",
  nextBodyEmpty:
    "Once you have a training plan, the session Runi wants you to run next appears here — with its structure, its target pace, and the reason behind any change to it.",
  nextCtaEmpty: "Build a plan",
  actsTitle: "Recent activities",
  pbTitle: "Personal Records",
  volTitle: "Weekly volume", volMeta: "km per week · 12 weeks",
  raceTargetLabel: "Target", raceDaysUnit: "days",
};

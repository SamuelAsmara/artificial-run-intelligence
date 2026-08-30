/**
 * The questions the product can answer about an athlete's own data.
 *
 * ## Why this is a list and not a chat
 *
 * A text box is a contract: its shape says "ask me anything", and the first
 * question it cannot parse reads as broken rather than as 90% covered. Worse,
 * the three failures cast doubt backwards over the seven that worked — "did it
 * understand me, or was I lucky?"
 *
 * So the athlete **picks** a question rather than typing one. Everything on
 * screen works, which is a promise a text box cannot make. The filter box above
 * the list narrows *these* questions; it never accepts free text.
 *
 * ## Why there is no language model here
 *
 * Every figure below is passed through from a tested module. A model asked to
 * summarise training data will occasionally invent a session that did not
 * happen, and in a coaching context a confident wrong number is worse than no
 * number — the same argument `buildNarrative.ts` makes, for the same reason.
 *
 * If a model is added later it belongs *above* this file, not inside it: its
 * only job would be to read "how much have I improved this month" and return
 * `{ id: "improvement" }`. The numbers would still come from here. That is what
 * makes the model replaceable, and what makes it unable to lie.
 *
 * ## The rule every answer follows
 *
 * **Say nothing rather than say something thin.** Each question declares how
 * much data it needs, and returns `insufficient: true` with an honest sentence
 * when it does not have it. There is a test for that case on every question.
 */

import { formatPace, formatDuration } from "@/lib/format/pace";
import { summariseRuns, withinDays, shiftIso } from "@/lib/activity/window";
import { SESSION_NAME, INFERRED_NOTE, type SessionType } from "@/lib/activity/classify";
import { ACWR_INJURY_RISK_THRESHOLD } from "@/lib/planning/acwr";
import type {
  AnswerBar, AnswerRow, InsightAnswer, InsightRun, Question, Tone,
} from "@/lib/insights/types";

/* ------------------------------------------------------------------ */
/* Shared shapes                                                       */
/* ------------------------------------------------------------------ */

const MONTH = 30;

/** How few runs make an answer not worth giving. */
export const MIN_RUNS = 3;

/** A comparison needs both halves populated, not just the recent one. */
export const MIN_RUNS_PER_SIDE = 3;

const nothing = (headline: string, detail: string | null = null): InsightAnswer => ({
  headline, detail, tone: null, rows: [], bars: null, caveat: null, insufficient: true,
});

const answer = (a: Partial<InsightAnswer> & { headline: string }): InsightAnswer => ({
  detail: null, tone: null, rows: [], bars: null, caveat: null, insufficient: false, ...a,
});

const km = (v: number) => `${v.toFixed(1)} km`;
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/** seconds per km as "-8 s/km", the way an athlete talks about a change. */
const paceDelta = (sec: number) => `${sec > 0 ? "+" : "−"}${Math.abs(Math.round(sec))} s/km`;

/** Faster is better, so a negative delta is the good one. */
const fasterTone = (deltaSec: number): Tone =>
  deltaSec <= -3 ? "positive" : deltaSec >= 3 ? "negative" : null;

const runsWithPace = (runs: InsightRun[]) => runs.filter((r) => r.paceSec !== null && r.distanceKm > 0);

/* ------------------------------------------------------------------ */
/* 1 · improvement                                                     */
/* ------------------------------------------------------------------ */

/**
 * "How much have I improved this month?"
 *
 * Pace alone is not improvement — running the same route harder is not the same
 * as running it more easily. So this reports **pace and heart rate together**,
 * and leads with efficiency: seconds per kilometre per beat. Getting faster at
 * the same heart rate is the only combination that is unambiguously fitness.
 *
 * Both windows are summarised by `summariseRuns`, so the pace is
 * distance-weighted and the heart rate duration-weighted. Averaging the paces
 * would report a change that is partly just a change in run lengths.
 */
const improvement: Question = {
  id: "improvement",
  label: "How much have I improved this month?",
  keywords: ["improve", "better", "progress", "fitness", "faster", "efficiency"],
  answer(data) {
    const recent = runsWithPace(withinDays(data.runs, MONTH, data.today));
    const priorEnd = shiftIso(data.today, -MONTH);
    const prior = runsWithPace(
      data.runs.filter((r) => r.date <= priorEnd && r.date > shiftIso(priorEnd, -MONTH)),
    );

    if (recent.length < MIN_RUNS_PER_SIDE || prior.length < MIN_RUNS_PER_SIDE) {
      return nothing(
        "Not enough history to compare two months yet.",
        `This needs ${MIN_RUNS_PER_SIDE} runs in each of the last two months. You have ${recent.length} and ${prior.length}.`,
      );
    }

    const now = summariseRuns(recent);
    const then = summariseRuns(prior);
    if (now.avgPaceSec === null || then.avgPaceSec === null) {
      return nothing("Those runs have no usable distance or time.");
    }

    const delta = now.avgPaceSec - then.avgPaceSec;
    const rows: AnswerRow[] = [
      { label: "Pace this month", value: `${formatPace(now.avgPaceSec)} /km` },
      { label: "Pace the month before", value: `${formatPace(then.avgPaceSec)} /km` },
      { label: "Change", value: paceDelta(delta), tone: fasterTone(delta) },
    ];

    // Efficiency only exists when both months wore a strap.
    let efficiency: string | null = null;
    if (now.avgHr !== null && then.avgHr !== null) {
      const nowEff = now.avgPaceSec * now.avgHr;
      const thenEff = then.avgPaceSec * then.avgHr;
      const effPct = ((nowEff - thenEff) / thenEff) * 100;
      rows.push({ label: "Heart rate this month", value: `${now.avgHr} bpm` });
      rows.push({ label: "Heart rate the month before", value: `${then.avgHr} bpm` });
      rows.push({
        label: "Cost of a kilometre",
        value: pct(effPct),
        tone: effPct <= -2 ? "positive" : effPct >= 2 ? "negative" : null,
      });
      efficiency =
        effPct <= -2
          ? "Each kilometre is costing you fewer heartbeats than it did — that is fitness, not effort."
          : effPct >= 2
            ? "Each kilometre is costing you more heartbeats. Often fatigue, heat, or a harder block."
            : "The cost of a kilometre is essentially unchanged.";
    }

    const headline =
      delta <= -3
        ? `You are ${paceDelta(delta)} faster than a month ago.`
        : delta >= 3
          ? `You are ${paceDelta(delta)} slower than a month ago.`
          : "Your pace is level with a month ago.";

    return answer({
      headline,
      detail: efficiency,
      tone: fasterTone(delta),
      rows,
      caveat:
        now.avgHr === null || then.avgHr === null
          ? "Pace only — one of the two months has no heart-rate data, so this cannot separate fitness from effort."
          : null,
    });
  },
};

/* ------------------------------------------------------------------ */
/* 2 · longest run                                                     */
/* ------------------------------------------------------------------ */

const longest: Question = {
  id: "longest",
  label: "What is my longest run — and when?",
  keywords: ["longest", "furthest", "far", "distance", "long run", "max"],
  answer(data) {
    const runs = runsWithPace(data.runs);
    if (runs.length === 0) return nothing("No runs recorded yet.");

    const best = runs.reduce((a, b) => (b.distanceKm > a.distanceKm ? b : a));
    const rest = runs.filter((r) => r.id !== best.id);
    const second = rest.length ? rest.reduce((a, b) => (b.distanceKm > a.distanceKm ? b : a)) : null;

    return answer({
      headline: `${km(best.distanceKm)} on ${best.dateLabel}.`,
      detail: `You held ${formatPace(best.paceSec)} /km for ${formatDuration(best.durationSec)}.`,
      rows: [
        { label: "Distance", value: km(best.distanceKm) },
        { label: "Time", value: formatDuration(best.durationSec) },
        { label: "Pace", value: `${formatPace(best.paceSec)} /km` },
        ...(best.avgHr !== null ? [{ label: "Average heart rate", value: `${best.avgHr} bpm` }] : []),
        ...(second ? [{ label: "Next longest", value: `${km(second.distanceKm)} · ${second.dateLabel}` }] : []),
      ],
      caveat: "Over the runs Runi holds, which may not be your whole running life.",
    });
  },
};

/* ------------------------------------------------------------------ */
/* 3 · this week vs normal                                             */
/* ------------------------------------------------------------------ */

/**
 * "How does this week compare to my normal?"
 *
 * "Normal" is the previous four weeks — the athlete's own recent baseline, not
 * a target and not a table. The comparison is against the *average* of those
 * weeks rather than against last week alone, which would make every ordinary
 * cutback week look like a collapse.
 */
const thisWeek: Question = {
  id: "this-week",
  label: "How does this week compare to my normal?",
  keywords: ["week", "normal", "usual", "volume", "compare", "average"],
  answer(data) {
    const week = withinDays(data.runs, 7, data.today);
    const priorEnd = shiftIso(data.today, -7);
    const prior = data.runs.filter((r) => r.date <= priorEnd && r.date > shiftIso(priorEnd, -28));

    if (prior.length < MIN_RUNS) {
      return nothing(
        "Not enough history to know what normal looks like for you.",
        `This compares the last 7 days against the 4 weeks before them, and those weeks hold ${prior.length} runs.`,
      );
    }

    const now = summariseRuns(week);
    const baselineKm = summariseRuns(prior).totalKm / 4;
    const deltaPct = baselineKm > 0 ? ((now.totalKm - baselineKm) / baselineKm) * 100 : 0;

    const headline =
      Math.abs(deltaPct) < 10
        ? `${km(now.totalKm)} this week — an ordinary week for you.`
        : deltaPct > 0
          ? `${km(now.totalKm)} this week, ${pct(deltaPct)} on your normal.`
          : `${km(now.totalKm)} this week, ${pct(deltaPct)} on your normal.`;

    return answer({
      headline,
      detail:
        deltaPct > 30
          ? "A big week. Worth checking the load ratio before you add another."
          : deltaPct < -30
            ? "A light week. Deliberate cutback weeks look exactly like this."
            : null,
      tone: deltaPct > 30 ? "caution" : null,
      rows: [
        { label: "This week", value: `${km(now.totalKm)} · ${now.runs} runs` },
        { label: "Your 4-week average", value: km(baselineKm) },
        { label: "Difference", value: pct(deltaPct), tone: deltaPct > 30 ? "caution" : null },
      ],
      caveat: "The current week is still in progress, so it is being compared part-run.",
    });
  },
};

/* ------------------------------------------------------------------ */
/* 4 · cardiac drift                                                   */
/* ------------------------------------------------------------------ */

/**
 * "Is my cardiac drift improving?"
 *
 * Cardiac drift is heart rate climbing through a run held at a steady pace —
 * the clearest single signal of aerobic durability, and one almost no consumer
 * app surfaces. Lower is better, and the direction over weeks matters far more
 * than any one run.
 */
const drift: Question = {
  id: "drift",
  label: "Is my cardiac drift improving?",
  keywords: ["drift", "cardiac", "heart rate", "durability", "aerobic", "decoupling"],
  answer(data) {
    const withDrift = data.runs.filter(
      (r) => r.cardiacDriftPct !== null && Number.isFinite(r.cardiacDriftPct),
    );
    const recent = withinDays(withDrift, MONTH, data.today);
    const priorEnd = shiftIso(data.today, -MONTH);
    const prior = withDrift.filter((r) => r.date <= priorEnd && r.date > shiftIso(priorEnd, -MONTH));

    if (recent.length < MIN_RUNS_PER_SIDE || prior.length < MIN_RUNS_PER_SIDE) {
      return nothing(
        "Not enough runs with a drift reading to show a direction.",
        "Drift needs a steady run with heart-rate data. Interval sessions and short runs do not produce one.",
      );
    }

    const mean = (rs: InsightRun[]) =>
      rs.reduce((s, r) => s + (r.cardiacDriftPct as number), 0) / rs.length;
    const now = mean(recent);
    const then = mean(prior);
    const change = now - then;

    return answer({
      headline:
        change <= -0.5
          ? `Improving — drift is down from ${then.toFixed(1)}% to ${now.toFixed(1)}%.`
          : change >= 0.5
            ? `Worsening — drift is up from ${then.toFixed(1)}% to ${now.toFixed(1)}%.`
            : `Steady at about ${now.toFixed(1)}%.`,
      detail:
        "Drift is how far your heart rate climbs through a run you held at one pace. Lower means your aerobic base is carrying the effort for longer.",
      tone: change <= -0.5 ? "positive" : change >= 0.5 ? "caution" : null,
      rows: [
        { label: "Last 30 days", value: `${now.toFixed(1)}%`, tone: null },
        { label: "The 30 days before", value: `${then.toFixed(1)}%` },
        { label: "Change", value: pct(change), tone: change <= -0.5 ? "positive" : change >= 0.5 ? "caution" : null },
        { label: "Runs measured", value: `${recent.length} and ${prior.length}` },
      ],
      caveat: "Heat, hills and dehydration all raise drift. One hot month is not a loss of fitness.",
    });
  },
};

/* ------------------------------------------------------------------ */
/* 5 · pace by session type                                            */
/* ------------------------------------------------------------------ */

const TYPE_ORDER: SessionType[] = ["easy", "tempo", "int", "long"];

const paceByType: Question = {
  id: "pace-by-type",
  label: "What is my pace by session type?",
  keywords: ["pace", "type", "easy", "tempo", "intervals", "long", "session"],
  answer(data) {
    const runs = runsWithPace(withinDays(data.runs, 90, data.today));
    if (runs.length < MIN_RUNS) {
      return nothing("Not enough runs in the last 90 days to break down by type.");
    }

    const rows: AnswerRow[] = [];
    const bars: AnswerBar[] = [];
    for (const t of TYPE_ORDER) {
      const of = runs.filter((r) => r.type === t);
      if (of.length === 0) continue;
      const s = summariseRuns(of);
      if (s.avgPaceSec === null) continue;
      rows.push({
        label: `${SESSION_NAME[t]} · ${of.length} runs`,
        value: `${formatPace(s.avgPaceSec)} /km`,
      });
      // Faster runs should read as taller bars, so the bar is speed, not pace.
      bars.push({
        label: SESSION_NAME[t].replace(" Run", ""),
        value: 1000 / s.avgPaceSec,
        caption: formatPace(s.avgPaceSec),
      });
    }

    if (rows.length === 0) return nothing("Those runs have no usable distance or time.");

    return answer({
      headline: `${rows.length} kinds of session over the last 90 days.`,
      detail:
        "Each pace is distance-weighted, so a long run counts for more than a short one. A longer bar is a faster pace.",
      rows,
      bars,
      // Paces cluster; from zero these would be four bars of the same length.
      baseline: "range",
      caveat: INFERRED_NOTE,
    });
  },
};

/* ------------------------------------------------------------------ */
/* 6 · easy vs hard                                                    */
/* ------------------------------------------------------------------ */

/**
 * "How much of my training is easy?"
 *
 * The best-supported finding in endurance training is that most of it should be
 * comfortable — roughly four runs in five. The characteristic amateur mistake is
 * the opposite: easy runs run slightly too hard and hard runs slightly too easy,
 * so every session lands in the same grey middle and none of them do their job.
 *
 * Measured against the athlete's own threshold heart rate when there is one, and
 * against the inferred session type when there is not — with the caveat saying
 * which of the two was used, because they are not equally good.
 */
export const EASY_TARGET_PCT = 80;

const easyShare: Question = {
  id: "easy-share",
  label: "How much of my training is easy?",
  keywords: ["easy", "hard", "polarised", "80/20", "intensity", "zones"],
  answer(data) {
    const runs = withinDays(data.runs, MONTH, data.today).filter((r) => r.durationSec > 0);
    if (runs.length < MIN_RUNS) {
      return nothing("Not enough runs in the last 30 days to judge your intensity mix.");
    }

    // Time, not run count: twenty minutes hard and two hours easy is not "half".
    const byHr = runs.filter((r) => r.avgHr !== null);
    const useHr = data.lthr !== null && byHr.length >= runs.length * 0.6;

    let easySec = 0;
    let hardSec = 0;
    for (const r of runs) {
      const isEasy = useHr
        ? r.avgHr !== null
          ? r.avgHr < (data.lthr as number)
          : r.type === "easy" || r.type === "long"
        : r.type === "easy" || r.type === "long";
      if (isEasy) easySec += r.durationSec;
      else hardSec += r.durationSec;
    }

    const total = easySec + hardSec;
    if (total === 0) return nothing("Those runs have no usable duration.");
    const share = (easySec / total) * 100;

    return answer({
      headline: `${Math.round(share)}% of your running time was easy.`,
      detail:
        share >= 75
          ? "That is the shape most endurance plans aim for — the majority comfortable, so the hard sessions can be genuinely hard."
          : "Below the four-in-five most plans aim for. The usual cause is easy runs drifting slightly too fast, which leaves the hard ones with nothing left.",
      tone: share >= 75 ? "positive" : "caution",
      rows: [
        { label: "Easy", value: formatDuration(easySec), tone: null },
        { label: "Harder", value: formatDuration(hardSec) },
        { label: "Easy share", value: `${Math.round(share)}%`, tone: share >= 75 ? "positive" : "caution" },
        { label: "Commonly aimed at", value: `${EASY_TARGET_PCT}%` },
      ],
      bars: [
        { label: "Easy", value: share, caption: `${Math.round(share)}%`, tone: "positive" },
        { label: "Harder", value: 100 - share, caption: `${Math.round(100 - share)}%`, tone: "caution" },
      ],
      caveat: useHr
        ? "Split by your own threshold heart rate."
        : `Split by inferred session type, not by heart rate. ${INFERRED_NOTE}`,
    });
  },
};

/* ------------------------------------------------------------------ */
/* 7 · ramp rate                                                       */
/* ------------------------------------------------------------------ */

const ramping: Question = {
  id: "ramping",
  label: "Am I ramping up too fast?",
  keywords: ["ramp", "load", "acwr", "injury", "risk", "too fast", "overload"],
  answer(data) {
    const withRatio = data.load.filter((d) => d.acwr !== null && Number.isFinite(d.acwr));
    if (withRatio.length === 0) {
      return nothing(
        "No load ratio yet.",
        "The ratio compares this week's training load against the four before it, so it needs about a month of runs.",
      );
    }

    const latest = withRatio[withRatio.length - 1];
    const ratio = latest.acwr as number;
    const recent = withRatio.slice(-14);
    const over = recent.filter((d) => (d.acwr as number) > ACWR_INJURY_RISK_THRESHOLD).length;

    const tone: Tone =
      ratio > ACWR_INJURY_RISK_THRESHOLD ? "negative" : ratio > 1.3 ? "caution" : ratio < 0.8 ? "caution" : "positive";

    return answer({
      headline:
        ratio > ACWR_INJURY_RISK_THRESHOLD
          ? `Yes — your load ratio is ${ratio.toFixed(2)}.`
          : ratio < 0.8
            ? `No — at ${ratio.toFixed(2)} you are training below what you have absorbed.`
            : `No — your load ratio is ${ratio.toFixed(2)}.`,
      detail:
        "The ratio is this week's training load against the four weeks you have already absorbed. Above 1.5 is where injury risk starts to climb in the research; below 0.8 is detraining.",
      tone,
      rows: [
        { label: "Load ratio today", value: ratio.toFixed(2), tone },
        { label: "Risk threshold", value: ACWR_INJURY_RISK_THRESHOLD.toFixed(2) },
        { label: "Days above it, last 14", value: String(over), tone: over > 0 ? "caution" : null },
        { label: "Fitness (CTL)", value: latest.ctl.toFixed(0) },
      ],
      bars: recent.map((d) => ({
        label: d.date.slice(5),
        value: d.acwr as number,
        caption: (d.acwr as number).toFixed(2),
        tone: (d.acwr as number) > ACWR_INJURY_RISK_THRESHOLD ? "negative" : null,
      })),
      reference: { value: ACWR_INJURY_RISK_THRESHOLD, label: "risk" },
      caveat: "A ratio is a flag, not a diagnosis. How you feel is the other half of it.",
    });
  },
};

/* ------------------------------------------------------------------ */
/* 8 · plan adherence                                                  */
/* ------------------------------------------------------------------ */

const adherence: Question = {
  id: "adherence",
  label: "Did I stick to my plan?",
  keywords: ["plan", "stick", "adherence", "missed", "completed", "followed"],
  answer(data) {
    const past = data.planned.filter((p) => p.past);
    const recent = withinDays(past, 28, data.today);
    if (recent.length === 0) {
      return nothing(
        "No planned sessions in the last four weeks.",
        "Set a goal race and Runi will build a plan; this question reads what it built against what you ran.",
      );
    }

    const done = recent.filter((p) => (p.actualKm ?? 0) > 0);
    const missed = recent.length - done.length;
    const share = (done.length / recent.length) * 100;

    const plannedKm = recent.reduce((s, p) => s + (p.plannedKm ?? 0), 0);
    const actualKm = recent.reduce((s, p) => s + (p.actualKm ?? 0), 0);

    return answer({
      headline: `${done.length} of ${recent.length} sessions done — ${Math.round(share)}%.`,
      detail:
        missed === 0
          ? "Every session in the last four weeks was run."
          : `${missed} ${missed === 1 ? "session was" : "sessions were"} not run. A plan is a proposal, and life happens; Runi reshapes what is still ahead rather than asking you to catch up.`,
      tone: share >= 80 ? "positive" : share >= 60 ? "caution" : "negative",
      rows: [
        { label: "Completed", value: String(done.length), tone: "positive" },
        { label: "Missed", value: String(missed), tone: missed > 0 ? "caution" : null },
        { label: "Distance planned", value: km(plannedKm) },
        { label: "Distance run", value: km(actualKm) },
      ],
      caveat: "Counted over the last four weeks of past days only — sessions still ahead of you are not missed.",
    });
  },
};

/* ------------------------------------------------------------------ */
/* 9 · best runs                                                       */
/* ------------------------------------------------------------------ */

const bestRuns: Question = {
  id: "best-runs",
  label: "Which were my best runs this month?",
  keywords: ["best", "top", "fastest", "strongest", "records", "pb"],
  answer(data) {
    const runs = runsWithPace(withinDays(data.runs, MONTH, data.today));
    if (runs.length < MIN_RUNS) return nothing("Fewer than three runs in the last 30 days.");

    // Fastest first, but a run that set a record outranks a fast short one.
    const ranked = [...runs].sort((a, b) => {
      if (Boolean(a.pb) !== Boolean(b.pb)) return a.pb ? -1 : 1;
      return (a.paceSec as number) - (b.paceSec as number);
    });
    const top = ranked.slice(0, 3);

    return answer({
      headline: top[0].pb
        ? `${top[0].dateLabel} — ${top[0].pb}.`
        : `${top[0].dateLabel} — ${km(top[0].distanceKm)} at ${formatPace(top[0].paceSec)} /km.`,
      detail: "Ranked by pace, with any run that set a record first.",
      rows: top.map((r) => ({
        label: `${r.dateLabel} · ${km(r.distanceKm)}`,
        value: r.pb ? `${formatPace(r.paceSec)} /km · ${r.pb}` : `${formatPace(r.paceSec)} /km`,
        tone: r.pb ? ("positive" as Tone) : null,
      })),
      caveat: "Pace alone — a fast 5K and a steady 20K are not the same achievement.",
    });
  },
};

/* ------------------------------------------------------------------ */
/* 10 · goal race                                                      */
/* ------------------------------------------------------------------ */

const goalRace: Question = {
  id: "goal",
  label: "Am I on track for my goal time?",
  keywords: ["goal", "race", "target", "on track", "prediction", "time"],
  answer(data) {
    if (!data.race) {
      return nothing(
        "No goal race set.",
        "Set one in Settings and Runi will build a plan backwards from it — and this question will compare where you are against where it needs you to be.",
      );
    }
    const daysOut = Math.round(
      (Date.parse(`${data.race.date}T00:00:00`) - Date.parse(`${data.today}T00:00:00`)) / 86_400_000,
    );

    const rows: AnswerRow[] = [
      { label: "Race", value: data.race.label },
      { label: "Days away", value: daysOut >= 0 ? String(daysOut) : "already run" },
    ];
    if (data.race.targetSec !== null) {
      rows.push({ label: "Target time", value: formatDuration(data.race.targetSec) });
    }

    const settled = data.load.length > 0 ? data.load[data.load.length - 1] : null;
    if (settled) {
      rows.push({ label: "Fitness (CTL)", value: settled.ctl.toFixed(0) });
      rows.push({ label: "Form (TSB)", value: settled.tsb.toFixed(0) });
    }

    return answer({
      headline:
        daysOut < 0
          ? `${data.race.label} has already been run.`
          : `${data.race.label} is ${daysOut} ${daysOut === 1 ? "day" : "days"} away.`,
      detail:
        settled && daysOut >= 0
          ? settled.tsb < -20
            ? "You are carrying real fatigue right now, which is normal this far out but not where you want to be on race day."
            : "Your form is in a workable range."
          : null,
      tone: settled && settled.tsb < -20 && daysOut < 14 ? "caution" : null,
      rows,
      caveat: "A projection from training load, not a promise. Weather, course and the day itself all sit outside it.",
    });
  },
};

/* ------------------------------------------------------------------ */

/** Every question the panel offers, in the order it offers them. */
export const QUESTIONS: Question[] = [
  improvement,
  thisWeek,
  ramping,
  adherence,
  easyShare,
  drift,
  paceByType,
  bestRuns,
  longest,
  goalRace,
];

export const questionById = (id: string): Question | null =>
  QUESTIONS.find((q) => q.id === id) ?? null;

/**
 * The questions matching what the athlete typed.
 *
 * This filters the list — it never accepts a question that is not on it. An
 * empty query returns everything, so the box starts by showing what is
 * possible rather than an empty result.
 */
export function filterQuestions(query: string): Question[] {
  const q = query.trim().toLowerCase();
  if (!q) return QUESTIONS;
  const words = q.split(/\s+/);
  return QUESTIONS.filter((question) => {
    const hay = `${question.label} ${question.keywords.join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Turning the readiness numbers into something a person can act on.
 *
 * ## Why this is computed rather than generated
 *
 * The obvious way to write a coaching narrative is to hand the numbers to a
 * language model. We deliberately do the opposite, and it is the more defensible
 * choice for three reasons:
 *
 *   1. **The facts cannot be wrong.** Every number in the output is passed
 *      through from the engine. A model asked to "summarise" training data will
 *      occasionally invent a session that did not happen or misstate a figure,
 *      and in a coaching context a confident wrong number is worse than no
 *      number at all.
 *   2. **It is testable.** Given the same inputs this returns the same text, so
 *      the reasoning can be asserted in unit tests. A generated narrative can't.
 *   3. **It always works.** No API key, no network call, no per-request cost,
 *      no outage.
 *
 * When the AI layer arrives it is layered on *top* of this, not in place of it:
 * this function produces the facts and the argument, and the model is asked
 * only to rephrase them more naturally. That keeps the numbers correct and
 * makes the model replaceable.
 *
 * ## How a narrative is put together
 *
 * Three sentences, each answering a different question:
 *
 *   1. Where are you?      — form, expressed as the athlete experiences it
 *   2. What stands out?    — the most notable deviation from your own normal
 *   3. So what today?      — the recommendation, and the honest caveat
 *
 * Plus a `reasoning` list: every component that fed the score, what it read,
 * what it scored and how much it counted. That is what the "Show reasoning"
 * button opens, and it is the part that makes the score arguable rather than
 * oracular.
 */

import { formZone, FORM_ZONE_LABEL, rampVerdict } from "@/lib/planning/pmc";
import type { ReadinessComponent, ReadinessResult } from "@/lib/planning/readiness";

export interface NarrativeInput {
  /** the score and its breakdown, straight from computeReadiness */
  readiness: Pick<ReadinessResult, "score" | "label" | "contributions">;
  pmc: { ctl: number; atl: number; tsb: number; rampRate: number };
  /** acute:chronic load ratio, or null when history is too short */
  loadRatio: number | null;
  sleepHours?: number | null;
  hrvVsBaselinePct?: number | null;
  restingHr?: number | null;
  /** heart-rate drift on the most recent qualifying run, in percent */
  cardiacDriftPct?: number | null;
  /** longest run in the last 30 days, in metres */
  longestRecentM?: number | null;
  /** this week's volume in km, and the change against last week in percent */
  weeklyVolumeKm?: number | null;
  weeklyChangePct?: number | null;
}

export interface ReasoningLine {
  component: ReadinessComponent;
  /** human name, e.g. "Form" */
  label: string;
  /** what it actually read today, e.g. "+0.6 · neither loaded nor fresh" */
  reading: string;
  /** 0–100 */
  subscore: number;
  /** whole percent of the final score */
  weightPct: number;
  /** one sentence on what this component means and why it scored that way */
  note: string;
}

export interface Narrative {
  headline: string;
  /**
   * Two sentences for the hero card. The Claude Design layout budgets roughly
   * two lines here, so this is built short on purpose rather than truncated —
   * it picks the most decision-relevant sentences instead of the first ones.
   */
  body: string;
  /** every sentence, for the reasoning panel */
  full: string;
  /** the sentences individually, so the AI layer can rephrase them one by one */
  sentences: string[];
  tone: "positive" | "caution" | "negative";
  reasoning: ReasoningLine[];
  /** the component that held the score back most, if one clearly did */
  limiter: ReadinessComponent | null;
  /** how the text was produced — becomes "ai" once that layer is added */
  source: "computed";
}

/* ------------------------------------------------------------------ */
/* small formatters                                                    */
/* ------------------------------------------------------------------ */

const signed = (n: number) => `${n >= 0 ? "+" : ""}${round1(n)}`;
const round1 = (n: number) => Math.round(n * 10) / 10;
const km = (metres: number) => `${(metres / 1000).toFixed(1)} km`;
const pct = (n: number) => `${Math.round(Math.abs(n))}%`;

const COMPONENT_LABEL: Record<ReadinessComponent, string> = {
  form: "Form",
  loadRatio: "Load balance",
  cardiacDrift: "Cardiac drift",
  sleep: "Sleep",
  hrv: "Heart-rate variability",
};

/* ------------------------------------------------------------------ */
/* sentence 1 — where you are                                          */
/* ------------------------------------------------------------------ */

function whereYouAre(pmc: NarrativeInput["pmc"]): string {
  const zone = formZone(pmc.tsb);
  const fitness = Math.round(pmc.ctl);

  switch (zone) {
    case "fresh":
      return `You're fresh — form is ${signed(pmc.tsb)} and your fitness is holding at ${fitness}.`;
    case "transition":
      return `You've been resting a while. Form is ${signed(pmc.tsb)}, which is past fresh and into detrained — fitness has drifted down to ${fitness}.`;
    case "optimal":
      return `You're in the productive band: fitness ${fitness}, form ${signed(pmc.tsb)}. This is where training actually pays off.`;
    case "grey":
      return `You're neither loaded nor fresh — form is ${signed(pmc.tsb)}, sitting right in the middle. Fitness is ${fitness}.`;
    case "high-risk":
      return `You're carrying real fatigue: form is ${signed(pmc.tsb)} against fitness ${fitness}. That's a deep hole to be in.`;
  }
}

/* ------------------------------------------------------------------ */
/* sentence 2 — what stands out                                        */
/* ------------------------------------------------------------------ */

/**
 * Picks the single most notable thing about today and says it.
 *
 * Ordered by how much it should change what the athlete does, not by how
 * interesting the number is. A collapsing training load matters more than a
 * mildly short night.
 */
function whatStandsOut(input: NarrativeInput): string | null {
  const { loadRatio, pmc, weeklyChangePct } = input;

  // A load that has fallen well below the athlete's own normal.
  if (loadRatio !== null && loadRatio < 0.8) {
    const below = pct((1 - loadRatio) * 100);
    return `You've been winding down — your load this week is ${below} below your usual four-week level.`;
  }

  // A load climbing faster than the body adapts.
  if (loadRatio !== null && loadRatio > 1.3) {
    const above = pct((loadRatio - 1) * 100);
    return `Your load this week is ${above} above your usual four-week level. That's a fast climb — it doesn't mean injury, but it does mean the next few days should be easy.`;
  }

  // Fitness moving quickly in either direction.
  if (pmc.rampRate <= -3) {
    return `Fitness is falling at ${round1(Math.abs(pmc.rampRate))} points a week. That's the cost of the lighter fortnight showing up in the numbers.`;
  }
  if (rampVerdict(pmc.rampRate) === "aggressive") {
    return `Fitness is climbing at ${round1(pmc.rampRate)} points a week, which is faster than the usual guidance of 5 to 8. Worth keeping an eye on.`;
  }

  if (weeklyChangePct !== null && weeklyChangePct !== undefined && Math.abs(weeklyChangePct) >= 25) {
    const dir = weeklyChangePct > 0 ? "up" : "down";
    return `Weekly distance is ${dir} ${pct(weeklyChangePct)} on last week.`;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* sentence 3 — recovery, and what to do                               */
/* ------------------------------------------------------------------ */

/**
 * The recovery picture, written so that a weak input is separated from a weak
 * body. Telling someone with a resting heart rate of 49 that they are
 * "unrecovered" because they slept badly once is misleading; the point is that
 * the capacity is there and the sleep isn't.
 */
function recoveryLine(input: NarrativeInput, limiter: ReadinessComponent | null): string | null {
  const { sleepHours, hrvVsBaselinePct, restingHr } = input;
  const hasSleep = sleepHours !== null && sleepHours !== undefined;
  const hasHrv = hrvVsBaselinePct !== null && hrvVsBaselinePct !== undefined;

  if (!hasSleep && !hasHrv) return null;

  const strong: string[] = [];
  if (hasHrv && (hrvVsBaselinePct as number) >= 95) {
    strong.push(`heart-rate variability is ${Math.round(hrvVsBaselinePct as number)}% of your own baseline`);
  }
  if (restingHr !== null && restingHr !== undefined && restingHr <= 55) {
    strong.push(`resting heart rate is ${restingHr}`);
  }

  // Sleep is the weak link, but the underlying machinery looks fine.
  if (limiter === "sleep" && hasSleep && strong.length > 0) {
    return `Recovery capacity isn't the problem — ${joinList(strong)}. Sleep is: ${round1(sleepHours as number)} hours last night, and it's the weakest input in today's score.`;
  }

  if (limiter === "sleep" && hasSleep) {
    return `Sleep is the weakest input today at ${round1(sleepHours as number)} hours.`;
  }

  if (limiter === "hrv" && hasHrv) {
    return `Heart-rate variability is ${Math.round(hrvVsBaselinePct as number)}% of your baseline — below where you normally sit, which usually means the last few days cost more than they looked.`;
  }

  if (strong.length > 0) {
    const sleepBit = hasSleep ? `, and you slept ${round1(sleepHours as number)} hours` : "";
    return `Recovery looks good: ${joinList(strong)}${sleepBit}.`;
  }

  if (hasSleep) return `You slept ${round1(sleepHours as number)} hours last night.`;
  return null;
}

function verdictLine(input: NarrativeInput): string {
  const { readiness, loadRatio } = input;

  switch (readiness.label) {
    case "Rest day":
      return `Today should be rest, or twenty easy minutes at most.`;
    case "Ease off today":
      return `Go easy today — keep it aerobic and leave the hard work for later in the week.`;
    case "Ready to load":
      // Being ready and being under-trained at the same time is a specific,
      // common situation and deserves its own advice.
      if (loadRatio !== null && loadRatio < 0.8) {
        return `You have room to take real work on — a longer run or a quality session would be well absorbed today.`;
      }
      return `You're ready to take on a hard session today.`;
  }
}

const joinList = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

/* ------------------------------------------------------------------ */
/* the reasoning panel                                                 */
/* ------------------------------------------------------------------ */

function readingFor(component: ReadinessComponent, input: NarrativeInput): string {
  switch (component) {
    case "form":
      return `${signed(input.pmc.tsb)} · ${FORM_ZONE_LABEL[formZone(input.pmc.tsb)].toLowerCase()}`;
    case "loadRatio":
      return input.loadRatio === null
        ? "not enough history"
        : `${input.loadRatio.toFixed(2)} · ${describeRatio(input.loadRatio)}`;
    case "sleep":
      return input.sleepHours == null ? "not recorded" : `${round1(input.sleepHours)} hours`;
    case "hrv":
      return input.hrvVsBaselinePct == null
        ? "not enough nights"
        : `${Math.round(input.hrvVsBaselinePct)}% of baseline`;
    case "cardiacDrift":
      return input.cardiacDriftPct == null
        ? "not measured yet"
        : `${round1(input.cardiacDriftPct)}% · ${describeDrift(input.cardiacDriftPct)}`;
  }
}

function noteFor(component: ReadinessComponent, input: NarrativeInput): string {
  switch (component) {
    case "form":
      return "Fitness minus fatigue. Peak readiness sits slightly fresh rather than maximally fresh — well above +20 means detrained, not ready.";
    case "loadRatio":
      return "This week's load against your own four-week average. Descriptive, not a risk score: the evidence for acute:chronic ratios as an injury predictor is weak.";
    case "sleep":
      return "Anchored at 8 hours. Acute sleep loss costs roughly 7 to 8 percent of performance on average.";
    case "hrv":
      return "Measured against your own rolling baseline, never an absolute value — absolute heart-rate variability varies enormously between people and says nothing on its own.";
    case "cardiacDrift":
      return input.cardiacDriftPct == null
        ? "How much heart rate climbs at a steady pace within a run. Needs per-second data from each activity, which isn't wired up yet."
        : "How much heart rate climbs at a steady pace within a run. Below about 3% is normal; above 8% means the session cost more than its pace suggests.";
  }
}

function describeDrift(pct: number): string {
  if (pct <= 3) return "low, as expected";
  if (pct <= 8) return "mild";
  return "high — that run cost more than its pace suggests";
}

function describeRatio(ratio: number): string {
  if (ratio < 0.8) return "well below your usual level";
  if (ratio < 0.9) return "a little below your usual level";
  if (ratio <= 1.2) return "about your usual level";
  if (ratio <= 1.3) return "a little above your usual level";
  return "well above your usual level";
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

export function buildNarrative(input: NarrativeInput): Narrative {
  const contributions = input.readiness.contributions;

  // The limiter is the component that cost the most points: lowest subscore,
  // weighted by how much it counted. A component scoring 58 at 24% weight held
  // the score back more than one scoring 82 at 24%.
  const limiter =
    contributions.length === 0
      ? null
      : contributions
          .map((c) => ({ c, loss: (100 - c.sub) * c.weight }))
          .sort((a, b) => b.loss - a.loss)
          .filter((x) => x.loss > 3)[0]?.c.component ?? null;

  const context = whereYouAre(input.pmc);
  const longRun =
    input.longestRecentM && input.longestRecentM > 0
      ? `Your longest run in the last month was ${km(input.longestRecentM)}.`
      : null;
  const standout = whatStandsOut(input);
  const recovery = recoveryLine(input, limiter);
  const verdict = verdictLine(input);

  const sentences = [context, standout, longRun, recovery, verdict].filter(
    (s): s is string => s !== null,
  );

  // The hero gets the two sentences that should change what the athlete does
  // today: what is unusual, and what to do about it. Where-you-are is context
  // the metric tiles already show, so it only leads when nothing stands out.
  const lead = standout ?? recovery ?? context;
  const body = [lead, verdict].filter(Boolean).join(" ");

  const tone: Narrative["tone"] =
    input.readiness.label === "Rest day"
      ? "negative"
      : input.readiness.label === "Ease off today"
        ? "caution"
        : "positive";

  const reasoning: ReasoningLine[] = contributions.map((c) => ({
    component: c.component,
    label: COMPONENT_LABEL[c.component],
    reading: readingFor(c.component, input),
    subscore: c.sub,
    weightPct: Math.round(c.weight * 100),
    note: noteFor(c.component, input),
  }));

  return {
    headline: input.readiness.label,
    body,
    full: sentences.join(" "),
    sentences,
    tone,
    reasoning,
    limiter,
    source: "computed",
  };
}

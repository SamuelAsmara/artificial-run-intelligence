/**
 * What every number in Runi actually means.
 *
 * The product shows an athlete a readiness score, a form figure, a load ratio
 * and a cardiac-drift percentage, and until now explained none of them. That is
 * the difference between an instrument and an oracle: an instrument tells you
 * how it arrived at its reading.
 *
 * One page, two depths. Everybody gets the plain-language answer to "what is
 * this and what should I do about it". The formula sits underneath it, open by
 * default for a coach — who is being asked to trust these numbers with twenty
 * athletes — and one click away for an athlete who wants it.
 *
 * The content lives here rather than in the component so it can be checked:
 * every entry has to carry a range, a source, and a sentence about what the
 * number cannot tell you. That last field is the one that keeps this honest.
 */

export interface Method {
  id: string;
  /** what it is called on screen, wherever it appears */
  name: string;
  /** where in the app the athlete meets it */
  seenOn: string;
  /** one sentence, no jargon */
  plain: string;
  /** the actual arithmetic */
  formula: string;
  /** how to read the figure */
  scale: { value: string; meaning: string }[];
  /**
   * What it does NOT tell you.
   *
   * Every model here is a simplification, and an athlete who does not know
   * where the simplification bites will over-trust the number on exactly the
   * day it is wrong.
   */
  limit: string;
  source: string;
}

export const METHODS: Method[] = [
  {
    id: "trimp",
    name: "Training load (TRIMP)",
    seenOn: "Every run · the fitness chart",
    plain:
      "One number for how hard a run was, made from how long you ran and how high your heart rate was while you ran it. An easy hour and a hard twenty minutes can score the same.",
    formula:
      "TRIMP = duration_min × HRr × 0.64 × e^(1.92 × HRr)   where HRr = (HR_avg − HR_rest) / (HR_max − HR_rest)",
    scale: [
      { value: "< 50", meaning: "a short easy run" },
      { value: "50–120", meaning: "a normal training day" },
      { value: "> 200", meaning: "a long run or a hard session" },
    ],
    limit:
      "It needs a heart-rate strap. A run with no heart rate is scored from pace instead, which reads a hilly run as easier than it was.",
    source: "Banister (1991); the exponential weighting is Morton's.",
  },
  {
    id: "ctl",
    name: "Fitness (CTL)",
    seenOn: "The fitness · fatigue · form chart",
    plain:
      "Your training load averaged over about six weeks. It rises slowly and falls slowly, which is exactly how fitness behaves — one big week does not make you fit, and one missed week does not undo you.",
    formula: "CTL_today = CTL_yesterday + (load_today − CTL_yesterday) / 42",
    scale: [
      { value: "rising", meaning: "you are building" },
      { value: "flat", meaning: "you are maintaining" },
      { value: "falling", meaning: "you are detraining, or tapering on purpose" },
    ],
    limit:
      "It knows nothing about what kind of training you did. Six weeks of easy running and six weeks of intervals can produce the same CTL and very different race results.",
    source: "Banister's impulse-response model; the 42-day constant is the convention.",
  },
  {
    id: "atl",
    name: "Fatigue (ATL)",
    seenOn: "The fitness · fatigue · form chart",
    plain:
      "The same idea over about one week instead of six. It spikes after a hard session and settles within days.",
    formula: "ATL_today = ATL_yesterday + (load_today − ATL_yesterday) / 7",
    scale: [
      { value: "near CTL", meaning: "you are training at a level you are used to" },
      { value: "well above CTL", meaning: "you are in a hard block, or overreaching" },
    ],
    limit:
      "It measures training fatigue, not life fatigue. A bad night, a stressful week or being ill do not appear here at all.",
    source: "Banister; 7 days by convention.",
  },
  {
    id: "tsb",
    name: "Form (TSB)",
    seenOn: "The fitness · fatigue · form chart · your home screen",
    plain:
      "Fitness minus fatigue. Positive means you are fresher than usual, negative means you are carrying work. Neither is good or bad on its own — it depends what you are doing that week.",
    formula: "TSB = CTL − ATL",
    scale: [
      { value: "+15 and above", meaning: "fresh — race day, or you have been resting a while" },
      { value: "−10 to +5", meaning: "normal training" },
      { value: "below −20", meaning: "deep in a block; sustainable for a while, not forever" },
    ],
    limit:
      "It is a difference between two averages, so it can read positive during a week off that has actually made you unfit.",
    source: "Coggan's Performance Management Chart.",
  },
  {
    id: "acwr",
    name: "Load ratio (ACWR)",
    seenOn: "Your home screen",
    plain:
      "This week's training compared with the last month's. It is the closest thing running has to an injury-risk warning: bodies cope with load they are used to, and get hurt by sudden jumps.",
    formula:
      "ACWR = acute EWMA (7-day) ÷ chronic EWMA (28-day), both bias-corrected for the days actually recorded",
    scale: [
      { value: "0.8–1.3", meaning: "the range most training should sit in" },
      { value: "> 1.5", meaning: "a sharp jump — the figure most associated with injury" },
      { value: "< 0.8", meaning: "you are doing less than you are used to" },
    ],
    limit:
      "The evidence behind the 'danger zone' is contested and comes mostly from team sports. Treat it as a flag worth a second thought, not a diagnosis.",
    source:
      "Gabbett (2016), exponentially-weighted variant per Williams et al. (2017); criticised by Impellizzeri et al. (2020).",
  },
  {
    id: "gap",
    name: "Grade-adjusted pace",
    seenOn: "Every run with elevation",
    plain:
      "What your pace would have been on flat ground. Running uphill at 6:00/km can be the same effort as 5:00/km on the flat, and comparing the raw numbers would tell you that you had a bad day.",
    formula:
      "cost(i) = 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6   (i = gradient), pace scaled by cost(i) ÷ cost(0)",
    scale: [
      { value: "GAP faster than pace", meaning: "you were running uphill" },
      { value: "GAP slower than pace", meaning: "you were running downhill" },
    ],
    limit:
      "The curve was measured on a treadmill at moderate gradients. On very steep ground, and on technical trail, it flatters you.",
    source: "Minetti et al. (2002), energy cost of running on gradients.",
  },
  {
    id: "drift",
    name: "Cardiac drift",
    seenOn: "Every run with heart rate",
    plain:
      "How much your heart rate climbed over the run while your pace stayed the same. A steady run should not cost more at the end than at the start; when it does, the usual reasons are heat, dehydration, or the run being harder than intended.",
    formula:
      "drift % = (HR/pace in second half ÷ HR/pace in first half − 1) × 100, on steady runs only",
    scale: [
      { value: "< 5%", meaning: "well controlled" },
      { value: "5–10%", meaning: "worth noticing — heat, hydration, or pace" },
      { value: "> 10%", meaning: "the run was harder than it looked" },
    ],
    limit:
      "It is only meaningful on a steady effort. On intervals or a progression run the figure is arithmetic without a meaning, so Runi does not show one.",
    source: "Coyle & González-Alonso (2001), cardiovascular drift.",
  },
  {
    id: "riegel",
    name: "Race prediction",
    seenOn: "Your goal race",
    plain:
      "What your recent times suggest you could run at another distance. It assumes you are trained for the distance you are predicting — it will happily predict a marathon from a 5K you ran last week.",
    formula: "T₂ = T₁ × (D₂ / D₁)^1.06",
    scale: [
      { value: "5K → 10K", meaning: "reliable" },
      { value: "10K → half", meaning: "reasonable" },
      { value: "half → marathon", meaning: "optimistic unless you have done the long runs" },
    ],
    limit:
      "The exponent is one number for every runner. Someone with a strong endurance base beats it; someone who has only raced short distances will not.",
    source: "Riegel (1981); exponent 1.06 is the common value for trained runners.",
  },
  {
    id: "readiness",
    name: "Readiness",
    seenOn: "Your home screen",
    plain:
      "One figure for how ready you look today, from your form, your load ratio, your resting heart rate and your heart-rate variability against your own recent baseline — not against anyone else's.",
    formula:
      "A weighted blend of the components above, each scored against your own 30-day baseline, clamped to 0–100.",
    scale: [
      { value: "80–100", meaning: "ready to load" },
      { value: "60–79", meaning: "train as planned" },
      { value: "< 60", meaning: "easy, or rest — the plan will adjust" },
    ],
    limit:
      "It is only as good as what it is fed. With no HRV and no resting heart rate it falls back to training load alone, and it says so on the card rather than pretending to a fuller picture.",
    source:
      "Baseline-relative scoring after Plews et al. (2013) on HRV-guided training.",
  },
];

export const METHOD_COPY = {
  title: "How the numbers work",
  subtitle: "Every figure in Runi, what it means, and where it stops being true",
  intro:
    "Nothing here is a black box. Each number below is computed from your own data by a published method, and each one has a limit worth knowing.",
  seenOn: "Where you see it",
  howRead: "How to read it",
  limitLabel: "What it does not tell you",
  sourceLabel: "Source",
  showFormula: "Show the formula",
  hideFormula: "Hide the formula",
  back: "Back to settings",
  navLink: "How the numbers work",
  navHint: "TRIMP · CTL · ATL · form · load ratio · readiness",
} as const;

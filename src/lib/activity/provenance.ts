/**
 * Saying what a chart is made of, and what it is missing.
 *
 * ## Why this is a module and not a sentence
 *
 * A run reaches the page through three different doors — a live intervals.icu
 * stream, the summary the importer kept, or somebody typing it in — and any
 * of them can arrive without a heart rate, without elevation, without
 * cadence. The page used to handle that with one hard-coded sentence per
 * branch, which meant the same absence was described differently depending on
 * where in the code it was noticed, and a run missing only its heart rate was
 * described as missing everything.
 *
 * The chart is the product. An athlete who sees a band quietly disappear and
 * is told nothing learns to distrust the whole screen; one who is told "your
 * watch did not record heart rate on this run" learns something true about
 * their own kit. So absence gets the same designed treatment everywhere:
 * where the run came from, at what resolution it is drawn, and exactly which
 * measurements are not there.
 *
 * Pure. Row in, description out.
 */

/** How much detail the chart is drawn from. */
export type Resolution =
  /** a second-by-second stream from the provider */
  | "full"
  /** the stored pace summary — about forty points, pace only */
  | "summary"
  /** nothing drawable */
  | "none";

export interface ProvenanceInput {
  /** `activities.source` */
  source: string | null;
  /** how the chart was drawn */
  resolution: Resolution;
  /** true when the run carries this measurement at all */
  hasHeartRate: boolean;
  hasElevation: boolean;
  hasCadence: boolean;
  hasPower: boolean;
  /** set when the run came from a provider we could not reach just now */
  unreachable?: boolean;
  /**
   * Set when the viewer is the athlete's coach. The stream lives behind the
   * athlete's own provider credentials and `provider_connections` has no
   * coach policy, deliberately — so a coach sees the stored summary, and
   * should be told that rather than that the run has no data.
   */
  restricted?: boolean;
}

export interface Provenance {
  /** short label for the chip: where the run came from */
  sourceLabel: string;
  /** measurements this run does not carry, in the order the chart stacks them */
  missing: string[];
  /** one sentence explaining the absence, or "" when nothing is absent */
  note: string;
}

const SOURCE_LABEL: Record<string, string> = {
  intervals_icu: "intervals.icu",
  strava: "Strava",
  manual: "Entered by hand",
  derived: "Derived",
};

/**
 * Named the way the athlete would name them, and in the order the analysis
 * chart stacks its bands — so the list reads down the missing lanes.
 */
const LABELS = {
  power: "power",
  heartRate: "heart rate",
  cadence: "cadence",
  elevation: "elevation",
} as const;

/** Joins a list the way a person would say it. */
export function listWords(words: string[]): string {
  if (words.length === 0) return "";
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function provenanceOf(input: ProvenanceInput): Provenance {
  const sourceLabel = SOURCE_LABEL[input.source ?? ""] ?? "Unknown source";

  const missing: string[] = [];
  // Power and cadence are absent on most watches and on every phone, so their
  // absence is unremarkable and only worth listing once something else is too.
  if (!input.hasPower) missing.push(LABELS.power);
  if (!input.hasHeartRate) missing.push(LABELS.heartRate);
  if (!input.hasCadence) missing.push(LABELS.cadence);
  if (!input.hasElevation) missing.push(LABELS.elevation);

  return { sourceLabel, missing, note: noteFor(input, missing) };
}

function noteFor(input: ProvenanceInput, missing: string[]): string {
  const manual = input.source === "manual";

  if (input.resolution === "none") {
    if (input.restricted) {
      return "Only the athlete can see this run second by second — the recording sits behind their own provider account. The figures above are the ones stored at import.";
    }
    if (input.unreachable) {
      return "This run's second-by-second record could not be fetched just now, so there is nothing to draw. The figures above are the ones stored at import.";
    }
    return manual
      ? "This run was entered by hand, so there is no recording to draw — only the distance and time that were typed in."
      : "No recording was kept for this run, so there is nothing to draw. The figures above are the ones stored at import.";
  }

  if (input.resolution === "summary") {
    if (input.restricted) {
      return "Drawn from the pace summary stored with this run: the second-by-second recording sits behind the athlete's own provider account and is theirs to see.";
    }
    const head = manual
      ? "Entered by hand, so this chart is drawn from the pace summary stored with the run rather than a second-by-second record"
      : "Drawn from the pace summary stored with this run rather than a second-by-second record";
    return missing.length
      ? `${head} — no ${listWords(missing)} ${missing.length > 1 ? "were" : "was"} kept with it.`
      : `${head}.`;
  }

  // Full resolution: only the genuinely absent measurements are worth naming,
  // and only because the athlete would otherwise wonder where a band went.
  if (!input.hasHeartRate) {
    // Power is filtered out here for the same reason it is never remarked on
    // alone: almost no watch records it, so "and no power either" is noise
    // appended to the one absence that actually matters.
    const rest = missing.filter((m) => m !== LABELS.heartRate && m !== LABELS.power);
    return rest.length
      ? `Your watch did not record heart rate on this run, and no ${listWords(rest)} either — those bands are left out rather than drawn flat.`
      : "Your watch did not record heart rate on this run, so that band is left out rather than drawn flat.";
  }

  const notable = missing.filter((m) => m !== LABELS.power);
  if (notable.length) {
    return `No ${listWords(notable)} was recorded on this run, so ${notable.length > 1 ? "those bands are" : "that band is"} left out rather than drawn flat.`;
  }

  return "";
}

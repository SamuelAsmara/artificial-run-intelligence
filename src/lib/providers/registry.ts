/**
 * The data sources ARI can draw an athlete's training from.
 *
 * ## Sources are interchangeable, not cumulative
 *
 * This is the idea the rest of the app is built around, and it is easy to get
 * backwards. An athlete does not connect five services and receive the union of
 * them. They connect *one* that already holds their history, and that one
 * answers both questions ARI needs: what did you run, and how did you sleep.
 *
 * intervals.icu is that source today because it is itself an aggregator — the
 * athlete has already linked Garmin, Polar, Suunto, Coros or Wahoo *there*, so
 * one credential reaches all of them. Apple is the case that proves the rule:
 * Apple Health does not flow into intervals.icu, so for an Apple athlete it
 * would be the source *instead of* it, not in addition.
 *
 * Note the integration point is Apple **Health**, not the watch. Everything a
 * watch records already syncs into Health on the phone, and Health also holds
 * runs recorded by the phone alone. So the target is one iPhone integration
 * that serves watch owners and phone-only runners alike — a materially larger
 * group than "Apple Watch" implies.
 *
 * That is why `provider_connections` is keyed on (user_id, provider) and why
 * `activities` is keyed on (source, external_id): the schema already treats
 * sources as substitutable. This registry is the same idea on the code side.
 *
 * ## Why unavailable providers are listed at all
 *
 * A settings screen is also a statement of intent. Garmin's Health API and
 * Suunto's partner API both require a formal application, which is a process
 * you begin long before you need it. Listing them commits the product to that
 * path rather than pretending intervals.icu is a permanent answer.
 *
 * Nothing here is a promise that a provider works. `status` says exactly where
 * each one stands, and the UI renders that honestly.
 */

export type ProviderStatus =
  /** implemented and usable today */
  | "available"
  /** the integration exists in principle but is not built yet */
  | "planned"
  /** blocked on someone else — an API application, a partner agreement */
  | "gated";

export type ProviderCapability = "activities" | "sleep" | "hrv" | "restingHr";

export interface ProviderDefinition {
  id: string;
  name: string;
  /** single letter or short mark for the tile */
  mark: string;
  /** css colour for the mark background */
  markColor: string;
  /** what this source can supply */
  capabilities: ProviderCapability[];
  status: ProviderStatus;
  /** one line the settings screen shows under the name */
  summary: string;
  /**
   * Why it is not available yet, shown when status is not "available".
   * Written for the athlete, not for us.
   */
  blockedReason?: string;
  /**
   * True when connecting this source replaces the athlete's current one rather
   * than adding to it. Every full source is exclusive; Strava is not, because
   * it supplies activities only and can sit alongside a recovery source.
   */
  exclusive: boolean;
  /** true when this is the recommended source for a new athlete */
  recommended?: boolean;
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "intervals_icu",
    name: "intervals.icu",
    mark: "i",
    markColor: "var(--color-accent)",
    capabilities: ["activities", "sleep", "hrv", "restingHr"],
    status: "available",
    summary: "Runs, sleep, heart-rate variability and resting heart rate",
    exclusive: true,
    recommended: true,
  },
  {
    id: "strava",
    name: "Strava",
    mark: "S",
    markColor: "var(--color-strava)",
    capabilities: ["activities"],
    status: "available",
    summary: "Runs only — no overnight recovery data",
    exclusive: false,
  },
  {
    id: "apple_health",
    name: "Apple Health",
    mark: "A",
    markColor: "var(--color-line-strong)",
    // An iPhone on its own supplies runs and resting heart rate. Sleep and
    // heart-rate variability need a watch feeding Health — same integration,
    // richer data.
    capabilities: ["activities", "sleep", "hrv", "restingHr"],
    status: "planned",
    summary: "Runs from your iPhone, plus sleep and recovery if you wear a Watch",
    blockedReason:
      "Apple Health data never leaves the phone by itself, so this needs a small " +
      "companion app to read it and send it on. The groundwork is in place; the " +
      "app is not built yet.",
    exclusive: true,
  },
  {
    id: "garmin",
    name: "Garmin Connect",
    mark: "G",
    markColor: "var(--color-line-strong)",
    capabilities: ["activities", "sleep", "hrv", "restingHr"],
    status: "gated",
    summary: "Runs and full overnight recovery, straight from the watch",
    blockedReason:
      "Garmin's Health API needs an approved partner application. Until then, " +
      "connect your Garmin through intervals.icu — the data is the same.",
    exclusive: true,
  },
  {
    id: "suunto",
    name: "Suunto",
    mark: "Su",
    markColor: "var(--color-line-strong)",
    capabilities: ["activities", "sleep", "restingHr"],
    status: "gated",
    summary: "Runs and recovery from Suunto watches",
    blockedReason:
      "Needs a Suunto partner application. Suunto already reaches ARI through " +
      "intervals.icu today.",
    exclusive: true,
  },
  {
    id: "runkeeper",
    name: "Runkeeper",
    mark: "R",
    markColor: "var(--color-line-strong)",
    capabilities: ["activities"],
    status: "planned",
    summary: "Runs only",
    exclusive: false,
  },
];

export const providerById = (id: string): ProviderDefinition | undefined =>
  PROVIDERS.find((p) => p.id === id);

/** Sources that can supply overnight recovery — the half Strava cannot. */
export const recoveryProviders = (): ProviderDefinition[] =>
  PROVIDERS.filter((p) => p.capabilities.includes("sleep"));

/** What an athlete can actually connect right now. */
export const availableProviders = (): ProviderDefinition[] =>
  PROVIDERS.filter((p) => p.status === "available");

/**
 * Whether connecting `candidate` would replace `current`.
 *
 * Used by the settings screen to warn before an athlete swaps their source and
 * silently changes where every number on the dashboard comes from.
 */
export function wouldReplace(
  candidate: ProviderDefinition,
  current: ProviderDefinition | undefined,
): boolean {
  if (!current || current.id === candidate.id) return false;
  return candidate.exclusive && current.exclusive;
}

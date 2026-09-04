/**
 * The two coach packages.
 *
 * On screen they are Basic and Premium. In the database they are the `free`
 * and `pro` values the `subscriptions.plan` check has allowed since 0001 —
 * renaming a check constraint buys nothing, so the mapping lives here and
 * nowhere else.
 *
 * A seat is one active athlete on the roster. Basic stops at five; Premium
 * has no practical limit, and the number below is only there because the
 * column is `not null`.
 */

import type { Plan } from "@/types/database.types";

export type CoachTier = "basic" | "premium";

export const PREMIUM_SEATS = 100_000;

export const COACH_PLANS: Record<CoachTier, {
  tier: CoachTier;
  dbPlan: Plan;
  name: string;
  price: string;
  seatLimit: number;
  tagline: string;
  features: string[];
}> = {
  basic: {
    tier: "basic",
    dbPlan: "free",
    name: "Basic",
    price: "Free for 6 months, then $5/mo",
    seatLimit: 5,
    tagline: "For a coach with a handful of athletes.",
    features: [
      "Up to 5 athletes",
      "Roster with attention flags",
      "Preparation cycles and templates",
      "Edit any athlete's session",
    ],
  },
  premium: {
    tier: "premium",
    dbPlan: "pro",
    name: "Premium",
    price: "$10/mo",
    seatLimit: PREMIUM_SEATS,
    tagline: "For a coach who runs a club.",
    features: [
      "Unlimited athletes",
      "Everything in Basic",
      "RunAI for coach — free-text chat with Runi, coming next",
      "Priority for new integrations",
    ],
  },
};

/**
 * The athlete's two packages — Basic and Premium.
 *
 * Same `free`/`pro` values as the coach packages, in a separate
 * `subscriptions` row per `scope` (0023) so a coach who also trains keeps
 * the two apart. Only the copy differs:
 * an athlete isn't managing seats, so Premium's one addition is RunAI, the
 * free-text assistant built on Runi's own LLM layer.
 */
export const ATHLETE_PLANS: Record<CoachTier, {
  tier: CoachTier;
  dbPlan: Plan;
  name: string;
  price: string;
  tagline: string;
  features: string[];
}> = {
  basic: {
    tier: "basic",
    dbPlan: "free",
    name: "Basic",
    price: "Free",
    tagline: "Everything you need to train with Runi.",
    features: [
      "Full training plan, generated from your own data",
      "Readiness, load and trend tracking",
      "Connect your watch through intervals.icu",
    ],
  },
  premium: {
    tier: "premium",
    dbPlan: "pro",
    name: "Premium",
    price: "$10/mo · coming next",
    tagline: "Basic, plus a coach in your pocket.",
    features: [
      "Everything in Basic",
      "RunAI — ask questions about your training in plain language",
      "Built on Runi's own LLM layer, not a generic chatbot",
    ],
  },
};

export function tierOf(plan: Plan | null | undefined): CoachTier | null {
  if (plan === "free") return "basic";
  if (plan === "pro") return "premium";
  return null;
}

export function seatLimitFor(tier: CoachTier): number {
  return COACH_PLANS[tier].seatLimit;
}

/** "3 of 5 athletes" / "12 athletes" — the roster line under the plan name. */
export function seatsLabel(tier: CoachTier, athletes: number): string {
  const limit = seatLimitFor(tier);
  if (limit >= PREMIUM_SEATS) return `${athletes} athlete${athletes === 1 ? "" : "s"}`;
  return `${athletes} of ${limit} athletes`;
}

/** Whether one more athlete can join this coach's roster. */
export function hasSeat(tier: CoachTier | null, athletes: number): boolean {
  if (tier === null) return true; // an account from before the packages: never blocked
  return athletes < seatLimitFor(tier);
}

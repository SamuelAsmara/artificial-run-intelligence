/**
 * The words on the sign-in screen.
 *
 * Ported from the Figma design (file M0S7O3aLOXUcphFoXpry8C, node 2:4), with
 * the copy rewritten — see the note on `headline` for why.
 *
 * This file used to also export `qrPath` — a deterministic fake QR code — and
 * `TARGET_BY_RACE`, a table of invented goal times (a 47-minute 10K, a 3:45
 * marathon). Both belonged to the old prototype's coach screen, which has since
 * been rebuilt on real data, and neither had any remaining importer. Removed
 * rather than left lying about: a fabricated constant with no call sites is a
 * fabrication waiting for somebody to import it.
 */

export const LOGIN_COPY = {
  brand: "ARI",

  /**
   * The one line the product gets to explain itself.
   *
   * The first mock said "GET STARTED", which is a button label rather than a
   * claim. Every competitor measures — a watch counts, Strava displays,
   * intervals.icu hands you tools. None of them tells you what any of it meant.
   * So the headline claims precision and the subhead is the pipeline itself:
   * measure the run, explain what happened, move the plan accordingly.
   */
  heroTitle: "Precision in every step",
  heroSub: "Measured, explained, adjusted.",

  login: "Log in",
  signup: "Sign up",

  fUser: "Username",
  fUserPh: "what should ARI call you?",
  fEmail: "Email",
  fEmailPh: "you@run.com",
  fPass: "Password",
  fPassPh: "at least 8 characters",

  fRole: "I am joining as",
  roleAth: "Athlete",
  roleAthSub: "Train with an adaptive plan",
  roleCoach: "Coach",
  roleCoachSub: "Manage a roster of athletes",

  forgot: "Forgot password?",
  resetSent: "Check your inbox for the reset link.",
  confirmSent: "Account created — check your inbox to confirm the address.",

  submitLogin: "Log in",
  submitSignup: "Create account",
  working: "One moment…",

  /**
   * The social buttons are drawn as ordinary buttons and do nothing yet.
   *
   * Neither is wired: Google needs OAuth configuration and redirect URLs, and
   * Sign in with Apple needs a paid developer account. They are kept live-
   * looking so the card is not spoiled by two greyed-out controls, and they
   * answer when pressed rather than sitting silent — silence reads as a broken
   * page, not as a feature that has not shipped.
   */
  orConnect: "Or connect with",
  google: "Google",
  apple: "Apple",
} as const;

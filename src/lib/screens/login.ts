/**
 * The words on the sign-in screen.
 *
 * Ported from the Figma design (file M0S7O3aLOXUcphFoXpry8C, node 2:4), with
 * the copy rewritten — see the note on `headline` for why.
 *
 * `qrPath` and `TARGET_BY_RACE` are still here because CoachView imports them;
 * they belong to the old prototype and will move when that screen is rebuilt.
 */

/** Deterministic fake QR for the coach-code modal. */
export function qrPath(): string {
  let a = 99;
  const rnd = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let d = "";
  const c = 8;
  const eye = (x: number, y: number) => {
    d += "M" + x + " " + y + "h" + c * 3 + "v" + c * 3 + "h-" + c * 3 + "z";
  };
  eye(8, 8); eye(8, 64); eye(64, 8);
  for (let i = 0; i < 11; i++) {
    for (let j = 0; j < 11; j++) {
      const x = 8 + i * c, y = 8 + j * c;
      if ((i < 4 && j < 4) || (i < 4 && j > 6) || (i > 6 && j < 4)) continue;
      if (rnd() > 0.5) d += "M" + x + " " + y + "h" + (c - 2) + "v" + (c - 2) + "h-" + (c - 2) + "z";
    }
  }
  return d;
}

export const TARGET_BY_RACE: Record<string, string> = {
  "5K": "22:00", "10K": "47:00", Half: "1:45:00", Marathon: "3:45:00",
};

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

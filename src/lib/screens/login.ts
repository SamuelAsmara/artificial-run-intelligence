/**
 * Login / onboarding screen model — ported from
 * design_handoff_ari_athlete_app/ARI Login.dc.html.
 *
 * The auth here is still the prototype's: it validates locally and switches
 * view. Wiring it to Supabase auth is a separate step.
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
  tagline: "Artificial Run Intelligence — a data-driven coach for distance runners.",
  login: "Log in", signup: "Sign up",
  fUser: "Username", fEmail: "Email", fPass: "Password",
  fRole: "I am joining as",
  roleAth: "Athlete", roleAthSub: "Train with an adaptive plan",
  roleCoach: "Coach", roleCoachSub: "Manage a roster of athletes",
  demoNote: "Demo · any details work · nothing is stored",
  navHome: "Home", navActivities: "Activities", navPlan: "Plan", navSettings: "Settings",
  emptyContext: "No goal race yet", aiTag: "AI Coach",
  emptyReadiness: "Readiness · needs 7 days of data",
  emptyNarrative:
    "Welcome! I don’t know anything about your running yet. Connect Strava or add your first run, then build a plan — or join a coach’s plan with a code.",
  ctaBuild: "Build my training plan", ctaCode: "I have a coach code",
  noData: "No data yet",
  emptyChartTitle: "Fitness · Fatigue · Form will appear here",
  emptyChartSub: "The chart starts drawing after your first synced run.",
  builtMsg: "Plan created — 12 weeks to your marathon.",
  builtSub: "Preview the dashboard with demo data:",
  builtGo: "Open dashboard",
  coachTag: "Coach account", coachWelcome: "Welcome, Coach",
  coachSub: "Your roster is empty — invite athletes or open the coach dashboard.",
  coachGo: "Open coach dashboard",
  planTitle: "Build my training plan",
  planSub: "ARI generates an adaptive plan from your goal — it recalibrates after every run.",
  pRace: "Goal race", pDate: "Race date", pTarget: "Target time",
  pDays: "Training days per week",
  planGo: "Generate plan",
  planGenMsg: "Building your plan — analyzing goal, timeline and level…",
  codeTitle: "Join a coach’s plan",
  codeSub: "Scan the QR your coach sent, or type the code.",
  codeField: "Plan code", cancel: "Cancel", join: "Join plan",
  syncing: "Verifying code · syncing plan…",
  syncedMsg: "Connected to Coach Dana · Marathon plan · 12 weeks",
  syncedSub: "The plan was downloaded and your coach can now see your training data.",
};

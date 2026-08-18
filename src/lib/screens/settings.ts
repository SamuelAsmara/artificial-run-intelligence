import { formatMinSec } from "@/lib/format/pace";
/**
 * Settings screen copy and helpers — ported from
 * design_handoff_ari_athlete_app/ARI Settings.dc.html.
 *
 * The Strava flow here is the prototype's simulation. In production it becomes
 * a real OAuth2 round-trip (`read,activity:read_all`) plus webhook ingest into
 * activities + activity_streams — see docs/architecture.
 */

export const RACE_KM: Record<string, number> = {
  "5K": 5, "10K": 10, Half: 21.0975, Marathon: 42.195,
};

export const RACE_DEFAULT_TARGET: Record<string, string> = {
  "5K": "22:00", "10K": "47:00", Half: "1:45:00", Marathon: "3:45:00",
};

/** "3:45:00" over a marathon -> "5:20 /km". Returns "—" on bad input. */
export function requiredPace(goalRace: string, target: string): string {
  const km = RACE_KM[goalRace];
  const parts = (target || "").split(":").map(Number);
  if (!km || !parts.length || parts.some(isNaN)) return "—";
  const sec = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + (parts[1] || 0);
  const sk = sec / km;
  return formatMinSec(sk) + " /km";
}

export const PROVIDERS = [
  { name: "Garmin Connect", letter: "G", bg: "var(--color-line-strong)" },
  { name: "Suunto", letter: "Su", bg: "var(--color-line-strong)" },
  { name: "Apple Watch", letter: "A", bg: "var(--color-line-strong)" },
  { name: "Runkeeper", letter: "R", bg: "var(--color-line-strong)" },
];

export const SET_COPY = {
  brand: "ARI", navHome: "Home", navActivities: "Activities",
  navPlan: "Plan", navSettings: "Settings",
  title: "Settings",
  profileTitle: "Personal details",
  profileSub: "Used to calibrate training load and pace zones.",
  fName: "Full name", fEmail: "Email", fBio: "About",
  fGoalRace: "Training for", fTarget: "Target time", fPace: "Required pace",
  fBioPh: "A short bio — what are you training for?",
  fPhoto: "Profile photo",
  fPhotoSub: "Drag an image onto the circle, or click to browse.",
  fAge: "Age", fHeight: "Height (cm)", fWeight: "Weight (kg)", fLevel: "Running level",
  save: "Save changes", savedMsg: "Saved",
  secTitle: "Account & security", secSub: "Change your sign-in email or password.",
  curEmail: "Email", updEmail: "Update email",
  emailMsg: "Email updated — check your inbox to confirm.",
  curPass: "Current password", newPass: "New password",
  updPass: "Update password", passMsg: "Password updated.",
  connTitle: "Connectivity",
  connSub: "Connect a device or service to sync runs automatically.",
  strava: "Strava", connect: "Connect", connecting: "Connecting…", connected: "Connected",
  stAccount: "Account", stLastSync: "Last sync", stAuto: "Auto-sync new activities",
  syncNow: "Sync now", disconnect: "Disconnect", soon: "Coming soon",
  authTitle: "Authorize ARI", authSub: "strava.com · secure authorization",
  authScopes: "ARI is requesting permission to:",
  scope1: "View your activities and activity streams",
  scope2: "View your public profile",
  scope3: "Sync new runs automatically after upload",
  authNote: "You can revoke access at any time from your Strava settings.",
  cancel: "Cancel", authorize: "Authorize",
};

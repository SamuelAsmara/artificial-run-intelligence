/**
 * Settings screen copy, provider tiles and helpers.
 *
 * The page is three stacked cards: a profile that flips between a summary and
 * a full editor, a row of provider logos acting as tabs over one detail panel,
 * and account details that expand inline.
 *
 * Nothing here consults the database. It holds the words, the tile artwork and
 * two pure functions, so the design can be read and changed without reading the
 * wiring — and so the wiring cannot quietly invent copy.
 */

import { formatMinSec } from "@/lib/format/pace";
import type { RaceType } from "@/types/database.types";

/* ------------------------------------------------------------------ */
/* Race distances                                                      */
/* ------------------------------------------------------------------ */

/**
 * The design labels distances "5K / 10K / Half / Marathon"; the database calls
 * them "5k / 10k / half / full". Both are right for their audience, so the
 * mapping lives here rather than leaking either name into the other's world.
 *
 * There is deliberately no `defaultTarget`. Each option used to carry one —
 * 22:00, 47:00, 1:45:00, 3:45:00 — which the screen wrote into the field as
 * soon as a distance was tapped. Press Save and a goal time nobody had chosen
 * was stored, shown back as "Required pace", and used to generate a plan. A
 * goal is the one number on this screen that has to come from the athlete.
 */
export const RACE_OPTIONS: { value: RaceType; label: string; km: number }[] = [
  { value: "5k", label: "5K", km: 5 },
  { value: "10k", label: "10K", km: 10 },
  { value: "half", label: "Half", km: 21.0975 },
  { value: "full", label: "Marathon", km: 42.195 },
];

export const raceLabel = (value: RaceType | null): string =>
  RACE_OPTIONS.find((r) => r.value === value)?.label ?? "—";

/** "3:45:00" over a marathon -> "5:20 /km". Returns "—" on anything unusable. */
export function requiredPace(race: RaceType | null, target: string | null): string {
  const km = RACE_OPTIONS.find((r) => r.value === race)?.km;
  const parts = (target || "").split(":").map(Number);
  if (!km || !target || parts.some((n) => !Number.isFinite(n))) return "—";
  const sec =
    parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts.length === 2
        ? parts[0] * 60 + parts[1]
        : NaN;
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  return formatMinSec(sec / km) + " /km";
}

/** "3:45:00" or "47:00" -> seconds. null when blank, "invalid" when not a time. */
export function parseTargetTime(raw: string): number | null | "invalid" {
  const t = (raw ?? "").trim();
  if (t === "") return null;
  const parts = t.split(":");
  if (parts.length < 2 || parts.length > 3) return "invalid";
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return "invalid";
  const n = parts.map(Number);
  const seconds = parts.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
  // Anything under ten minutes or over twelve hours is a typo, not a goal.
  if (seconds < 600 || seconds > 43_200) return "invalid";
  return seconds;
}


export const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

/* ------------------------------------------------------------------ */
/* The connections row                                                 */
/* ------------------------------------------------------------------ */

/**
 * A tile in the logo row.
 *
 * `logo` is the mark as it appears on its own brand background — wordmarks in
 * their original colours on white, glyphs in white on the brand colour. When
 * the image cannot load (an ad blocker, an offline demo) the tile falls back to
 * `mark`, so the row never shows an empty chip.
 */
export interface ProviderTile {
  /** matches ProviderDefinition.id in @/lib/providers/registry */
  id: string;
  name: string;
  logo: string | null;
  /** rendered height of the mark, px */
  logoHeight: number;
  chipBg: string;
  /** fallback glyph when the logo image fails */
  mark: string;
  markColor: string;
}

/**
 * Left to right, exactly as the handoff orders them: the watch brands first,
 * then the services, then intervals.icu — which is last because it is the one
 * that is actually connected, and the row reads as a progression towards it.
 */
export const PROVIDER_TILES: ProviderTile[] = [
  {
    id: "garmin",
    name: "Garmin Connect",
    logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Garmin_logo_2006.svg",
    logoHeight: 12,
    chipBg: "#ffffff",
    mark: "G",
    markColor: "#0a3d68",
  },
  {
    id: "suunto",
    name: "Suunto",
    logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Suunto-logo.svg",
    logoHeight: 11,
    chipBg: "#ffffff",
    mark: "Su",
    markColor: "#1a1a1a",
  },
  {
    id: "strava",
    name: "Strava",
    logo: "https://cdn.simpleicons.org/strava/white",
    logoHeight: 20,
    chipBg: "#fc4c02",
    mark: "S",
    markColor: "#ffffff",
  },
  {
    id: "apple_health",
    name: "Apple Health",
    logo: "https://cdn.simpleicons.org/apple/white",
    logoHeight: 20,
    chipBg: "#0b0b0d",
    mark: "A",
    markColor: "#ffffff",
  },
  {
    id: "runkeeper",
    name: "Runkeeper",
    logo: "/logos/runkeeper.png",
    logoHeight: 30,
    chipBg: "#2dc9d7",
    mark: "R",
    markColor: "#06282c",
  },
  {
    id: "intervals_icu",
    name: "intervals.icu",
    logo: null,
    logoHeight: 18,
    chipBg: "#ffffff",
    mark: "i",
    markColor: "#e34a4a",
  },
];

/**
 * The providers whose data reaches Runi through intervals.icu.
 *
 * Selecting any of them shows the intervals.icu panel, because that is the
 * truthful answer to "is my Garmin connected?" — it is, by way of a service the
 * athlete already linked. The panel names which one, so the redirection is
 * stated rather than silently performed.
 */
export const VIA_INTERVALS = ["intervals_icu", "garmin", "suunto", "strava"] as const;

export const reachesUsViaIntervals = (id: string): boolean =>
  (VIA_INTERVALS as readonly string[]).includes(id);

export const SET_COPY = {
  brand: "Runi",
  navHome: "Home",
  navActivities: "Activities",
  navPlan: "Plan",
  navSettings: "Settings",
  title: "About you",
  subtitle: "Personal details · connections · coach & plan · account & security",

  profileTitle: "Personal details",
  profileSub: "Used to calibrate training load and pace zones.",
  fName: "Full name",
  fBio: "About",
  fBioPh: "A short bio — what are you training for?",
  fGoalRace: "Training for",
  fTarget: "Target time",
  fRaceDate: "Race date",
  fPace: "Required pace",
  fPhoto: "Profile photo",
  fPhotoSub: "Drag an image onto the circle, or click to browse.",
  fAge: "Age",
  fHeight: "Height (cm)",
  fWeight: "Weight (kg)",
  fLevel: "Running level",
  noBio: "No bio yet.",
  edit: "Edit",
  save: "Save changes",
  saving: "Saving…",
  cancel: "Cancel",
  savedMsg: "Saved",

  connTitle: "Connections",
  connSub: "Where your runs and recovery data come from.",
  icuName: "intervals.icu",
  icuDesc: "Runs, sleep, heart-rate variability and resting heart rate",
  icuAccount: "Account",
  icuKey: "API key",
  icuChecked: "Last checked",
  icuRecent: "Most recent run",
  connected: "Connected",
  notConnected: "Not connected",
  syncNow: "Sync now",
  syncing: "Syncing…",
  disconnect: "Disconnect",
  never: "Never",
  comingSoon: "Coming soon",

  secTitle: "Account & security",
  secSub: "Your sign-in details. Changes require your password.",
  curEmail: "Email",
  newEmail: "New email",
  repeatEmail: "Repeat new email",
  confirmPass: "Confirm with password",
  updEmail: "Update email",
  emailMsg: "Email updated — check your inbox to confirm.",
  passTitle: "Password",
  curPass: "Current password",
  newPass: "New password",
  repeatPass: "Repeat new password",
  updPass: "Update password",
  passMsg: "Password updated.",
  change: "Change",
  close: "Close",
} as const;

/**
 * A coach's settings, and the pure helpers around them.
 *
 * Separate from `actions/coach.ts` for the same reason `templates.ts` is: that
 * file is `"use server"`, where **every export becomes a public RPC endpoint**
 * and must therefore be an async function. A constant or a plain function put
 * there fails the build — which is the framework enforcing something worth
 * enforcing, since an accidental export there is an accidental endpoint.
 */

import {
  LOW_READINESS, OVERLOAD_RATIO, RACE_SOON_DAYS, SILENT_DAYS, UNDERLOAD_RATIO,
} from "@/lib/coach/roster";
import type { RaceType } from "@/types/database.types";

export interface CoachPreferences {
  raceColors: Record<string, string>;
  silentDays: number;
  overloadRatio: number;
  underloadRatio: number;
  lowReadiness: number;
  raceSoonDays: number;
}

export const DEFAULT_PREFERENCES: CoachPreferences = {
  raceColors: {},
  silentDays: SILENT_DAYS,
  overloadRatio: OVERLOAD_RATIO,
  underloadRatio: UNDERLOAD_RATIO,
  lowReadiness: LOW_READINESS,
  raceSoonDays: RACE_SOON_DAYS,
};

const RACE_KM: Record<RaceType, number> = { "5k": 5, "10k": 10, half: 21.0975, full: 42.195 };

/**
 * A goal time over a goal distance, as seconds per kilometre.
 *
 * The roster screen filters on this, so it has to be a number rather than the
 * "3:45:00" the athlete typed. Returns null on anything unparseable rather than
 * a plausible-looking wrong figure — a filter that quietly mis-sorts is worse
 * than one that leaves a row out.
 */
export function targetPaceSeconds(race: RaceType | null, target: string | null): number | null {
  if (!race || !target) return null;
  const parts = target.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  const seconds = parts.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds / RACE_KM[race]);
}

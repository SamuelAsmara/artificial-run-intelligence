"use server";

/**
 * Reading and writing the athlete's own profile.
 *
 * Settings shows a read-only summary and only opens an editor when asked, so
 * these are the two halves of that: one action that returns everything the
 * summary needs, and one that saves what the editor changed.
 *
 * The learned physiological values — maximum heart rate, threshold — are
 * deliberately *not* writable here. They are measured from the athlete's own
 * runs, and letting the settings form overwrite them would mean a number the
 * engine relies on could be set by whoever typed hardest.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseTargetTime } from "@/lib/screens/settings";
import type { RaceType, RunningLevel } from "@/types/database.types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface AthleteProfileView {
  email: string;
  fullName: string | null;
  bio: string | null;
  age: number | null;
  sex: "male" | "female" | null;
  heightCm: number | null;
  weightKg: number | null;
  runningLevel: "beginner" | "intermediate" | "advanced" | null;
  avatarUrl: string | null;
  avatarPosition: string;
  /** learned from training, shown but not editable */
  hrMax: number | null;
  lthr: number | null;
  thresholdsMeasured: boolean;
  /** the active goal race, if there is one */
  raceType: RaceType | null;
  raceDate: string | null;
  targetTime: string | null;
}

export async function getAthleteProfile(): Promise<AthleteProfileView | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: race }] = await Promise.all([
    supabase
      .from("profiles")
      // Must be a single string literal: supabase-js infers the row shape from
      // it, and concatenation collapses that to an unusable type.
      .select("email, full_name, bio, age, sex, height_cm, weight_kg, running_level, avatar_url, avatar_position, hr_max, lthr, thresholds_measured")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("goal_races")
      .select("race_type, race_date, target_time")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("race_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    email: profile?.email ?? user.email ?? "",
    fullName: profile?.full_name ?? null,
    bio: profile?.bio ?? null,
    age: profile?.age ?? null,
    sex: (profile?.sex as AthleteProfileView["sex"]) ?? null,
    heightCm: profile?.height_cm ?? null,
    weightKg: profile?.weight_kg ?? null,
    runningLevel: (profile?.running_level as AthleteProfileView["runningLevel"]) ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    avatarPosition: profile?.avatar_position ?? "50% 30%",
    hrMax: profile?.hr_max ?? null,
    lthr: profile?.lthr ?? null,
    thresholdsMeasured: profile?.thresholds_measured ?? false,
    raceType: (race?.race_type as RaceType) ?? null,
    raceDate: race?.race_date ?? null,
    targetTime: race?.target_time ?? null,
  };
}

export interface ProfileEdit {
  fullName: string;
  bio: string;
  age: string;
  sex: string;
  heightCm: string;
  weightKg: string;
  runningLevel: string;
  avatarUrl?: string | null;
  avatarPosition?: string;
  /* --- the goal race, which lives in its own table --- */
  raceType?: string;
  /** ISO date */
  raceDate?: string;
  /** "3:45:00" */
  targetTime?: string;
}

/** Roughly 200 KB of base64, which is a generous 400x400 JPEG. */
const MAX_AVATAR_CHARS = 280_000;

/** Parses a numeric field, returning null for blank and rejecting nonsense. */
function numberOrNull(raw: string, min: number, max: number): number | null | "invalid" {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < min || n > max) return "invalid";
  return n;
}

export async function saveAthleteProfile(edit: ProfileEdit): Promise<Result<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const age = numberOrNull(edit.age, 10, 100);
  if (age === "invalid") return { ok: false, error: "Age should be between 10 and 100." };

  const heightCm = numberOrNull(edit.heightCm, 100, 250);
  if (heightCm === "invalid") return { ok: false, error: "Height should be in centimetres, between 100 and 250." };

  const weightKg = numberOrNull(edit.weightKg, 30, 250);
  if (weightKg === "invalid") return { ok: false, error: "Weight should be in kilograms, between 30 and 250." };

  const sex = edit.sex === "male" || edit.sex === "female" ? edit.sex : null;
  const LEVELS: RunningLevel[] = ["beginner", "intermediate", "advanced"];
  const level = LEVELS.includes(edit.runningLevel as RunningLevel)
    ? (edit.runningLevel as RunningLevel)
    : null;

  if (edit.avatarUrl && edit.avatarUrl.length > MAX_AVATAR_CHARS) {
    return { ok: false, error: "That photo is too large even after resizing — try a smaller one." };
  }
  if (edit.avatarUrl && !edit.avatarUrl.startsWith("data:image/")) {
    return { ok: false, error: "That doesn't look like an image." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: edit.fullName.trim() || null,
      bio: edit.bio.trim() || null,
      age,
      sex,
      height_cm: heightCm,
      weight_kg: weightKg,
      running_level: level,
      ...(edit.avatarUrl !== undefined ? { avatar_url: edit.avatarUrl } : {}),
      ...(edit.avatarPosition ? { avatar_position: edit.avatarPosition } : {}),
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  const raceSaved = await saveGoalRace(supabase, user.id, edit);
  if (!raceSaved.ok) return raceSaved;

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  return { ok: true, data: null };
}

/* ------------------------------------------------------------------ */
/* The goal race                                                       */
/* ------------------------------------------------------------------ */

const RACE_TYPES: RaceType[] = ["5k", "10k", "half", "full"];

/**
 * Writes the athlete's goal race.
 *
 * Deliberately *updates the active race in place* rather than creating a new
 * one, and deliberately does not regenerate the training plan. Changing a
 * target time in Settings should not silently rebuild — and so discard — weeks
 * of a plan the athlete has been running. The Plan screen owns that decision
 * and asks before it acts.
 */
async function saveGoalRace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  edit: ProfileEdit,
): Promise<Result<null>> {
  // Nothing to do unless the editor actually sent race fields.
  if (edit.raceType === undefined && edit.raceDate === undefined && edit.targetTime === undefined) {
    return { ok: true, data: null };
  }

  const raceType = RACE_TYPES.includes(edit.raceType as RaceType)
    ? (edit.raceType as RaceType)
    : null;
  if (edit.raceType && !raceType) return { ok: false, error: "That isn't a race distance we plan for." };

  const target = parseTargetTime(edit.targetTime ?? "");
  if (target === "invalid") {
    return { ok: false, error: "Target time should look like 3:45:00 or 47:00." };
  }

  const raceDate = (edit.raceDate ?? "").trim();
  if (raceDate && !/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) {
    return { ok: false, error: "That date isn't valid." };
  }

  const { data: existing } = await supabase
    .from("goal_races")
    .select("id, race_date")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("race_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const targetTime = edit.targetTime?.trim() ? edit.targetTime.trim() : null;

  if (existing) {
    const { error: upErr } = await supabase
      .from("goal_races")
      .update({
        ...(raceType ? { race_type: raceType } : {}),
        ...(raceDate ? { race_date: raceDate } : {}),
        target_time: targetTime,
      })
      .eq("id", existing.id);
    if (upErr) return { ok: false, error: `Could not save the goal race: ${upErr.message}` };
    return { ok: true, data: null };
  }

  // No race yet. A row needs a date, so without one there is nothing to store —
  // the athlete picks a distance now and sets the date when they build a plan.
  if (!raceType || !raceDate) return { ok: true, data: null };

  const { error: insErr } = await supabase.from("goal_races").insert({
    user_id: userId,
    race_type: raceType,
    race_date: raceDate,
    target_time: targetTime,
  });
  if (insErr) return { ok: false, error: `Could not save the goal race: ${insErr.message}` };
  return { ok: true, data: null };
}

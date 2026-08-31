"use server";

/**
 * Cycles a coach runs.
 *
 * A cycle is a named group preparing for one race day from one template —
 * "Marathon prep · Tel Aviv" — and its members are whoever the coach puts in
 * it. Each member's plan is built from the cycle's template on the day they
 * join, so two people in one cycle can be in week 3 and week 7 of the same
 * preparation; the cycle screen shows each one's week next to their name.
 *
 * Row-level security (migration 0020) is what keeps a coach inside their own
 * roster: every write here goes through policies that check `is_coach_of`.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generatePlanAction } from "./plan";
import type { RaceType } from "@/types/database.types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface CycleMember {
  athleteId: string;
  name: string;
  avatarUrl: string | null;
  /** 1-based week of their plan today, and the plan's length; null without a plan */
  week: number | null;
  weeks: number | null;
  /** the plan was built for this cycle (as opposed to one they already had) */
  planFromCycle: boolean;
}

export interface CoachCycle {
  id: string;
  name: string;
  raceType: RaceType;
  raceDate: string;
  templateId: string | null;
  templateName: string | null;
  notes: string | null;
  members: CycleMember[];
}

export interface TemplateOption { id: string | null; raceType: RaceType; name: string; weeks: number; own: boolean }

const RACE_TYPES: RaceType[] = ["5k", "10k", "half", "full"];
const DAY = 86_400_000;

export async function getCoachCycles(): Promise<{ cycles: CoachCycle[]; templates: TemplateOption[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { cycles: [], templates: [] };

  const [{ data: cycles }, { data: links }, { data: templates }] = await Promise.all([
    supabase.from("coach_cycles").select("id, name, race_type, race_date, template_id, notes").eq("coach_id", user.id).order("race_date", { ascending: true }),
    supabase.from("coach_athletes").select("athlete_id, cycle_id").eq("coach_id", user.id).eq("status", "active"),
    supabase.from("plan_templates").select("id, coach_id, race_type, name, weeks").or(`coach_id.eq.${user.id},coach_id.is.null`),
  ]);

  const memberIds = (links ?? []).filter((l) => l.cycle_id).map((l) => l.athlete_id);
  const [{ data: profiles }, { data: plans }] = await Promise.all([
    memberIds.length ? supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", memberIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string; avatar_url: string | null }[] }),
    memberIds.length ? supabase.from("training_plans").select("id, user_id, cycle_id").in("user_id", memberIds).eq("status", "active") : Promise.resolve({ data: [] as { id: string; user_id: string; cycle_id: string | null }[] }),
  ]);
  const planIds = (plans ?? []).map((p) => p.id);
  const { data: rows } = planIds.length
    ? await supabase.from("plan_workouts").select("plan_id, week_number, day_date").in("plan_id", planIds)
    : { data: [] as { plan_id: string; week_number: number; day_date: string }[] };

  // week today = weeks since the plan's first day, +1; length = the highest week number
  const today = new Date().toISOString().slice(0, 10);
  const planSpan = new Map<string, { first: string; weeks: number }>();
  for (const r of rows ?? []) {
    const cur = planSpan.get(r.plan_id);
    if (!cur) planSpan.set(r.plan_id, { first: r.day_date, weeks: r.week_number });
    else { if (r.day_date < cur.first) cur.first = r.day_date; if (r.week_number > cur.weeks) cur.weeks = r.week_number; }
  }
  const planByUser = new Map((plans ?? []).map((p) => [p.user_id, p]));
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const member = (athleteId: string): CycleMember => {
    const p = profileById.get(athleteId);
    const plan = planByUser.get(athleteId);
    const span = plan ? planSpan.get(plan.id) : undefined;
    const week = span ? Math.min(span.weeks, Math.max(1, Math.floor((Date.parse(today) - Date.parse(span.first)) / (7 * DAY)) + 1)) : null;
    return {
      athleteId,
      name: p?.full_name || p?.email || "Athlete",
      avatarUrl: p?.avatar_url ?? null,
      week,
      weeks: span?.weeks ?? null,
      planFromCycle: !!plan?.cycle_id,
    };
  };

  const templateName = new Map((templates ?? []).map((t) => [t.id, t.name ?? `${t.race_type} template`]));
  const out: CoachCycle[] = (cycles ?? []).map((c) => ({
    id: c.id, name: c.name, raceType: c.race_type as RaceType, raceDate: c.race_date,
    templateId: c.template_id, templateName: c.template_id ? templateName.get(c.template_id) ?? null : null, notes: c.notes,
    members: (links ?? []).filter((l) => l.cycle_id === c.id).map((l) => member(l.athlete_id)).sort((a, b) => a.name.localeCompare(b.name)),
  }));

  // one option per distance: the coach's own template where it exists, else Runi's built-in
  const options: TemplateOption[] = RACE_TYPES.map((rt) => {
    const own = (templates ?? []).find((t) => t.coach_id === user.id && t.race_type === rt);
    const def = (templates ?? []).find((t) => t.coach_id === null && t.race_type === rt);
    const t = own ?? def;
    return { id: t?.id ?? null, raceType: rt, name: own ? (own.name ?? "Your template") : "Runi’s template", weeks: t?.weeks ?? 12, own: !!own };
  });

  return { cycles: out, templates: options };
}

export async function createCycle(input: { name: string; raceType: RaceType; raceDate: string; templateId: string | null; notes?: string }): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the cycle a name." };
  if (!RACE_TYPES.includes(input.raceType)) return { ok: false, error: "That is not a distance Runi plans for." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.raceDate) || Date.parse(input.raceDate) < Date.now() - DAY) return { ok: false, error: "Pick a race day in the future." };

  const { data, error } = await supabase
    .from("coach_cycles")
    .insert({ coach_id: user.id, name, race_type: input.raceType, race_date: input.raceDate, template_id: input.templateId, notes: input.notes?.trim() || null })
    .select("id").single();
  if (error || !data) return { ok: false, error: `Could not create the cycle: ${error?.message ?? "try again"}` };
  revalidatePath("/coach/cycles");
  return { ok: true, data: { id: data.id } };
}

export async function renameCycle(id: string, name: string): Promise<Result<null>> {
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "A cycle needs a name." };
  const { error } = await supabase.from("coach_cycles").update({ name: trimmed }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/cycles");
  return { ok: true, data: null };
}

/**
 * Put an athlete in a cycle.
 *
 * Membership is the row on the roster. The plan is built here too, from the
 * cycle's template and race day, starting this week — unless the athlete
 * already has an active plan, which is left alone and said so: a coach
 * replacing a plan someone is mid-way through should do it on purpose, from
 * the athlete's page.
 */
export async function assignToCycle(cycleId: string, athleteId: string): Promise<Result<{ note: string | null }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data: cycle } = await supabase.from("coach_cycles").select("id, race_type, race_date").eq("id", cycleId).eq("coach_id", user.id).maybeSingle();
  if (!cycle) return { ok: false, error: "That cycle is not yours." };

  const { error: linkError } = await supabase.from("coach_athletes").update({ cycle_id: cycleId }).eq("coach_id", user.id).eq("athlete_id", athleteId).eq("status", "active");
  if (linkError) return { ok: false, error: linkError.message };

  const { data: active } = await supabase.from("training_plans").select("id").eq("user_id", athleteId).eq("status", "active").limit(1).maybeSingle();
  if (active) {
    revalidatePath("/coach/cycles");
    return { ok: true, data: { note: "Added. They already have a plan, so it was left as it is." } };
  }

  // the cycle's race becomes their goal race — the plan is built backwards from it
  let raceId: string | null = null;
  const { data: race } = await supabase.from("goal_races").select("id, race_type, race_date").eq("user_id", athleteId).eq("status", "active").order("race_date", { ascending: true }).limit(1).maybeSingle();
  if (race && race.race_type === cycle.race_type && race.race_date === cycle.race_date) raceId = race.id;
  else {
    if (race) await supabase.from("goal_races").update({ status: "cancelled" }).eq("id", race.id);
    const { data: created, error } = await supabase.from("goal_races").insert({ user_id: athleteId, race_type: cycle.race_type as RaceType, race_date: cycle.race_date }).select("id").single();
    if (error || !created) return { ok: false, error: `Added to the cycle, but the goal race could not be written: ${error?.message ?? ""}` };
    raceId = created.id;
  }

  // Sized from their runs; with none on file, from a cautious default the
  // coach can see and change on the athlete's page.
  const result = await generatePlanAction(raceId, {
    cycleId, forUserId: athleteId,
    fallbackCapacity: { currentWeeklyM: 20_000, longestRecentM: 8_000 },
  });
  revalidatePath("/coach/cycles");
  revalidatePath("/coach");
  if (result.error) return { ok: true, data: { note: `Added — but no plan yet: ${result.error}` } };
  return { ok: true, data: { note: result.data!.notes[0] ?? null } };
}

/** Take an athlete out of a cycle. Their plan, if any, stays. */
export async function removeFromCycle(athleteId: string): Promise<Result<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };
  const { error } = await supabase.from("coach_athletes").update({ cycle_id: null }).eq("coach_id", user.id).eq("athlete_id", athleteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/cycles");
  return { ok: true, data: null };
}

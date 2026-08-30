-- ============ PLAN WORKOUT PHASE ============
--
-- The generator has always known which periodization phase every session
-- belongs to — `generatePlan` returns a `phase` on each workout — and then
-- `generatePlanAction` dropped the field on the floor when writing the rows.
-- The plan screen wants to show the athlete where they are in the arc of the
-- plan (base → build → peak → taper), and inventing that back from week
-- numbers on the client would be a guess about proportions the generator, or
-- a coach's template, already decided.
--
-- Nullable on purpose: rows written before this migration have no phase, and
-- the UI hides the phase timeline for those plans rather than fabricating one.
-- Rebuilding the plan fills it in.

alter table public.plan_workouts
  add column if not exists phase text
  check (phase in ('base','build','peak','taper'));

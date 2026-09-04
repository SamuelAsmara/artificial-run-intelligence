-- 0014 — who set this session, and what it was before we touched it
--
-- ## The two bugs this closes
--
-- **An automatic reduction was permanent.** `runPlanAdjustment` writes
-- `planned_distance * 0.8` and `status = 'adjusted'` when ACWR crosses 1.5.
-- `decideAdjustments` then skips anything whose status is not 'planned', which
-- correctly stops the cut compounding night after night — and also means there
-- is no path back. One heavy week, ACWR touches 1.6, the whole coming week is
-- cut to 80%. Two days later ACWR is 1.05 and those sessions stay at 80% for
-- ever, with no marker and no explanation. The athlete asks their coach why the
-- plan shrank, and the coach cannot tell them either.
--
-- **A coach's edit was silently overwritten.** `updateWorkout` writes the type,
-- the distance and the pace and leaves `status = 'planned'`, which is exactly
-- the state the engine is looking for. A coach who sets Thursday to 18 km at
-- 20:00 finds 14.4 km there in the morning. Nothing in the interface says the
-- engine did it, and nothing recorded that a human had decided otherwise.
--
-- ## The model
--
-- `origin` says whose decision the current numbers are. The engine may adjust
-- what it generated; it may not overrule a person. A coach's edit is a
-- statement about this athlete that we do not have the standing to undo at
-- 03:00 without asking.
--
-- `planned_distance_original` is what the session was before an automatic
-- reduction, so it can be put back when the reason clears. Null means the
-- current distance *is* the original — that is the resting state, and restoring
-- clears it again rather than leaving a trail of stale numbers.
--
-- `adjusted_reason` is why, in the athlete's own words rather than a log line.
-- The plan screen has had a slot for this text since the prototype and has been
-- filling it with an invented sentence about a long run that never happened.

alter table public.plan_workouts
  add column if not exists origin text not null default 'generated',
  add column if not exists planned_distance_original numeric,
  add column if not exists adjusted_reason text,
  add column if not exists adjusted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plan_workouts_origin_check'
  ) then
    alter table public.plan_workouts
      add constraint plan_workouts_origin_check
      check (origin in ('generated', 'coach', 'athlete'));
  end if;
end $$;

-- The engine reads "everything upcoming it is allowed to touch" on every run.
-- Without this it is a sequential scan of the whole plan per athlete per night.
create index if not exists plan_workouts_adjustable_idx
  on public.plan_workouts (plan_id, day_date)
  where origin = 'generated';

comment on column public.plan_workouts.origin is
  'generated = Runi built it and may adjust it; coach/athlete = a person set it, the engine leaves it alone';
comment on column public.plan_workouts.planned_distance_original is
  'the distance before an automatic reduction; null once restored';

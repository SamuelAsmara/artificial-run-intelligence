-- Cycles a coach runs, plans an athlete writes, and one constraint that
-- was refusing coaches' templates.
--
-- Three things, each small on its own:
--
-- 1. `plan_templates` was created (0001) with `unique (race_type, level)`,
--    and the four built-in defaults occupy every (distance, 'experienced')
--    pair. Migration 0008 gave templates an owner and a *partial* unique
--    index on (coach_id, race_type), but never dropped the old constraint —
--    so the first time any coach saved a marathon template, the INSERT
--    collided with the built-in marathon row and the screen showed
--    "duplicate key value violates unique constraint". The constraint goes;
--    the partial index from 0008 is the uniqueness that was meant.
--
-- 2. A plan no longer has to hang off a goal race. An athlete who wants to
--    run a steady eight weeks with no race in sight builds one by hand, and
--    forcing them to invent a race first was the wrong contract. `goal_race_id`
--    becomes nullable and the plan gets a `name` so the screen can call it
--    something.
--
-- 3. Cycles. Until now a "cycle" on the coach's screens was derived — every
--    athlete sharing a distance and a race date — which cannot be named,
--    merged, or joined late. This makes it a thing the coach owns: a name, a
--    distance, a race day, the template it is built from, and members. Each
--    member's plan is generated from the cycle's template on the day they
--    join, which is why two people in one cycle can be in week 2 and week 5
--    of "the same" plan — and why the coach needs INSERT on the athlete's plan
--    tables, which they never had. The new policies grant exactly that, only
--    for athletes who are on the coach's roster.

/* ------------------------------------------------------------------ */
/* 1. the constraint                                                   */
/* ------------------------------------------------------------------ */

alter table public.plan_templates
  drop constraint if exists plan_templates_race_type_level_key;

/* ------------------------------------------------------------------ */
/* 2. a plan of one's own                                               */
/* ------------------------------------------------------------------ */

alter table public.training_plans
  alter column goal_race_id drop not null;

alter table public.training_plans
  add column if not exists name text,
  add column if not exists cycle_id uuid;

comment on column public.training_plans.name is
  'What the athlete or coach called this plan. Null for the generated race plans, which are named after the race on screen.';

/* ------------------------------------------------------------------ */
/* 3. cycles                                                           */
/* ------------------------------------------------------------------ */

create table if not exists public.coach_cycles (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  race_type   text not null check (race_type in ('5k','10k','half','full')),
  race_date   date not null,
  template_id uuid references public.plan_templates(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists coach_cycles_coach_idx on public.coach_cycles (coach_id, race_date);

alter table public.coach_athletes
  add column if not exists cycle_id uuid references public.coach_cycles(id) on delete set null;

alter table public.training_plans
  add constraint training_plans_cycle_fk
  foreign key (cycle_id) references public.coach_cycles(id) on delete set null;

alter table public.coach_cycles enable row level security;

drop policy if exists cycles_coach on public.coach_cycles;
create policy cycles_coach on public.coach_cycles
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- An athlete may read the cycle they are in — its name is on their plan.
drop policy if exists cycles_member on public.coach_cycles;
create policy cycles_member on public.coach_cycles
  for select using (
    exists (
      select 1 from public.coach_athletes ca
      where ca.cycle_id = coach_cycles.id
        and ca.athlete_id = auth.uid()
        and ca.status = 'active'
    )
  );

-- The coach writes the plan for a member. Insert only where the coach had
-- select already (their own active athletes), and only for the tables a plan
-- is made of. Nothing here lets a coach read or write anyone else's rows.
drop policy if exists gr_coach_insert on public.goal_races;
create policy gr_coach_insert on public.goal_races
  for insert with check (public.is_coach_of(user_id));

drop policy if exists gr_coach_update on public.goal_races;
create policy gr_coach_update on public.goal_races
  for update using (public.is_coach_of(user_id)) with check (public.is_coach_of(user_id));

drop policy if exists tp_coach_insert on public.training_plans;
create policy tp_coach_insert on public.training_plans
  for insert with check (public.is_coach_of(user_id));

drop policy if exists tp_coach_update on public.training_plans;
create policy tp_coach_update on public.training_plans
  for update using (public.is_coach_of(user_id)) with check (public.is_coach_of(user_id));

drop policy if exists pw_coach_insert on public.plan_workouts;
create policy pw_coach_insert on public.plan_workouts
  for insert with check (
    exists (select 1 from public.training_plans t where t.id = plan_workouts.plan_id and public.is_coach_of(t.user_id))
  );

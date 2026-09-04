-- ============================================================================
-- Runi — schema init (v1)
-- athlete + coach · event-driven · explained decisions · coach seats
-- Postgres / Supabase. RLS: an athlete sees their own rows; a coach reads
-- their active athletes. Applied through the Supabase SQL editor.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============ PROFILES (role) ============
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null default 'athlete' check (role in ('athlete','coach')),
  created_at timestamptz not null default now()
);

-- a profile row is created automatically on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ COACH <-> ATHLETE ============
create table public.coach_athletes (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'invited' check (status in ('invited','active')),
  created_at timestamptz not null default now(),
  unique (coach_id, athlete_id)
);
create index idx_coach_athletes_coach   on public.coach_athletes(coach_id);
create index idx_coach_athletes_athlete on public.coach_athletes(athlete_id);

-- ============ SUBSCRIPTIONS (seats, mock) ============
create table public.subscriptions (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  plan       text not null default 'free' check (plan in ('free','pro')),
  seat_limit int  not null default 3,
  updated_at timestamptz not null default now()
);

create table public.billing_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  plan_from  text, plan_to text, seats int,
  created_at timestamptz not null default now()
);

-- ============ STRAVA CONNECTIONS ============
create table public.strava_connections (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  access_token     text not null,
  refresh_token    text not null,
  expires_at       timestamptz not null,
  athlete_id       bigint,
  last_sync_at     timestamptz,
  last_sync_status text
);

-- ============ PLAN TEMPLATES (generic skeletons — reference data) ============
create table public.plan_templates (
  id              uuid primary key default gen_random_uuid(),
  race_type       text not null check (race_type in ('5k','10k','half','full')),
  level           text not null check (level in ('beginner','experienced')),
  weeks           int  not null,
  phase_structure jsonb not null,   -- {"base":N,"build":N,"peak":N,"taper":N} (weeks)
  weekly_mix      jsonb not null,   -- {"easy":N,"interval":N,"long":N,"rest":N} (days per week)
  unique (race_type, level)
);

-- ============ GOAL RACES ============
create table public.goal_races (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  race_type   text not null check (race_type in ('5k','10k','half','full')),
  race_date   date not null,
  target_time interval,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);
create index idx_goal_races_user on public.goal_races(user_id);

-- ============ TRAINING PLANS ============
create table public.training_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  goal_race_id uuid not null references public.goal_races(id) on delete cascade,
  template_id  uuid references public.plan_templates(id),
  status       text not null default 'active',
  created_at   timestamptz not null default now()
);
create index idx_training_plans_user on public.training_plans(user_id);

-- ============ PLAN WORKOUTS ============
create table public.plan_workouts (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.training_plans(id) on delete cascade,
  week_number      int not null,
  day_date         date not null,
  workout_type     text not null,  -- easy / interval / long / rest
  planned_distance numeric,
  planned_pace     interval,
  status           text not null default 'planned'
                   check (status in ('planned','completed','missed','adjusted'))
);
create index idx_plan_workouts_plan_date on public.plan_workouts(plan_id, day_date);

-- ============ ACTIVITIES (dedup) ============
create table public.activities (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  strava_activity_id bigint not null,
  type               text,
  distance_m         numeric,
  duration_s         int,
  avg_hr             int,
  avg_pace           interval,
  started_at         timestamptz,
  unique (user_id, strava_activity_id)   -- no duplicates from a repeated webhook delivery
);
create index idx_activities_user_started on public.activities(user_id, started_at);

-- ============ READINESS SNAPSHOTS (precompute) ============
create table public.readiness_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  date            date not null,
  ctl numeric, atl numeric, tsb numeric, acwr numeric,
  cardiac_drift   numeric,
  readiness_score int,
  narrative       text,             -- cached explanation text
  unique (user_id, date)
);
create index idx_readiness_user_date on public.readiness_snapshots(user_id, date);

-- ============ PLAN ADJUSTMENTS (log) ============
create table public.plan_adjustments (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.training_plans(id) on delete cascade,
  workout_id  uuid references public.plan_workouts(id) on delete set null,
  changed_at  timestamptz not null default now(),
  reason_code text,
  reason_text text,
  before jsonb, after jsonb
);
create index idx_plan_adjustments_plan on public.plan_adjustments(plan_id);

-- ============ RECOVERY SIGNALS (optional) ============
create table public.recovery_signals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  date        date not null,
  source      text not null check (source in ('webhook','derived')),
  sleep_hours numeric, resting_hr int, hrv numeric,
  unique (user_id, date)
);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.profiles            enable row level security;
alter table public.coach_athletes      enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.billing_events      enable row level security;
alter table public.strava_connections  enable row level security;
alter table public.plan_templates      enable row level security;
alter table public.goal_races          enable row level security;
alter table public.training_plans      enable row level security;
alter table public.plan_workouts       enable row level security;
alter table public.activities          enable row level security;
alter table public.readiness_snapshots enable row level security;
alter table public.plan_adjustments    enable row level security;
alter table public.recovery_signals    enable row level security;

-- helper: is the current user an active coach of :athlete?
-- security definer so it can read coach_athletes without recursing into RLS.
create or replace function public.is_coach_of(athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_athletes ca
    where ca.coach_id = auth.uid() and ca.athlete_id = athlete and ca.status = 'active'
  );
$$;

-- profiles: read own row and coached athletes; update own row only
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_coach_of(id));
create policy profiles_upd  on public.profiles for update using (id = auth.uid());

-- plan_templates: reference data — readable, no client writes (narrowed in 0008 and 0024)
create policy templates_read on public.plan_templates for select using (true);

-- coach_athletes: both sides read; the coach manages (revised in 0013 and 0024)
create policy ca_select on public.coach_athletes for select using (coach_id = auth.uid() or athlete_id = auth.uid());
create policy ca_insert on public.coach_athletes for insert with check (coach_id = auth.uid());
create policy ca_update on public.coach_athletes for update using (coach_id = auth.uid() or athlete_id = auth.uid());
create policy ca_delete on public.coach_athletes for delete using (coach_id = auth.uid());

-- subscriptions / billing / strava: own rows only (a coach cannot see them)
create policy subs_self    on public.subscriptions      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy billing_self on public.billing_events     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy strava_self  on public.strava_connections for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- athlete data tables: full access to own rows; coach reads through is_coach_of
create policy gr_self  on public.goal_races          for all    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy gr_coach on public.goal_races          for select using (public.is_coach_of(user_id));
create policy tp_self  on public.training_plans      for all    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tp_coach on public.training_plans      for select using (public.is_coach_of(user_id));
create policy act_self on public.activities          for all    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy act_coach on public.activities         for select using (public.is_coach_of(user_id));
create policy rs_self  on public.readiness_snapshots for all    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rs_coach on public.readiness_snapshots for select using (public.is_coach_of(user_id));
create policy rec_self on public.recovery_signals    for all    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rec_coach on public.recovery_signals   for select using (public.is_coach_of(user_id));

-- plan_workouts / plan_adjustments: through ownership of the plan (no direct user_id)
create policy pw_self  on public.plan_workouts for all
  using      (exists (select 1 from public.training_plans t where t.id = plan_workouts.plan_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.training_plans t where t.id = plan_workouts.plan_id and t.user_id = auth.uid()));
create policy pw_coach on public.plan_workouts for select
  using (exists (select 1 from public.training_plans t where t.id = plan_workouts.plan_id and public.is_coach_of(t.user_id)));

create policy pa_self  on public.plan_adjustments for all
  using      (exists (select 1 from public.training_plans t where t.id = plan_adjustments.plan_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.training_plans t where t.id = plan_adjustments.plan_id and t.user_id = auth.uid()));
create policy pa_coach on public.plan_adjustments for select
  using (exists (select 1 from public.training_plans t where t.id = plan_adjustments.plan_id and public.is_coach_of(t.user_id)));

-- ============================================================================
-- SEED — plan_templates (generic skeletons built on periodisation principles)
-- ============================================================================
insert into public.plan_templates (race_type, level, weeks, phase_structure, weekly_mix) values
('5k',  'beginner',    8,  '{"base":3,"build":3,"peak":1,"taper":1}', '{"easy":3,"interval":1,"long":1,"rest":2}'),
('5k',  'experienced', 8,  '{"base":2,"build":3,"peak":2,"taper":1}', '{"easy":3,"interval":2,"long":1,"rest":1}'),
('10k', 'beginner',    10, '{"base":4,"build":3,"peak":2,"taper":1}', '{"easy":3,"interval":1,"long":1,"rest":2}'),
('10k', 'experienced', 10, '{"base":3,"build":3,"peak":3,"taper":1}', '{"easy":3,"interval":2,"long":1,"rest":1}'),
('half','beginner',    12, '{"base":5,"build":4,"peak":2,"taper":1}', '{"easy":3,"interval":1,"long":1,"rest":2}'),
('half','experienced', 14, '{"base":5,"build":5,"peak":2,"taper":2}', '{"easy":3,"interval":2,"long":1,"rest":1}'),
('full','beginner',    16, '{"base":7,"build":5,"peak":2,"taper":2}', '{"easy":4,"interval":1,"long":1,"rest":1}'),
('full','experienced', 18, '{"base":7,"build":6,"peak":3,"taper":2}', '{"easy":3,"interval":2,"long":1,"rest":1}');

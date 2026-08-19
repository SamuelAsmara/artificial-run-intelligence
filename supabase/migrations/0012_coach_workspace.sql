-- 0012 — a coach's own settings, and the notes they leave themselves
--
-- Two small tables behind the coach workspace.
--
-- ## coach_preferences
--
-- The calendar colours a race distance is drawn in, and the thresholds that
-- decide who appears in "needs you". Both are genuinely per-coach: the flag
-- constants in lib/coach/roster.ts (five silent days, a load ratio of 1.5) are
-- defensible defaults and nothing more, and a coach working with beginners
-- wants different numbers from one working with a club. Storing them makes the
-- coach's judgement part of the product rather than something hard-coded in a
-- file they cannot see.
--
-- One row per coach, created on first save. Absent means "use the defaults",
-- which is why every column has one.
--
-- ## coach_reminders
--
-- A coach's own note to themselves — "ask Dana about her calf", "Omer's taper
-- starts Monday". Optionally attached to an athlete and optionally dated.
-- Deliberately not messages: nothing here is sent anywhere or seen by anybody
-- else, so there is no delivery to get wrong and no expectation to manage.

create table if not exists public.coach_preferences (
  coach_id        uuid primary key references auth.users(id) on delete cascade,
  -- { "5k": "#4e8ef7", "10k": "#7fc887", ... }; missing keys fall back in code
  race_colors     jsonb    not null default '{}'::jsonb,
  silent_days     smallint not null default 5  check (silent_days between 1 and 30),
  overload_ratio  numeric  not null default 1.5 check (overload_ratio between 1.0 and 3.0),
  underload_ratio numeric  not null default 0.8 check (underload_ratio between 0.1 and 1.0),
  low_readiness   smallint not null default 55 check (low_readiness between 0 and 100),
  race_soon_days  smallint not null default 21 check (race_soon_days between 1 and 120),
  updated_at      timestamptz not null default now()
);

comment on table public.coach_preferences is
  'Per-coach calendar colours and attention thresholds. A missing row means the built-in defaults.';

alter table public.coach_preferences enable row level security;

drop policy if exists cp_own on public.coach_preferences;
create policy cp_own on public.coach_preferences for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create table if not exists public.coach_reminders (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references auth.users(id) on delete cascade,
  -- null when the note is about the roster rather than one person
  athlete_id  uuid references auth.users(id) on delete cascade,
  body        text not null check (length(btrim(body)) between 1 and 500),
  due_date    date,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.coach_reminders is
  'A coach''s private notes to themselves. Never shown to the athlete they mention.';

create index if not exists coach_reminders_coach_idx
  on public.coach_reminders (coach_id, done, due_date);

alter table public.coach_reminders enable row level security;

-- Only the author. Note the athlete named in a reminder has no read access at
-- all: "ask Dana whether her calf is still sore" is the coach thinking aloud,
-- and thinking aloud stops being useful the moment it is published.
drop policy if exists cr_own on public.coach_reminders;
create policy cr_own on public.coach_reminders for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create or replace function public.touch_coach_preferences()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists coach_preferences_touch on public.coach_preferences;
create trigger coach_preferences_touch
  before update on public.coach_preferences
  for each row execute function public.touch_coach_preferences();

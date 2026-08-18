-- 0008 — joining a coach, and letting a coach own their own plan templates
--
-- The row-level policies for coaching already exist: `is_coach_of(user_id)`
-- guards SELECT on the training tables, `coach_athletes` is readable and
-- writable by either side of the pair, and `provider_connections` stays
-- owner-only so a coach can see how an athlete trains but never how they are
-- connected. What has never existed is a way for two people to become a pair
-- at all, and a way for a coach to express their own methodology.

/* ------------------------------------------------------------------ */
/* 1. The join code                                                     */
/* ------------------------------------------------------------------ */

-- A short code a coach can read aloud or paste into a message. One per coach,
-- regenerable. Not an invitation to a named person: whoever holds it can join,
-- which is the right trade between friends and the wrong one at scale — a
-- `coach_invites` table with per-athlete, single-use, expiring codes is the
-- eventual shape.
alter table public.profiles
  add column if not exists coach_code text unique;

comment on column public.profiles.coach_code is
  'Short code an athlete redeems to join this coach. A bearer credential: anyone holding it can join. Regenerate to revoke.';

-- Ambiguous characters are left out on purpose. This gets read aloud and
-- retyped, and O/0 and I/1 are where that goes wrong.
create or replace function public.generate_coach_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where coach_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Issues this coach a code, or returns the one they already have.
create or replace function public.my_coach_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select coach_code into existing from public.profiles where id = auth.uid();
  if existing is not null then
    return existing;
  end if;

  existing := public.generate_coach_code();
  update public.profiles set coach_code = existing where id = auth.uid();
  return existing;
end;
$$;

/* ------------------------------------------------------------------ */
/* 2. Redeeming it                                                      */
/* ------------------------------------------------------------------ */

-- SECURITY DEFINER, and that is the entire reason this function exists.
--
-- Finding a coach by code means reading a `profiles` row belonging to someone
-- else, which RLS correctly forbids. Relaxing that policy so athletes could
-- search profiles would expose every user's row to every user. Instead the
-- lookup happens inside a function running with the definer's rights, and the
-- only thing that comes back is the coach you were already given a code for.
-- An athlete can redeem a code they were handed; they cannot enumerate coaches,
-- read a profile, or learn anything about a code that does not exist.
--
-- Redeeming is itself the consent. The athlete typed the code, so the link is
-- created active. A coach adding somebody directly — which no interface does
-- yet — would insert 'invited' and wait to be accepted.
create or replace function public.join_coach(code text)
returns table (coach_id uuid, coach_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  found uuid;
  found_name text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select id, coalesce(nullif(full_name, ''), email)
    into found, found_name
    from public.profiles
   where coach_code = upper(trim(code));

  if found is null then
    raise exception 'no coach with that code';
  end if;

  if found = auth.uid() then
    raise exception 'that is your own code';
  end if;

  insert into public.coach_athletes (coach_id, athlete_id, status)
  values (found, auth.uid(), 'active')
  on conflict (coach_id, athlete_id) do update set status = 'active';

  return query select found, found_name;
end;
$$;

-- Leaving needs no function of its own: the existing delete policy already lets
-- either side remove the row, and an athlete must never need permission to stop
-- being coached.

-- One link per pair, so redeeming the same code twice is idempotent rather than
-- duplicating the roster entry.
create unique index if not exists coach_athletes_pair_idx
  on public.coach_athletes (coach_id, athlete_id);

/* ------------------------------------------------------------------ */
/* 3. A coach's own plan templates                                      */
/* ------------------------------------------------------------------ */

-- A coach's methodology is the thing they are actually selling, and until now
-- `plan_templates` held one global set that nobody could change. Adding an
-- owner turns the table into what it should have been: every coach describes
-- how *they* prepare someone for 5K, 10K, half and marathon, and the generator
-- applies it to whoever is training for that distance.
--
-- `coach_id is null` marks the built-in defaults, which stay as the fallback
-- for athletes with no coach and for coaches who have not written their own.
alter table public.plan_templates
  add column if not exists coach_id uuid references auth.users(id) on delete cascade,
  add column if not exists name text,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.plan_templates.coach_id is
  'Owning coach. Null marks a built-in default, used when an athlete has no coach or their coach has not written a template for this distance.';

create index if not exists plan_templates_coach_idx
  on public.plan_templates (coach_id, race_type);

-- One template per distance per coach. Deliberately not keyed on level as well:
-- that would be twelve forms to fill in, nobody fills in twelve forms, and the
-- athlete's level already scales volume in the generator.
create unique index if not exists plan_templates_coach_race_idx
  on public.plan_templates (coach_id, race_type)
  where coach_id is not null;

alter table public.plan_templates enable row level security;

-- Everyone may read the built-in defaults, because every athlete's plan may be
-- generated from one.
drop policy if exists "default templates readable" on public.plan_templates;
create policy "default templates readable"
  on public.plan_templates for select
  using (coach_id is null);

-- A coach reads and writes their own.
drop policy if exists "own templates readable" on public.plan_templates;
create policy "own templates readable"
  on public.plan_templates for select
  using (auth.uid() = coach_id);

drop policy if exists "own templates writable" on public.plan_templates;
create policy "own templates writable"
  on public.plan_templates for insert
  with check (auth.uid() = coach_id);

drop policy if exists "own templates updatable" on public.plan_templates;
create policy "own templates updatable"
  on public.plan_templates for update
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);

drop policy if exists "own templates deletable" on public.plan_templates;
create policy "own templates deletable"
  on public.plan_templates for delete
  using (auth.uid() = coach_id);

-- An athlete must be able to read the template their own plan was built from,
-- or their plan screen cannot explain where its structure came from.
drop policy if exists "my coach templates readable" on public.plan_templates;
create policy "my coach templates readable"
  on public.plan_templates for select
  using (
    coach_id is not null
    and exists (
      select 1 from public.coach_athletes ca
      where ca.coach_id = plan_templates.coach_id
        and ca.athlete_id = auth.uid()
        and ca.status = 'active'
    )
  );

create or replace function public.touch_plan_templates()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plan_templates_touch on public.plan_templates;
create trigger plan_templates_touch
  before update on public.plan_templates
  for each row execute function public.touch_plan_templates();

-- Note on editing a template: it changes *future* plans only. Regenerating a
-- plan an athlete is already running would discard weeks of their history, so
-- `training_plans` keeps the structure it was generated with and the coach's
-- edit reaches the next athlete to start.

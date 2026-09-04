-- ============ PERMISSION HARDENING ============
--
-- Four holes found in a pre-release review of the policy set, each closed
-- with the smallest change that does it. Nothing here changes what the
-- product does for a signed-in athlete or coach; it removes what a direct
-- PostgREST call could do that the interface never offered.
--
-- 1. plan_templates was still readable by everyone (`using (true)`, from 0001)
--    even after 0008 added the intended policies. Policies are OR-ed, so the
--    old one made the new ones decorative: anyone holding the anon key could
--    read every coach's methodology. The default templates (coach_id is null)
--    stay readable by every signed-in user — an athlete building their own
--    plan is generated from one — and a coach's own templates are visible to
--    that coach and to the athletes on their roster, exactly as 0008 says.
--
-- 2. coach_athletes could be inserted and updated directly by the athlete
--    side (0013), which let a browser skip `join_coach` — the code check, the
--    seat cap and the one-coach rule all live there. Links are now created only
--    by `join_coach` and moved between cycles only by `set_athlete_cycle`
--    (both SECURITY DEFINER). Either side may still delete, as before.
--
-- 3. profiles.role, coach_code and email were self-writable through
--    `profiles_upd`. Nothing in the product changes them after signup —
--    role is chosen once, coach_code is issued by `issue_coach_code`, email is
--    mirrored from auth by `sync_profile_email` — so a trigger refuses a
--    direct change from a client role. The SECURITY DEFINER functions run as
--    the owner and are unaffected.
--
-- 4. join_coach: the seat count and the insert were two statements with no
--    lock, so two athletes redeeming the last seat together both got in. A
--    transaction-scoped advisory lock on the coach id serialises them. The
--    name returned for the "joined X" message also fell back to the coach's
--    e-mail address; it now falls back to the part before the @, matching
--    my_coach_name (0019).

/* ------------------------------------------------------------------ */
/* 1. Templates                                                        */
/* ------------------------------------------------------------------ */

drop policy if exists templates_read on public.plan_templates;

-- Default templates are for every signed-in user, not for the anon role.
drop policy if exists "default templates readable" on public.plan_templates;
create policy "default templates readable"
  on public.plan_templates for select
  to authenticated
  using (coach_id is null);

/* ------------------------------------------------------------------ */
/* 2. Coach ↔ athlete links                                            */
/* ------------------------------------------------------------------ */

drop policy if exists ca_insert on public.coach_athletes;
drop policy if exists ca_update on public.coach_athletes;

/* ------------------------------------------------------------------ */
/* 3. Identity columns on profiles                                     */
/* ------------------------------------------------------------------ */

create or replace function public.profiles_guard_identity()
returns trigger
language plpgsql
as $$
begin
  -- `current_user` is the PostgREST role for a direct request and the
  -- function owner inside a SECURITY DEFINER function, which is how the
  -- product's own writers (issue_coach_code, sync_profile_email) pass.
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.coach_code is distinct from old.coach_code
       or new.email is distinct from old.email then
      raise exception 'identity columns are not editable'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_identity on public.profiles;
create trigger profiles_guard_identity
  before update on public.profiles
  for each row execute function public.profiles_guard_identity();

/* ------------------------------------------------------------------ */
/* 4. join_coach — atomic seat check, no e-mail in the name            */
/* ------------------------------------------------------------------ */

create or replace function public.join_coach(code text)
returns table (coach_id uuid, coach_name text)
language plpgsql
security definer
set search_path = public
as $$
-- The OUT columns are named like the table's columns; inside the body an
-- unqualified name must mean the column (the ON CONFLICT target below).
#variable_conflict use_column
declare
  found uuid;
  found_name text;
  seats int;
  taken int;
  already boolean;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select id, coalesce(nullif(full_name, ''), split_part(email, '@', 1))
    into found, found_name
    from public.profiles
   where coach_code = upper(trim(code));

  if found is null then
    raise exception 'no coach with that code';
  end if;

  if found = auth.uid() then
    raise exception 'that is your own code';
  end if;

  -- One roster at a time: the count below and the insert are serialised per
  -- coach for the rest of this transaction.
  perform pg_advisory_xact_lock(hashtext(found::text));

  -- rejoining the same coach never counts as a new seat
  select exists (
    select 1 from public.coach_athletes ca
     where ca.coach_id = found and ca.athlete_id = auth.uid() and ca.status = 'active'
  ) into already;

  if not already then
    select s.seat_limit into seats
      from public.subscriptions s
     where s.user_id = found and s.scope = 'coach';
    if seats is not null then
      select count(*) into taken from public.coach_athletes ca
       where ca.coach_id = found and ca.status = 'active';
      if taken >= seats then
        raise exception 'roster full';
      end if;
    end if;
  end if;

  insert into public.coach_athletes (coach_id, athlete_id, status)
  values (found, auth.uid(), 'active')
  on conflict (coach_id, athlete_id) do update set status = 'active';

  return query select found, found_name;
end;
$$;

/* ------------------------------------------------------------------ */
/* 5. plan_workouts.workout_type — the four values the product knows   */
/* ------------------------------------------------------------------ */

alter table public.plan_workouts
  drop constraint if exists plan_workouts_type_check;
alter table public.plan_workouts
  add constraint plan_workouts_type_check
  check (workout_type in ('easy', 'interval', 'long', 'rest'));

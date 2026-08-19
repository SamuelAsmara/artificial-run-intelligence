-- 0013 — being coached has to be something you agreed to
--
-- ## The hole
--
-- Migration 0001 shipped:
--
--   create policy ca_insert on public.coach_athletes for insert
--     with check (coach_id = auth.uid());
--
-- The only condition is that *you* are the coach. Nothing at all constrains
-- `athlete_id`. The anonymous Supabase client ships in the browser bundle
-- carrying the signed-in user's session, so one line from the developer console
-- was enough:
--
--   supabase.from('coach_athletes')
--           .insert({ coach_id: <me>, athlete_id: <anyone>, status: 'active' })
--
-- `is_coach_of()` then returns true for that person, and every policy written on
-- top of it opens: their profile — email, age, sex, height, weight, resting
-- physiology — their activities, their readiness history, their goal race, their
-- plan. Migration 0009 added a coach UPDATE policy on `plan_workouts`, so their
-- training could be rewritten too. The victim is never told; nothing in the
-- product lists who claims to coach them.
--
-- Every authorization decision on the coaching side reduces to "is there a row
-- in `coach_athletes`", which made that table's INSERT policy the whole security
-- boundary — and it was checking the wrong column.
--
-- ## The fix
--
-- Only the athlete may create the link. That is already how the product works:
-- `join_coach` (migration 0008) is SECURITY DEFINER, hard-codes
-- `athlete_id = auth.uid()`, and is reached by the athlete typing a code they
-- were given. Redeeming the code *is* the consent. This policy simply stops
-- there being a second, unconsented way in.
--
-- A coach inviting somebody directly is a feature that can exist later, and it
-- has to be a SECURITY DEFINER function that inserts `status = 'invited'` and
-- waits to be accepted — never a policy that lets one row assert a relationship
-- over somebody else.

drop policy if exists ca_insert on public.coach_athletes;
create policy ca_insert on public.coach_athletes for insert
  with check (athlete_id = auth.uid());

-- ## Leaving
--
-- The delete policy was `coach_id = auth.uid()` — coach only. So an athlete
-- could not end the relationship: `leaveCoach()` in src/actions/coach.ts deletes
-- `where athlete_id = auth.uid()`, matched nothing, and returned success. The
-- athlete pressed "Leave", was told it worked, and stayed coached.
--
-- Either side may end it, and neither needs the other's permission. That is not
-- a courtesy — an athlete must never need consent to stop being watched.
drop policy if exists ca_delete on public.coach_athletes;
create policy ca_delete on public.coach_athletes for delete
  using (coach_id = auth.uid() or athlete_id = auth.uid());

-- ## Status
--
-- Only the athlete moves a link between 'invited' and 'active', for the same
-- reason they alone create it: `status = 'active'` is the sentence
-- `is_coach_of()` reads, so whoever can write it decides who sees what.
drop policy if exists ca_update on public.coach_athletes;
create policy ca_update on public.coach_athletes for update
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid());

/* ------------------------------------------------------------------ */
/* Reading your own coach's name                                       */
/* ------------------------------------------------------------------ */

-- `profiles_read` is `id = auth.uid() or is_coach_of(id)` — correct, and it
-- means the relationship is deliberately one-way: a coach may read their
-- athletes, an athlete may not read their coach. So `getMyCoach()` asking
-- `profiles` for the coach's name has always returned nothing, and the Settings
-- screen has always shown the fallback string "Your coach". Silently, because a
-- null read is not an error.
--
-- The answer is not to widen the policy — that would expose every profile to
-- every user. It is a function that returns one name to one person who is
-- already linked to that coach, and nothing else.
create or replace function public.my_coach_name()
returns table (coach_id uuid, coach_name text, since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)),
         ca.created_at
    from public.coach_athletes ca
    join public.profiles p on p.id = ca.coach_id
   where ca.athlete_id = auth.uid()
     and ca.status = 'active'
   limit 1;
$$;

comment on function public.my_coach_name is
  'The name of the coach the caller has joined. Returns nothing when they have not joined one. Deliberately narrower than a profiles policy: one row, to one person, about somebody they already chose.';

/* ------------------------------------------------------------------ */
/* Issuing a coach code                                                */
/* ------------------------------------------------------------------ */

-- `my_coach_code()` writes: it mints a code on first ask. The coach screens call
-- it while rendering, and those screens are reachable by any signed-in user, so
-- merely visiting /coach permanently issued the visitor a bearer credential as a
-- side effect of a page load.
--
-- Split in two. Reading never writes; issuing is explicit.
create or replace function public.my_coach_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coach_code from public.profiles where id = auth.uid();
$$;

create or replace function public.issue_coach_code()
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
end; $$;

comment on function public.issue_coach_code is
  'Mints this user''s coach code if they do not have one. Explicit because the code is a bearer credential — anyone holding it can join, so it should be created when somebody asks for it, not when a page happens to render.';

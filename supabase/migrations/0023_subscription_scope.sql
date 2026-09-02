-- A coach is usually also a runner (product doc: "a coach is usually a
-- runner themselves too"), and now both roles pick a package on the same
-- `subscriptions` table. Before this migration that table had one row per
-- user (`user_id` was the whole primary key) — so a coach who trains on
-- Runi could not hold "Premium as a coach, Basic as an athlete" or the
-- reverse. Choosing one silently overwrote the other, because there was
-- nowhere else for the second choice to live.
--
-- `scope` splits the row: one subscription per (user, role). A user who is
-- both a coach and an athlete now holds up to two rows — one per scope —
-- instead of fighting over one.

alter table public.subscriptions
  add column scope text not null default 'coach' check (scope in ('athlete', 'coach'));

-- every existing row predates athlete billing, so it is a coach row —
-- already stamped correctly by the default above.

alter table public.subscriptions drop constraint subscriptions_pkey;
alter table public.subscriptions add primary key (user_id, scope);

-- billing_events is a log, not a keyed row, but plan_from/plan_to alone
-- can't say whether an event was the coach's package or the athlete's —
-- worth knowing when this table is read back later.
alter table public.billing_events
  add column scope text not null default 'coach' check (scope in ('athlete', 'coach'));

-- join_coach reads the seat limit for the COACH scope specifically — a
-- coach who is also an athlete must not have their own athlete package
-- read as their roster's seat limit.
create or replace function public.join_coach(code text)
returns table (coach_id uuid, coach_name text)
language plpgsql
security definer
set search_path = public
as $$
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

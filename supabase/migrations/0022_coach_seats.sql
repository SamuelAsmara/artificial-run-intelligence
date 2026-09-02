-- A coach's package decides how many athletes can join.
--
-- Basic stops at five active athletes; Premium does not stop. The check has
-- to live in join_coach itself: the athlete redeeming the code cannot read
-- the coach's subscriptions row (RLS, 0001 — subscriptions are self-only),
-- and the join already runs as definer for the same reason.
--
-- A coach with no subscriptions row — an account from before packages
-- existed — is never blocked. The row is written the first time they open
-- the workspace and choose.

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
    select s.seat_limit into seats from public.subscriptions s where s.user_id = found;
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

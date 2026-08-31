-- Let a coach put an athlete in a cycle — and nothing else on that row.
--
-- Migration 0013 made UPDATE on `coach_athletes` athlete-only, on purpose:
-- the link is the athlete's consent, and a coach must not be able to flip
-- `status` for someone who never redeemed their code. Migration 0020 then
-- added `cycle_id` to the same row and the cycles screen wrote to it with a
-- plain UPDATE — which RLS refused, silently: "Added" appeared over a cycle
-- that stayed empty.
--
-- A row policy cannot say "this column but not that one", so the write goes
-- through one narrow function instead: it runs as definer, checks that the
-- caller coaches the athlete and owns the cycle, and touches `cycle_id`
-- only. `status` stays exactly as consent-only as 0013 left it.

create or replace function public.set_athlete_cycle(p_athlete uuid, p_cycle uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed int;
begin
  if p_cycle is not null and not exists (
    select 1 from public.coach_cycles c where c.id = p_cycle and c.coach_id = auth.uid()
  ) then
    raise exception 'not your cycle';
  end if;

  update public.coach_athletes
     set cycle_id = p_cycle
   where coach_id = auth.uid()
     and athlete_id = p_athlete
     and status = 'active';
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

-- Emptying a whole cycle (before deleting it) is the same write, for every member.
create or replace function public.clear_cycle_members(p_cycle uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  changed int;
begin
  if not exists (select 1 from public.coach_cycles c where c.id = p_cycle and c.coach_id = auth.uid()) then
    raise exception 'not your cycle';
  end if;
  update public.coach_athletes set cycle_id = null where coach_id = auth.uid() and cycle_id = p_cycle;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

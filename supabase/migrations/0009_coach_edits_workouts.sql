-- 0009 — let a coach actually change the session they are shown a form for
--
-- Migration 0001 gives coaches SELECT on their athletes' planned sessions:
--
--   create policy pw_coach on public.plan_workouts for select
--     using (exists (select 1 from public.training_plans t
--                    where t.id = plan_workouts.plan_id
--                      and public.is_coach_of(t.user_id)));
--
-- SELECT only. There is no coach UPDATE policy, which had two consequences —
-- one good and one bad, and they are worth separating.
--
-- The good one: the first version of `updateWorkout` in src/actions/coach.ts
-- trusted a caller-supplied workout id with no ownership check, and this policy
-- is the reason that was never exploitable. RLS refused the write. The action
-- now checks ownership explicitly as well, because relying on a policy nobody
-- had read was the actual problem.
--
-- The bad one: the coach's own edit form could not work either. Postgres does
-- not error when a policy excludes a row from an UPDATE — it simply matches
-- nothing. The action saw `error === null`, reported "Saved", and changed
-- nothing at all. A control that says it worked and did not is worse than one
-- that fails.
--
-- So: a coach may change a session belonging to an athlete they actively coach.
-- The USING clause decides which rows they may touch; the WITH CHECK clause
-- repeats it so a row cannot be re-parented to a different athlete's plan on
-- the way out.

drop policy if exists pw_coach_update on public.plan_workouts;
create policy pw_coach_update on public.plan_workouts for update
  using (
    exists (
      select 1 from public.training_plans t
      where t.id = plan_workouts.plan_id
        and public.is_coach_of(t.user_id)
    )
  )
  with check (
    exists (
      select 1 from public.training_plans t
      where t.id = plan_workouts.plan_id
        and public.is_coach_of(t.user_id)
    )
  );

-- Deliberately not INSERT or DELETE. Adding or removing sessions changes the
-- shape of a plan the generator produced and the adjustment engine reasons
-- about; until sessions carry provenance (`origin`, `locked_by`) so the engine
-- knows what not to touch, a coach edits what is there rather than restructures
-- it. Documented as the next step rather than half-built here.

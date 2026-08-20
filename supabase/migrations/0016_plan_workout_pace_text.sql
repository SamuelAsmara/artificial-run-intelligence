-- ============================================================================
-- 0016 · planned_pace is a pace, not a duration
-- ============================================================================
--
-- THE BUG
--
-- `plan_workouts.planned_pace` is declared `interval`, and every writer in the
-- application puts a *pace label* in it:
--
--   src/actions/plan.ts:187   planned_pace: paceLabel(w.workoutType, ...)
--   src/lib/planning/paces.ts paceLabel(...) -> "5:49"
--
-- Postgres reads "5:49" as five hours and forty-nine minutes. The row comes
-- back as "05:49:00", and every reader treats the column as an already-
-- formatted string:
--
--   src/lib/dashboard/realPlan.ts:151   row.planned_pace ?? ...
--   src/actions/coach.ts:511            plannedPace: w.planned_pace
--   src/lib/planning/sessionShape.ts    expects "4:15"
--
-- So the plan screen would print "05:49:00/km", the coach's editor would show
-- the same, and `sessionShape` would fail to parse a session it was handed.
--
-- WHY NOBODY SAW IT
--
-- No plan had ever been generated against a real account -- the only athlete in
-- the database had 130 runs, no goal race and no plan -- so not one row was
-- ever written to this column. The demo seed (scripts/seed-demo.ts) generates
-- plans for twenty athletes and would have made this visible on every screen at
-- once.
--
-- THE FIX
--
-- The column's job is to hold "5:49". That is text, and every reader already
-- treats it as text. Changing the type is smaller and safer than converting
-- eight call sites to parse and format intervals, and it removes the class of
-- error rather than one instance of it.
--
-- The USING clause below recovers the mis-parsed value for any row that does
-- exist: a pace stored as "5:49" landed as 5 hours 49 minutes, so the hours
-- component is really minutes and the minutes component is really seconds.
--
-- להריץ ב-Supabase → SQL Editor.
-- ============================================================================

alter table public.plan_workouts
  alter column planned_pace type text
  using case
    when planned_pace is null then null
    -- written by the app as "M:SS" and mis-parsed by Postgres as "H:MM"
    when extract(epoch from planned_pace) >= 3600 then
      to_char(
        make_interval(
          mins  => extract(hour   from planned_pace)::int,
          secs  => extract(minute from planned_pace)::int
        ),
        'FMMI:SS'
      )
    -- already a sensible sub-hour interval
    else to_char(planned_pace, 'FMMI:SS')
  end;

comment on column public.plan_workouts.planned_pace is
  'Prescribed pace as minutes:seconds per kilometre, e.g. "5:49". Text, not '
  'interval: the value is a rate, and Postgres parses "5:49" as 5h49m.';

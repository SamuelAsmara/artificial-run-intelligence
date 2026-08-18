-- 0002 — physiological profile fields
--
-- The settings screen collects age, height, weight and running level, and the
-- load model needs age and sex to estimate maximum heart rate. `profiles` had
-- nowhere to put any of it, so those values were hard-coded in the readiness
-- action. This migration gives them a home.
--
-- It also caches the learned thresholds. They are expensive to recompute (they
-- scan the whole activity history) and they must only fall slowly — keeping the
-- previous value is what lets the ratchet in estimateLthr work across runs
-- rather than only within a single one.

alter table public.profiles
  add column if not exists full_name     text,
  add column if not exists age           int,
  add column if not exists sex           text check (sex in ('male','female')),
  add column if not exists height_cm     int,
  add column if not exists weight_kg     numeric,
  add column if not exists running_level text check (running_level in ('beginner','intermediate','advanced')),
  add column if not exists bio           text;

-- learned, not entered: recomputed from the athlete's own history
alter table public.profiles
  add column if not exists hr_max                int,
  add column if not exists lthr                  int,
  add column if not exists threshold_speed_mps   numeric,
  add column if not exists thresholds_measured   boolean not null default false,
  add column if not exists thresholds_updated_at timestamptz;

comment on column public.profiles.lthr is
  'Lactate threshold heart rate, estimated from sustained hard efforts. Rises immediately, falls at most 1 bpm per recompute so a single hot or ill day cannot collapse the load series.';

comment on column public.profiles.thresholds_measured is
  'False while the estimate is still seeded from age-predicted defaults rather than measured from at least three qualifying efforts.';

-- The existing RLS policies on profiles already restrict rows to the owner and
-- their coach, so the new columns inherit the right protection with no changes.

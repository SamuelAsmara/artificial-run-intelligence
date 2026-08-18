-- 0007 — the numbers the activity-analysis screen shows
--
-- The new activity detail screen reports cadence, power, calories, maximum
-- heart rate and where cardiac drift began. Four of those we simply never
-- asked intervals.icu for; the fifth we can only get by reading the stream.
--
-- ## Why these are stored rather than derived on demand
--
-- The stream itself is not kept — see 0005 and src/lib/wellness/icuStreams.ts.
-- An hour of running at 1 Hz is thousands of samples across six channels, and
-- we read it through a handful of summaries. Deriving on demand would mean one
-- network round trip to intervals.icu per activity per page load, including on
-- the activities list, which shows sixty at a time.
--
-- ## max_hr is not a duplicate of avg_hr
--
-- It carries a second job. The zone model on the analysis screen needs the
-- athlete's true maximum heart rate, and the age formula (220 - age) is a
-- population average that is wrong for most individuals by ten beats or more.
-- This athlete's formula value is 186; a training run recorded 181, which no
-- one reaches at 97% of maximum. The highest value observed across an athlete's
-- own history is a measurement rather than an estimate, and it improves by
-- itself every time they race.

alter table public.activities
  add column if not exists max_hr        integer,
  add column if not exists calories      integer,
  add column if not exists avg_cadence   integer,
  add column if not exists avg_power     integer,
  add column if not exists drift_onset_m integer;

comment on column public.activities.max_hr is
  'Highest heart rate in this activity. Also the raw material for the athlete''s observed maximum, which the zone model prefers over the age formula.';
comment on column public.activities.calories is
  'As reported by the device. Every provider estimates this differently, so it is displayed and never used in a calculation.';
comment on column public.activities.avg_cadence is
  'Steps per minute, both feet. Garmin reports one foot; the importer doubles it so the stored number is the one coaches use.';
comment on column public.activities.avg_power is
  'Watts, as estimated by the watch. Running power is modelled rather than measured and is not comparable between brands, so it is drawn and never interpreted.';
comment on column public.activities.drift_onset_m is
  'Metres into the run where cardiac drift began, or null when it never did. See src/lib/activity/metrics.ts for the definition.';

-- The analysis screen asks for one activity at a time and the dashboard asks
-- for the newest with a reading; both are covered by the existing user/date
-- index. No new index is needed.

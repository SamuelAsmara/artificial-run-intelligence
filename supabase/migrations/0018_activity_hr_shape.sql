-- 0018 — keep the heart rate over the run, not just its average
--
-- Migration 0005 kept three things from each activity's stream and threw the
-- stream away: `pace_shape`, `best_efforts` and `cardiac_drift_pct`. That was
-- the right trade — an hour at 1 Hz is thousands of samples across several
-- fields, and a year of it is tens of megabytes per athlete for data we only
-- read through summaries. But the shape we kept was pace alone, and the
-- consequence took until now to become visible:
--
--   * The activity chart could only draw heart rate for a run whose stream it
--     could fetch live from intervals.icu. A Strava import, a hand-entered
--     session or a coach looking at an athlete's run got no heart-rate band at
--     all — the same hole `streamsFromShape` just closed for pace, still open
--     for the one measurement that says how hard the run actually was.
--
--   * Comparing two runs could say "9% less heart rate for the same speed"
--     from the two averages, but could not show *where* in the run that
--     happened. Which is the interesting half: holding the same heart rate for
--     twenty minutes and then climbing is a different run from starting high
--     and settling, and the averages are identical.
--
-- Forty points is the same budget `pace_shape` uses, and for the same reason:
-- enough to see the shape of an effort, small enough that a decade of running
-- is still kilobytes.
--
-- Nothing needs backfilling by hand. The importer stamps
-- `streams_derived_version` on every row it touches and re-derives anything
-- stamped lower, so raising DERIVATION_VERSION in src/lib/providers/syncIcu.ts
-- is what fills this column in — in ordinary sync batches, at the athlete's own
-- pace, with no migration that has to hold thousands of rows at once.

alter table public.activities
  add column if not exists hr_shape jsonb;

comment on column public.activities.hr_shape is
  'Beats per minute across the run, downsampled to about 40 points, aligned one-for-one with pace_shape. Null entries are stretches the strap did not report - a dropout, not a heart rate of zero. Null for the whole column means the run was recorded without heart rate, or predates the derivation that stores it.';

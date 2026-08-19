-- 0010 — mark which version of the derivation produced a run's stored summaries
--
-- `pace_shape`, `best_efforts`, `cardiac_drift_pct` and `drift_onset_m` are a
-- cache. The raw stream is thrown away after import (it is tens of megabytes a
-- year), so these four columns are the only surviving product of a pure
-- function over data we no longer hold.
--
-- That was fine until the function changed. `bestEfforts` was measuring its
-- windows on elapsed time, so a red light inside a fast 10 km counted against
-- the effort, and a run that was 43 seconds quicker was recorded as the slower
-- personal best. Fixing the function fixed nothing already stored: the sync
-- skips any activity with `streams_fetched_at` set, so every historical row
-- kept its wrong answer with no way to notice.
--
-- A version number turns that from a manual migration into an ordinary sync.
-- The importer knows which version it implements; anything stamped lower is
-- re-derived on the next run, in the same batches as a first import. Change the
-- maths, raise the constant, and the data catches itself up.
--
-- Default 0 rather than the current version, because every existing row *was*
-- produced by an older derivation and does need redoing.

alter table public.activities
  add column if not exists streams_derived_version smallint not null default 0;

comment on column public.activities.streams_derived_version is
  'Which version of the stream derivation produced pace_shape / best_efforts / cardiac_drift_pct / drift_onset_m. Rows below the importer''s current version are re-derived on the next sync. See DERIVATION_VERSION in src/lib/providers/syncIcu.ts.';

-- The sync looks for "not yet derived, or derived by something older", so the
-- index carries both halves of that question.
create index if not exists activities_derivation_idx
  on public.activities (user_id, streams_derived_version)
  where source = 'intervals_icu';

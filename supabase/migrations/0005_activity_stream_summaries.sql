-- 0005 — what we keep from each activity's second-by-second record
--
-- The raw stream is large: an hour of running at 1 Hz is thousands of samples
-- across several fields, and a year of it would be tens of megabytes per
-- athlete for data we only ever read through three summaries. So we fetch the
-- stream once, derive, store the summaries, and discard the stream. It never
-- changes, so re-deriving only ever means re-fetching.
--
-- The three summaries replace three things that were previously faked:
--   * pace_shape       — the flat line in the activity list
--   * best_efforts     — the hard-coded personal records
--   * cardiac_drift_pct— a constant 2.4% on the dashboard
--
-- `streams_fetched_at` is what makes the import resumable. A first sync has
-- hundreds of activities to walk and cannot do them all inside one request, so
-- each run processes a batch of whatever is still null and the athlete syncs
-- again to continue.

alter table public.activities
  add column if not exists pace_shape          jsonb,
  add column if not exists best_efforts        jsonb,
  add column if not exists cardiac_drift_pct   numeric,
  add column if not exists streams_fetched_at  timestamptz;

comment on column public.activities.pace_shape is
  'Seconds per kilometre, downsampled to about 40 points, for the activity-list sparkline. Null entries are stretches with no usable speed — a stop at a crossing rather than a pace of zero.';
comment on column public.activities.best_efforts is
  'Fastest continuous time over each tracked distance within this run, in seconds, e.g. {"1k":225,"5k":1308}. A 5K best can come from a 10 km run — that is the point.';
comment on column public.activities.cardiac_drift_pct is
  'Aerobic decoupling: how much the heart-rate-to-pace ratio rose from the first half of the run to the second. Null for runs too short or too broken for the number to mean anything.';
comment on column public.activities.streams_fetched_at is
  'When the stream was last pulled. Null means not yet processed, which is how the resumable backfill finds its next batch.';

-- Finding the next batch to process is the hot query during a backfill.
create index if not exists activities_streams_pending_idx
  on public.activities (user_id, streams_fetched_at)
  where streams_fetched_at is null;

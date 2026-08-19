-- 0015 — notice when a run is edited after we imported it
--
-- ## The gap
--
-- The summary half of the sync is already self-healing: `importFromIcu` re-upserts
-- a fixed 400-day window every run, so a corrected distance or heart rate flows
-- through on its own. The four *derived* columns do not. `processStreams` selects
-- only rows with `streams_derived_version < DERIVATION_VERSION`, and once a run is
-- stamped at the current version there is no condition under which it is fetched
-- again.
--
-- So: an athlete's watch keeps recording the 400 m walk to the car at the end of
-- a tempo run. They crop the activity on intervals.icu. Distance and duration
-- correct themselves on the next sync — and `pace_shape` still shows the tail-off,
-- `best_efforts` still holds the stretched 5 km split that the walk inflated, and
-- `cardiac_drift_pct` still reflects a heart rate that was falling in a car park.
-- Nothing in the product could ever fix it. The personal-records discrepancy we
-- chased in August was this class of bug, found the hard way.
--
-- ## The mechanism
--
-- intervals.icu stamps every activity with when it was last modified. Storing that
-- alongside the run turns "has this changed?" into a comparison rather than a
-- guess: when the timestamp moves, the sync resets `streams_derived_version` to 0
-- and the existing re-derivation path — built for changing the maths in code —
-- picks the row up on the same pass and recomputes it. No new machinery, no
-- per-activity "re-analyse" button for the athlete to know to press.
--
-- Null for every row that exists today, and for any provider that does not report
-- one. That is the correct resting state: unknown, not stale. Nothing is
-- re-derived on the strength of a timestamp we never had.

alter table public.activities
  add column if not exists source_updated_at timestamptz;

comment on column public.activities.source_updated_at is
  'when the provider last modified this activity; a change resets streams_derived_version so the stream is re-analysed';

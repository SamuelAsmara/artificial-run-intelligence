-- 0004 — activities can come from more than Strava
--
-- The original schema keyed every activity on `strava_activity_id bigint not
-- null`. That encoded an assumption that is no longer true: intervals.icu is
-- now the primary source, it already holds the athlete's full Garmin history,
-- and its activity ids are strings like "i12345678" — they do not fit in a
-- bigint and they are not Strava's.
--
-- Rather than bolt a second id column on per provider, this generalises to
-- (source, external_id). Adding a third source later costs a check-constraint
-- value and nothing else.
--
-- ## Why the unique key includes user_id
--
-- Two athletes can legitimately hold the same activity id from different
-- accounts of the same provider, and more importantly the uniqueness we care
-- about is "this athlete does not have this run twice". Deduplication is the
-- whole point: syncing repeatedly must be idempotent, and the athlete may end
-- up connecting both Strava and intervals.icu for the same runs.

alter table public.activities
  add column if not exists source      text,
  add column if not exists external_id text;

-- Everything already in the table came from Strava.
update public.activities
   set source = coalesce(source, 'strava'),
       external_id = coalesce(external_id, strava_activity_id::text)
 where source is null or external_id is null;

alter table public.activities
  alter column source set default 'strava',
  alter column source set not null,
  alter column external_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'activities_source_check'
  ) then
    alter table public.activities
      add constraint activities_source_check
      check (source in ('strava', 'intervals_icu', 'manual'));
  end if;
end $$;

-- The Strava id becomes optional: an intervals.icu activity has none.
alter table public.activities
  alter column strava_activity_id drop not null;

-- Idempotent sync. Repeated imports update rather than duplicate.
create unique index if not exists activities_user_source_external_idx
  on public.activities (user_id, source, external_id);

comment on column public.activities.source is
  'Which connection this activity came from. Determines how external_id is interpreted.';
comment on column public.activities.external_id is
  'The activity id at the source. Combined with source and user_id this is the deduplication key, so re-syncing is idempotent.';
comment on column public.activities.strava_activity_id is
  'Kept for the Strava path and for existing rows. Null for activities from any other source — use external_id instead.';

-- 0003 — per-athlete connections to outside data sources
--
-- Until now the intervals.icu credentials lived in `.env.local`. That works for
-- one developer and for nobody else: a second athlete has no way to connect
-- their own watch. This table moves the connection into the product.
--
-- ## Why intervals.icu needs a table at all when Strava does not
--
-- Strava uses OAuth, so the app already stores an access token per athlete in
-- `strava_accounts`. intervals.icu has no OAuth flow for personal accounts — it
-- issues a long-lived API key that the athlete copies out of their own settings
-- page. So the athlete pastes two values (athlete id + API key) and we keep
-- them.
--
-- ## Security posture, stated plainly
--
-- The API key is stored as text. RLS restricts every row to its owner, so no
-- other athlete — and no coach — can read it. It is NOT encrypted at rest by
-- the application, which means a database dump would expose it. A production
-- deployment should hold it in Supabase Vault (pgsodium) and store only the
-- secret id here.
--
-- Two things reduce the blast radius in the meantime:
--   * an intervals.icu API key is read-only for wellness and activity data and
--     carries no payment or identity scope;
--   * `api_key_hint` exists so the UI can show "…a1b2" without ever selecting
--     the key itself.

create table if not exists public.provider_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null check (provider in ('intervals_icu')),

  -- the athlete's id at the provider, e.g. "i123456"
  external_id   text not null,
  api_key       text not null,
  -- last four characters, safe to display
  api_key_hint  text,

  status        text not null default 'connected'
                check (status in ('connected', 'error', 'revoked')),
  last_error    text,
  last_synced_at timestamptz,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- one connection per provider per athlete; makes upsert-on-reconnect trivial
  unique (user_id, provider)
);

comment on table public.provider_connections is
  'Athlete-supplied credentials for data sources that have no OAuth flow. Currently only intervals.icu.';
comment on column public.provider_connections.api_key is
  'Plaintext at rest. Protected by RLS only — see the migration header. Never select this column into anything that reaches the browser.';
comment on column public.provider_connections.api_key_hint is
  'Last four characters, for display. Lets Settings confirm which key is connected without exposing it.';

create index if not exists provider_connections_user_idx
  on public.provider_connections (user_id);

alter table public.provider_connections enable row level security;

-- Owner-only. Deliberately narrower than `profiles`: a coach can see an
-- athlete's training data, but never the athlete's credentials.
drop policy if exists "own connections readable" on public.provider_connections;
create policy "own connections readable"
  on public.provider_connections for select
  using (auth.uid() = user_id);

drop policy if exists "own connections insertable" on public.provider_connections;
create policy "own connections insertable"
  on public.provider_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "own connections updatable" on public.provider_connections;
create policy "own connections updatable"
  on public.provider_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own connections deletable" on public.provider_connections;
create policy "own connections deletable"
  on public.provider_connections for delete
  using (auth.uid() = user_id);

-- keep updated_at honest
create or replace function public.touch_provider_connections()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists provider_connections_touch on public.provider_connections;
create trigger provider_connections_touch
  before update on public.provider_connections
  for each row execute function public.touch_provider_connections();

-- 0011 — carry the chosen role and name from signup into the profile
--
-- The sign-up form asks whether you are an athlete or a coach, and sends the
-- answer as user metadata:
--
--   supabase.auth.signUp({ email, password,
--     options: { data: { username, role } } })
--
-- The trigger that builds the profile row never read it:
--
--   insert into public.profiles (id, email) values (new.id, new.email)
--
-- So `role` fell to its default of 'athlete' for everybody, and the username
-- was discarded. Picking "Coach" on the sign-up screen did nothing at all —
-- silently, which is the worst way for a control to not work. The coach screens
-- were reachable by URL, so nobody noticed until somebody actually signed up as
-- a coach and found themselves an athlete.
--
-- The metadata is not trusted blindly. `role` is whitelisted against the two
-- legal values, because it arrives from the browser and the column's check
-- constraint would otherwise turn a typo into a failed signup rather than a
-- sensible default.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  chosen_role text;
  chosen_name text;
begin
  chosen_role := coalesce(new.raw_user_meta_data ->> 'role', 'athlete');
  if chosen_role not in ('athlete', 'coach') then
    chosen_role := 'athlete';
  end if;

  chosen_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'full_name',
    ''
  )), '');

  insert into public.profiles (id, email, role, full_name)
  values (new.id, new.email, chosen_role, chosen_name)
  on conflict (id) do nothing;

  return new;
end; $$;

-- Anyone who signed up before this fix has the default role. There is no way to
-- recover their intent from here — the choice was never stored — so they are
-- left as athletes and can be changed by hand if they say so.

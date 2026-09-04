-- ============================================================================
-- 0017 · profiles.email must follow auth.users.email
-- ============================================================================
--
-- THE BUG
--
-- `handle_new_user` copies the address into `public.profiles` on INSERT, and
-- there the copy stays. `auth.users` had exactly one trigger — INSERT — so an
-- athlete who changed their email in Settings kept the old address in
-- `profiles` forever.
--
-- The change flow itself is careful: AccountSecurity re-authenticates with the
-- current password before calling `updateUser`, and Supabase only switches the
-- address once the new one is confirmed. All of that works. The copy simply
-- never heard about it.
--
-- WHERE IT SHOWS
--
-- The coach's roster labels an athlete `full_name || email`, so anyone without
-- a display name is listed under an address they no longer own. It is also two
-- sources of truth for one fact, which is a bug waiting to be inherited by
-- every report written from here on.
--
-- WHY A TRIGGER RATHER THAN A WRITE IN THE ACTION
--
-- Because the address can change without the application being involved: from
-- the Supabase dashboard, from the admin API, from a support action. Anything
-- that only fires on our own code path would go stale again the first time
-- somebody used one of those.
--
-- Applied through the Supabase SQL editor.
-- ============================================================================

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- Anyone who already changed their address before this existed.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

comment on function public.sync_profile_email() is
  'Keeps profiles.email in step with auth.users.email. Added in 0017 after the '
  'address was found to be copied on signup and never updated again.';

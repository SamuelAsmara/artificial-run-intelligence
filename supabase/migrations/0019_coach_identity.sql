-- Let an athlete see who is coaching them.
--
-- `profiles_read` is `id = auth.uid() or is_coach_of(id)`: a coach may read
-- their athletes, an athlete may not read their coach. That asymmetry is
-- correct — widening the policy would let anyone who ever held a coach code
-- read a stranger's profile row, physiology included — so the fix stays where
-- migration 0013 put it: one narrow security-definer function that returns
-- exactly the columns an athlete is entitled to see about their own coach.
--
-- Three columns become five. Nothing else about the function changes: same
-- name, same join, same `limit 1`, same "returns nothing when you have not
-- joined a coach". A caller written against the three-column version keeps
-- working, because the two new columns are simply ignored.
--
-- Deliberately NOT returned: email, physiology, thresholds, provider
-- connections, coach code. An athlete needs a face and a sentence, not a file.

-- `create or replace` cannot widen a function's return type — Postgres answers
-- "cannot change return type of existing function" — so the old signature is
-- dropped first. No grants were ever issued on it (execute on functions is
-- public by default), so nothing has to be restored afterwards.
drop function if exists public.my_coach_name();

create function public.my_coach_name()
returns table (
  coach_id         uuid,
  coach_name       text,
  since            timestamptz,
  coach_avatar_url text,
  coach_bio        text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)),
         ca.created_at,
         p.avatar_url,
         nullif(p.bio, '')
    from public.coach_athletes ca
    join public.profiles p on p.id = ca.coach_id
   where ca.athlete_id = auth.uid()
     and ca.status = 'active'
   limit 1;
$$;

comment on function public.my_coach_name is
  'Who is coaching the caller: name, avatar, bio and the date the link began. '
  'Returns nothing when they have not joined a coach. Deliberately narrower '
  'than a profiles read — an athlete may see their coach''s face and blurb, '
  'never their email, physiology or credentials.';

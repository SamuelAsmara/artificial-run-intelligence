-- 0006 — the athlete's photo, and where it sits in the frame
--
-- Two columns rather than one, because a photo and its framing are separate
-- facts. A round avatar crops whatever it is given, and cropping around the
-- geometric centre cuts the top off most portraits — so the athlete needs to
-- be able to move the image inside the circle without re-uploading it.
--
-- ## Why the image lives in a column and not in object storage
--
-- Supabase Storage would be the right answer for full-resolution photos. For a
-- 400x400 avatar it is a bucket, a policy set and a second failure mode in
-- exchange for very little: the browser downscales before upload, so what lands
-- here is tens of kilobytes. If avatars ever grow beyond that, this column
-- becomes a storage path and nothing else changes.
--
-- RLS on `profiles` already restricts rows to their owner and that athlete's
-- coach, so the new columns inherit the right protection with no changes.

alter table public.profiles
  add column if not exists avatar_url      text,
  add column if not exists avatar_position text not null default '50% 30%';

comment on column public.profiles.avatar_url is
  'The athlete photo as a data URL, already downscaled by the browser. Null means show the placeholder.';
comment on column public.profiles.avatar_position is
  'CSS object-position for the photo inside its circle, e.g. "50% 30%". Lets the athlete move the crop without re-uploading. Defaults biased upward because faces sit above the centre of most photos.';

-- Security hardening, applied to production on 2026-10-07.

-- 1. Profiles are readable by signed-in users only (was: anyone with the public anon key).
alter policy "profiles_admin_select" on public.profiles to authenticated;
alter policy "Профиль видят все" on public.profiles to authenticated;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

-- 2. Strip markup from profile text and only accept avatars from our own bucket.
--    The app renders these fields as HTML, so this blocks stored XSS for every client.
create or replace function public.profiles_sanitize()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.name is not null then
    new.name := left(regexp_replace(new.name, '[<>"`]', '', 'g'), 60);
  end if;
  if new.location_name is not null then
    new.location_name := left(regexp_replace(new.location_name, '[<>"`]', '', 'g'), 120);
  end if;
  if new.location is not null then
    new.location := left(regexp_replace(new.location, '[<>"`]', '', 'g'), 120);
  end if;
  if new.gender is not null then
    new.gender := left(regexp_replace(new.gender, '[<>"`]', '', 'g'), 40);
  end if;
  if new.origin is not null then
    new.origin := left(regexp_replace(new.origin, '[<>"`]', '', 'g'), 40);
  end if;
  if new.photo_url is not null and new.photo_url <> '' and (
       new.photo_url not like 'https://pewgupxikbswhaqxjrwk.supabase.co/storage/v1/object/public/avatars/%'
       or new.photo_url ~ '[''"()<>\s\\]'
     ) then
    new.photo_url := null;
  end if;
  return new;
end
$fn$;

create trigger profiles_sanitize
  before insert or update on public.profiles
  for each row execute function public.profiles_sanitize();

-- 3. Avatars bucket: images only, 10 MB max.
--    (storage.objects policies are owned by supabase_storage_admin and must be changed in the
--    Dashboard: upload only into your own "<auth.uid()>/" folder, see the security notes.)
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
 where id = 'avatars';

-- 4. get_user_circle_id is not part of the public API.
revoke execute on function public.get_user_circle_id(uuid) from anon, public;

-- 5. Pin search_path on functions flagged by the Supabase linter.
alter function public.get_user_circle_id(uuid) set search_path = public, extensions, pg_temp;
alter function public.update_updated_at_column() set search_path = public, extensions, pg_temp;
alter function public.check_mutual_like() set search_path = public, extensions, pg_temp;
alter function public.trigger_notify_new_message() set search_path = public, extensions, pg_temp;
alter function public.trigger_oli_reply() set search_path = public, extensions, pg_temp;
alter function public.trigger_oli_welcome() set search_path = public, extensions, pg_temp;
alter function public.trigger_oli_group_reply() set search_path = public, extensions, pg_temp;
alter function public.mirror_submit_friend_response(text, text, jsonb) set search_path = public, extensions, pg_temp;
alter function public.mirror_submit_friend_response(text, text, jsonb, text) set search_path = public, extensions, pg_temp;

-- 6. The four trigger functions that call Edge Functions (notify-new-message, oli-reply,
--    oli-welcome, oli-group-reply) no longer carry the service role JWT inline. In each, the
--    literal 'Bearer <jwt>' was replaced in place with
--      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
--    The rest of each function body is unchanged.

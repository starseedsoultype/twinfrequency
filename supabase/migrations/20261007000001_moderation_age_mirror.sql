-- Moderation that works server-side, 18+ enforcement, Mirror closed. Applied 2026-10-07.

-- Admin check usable inside policies without recursing into profiles RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;
revoke execute on function public.is_admin() from anon, public;
grant execute on function public.is_admin() to authenticated;

-- Banned people are invisible to everyone except themselves (for the banned.html redirect)
-- and admins (to unban). Applies to all three existing SELECT policies on profiles.
alter policy "profiles_admin_select" on public.profiles to authenticated
  using (not coalesce(is_banned, false) or id = (select auth.uid()) or (select public.is_admin()));
alter policy "profiles_select_authenticated" on public.profiles to authenticated
  using (not coalesce(is_banned, false) or id = (select auth.uid()) or (select public.is_admin()));
alter policy "Профиль видят все" on public.profiles to authenticated
  using (not coalesce(is_banned, false) or id = (select auth.uid()) or (select public.is_admin()));

-- Banned people cannot message or like; only confirmed adults can like (a like is the only
-- way to a match with another person). Runs for every client, Edge Functions included.
create or replace function public.block_banned_writes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor uuid; p record;
begin
  if tg_table_name = 'likes' then
    actor := (to_jsonb(new) ->> 'from_user')::uuid;
  else
    actor := (to_jsonb(new) ->> 'sender_id')::uuid;
  end if;
  select is_banned, age, is_bot into p from public.profiles where id = actor;
  if coalesce(p.is_banned, false) then
    raise exception 'account is banned' using errcode = '42501';
  end if;
  if tg_table_name = 'likes' and not coalesce(p.is_bot, false) and (p.age is null or p.age < 18) then
    raise exception 'age confirmation required' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger block_banned_writes before insert on public.messages
  for each row execute function public.block_banned_writes();
create trigger block_banned_writes before insert on public.group_messages
  for each row execute function public.block_banned_writes();
create trigger block_banned_writes before insert on public.likes
  for each row execute function public.block_banned_writes();

-- Ban / unban from admin.html. Profile RLS only lets people edit their own row, so the
-- old client-side update silently did nothing.
create or replace function public.admin_set_banned(target uuid, banned boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'cannot ban yourself';
  end if;
  update public.profiles set is_banned = banned where id = target;
  if banned then
    delete from public.matches where user1 = target or user2 = target;
  end if;
end
$$;
revoke execute on function public.admin_set_banned(uuid, boolean) from anon, public;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;

-- 18+ at the data level.
alter table public.profiles add constraint profiles_age_adult
  check (age is null or (age >= 18 and age <= 120));

-- Mirror is retired: no anonymous reads (names, Telegram IDs) or writes.
alter policy "anon read session by code" on public.mirror_sessions using (false);
alter policy "public can read mirror friend responses" on public.mirror_friend_responses using (false);
alter policy "anon insert friend response" on public.mirror_friend_responses with check (false);

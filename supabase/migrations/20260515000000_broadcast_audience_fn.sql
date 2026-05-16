-- Helper function for broadcast audience — joins auth.users with profiles
-- Returns eligible users for a given broadcast_key (not yet sent)
create or replace function public.get_broadcast_audience(p_broadcast_key text)
returns table(user_id uuid, email text)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where
    u.email is not null
    and u.email <> ''
    and u.email not like 'tg_%@twinfrequency.io'
    and p.name is not null and p.name <> ''
    and p.origin is not null and p.origin <> '' and p.origin <> 'Unknown'
    and p.age is not null
    and p.gender is not null and p.gender <> ''
    and coalesce(p.is_banned, false) = false
    and not exists (
      select 1
      from public.email_broadcast_log l
      where l.broadcast_key = p_broadcast_key
        and l.email = u.email
        and l.status = 'sent'
    )
$$;

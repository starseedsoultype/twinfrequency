-- Loose broadcast audience — anyone with a real email who isn't banned
-- Excludes anyone who already received any successful broadcast
create or replace function public.get_broadcast_audience_loose(p_broadcast_key text)
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
    and coalesce(p.is_banned, false) = false
    and not exists (
      select 1
      from public.email_broadcast_log l
      where l.email = u.email
        and l.status = 'sent'
    )
$$;

create or replace function public.get_broadcast_audience_instagram_leads(p_broadcast_key text)
returns table(user_id uuid, email text)
language sql
security definer
set search_path = public
as $$
  select distinct on (l.email)
    l.user_id,
    l.email
  from public.api_leads l
  where
    l.email is not null
    and l.source = 'instagram'
    and not exists (
      select 1 from public.email_broadcast_log b
      where b.email = l.email
        and b.broadcast_key = p_broadcast_key
        and b.status = 'sent'
    )
    and not exists (
      select 1 from public.email_unsubscribes us
      where us.email = l.email
    )
$$;

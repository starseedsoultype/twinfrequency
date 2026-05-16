-- Unsubscribe table and updated audience functions

create table if not exists public.email_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  unsubscribed_at timestamptz not null default now(),
  constraint email_unsubscribes_email_unique unique (email)
);

alter table public.email_unsubscribes enable row level security;

create policy "anon can insert unsubscribes"
on public.email_unsubscribes
for insert
to anon
with check (true);

-- Updated audience functions with unsubscribe exclusion

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
      select 1 from public.email_broadcast_log l
      where l.broadcast_key = p_broadcast_key
        and l.email = u.email
        and l.status = 'sent'
    )
    and not exists (
      select 1 from public.email_unsubscribes us
      where us.email = u.email
    )
$$;

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
      select 1 from public.email_broadcast_log l
      where l.email = u.email
        and l.status = 'sent'
    )
    and not exists (
      select 1 from public.email_unsubscribes us
      where us.email = u.email
    )
$$;

create or replace function public.get_broadcast_audience_origin_leads(p_broadcast_key text)
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
    and l.interest is not null
    and l.interest not like 'connection:%'
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

create or replace function public.get_broadcast_audience_connection_leads(p_broadcast_key text)
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
    and l.interest like 'connection:%'
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

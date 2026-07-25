-- Telegram broadcast system for @SeedSoulTest_bot
-- Mirrors the email broadcast system (email_broadcast_log + audience functions).
-- Created 2026-07-25.

-- ─────────────────────────────────────────────────────────────
-- 1. Subscribers — everyone who has opened the bot
-- ─────────────────────────────────────────────────────────────
create table if not exists telegram_subscribers (
  telegram_id    bigint primary key,
  username       text,
  first_name     text,
  last_name      text,
  language_code  text,
  source         text default 'bot',   -- bot / instagram / import
  start_param    text,                 -- deep-link payload: guide / portal / star
  is_blocked     boolean not null default false,
  subscribed_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

comment on table telegram_subscribers is
  'Everyone who pressed Start in @SeedSoulTest_bot. Populated by seedsoul-bot-webhook.';
comment on column telegram_subscribers.is_blocked is
  'True once Telegram reports the user blocked the bot. Excluded from all audiences.';

alter table telegram_subscribers enable row level security;
-- No policies: service role only (edge functions).

-- ─────────────────────────────────────────────────────────────
-- 2. Broadcast log — one row per (campaign, recipient)
-- ─────────────────────────────────────────────────────────────
create table if not exists telegram_broadcast_log (
  id            uuid primary key default gen_random_uuid(),
  broadcast_key text not null,
  telegram_id   bigint not null,
  status        text not null default 'pending',   -- pending / sent / error
  error         text,
  message_id    bigint,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (broadcast_key, telegram_id)
);

create index if not exists telegram_broadcast_log_key_idx
  on telegram_broadcast_log (broadcast_key);

alter table telegram_broadcast_log enable row level security;
-- No policies: service role only.

-- ─────────────────────────────────────────────────────────────
-- 3. Bot assets — cached Telegram file_id for the free guide
--    First send uploads by URL, Telegram returns a file_id,
--    every later send reuses it and is instant.
-- ─────────────────────────────────────────────────────────────
create table if not exists bot_assets (
  key        text primary key,   -- e.g. 'relationships_guide'
  file_id    text,
  source_url text,
  updated_at timestamptz not null default now()
);

alter table bot_assets enable row level security;

insert into bot_assets (key, source_url)
values ('relationships_guide', 'https://twinfrequency.io/guide/starseed-relationships.pdf')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 4. Audience functions
--    All return telegram_id, exclude blocked users and anyone
--    who already received this broadcast_key.
-- ─────────────────────────────────────────────────────────────

-- Bot subscribers (people who came from Instagram / links)
create or replace function get_tg_audience_subscribers(p_broadcast_key text)
returns table (telegram_id bigint)
language sql
security definer
set search_path = public
as $$
  select s.telegram_id
  from telegram_subscribers s
  where s.is_blocked = false
    and not exists (
      select 1 from telegram_broadcast_log l
      where l.broadcast_key = p_broadcast_key
        and l.telegram_id   = s.telegram_id
    )
  order by s.subscribed_at
$$;

-- TwinF users who signed in through the Telegram Mini App
create or replace function get_tg_audience_twinf(p_broadcast_key text)
returns table (telegram_id bigint)
language sql
security definer
set search_path = public
as $$
  select p.telegram_id
  from profiles p
  where p.telegram_id is not null
    and coalesce(p.is_bot, false)    = false
    and coalesce(p.is_banned, false) = false
    and not exists (
      select 1 from telegram_subscribers s
      where s.telegram_id = p.telegram_id and s.is_blocked
    )
    and not exists (
      select 1 from telegram_broadcast_log l
      where l.broadcast_key = p_broadcast_key
        and l.telegram_id   = p.telegram_id
    )
$$;

-- Everyone reachable, deduplicated
create or replace function get_tg_audience_all(p_broadcast_key text)
returns table (telegram_id bigint)
language sql
security definer
set search_path = public
as $$
  select tg.telegram_id from (
    select s.telegram_id
    from telegram_subscribers s
    where s.is_blocked = false
    union
    select p.telegram_id
    from profiles p
    where p.telegram_id is not null
      and coalesce(p.is_bot, false)    = false
      and coalesce(p.is_banned, false) = false
      and not exists (
        select 1 from telegram_subscribers s2
        where s2.telegram_id = p.telegram_id and s2.is_blocked
      )
  ) tg
  where not exists (
    select 1 from telegram_broadcast_log l
    where l.broadcast_key = p_broadcast_key
      and l.telegram_id   = tg.telegram_id
  )
$$;

revoke all on function get_tg_audience_subscribers(text) from public, anon, authenticated;
revoke all on function get_tg_audience_twinf(text)       from public, anon, authenticated;
revoke all on function get_tg_audience_all(text)         from public, anon, authenticated;

-- Where the person is in their connection, captured on the first tap.
alter table telegram_subscribers
  add column if not exists stage      text,
  add column if not exists stage_at   timestamptz,
  add column if not exists origin     text,
  add column if not exists origin_at  timestamptz;

comment on column telegram_subscribers.stage is
  'together / onoff / pulled / nocontact. Set when the subscriber taps the stage question.';
comment on column telegram_subscribers.origin is
  'Soul Origin, filled once the person completes the Origin Scan. Step 2.';

create index if not exists telegram_subscribers_stage_idx
  on telegram_subscribers (stage);

-- Queue for timed follow-ups, processed by pg_cron. Step 3.
create table if not exists bot_followups (
  id          uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  kind        text not null,
  due_at      timestamptz not null,
  sent_at     timestamptz,
  status      text not null default 'pending',
  error       text,
  created_at  timestamptz not null default now(),
  unique (telegram_id, kind)
);

create index if not exists bot_followups_due_idx
  on bot_followups (status, due_at);

alter table bot_followups enable row level security;

-- Every tap on a paid link, so we can see who reached the price and stopped.
create table if not exists bot_clicks (
  id          uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  kind        text   not null,
  url         text,
  clicked_at  timestamptz not null default now()
);

create index if not exists bot_clicks_subscriber_idx
  on bot_clicks (telegram_id, kind);

alter table bot_clicks enable row level security;

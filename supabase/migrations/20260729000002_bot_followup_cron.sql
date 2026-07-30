-- Shared secret so only pg_cron can drain the queue.
-- Value is set once in bot_config; it is not in this file.
insert into bot_config (key, value)
values ('cron_secret', 'SET_ME')
on conflict (key) do nothing;

-- Drain the follow-up queue every ten minutes, entirely inside Postgres.
select cron.unschedule('seedsoul-bot-followups')
where exists (select 1 from cron.job where jobname = 'seedsoul-bot-followups');

select cron.schedule(
  'seedsoul-bot-followups',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://pewgupxikbswhaqxjrwk.supabase.co/functions/v1/seedsoul-bot-followup',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', (select value from public.bot_config where key = 'cron_secret')
               ),
    body    := '{}'::jsonb
  );
  $$
);

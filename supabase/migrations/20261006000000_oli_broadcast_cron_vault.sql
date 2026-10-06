-- Weekly Oli broadcast (Mondays 15:00 UTC) reads the service role key from
-- Vault instead of carrying it in plain text inside cron.job.command.
--
-- One-time setup, run by hand, never committed:
--   select vault.create_secret('<service role key>', 'service_role_key',
--     'Service role JWT used by pg_cron/pg_net to call Edge Functions. Single source of truth: rotate here.');
-- Rotating the key later: vault.update_secret(id, '<new key>') — the job picks it up on the next run.

select cron.unschedule('oli-broadcast-weekly')
where exists (select 1 from cron.job where jobname = 'oli-broadcast-weekly');

select cron.schedule(
  'oli-broadcast-weekly',
  '0 15 * * 1',
  $cmd$
  SELECT net.http_post(
    url := 'https://pewgupxikbswhaqxjrwk.supabase.co/functions/v1/oli-broadcast',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    )
  );
  $cmd$
);

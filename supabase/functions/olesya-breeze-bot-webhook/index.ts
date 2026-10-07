// Mirror is switched off (2026-10-07): the bot no longer reads, stores or answers
// anything. It returns "ok" so Telegram stops retrying. The working version is in git
// history (commit "olesya-breeze-bot-webhook: check Telegram webhook secret").
Deno.serve(() => new Response("ok"));

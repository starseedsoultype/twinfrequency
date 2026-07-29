-- Opaque per-subscriber token used in the personal quiz link.
-- The raw telegram_id stays out of the URL so nobody can set someone else's origin.
alter table telegram_subscribers
  add column if not exists quiz_token text;

create unique index if not exists telegram_subscribers_quiz_token_idx
  on telegram_subscribers (quiz_token)
  where quiz_token is not null;

comment on column telegram_subscribers.quiz_token is
  'Random token in the personal Origin Scan link. Resolved by bot-origin-capture.';

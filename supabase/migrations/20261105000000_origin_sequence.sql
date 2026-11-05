-- Origin letter sequence: four letters per type, sent once a day by edge function
-- origin-sequence. Nothing is sent until bot_config.origin_seq_enabled = 'true'.
-- Only edge functions touch these tables, so RLS has no policies.

create table public.origin_seq_types (
  type_name text primary key,
  pdf_url text not null
);

-- api_leads.interest and the letters sheet spell some types differently.
create table public.origin_seq_type_names (
  lead_name text primary key,
  type_name text not null references public.origin_seq_types(type_name)
);

create table public.origin_seq_letters (
  type_name text not null references public.origin_seq_types(type_name),
  letter_no int not null check (letter_no between 1 and 4),
  subject text not null,
  body text not null,
  approved boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (type_name, letter_no)
);

-- Shared text placed into letters: PDF_BLOCK (uses {{PDF_URL}}) and PAIR_BLOCK.
create table public.origin_seq_blocks (
  key text primary key,
  body text not null,
  updated_at timestamptz not null default now()
);

create table public.origin_seq_sends (
  email text not null,
  letter_no int not null check (letter_no between 1 and 4),
  status text not null check (status in ('sending', 'sent', 'error', 'failed')),
  attempts int not null default 1,
  resend_id text,
  error text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (email, letter_no)
);
create index origin_seq_sends_status on public.origin_seq_sends (status);

alter table public.origin_seq_types enable row level security;
alter table public.origin_seq_type_names enable row level security;
alter table public.origin_seq_letters enable row level security;
alter table public.origin_seq_blocks enable row level security;
alter table public.origin_seq_sends enable row level security;

insert into public.origin_seq_types (type_name, pdf_url) values
  ('Siriusian', 'https://starseedsoul.gumroad.com/l/soul-20'),
  ('Pleiadian', 'https://starseedsoul.gumroad.com/l/soul-17'),
  ('Lemurian', 'https://starseedsoul.gumroad.com/l/soul-13'),
  ('Cassiopeian', 'https://starseedsoul.gumroad.com/l/soul-7'),
  ('Procyonian', 'https://starseedsoul.gumroad.com/l/soul-19'),
  ('Lyran', 'https://starseedsoul.gumroad.com/l/soul-14'),
  ('Arcturian', 'https://starseedsoul.gumroad.com/l/soul-4'),
  ('Orion', 'https://starseedsoul.gumroad.com/l/soul-16'),
  ('Vegan', 'https://starseedsoul.gumroad.com/l/soul-23'),
  ('Zeta Reticulan', 'https://starseedsoul.gumroad.com/l/soul-24'),
  ('Epsilon Eridanian', 'https://starseedsoul.gumroad.com/l/soul-10'),
  ('Atlantean', 'https://starseedsoul.gumroad.com/l/soul-5'),
  ('Andromedan', 'https://starseedsoul.gumroad.com/l/soul-2'),
  ('Polarisian', 'https://starseedsoul.gumroad.com/l/soul-18'),
  ('Nibirian', 'https://starseedsoul.gumroad.com/l/soul-15'),
  ('Egyptian', 'https://starseedsoul.gumroad.com/l/soul-9'),
  ('Titanian', 'https://starseedsoul.gumroad.com/l/soul-22'),
  ('Blue Avian', 'https://starseedsoul.gumroad.com/l/soul-6'),
  ('Tau Cetian', 'https://starseedsoul.gumroad.com/l/soul-21'),
  ('Aldebaranian', 'https://starseedsoul.gumroad.com/l/soul-1'),
  ('Centaurian', 'https://starseedsoul.gumroad.com/l/soul-8'),
  ('Herculean', 'https://starseedsoul.gumroad.com/l/soul-11'),
  ('Anunnaki', 'https://starseedsoul.gumroad.com/l/soul-3'),
  ('Hyperborean', 'https://starseedsoul.gumroad.com/l/soul-12');

insert into public.origin_seq_type_names (lead_name, type_name)
select type_name, type_name from public.origin_seq_types;

insert into public.origin_seq_type_names (lead_name, type_name) values
  ('Nibiruan', 'Nibirian'),
  ('Aldebaran', 'Aldebaranian'),
  ('Epsilon Eridan', 'Epsilon Eridanian'),
  ('Lyrian', 'Lyran');

insert into public.origin_seq_blocks (key, body) values (
  'PDF_BLOCK',
  E'Your Origin reading is ready for you. If you already have it, you are all set. If the page confused you, here is your link again: {{PDF_URL}}\nEnter 0 in the price box and it is yours.'
);

insert into public.bot_config (key, value) values
  ('origin_seq_enabled', 'false'),
  ('origin_seq_daily_cap', '150')
on conflict (key) do nothing;

-- 00:00 UTC is 19:00 in New York in winter, 20:00 in summer.
select cron.schedule(
  'origin-sequence-daily',
  '0 0 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://pewgupxikbswhaqxjrwk.supabase.co/functions/v1/origin-sequence',
    body := '{"action":"run"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    timeout_milliseconds := 120000
  );
  $cmd$
);

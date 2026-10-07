-- The people in a user's romantic life, as Oli learns them from conversation.
-- One row per person; Oli works out which one each message is about.
-- Only edge functions touch this table, so RLS has no policies.

create table public.oli_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  origin text,
  notes text,
  last_mentioned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index oli_people_user on public.oli_people (user_id, last_mentioned_at desc);
alter table public.oli_people enable row level security;

alter table public.pdf_requests
  add column person_id uuid references public.oli_people(id) on delete set null;

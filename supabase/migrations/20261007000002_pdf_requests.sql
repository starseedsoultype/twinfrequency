-- Pair PDF requests: a user asks Oli for a pair PDF, Alexandra is notified in
-- @SeedSoulTest_bot, replies with the Gumroad link, and Oli sends it to the user.
-- Only edge functions (service role) touch this table, so RLS has no policies.

create table public.pdf_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  origin_a text not null,
  origin_b text not null,
  pair_key text not null,
  relationship_frequency text,
  lang text not null default 'en',
  status text not null default 'requested' check (status in ('requested', 'ready')),
  gumroad_url text,
  admin_message_id bigint,
  created_at timestamptz not null default now(),
  ready_at timestamptz
);

create unique index pdf_requests_one_open_per_pair
  on public.pdf_requests (user_id, pair_key) where status = 'requested';
create index pdf_requests_admin_message on public.pdf_requests (admin_message_id);

alter table public.pdf_requests enable row level security;

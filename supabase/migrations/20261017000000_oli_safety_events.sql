-- Safety events for the yearly report under California SB 243 (from 1 July 2027):
-- how many times Oli referred someone to crisis services, and how many under-18 stops.
-- Only the day and the kind: no user id, no message text. Edge functions (service role) write it.
create table if not exists public.oli_safety_events (
  id bigint generated always as identity primary key,
  day date not null default current_date,
  kind text not null check (kind in ('crisis', 'minor'))
);

alter table public.oli_safety_events enable row level security;
revoke all on public.oli_safety_events from anon, authenticated;

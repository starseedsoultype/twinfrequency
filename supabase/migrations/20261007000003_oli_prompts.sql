-- Oli's system prompt, versioned. Every change is a new row; Oli reads the newest.
-- The text itself is inserted outside this public repo. Only edge functions read it.

create table public.oli_prompts (
  version serial primary key,
  text text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.oli_prompts enable row level security;

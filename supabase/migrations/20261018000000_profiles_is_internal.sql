-- Internal accounts (Alexandra's own, test accounts used by Claude sessions) are kept
-- out of every user count. Set the flag directly in the database; stats filter on it.
alter table public.profiles add column is_internal boolean not null default false;

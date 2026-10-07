-- Structured actions on chat messages (a PDF offer button, a button press, an Oli scan question),
-- so the same intent works from a button in chat and from a spoken "yes" on a device later.
alter table public.messages add column meta jsonb;

-- Progress of the Origin Scan Oli runs through conversation for a person in the user's life.
alter table public.oli_people add column scan jsonb;

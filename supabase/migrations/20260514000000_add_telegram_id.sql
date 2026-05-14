-- Add telegram_id to profiles for Telegram Mini App auth
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_id bigint UNIQUE;

-- TwinFrequency Row Level Security Policies
-- Run AFTER 20260405000000_init_schema.sql

-- ═══════════════════════════════════════════════════════════
-- PROFILES
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read any profile (needed for feed, chats)
-- BUT sensitive fields (pref_*, notif_*, location_geom) are hidden via a view
CREATE POLICY "profiles_select_public"
  ON public.profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Insert is handled by trigger (handle_new_user), not by client
-- No INSERT policy needed for clients

-- ═══════════════════════════════════════════════════════════
-- SWIPES
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;

-- Users can only see their own swipes (not others' — prevents gaming)
CREATE POLICY "swipes_select_own"
  ON public.swipes FOR SELECT
  USING (auth.uid() = actor_id);

-- Users can insert their own swipes
CREATE POLICY "swipes_insert_own"
  ON public.swipes FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

-- No update/delete on swipes (immutable)

-- ═══════════════════════════════════════════════════════════
-- MATCHES
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Users can see matches they are part of
CREATE POLICY "matches_select_participant"
  ON public.matches FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Matches are created by trigger (check_mutual_like), not by client
-- But we allow delete for unmatch
CREATE POLICY "matches_delete_participant"
  ON public.matches FOR DELETE
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- ═══════════════════════════════════════════════════════════
-- MESSAGES
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages only in their matches
CREATE POLICY "messages_select_participant"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE id = messages.match_id
        AND (user1_id = auth.uid() OR user2_id = auth.uid())
    )
  );

-- Users can insert messages only in their matches
CREATE POLICY "messages_insert_participant"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.matches
      WHERE id = messages.match_id
        AND (user1_id = auth.uid() OR user2_id = auth.uid())
    )
  );

-- Users can delete messages only in their matches (for unmatch cleanup)
CREATE POLICY "messages_delete_participant"
  ON public.messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE id = messages.match_id
        AND (user1_id = auth.uid() OR user2_id = auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════
-- CIRCLES
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read circles
CREATE POLICY "circles_select_authenticated"
  ON public.circles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- GROUP MESSAGES
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Helper function: get user's circle_id based on origin
CREATE OR REPLACE FUNCTION public.get_user_circle_id(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  user_origin TEXT;
BEGIN
  SELECT origin INTO user_origin FROM public.profiles WHERE id = user_id;
  CASE user_origin
    WHEN 'Siriusian', 'Pleiadian', 'Lemurian', 'Cassiopeian', 'Procyonian', 'Lyran' THEN RETURN 1;
    WHEN 'Arcturian', 'Orion', 'Vegan', 'Zeta Reticulan', 'Epsilon Eridan', 'Atlantean' THEN RETURN 2;
    WHEN 'Andromedan', 'Polarisian', 'Nibiruan', 'Egyptian', 'Titan', 'Blue Avian' THEN RETURN 3;
    WHEN 'Tau Cetian', 'Aldebaran', 'Centaurian', 'Herculean', 'Anunnaki', 'Hyperborean' THEN RETURN 4;
    ELSE RETURN 0; -- Unknown
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Users can read:
--   a) their own circle's messages
--   b) the Open Frequency (circle_id = 0) — always accessible
--   c) other circles — read-only (can see but not post)
CREATE POLICY "group_messages_select_authenticated"
  ON public.group_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can only post to their own circle or Open Frequency
CREATE POLICY "group_messages_insert_own_circle"
  ON public.group_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      circle_id = 0  -- Open Frequency: anyone can post
      OR circle_id = public.get_user_circle_id(auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════
-- BLOCKS
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own blocks
CREATE POLICY "blocks_select_own"
  ON public.blocks FOR SELECT
  USING (auth.uid() = blocker_id);

-- Users can insert their own blocks
CREATE POLICY "blocks_insert_own"
  ON public.blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Users can remove their own blocks
CREATE POLICY "blocks_delete_own"
  ON public.blocks FOR DELETE
  USING (auth.uid() = blocker_id);

-- ═══════════════════════════════════════════════════════════
-- REPORTS
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Users can only insert reports (not read others' reports)
CREATE POLICY "reports_insert_own"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- ═══════════════════════════════════════════════════════════
-- STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════
-- Run in Supabase Dashboard → Storage → New Bucket: "avatars" (public)
-- Then apply these policies:

-- INSERT: user can upload to their own folder (avatars/{user_id}/*)
-- UPDATE: user can update their own avatar
-- DELETE: user can delete their own avatar
-- SELECT: anyone can read (public bucket)

-- These are managed via Supabase Dashboard Storage policies, not SQL.
-- Bucket name: avatars
-- Policy for INSERT/UPDATE/DELETE: (storage.foldername(name))[1] = auth.uid()::text
-- Policy for SELECT: true (public)

-- ═══════════════════════════════════════════════════════════
-- SAFE PUBLIC VIEW (hides sensitive fields)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  id,
  name,
  age,
  gender,
  photo_url,
  origin,
  location_name,
  last_active_at,
  onboarding_completed
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.profiles_public TO authenticated;

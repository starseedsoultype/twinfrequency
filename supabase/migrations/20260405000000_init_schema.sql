-- TwinFrequency Initial Database Schema
-- Run this in Supabase SQL Editor

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For geolocation filtering

-- 2. ENUMS
CREATE TYPE gender_type AS ENUM ('Women', 'Men', 'Non-binary', 'Other');
CREATE TYPE origin_type AS ENUM (
  'Siriusian', 'Pleiadian', 'Lemurian', 'Cassiopeian', 'Procyonian', 'Lyran',
  'Arcturian', 'Orion', 'Vegan', 'Zeta Reticulan', 'Epsilon Eridan', 'Atlantean',
  'Andromedan', 'Polarisian', 'Nibiruan', 'Egyptian', 'Titan', 'Blue Avian',
  'Tau Cetian', 'Aldebaran', 'Centaurian', 'Herculean', 'Anunnaki', 'Hyperborean',
  'Unknown'
);
CREATE TYPE swipe_action AS ENUM ('like', 'pass');
CREATE TYPE report_reason AS ENUM ('spam', 'inappropriate', 'harassment', 'other');

-- 3. TABLES

-- PROFILES
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Basic Info
  name TEXT NOT NULL CHECK (char_length(name) >= 2),
  age INTEGER CHECK (age >= 18),
  gender gender_type,
  photo_url TEXT,
  
  -- Soul Type
  origin origin_type DEFAULT 'Unknown',
  
  -- Location (optional)
  location_name TEXT,
  location_geom GEOGRAPHY(Point, 4326),
  
  -- Preferences
  pref_age_min INTEGER DEFAULT 18,
  pref_age_max INTEGER DEFAULT 80,
  pref_gender TEXT[] DEFAULT ARRAY['Women', 'Men', 'Non-binary', 'Other'],
  pref_origins origin_type[], -- null means all
  
  -- Settings
  show_location BOOLEAN DEFAULT true,
  notif_matches BOOLEAN DEFAULT true,
  notif_messages BOOLEAN DEFAULT true,
  notif_library BOOLEAN DEFAULT true,
  
  -- Internal state
  onboarding_completed BOOLEAN DEFAULT false,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  daily_swipes_count INTEGER DEFAULT 0,
  last_swipe_date DATE DEFAULT CURRENT_DATE
);

-- SWIPES (Likes & Passes)
CREATE TABLE public.swipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  action swipe_action NOT NULL,
  
  UNIQUE(actor_id, target_id)
);

-- MATCHES
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user1_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  user2_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Connection type is calculated dynamically in UI or via view, 
  -- but we store it here if we want to query by it efficiently
  connection_type TEXT,
  
  UNIQUE(LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id))
);

-- MESSAGES (Direct)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
  read_at TIMESTAMPTZ
);

-- GROUP CIRCLES
CREATE TABLE public.circles (
  id INTEGER PRIMARY KEY, -- 1: Relationships, 2: Logic, 3: Energy, 4: Matter, 0: Unknown
  name TEXT NOT NULL,
  description TEXT
);

-- GROUP MESSAGES
CREATE TABLE public.group_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  circle_id INTEGER REFERENCES public.circles(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0)
);

-- BLOCKS
CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  blocker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  UNIQUE(blocker_id, blocked_id)
);

-- REPORTS
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason report_reason NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'pending'
);

-- 4. TRIGGERS & FUNCTIONS

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (new.id, split_part(new.email, '@', 1));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Auto-create match on mutual like
CREATE OR REPLACE FUNCTION public.check_mutual_like()
RETURNS trigger AS $$
DECLARE
  mutual_like_exists BOOLEAN;
  existing_match UUID;
BEGIN
  IF NEW.action = 'like' THEN
    -- Check if target already liked actor
    SELECT EXISTS (
      SELECT 1 FROM public.swipes
      WHERE actor_id = NEW.target_id 
        AND target_id = NEW.actor_id 
        AND action = 'like'
    ) INTO mutual_like_exists;

    IF mutual_like_exists THEN
      -- Create match if doesn't exist
      SELECT id INTO existing_match FROM public.matches 
      WHERE (user1_id = NEW.actor_id AND user2_id = NEW.target_id)
         OR (user1_id = NEW.target_id AND user2_id = NEW.actor_id);
         
      IF existing_match IS NULL THEN
        INSERT INTO public.matches (user1_id, user2_id)
        VALUES (LEAST(NEW.actor_id, NEW.target_id), GREATEST(NEW.actor_id, NEW.target_id));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_swipe_created
  AFTER INSERT ON public.swipes
  FOR EACH ROW EXECUTE PROCEDURE public.check_mutual_like();

-- 5. INITIAL DATA
INSERT INTO public.circles (id, name, description) VALUES
  (1, 'Relationships Circle', 'For those focused on connection and emotion'),
  (2, 'Logic Circle', 'For those focused on structure and reason'),
  (3, 'Energy Circle', 'For those focused on frequency and flow'),
  (4, 'Matter Circle', 'For those focused on physical manifestation'),
  (0, 'Open Frequency', 'For those still discovering their frequency');

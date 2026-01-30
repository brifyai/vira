-- Full Schema Setup for New Project
-- This script sets up the entire database structure in the correct order.

-- 1. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create Enum Types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'user', 'viewer');
    END IF;
END $$;

-- 3. Create Tables (Ordered by dependencies)

-- Table: users (Referenced by almost everyone)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL,
  email character varying NOT NULL UNIQUE,
  full_name character varying,
  avatar_url text,
  role user_role NOT NULL DEFAULT 'user'::user_role,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Table: radios (Referenced by news_broadcasts, user_radios)
CREATE TABLE IF NOT EXISTS public.radios (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  region text,
  comuna text,
  frequency text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT radios_pkey PRIMARY KEY (id),
  CONSTRAINT radios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Table: user_radios
CREATE TABLE IF NOT EXISTS public.user_radios (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  radio_id uuid,
  assigned_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  assigned_by uuid,
  CONSTRAINT user_radios_pkey PRIMARY KEY (id),
  CONSTRAINT user_radios_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_radios_radio_id_fkey FOREIGN KEY (radio_id) REFERENCES public.radios(id) ON DELETE CASCADE,
  CONSTRAINT user_radios_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);

-- Table: news_sources (Referenced by scraped_news)
CREATE TABLE IF NOT EXISTS public.news_sources (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  url text NOT NULL,
  description text,
  category character varying,
  scraping_config jsonb,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  selector_list_container text,
  selector_link text,
  selector_content text,
  selector_ignore text,
  CONSTRAINT news_sources_pkey PRIMARY KEY (id),
  CONSTRAINT news_sources_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Table: scraped_news (Referenced by humanized_news)
CREATE TABLE IF NOT EXISTS public.scraped_news (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  source_id uuid,
  title text NOT NULL,
  content text NOT NULL,
  summary text,
  original_url text,
  image_url text,
  published_at timestamp with time zone,
  scraped_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  is_processed boolean DEFAULT false,
  is_selected boolean DEFAULT false,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  category character varying,
  CONSTRAINT scraped_news_pkey PRIMARY KEY (id),
  CONSTRAINT scraped_news_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.news_sources(id)
);

-- Table: humanized_news (Referenced by broadcast_news_items, tts_audio_files)
CREATE TABLE IF NOT EXISTS public.humanized_news (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  scraped_news_id uuid,
  original_content text NOT NULL,
  humanized_content text NOT NULL,
  reading_time_seconds integer,
  word_count integer,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  title text,
  audio_url text,
  status text DEFAULT 'ready'::text,
  CONSTRAINT humanized_news_pkey PRIMARY KEY (id),
  CONSTRAINT humanized_news_scraped_news_id_fkey FOREIGN KEY (scraped_news_id) REFERENCES public.scraped_news(id),
  CONSTRAINT humanized_news_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Table: news_broadcasts (Referenced by generated_broadcasts, timeline_events, broadcast_news_items)
CREATE TABLE IF NOT EXISTS public.news_broadcasts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title character varying NOT NULL,
  description text,
  duration_minutes integer NOT NULL,
  status character varying DEFAULT 'draft'::character varying,
  total_news_count integer DEFAULT 0,
  total_reading_time_seconds integer DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  published_at timestamp with time zone,
  radio_id uuid,
  scheduled_time text,
  CONSTRAINT news_broadcasts_pkey PRIMARY KEY (id),
  CONSTRAINT news_broadcasts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT news_broadcasts_radio_id_fkey FOREIGN KEY (radio_id) REFERENCES public.radios(id)
);

-- Table: broadcast_news_items (Referenced by tts_audio_files)
CREATE TABLE IF NOT EXISTS public.broadcast_news_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  broadcast_id uuid,
  humanized_news_id uuid,
  order_index integer NOT NULL,
  reading_time_seconds integer,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  type text DEFAULT 'news'::text,
  custom_title text,
  custom_content text,
  audio_url text,
  duration_seconds integer DEFAULT 30,
  CONSTRAINT broadcast_news_items_pkey PRIMARY KEY (id),
  CONSTRAINT broadcast_news_items_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.news_broadcasts(id),
  CONSTRAINT broadcast_news_items_humanized_news_id_fkey FOREIGN KEY (humanized_news_id) REFERENCES public.humanized_news(id)
);

-- Table: generated_broadcasts
CREATE TABLE IF NOT EXISTS public.generated_broadcasts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  broadcast_id uuid,
  title text NOT NULL,
  audio_url text NOT NULL,
  duration_seconds integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT generated_broadcasts_pkey PRIMARY KEY (id),
  CONSTRAINT generated_broadcasts_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.news_broadcasts(id)
);

-- Table: timeline_events
CREATE TABLE IF NOT EXISTS public.timeline_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  broadcast_id uuid,
  event_type character varying NOT NULL,
  title character varying,
  description text,
  start_time_seconds integer NOT NULL,
  end_time_seconds integer,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT timeline_events_pkey PRIMARY KEY (id),
  CONSTRAINT timeline_events_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.news_broadcasts(id)
);

-- Table: tts_audio_files
CREATE TABLE IF NOT EXISTS public.tts_audio_files (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  humanized_news_id uuid,
  broadcast_news_item_id uuid,
  audio_url text NOT NULL,
  audio_duration_seconds integer,
  voice_settings jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT tts_audio_files_pkey PRIMARY KEY (id),
  CONSTRAINT tts_audio_files_humanized_news_id_fkey FOREIGN KEY (humanized_news_id) REFERENCES public.humanized_news(id),
  CONSTRAINT tts_audio_files_broadcast_news_item_id_fkey FOREIGN KEY (broadcast_news_item_id) REFERENCES public.broadcast_news_items(id)
);

-- Table: automation_assets (Referenced by automation_runs)
CREATE TABLE IF NOT EXISTS public.automation_assets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  type character varying NOT NULL,
  config jsonb NOT NULL,
  is_active boolean DEFAULT true,
  schedule jsonb,
  last_run_at timestamp with time zone,
  next_run_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT automation_assets_pkey PRIMARY KEY (id),
  CONSTRAINT automation_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Table: automation_runs
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  asset_id uuid,
  status character varying NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at timestamp with time zone,
  result jsonb,
  error_message text,
  created_by uuid,
  CONSTRAINT automation_runs_pkey PRIMARY KEY (id),
  CONSTRAINT automation_runs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.automation_assets(id),
  CONSTRAINT automation_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Table: settings
CREATE TABLE IF NOT EXISTS public.settings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  key character varying NOT NULL UNIQUE,
  value jsonb NOT NULL,
  description text,
  updated_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT settings_pkey PRIMARY KEY (id),
  CONSTRAINT settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);

-- 4. Triggers and Functions for Auth Integration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuario'), 
    'user'::user_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create public profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. Row Level Security (RLS) Policies (Basic Setup)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_broadcasts ENABLE ROW LEVEL SECURITY;
-- (Add other tables as needed)

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Allow admins/super_admins to view all profiles
CREATE POLICY "Admins view all profiles" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Update users (Admins or Self)
CREATE POLICY "Update users" ON public.users
  FOR UPDATE USING (
    auth.uid() = id OR 
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

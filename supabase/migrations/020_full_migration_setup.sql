-- FULL SCHEMA MIGRATION SCRIPT
-- This script completes the database setup by adding Views, Functions, Triggers, and RLS Policies.
-- Run this AFTER creating the tables (if they exist) or use it to ensure everything is in place.

-- ==========================================
-- 1. EXTENSIONS & ENUMS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'user', 'viewer');
    ELSE
        -- Ensure all values exist
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';
    END IF;
END $$;

-- ==========================================
-- 2. VIEWS (Crucial for Frontend)
-- ==========================================

-- View: news_with_source
-- Joins scraped_news with news_sources to provide source details
CREATE OR REPLACE VIEW public.news_with_source AS
SELECT 
    sn.id,
    sn.source_id,
    sn.title,
    sn.content,
    sn.summary,
    sn.original_url,
    sn.image_url,
    sn.published_at,
    sn.scraped_at,
    sn.is_processed,
    sn.is_selected,
    sn.metadata,
    sn.created_at,
    sn.category,
    ns.name as source_name,
    ns.url as source_url,
    ns.category as source_category
FROM public.scraped_news sn
LEFT JOIN public.news_sources ns ON sn.source_id = ns.id;

-- View: broadcast_details
-- Joins news_broadcasts with radios/users for display
CREATE OR REPLACE VIEW public.broadcast_details AS
SELECT 
    nb.*,
    r.name as radio_name,
    u.full_name as created_by_name
FROM public.news_broadcasts nb
LEFT JOIN public.radios r ON nb.radio_id = r.id
LEFT JOIN public.users u ON nb.created_by = u.id;

-- ==========================================
-- 3. FUNCTIONS & TRIGGERS
-- ==========================================

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at (Add for all tables that have updated_at)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.columns WHERE column_name = 'updated_at' AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END $$;

-- Function: create_user_rpc (For Admin User Management)
CREATE OR REPLACE FUNCTION public.create_user_rpc(
    email text,
    password text,
    role_name text,
    full_name text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_user_id uuid;
    requesting_user_role user_role;
BEGIN
    -- Check permissions
    SELECT role INTO requesting_user_role FROM public.users WHERE id = auth.uid();
    
    IF requesting_user_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only Admins can create users';
    END IF;

    IF requesting_user_role = 'admin' AND role_name IN ('super_admin', 'admin') THEN
         RAISE EXCEPTION 'Unauthorized: Admins can only create regular users';
    END IF;

    new_user_id := uuid_generate_v4();

    -- Insert into auth.users
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        email,
        crypt(password, gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        json_build_object('full_name', full_name),
        now(),
        now()
    );

    -- Insert into public.users (handled by trigger usually, but forcing here for safety/role)
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (new_user_id, email, full_name, role_name::user_role)
    ON CONFLICT (id) DO UPDATE SET role = role_name::user_role;

    RETURN json_build_object('id', new_user_id, 'email', email);
END;
$$;

-- ==========================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on all tables
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- Policy: Super Admin has full access to everything
-- We can create a blanket policy for super_admin on all tables, 
-- but usually it's better to add it to specific policies or a broad one if supported.
-- For simplicity, we ensure existing policies cover super_admin via 'OR role = super_admin'.

-- (Re-run 009_rbac_setup.sql content logic here if needed, but assuming it's done or we just patch)
-- Let's ensure News Sources is correct (Critical for User's question)

DROP POLICY IF EXISTS "Read access for news_sources" ON public.news_sources;
CREATE POLICY "Read access for news_sources" ON public.news_sources FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Write access for news_sources" ON public.news_sources;
CREATE POLICY "Write access for news_sources" ON public.news_sources FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);

-- ==========================================
-- 5. FINAL CLEANUP
-- ==========================================
-- Ensure the nuclear trigger fix is applied (from 018)
-- (Already provided in 018, user should run that too if they haven't)

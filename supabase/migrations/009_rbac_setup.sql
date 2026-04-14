-- Update user_role enum
-- MOVED TO 000_fix_enums.sql TO AVOID TRANSACTION ERRORS
-- ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
-- ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';

-- Create user_radios table
CREATE TABLE IF NOT EXISTS public.user_radios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    radio_id UUID REFERENCES public.radios(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    UNIQUE(user_id, radio_id)
);

-- RLS for user_radios
ALTER TABLE public.user_radios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and Super Admins can manage user_radios" ON public.user_radios
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Users can view their own radio assignments" ON public.user_radios
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Update RLS for Radios
-- Drop existing policies to replace them with role-aware ones
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.radios;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.radios;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.radios;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.radios;

-- New Radio Policies
-- 1. Read: Super Admin & Admin see all. Users see assigned.
CREATE POLICY "Read access for radios" ON public.radios
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
        OR
        EXISTS (
            SELECT 1 FROM public.user_radios
            WHERE user_id = auth.uid() AND radio_id = public.radios.id
        )
    );

-- 2. Write (Insert/Update/Delete): Only Super Admin & Admin
CREATE POLICY "Write access for radios" ON public.radios
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Update RLS for News Sources
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;

-- 1. Read: Everyone can read sources
CREATE POLICY "Read access for news_sources" ON public.news_sources
    FOR SELECT
    TO authenticated
    USING (true);

-- 2. Write: Only Super Admin
CREATE POLICY "Write access for news_sources" ON public.news_sources
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Trigger for New Users (to populate public.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'user');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Helper to ensure current users have a profile (optional, run manually if needed)
-- INSERT INTO public.users (id, email, role)
-- SELECT id, email, 'super_admin' FROM auth.users
-- ON CONFLICT (id) DO NOTHING;

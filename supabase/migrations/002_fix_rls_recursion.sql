-- ============================================
-- Fix RLS Recursion Error in news_sources
-- ============================================

-- Drop existing policies that cause infinite recursion
DROP POLICY IF EXISTS "Editors and admins can view news sources" ON public.news_sources;
DROP POLICY IF EXISTS "Editors and admins can create news sources" ON public.news_sources;
DROP POLICY IF EXISTS "Editors and admins can update news sources" ON public.news_sources;
DROP POLICY IF EXISTS "Admins can delete news sources" ON public.news_sources;

-- Recreate policies with correct syntax (no EXISTS clause)
CREATE POLICY "Editors and admins can view news sources" ON public.news_sources
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create news sources" ON public.news_sources
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can update news sources" ON public.news_sources
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Admins can delete news sources" ON public.news_sources
    FOR DELETE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role = 'admin'
        )
    );

-- ============================================
-- Fix ALL RLS Recursion Errors
-- ============================================

-- Drop ALL policies that cause infinite recursion
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

DROP POLICY IF EXISTS "Editors and admins can view news sources" ON public.news_sources;
DROP POLICY IF EXISTS "Editors and admins can create news sources" ON public.news_sources;
DROP POLICY IF EXISTS "Editors and admins can update news sources" ON public.news_sources;
DROP POLICY IF EXISTS "Admins can delete news sources" ON public.news_sources;

DROP POLICY IF EXISTS "Editors and admins can view scraped news" ON public.scraped_news;
DROP POLICY IF EXISTS "Editors and admins can create scraped news" ON public.scraped_news;
DROP POLICY IF EXISTS "Editors and admins can update scraped news" ON public.scraped_news;
DROP POLICY IF EXISTS "Admins can delete scraped news" ON public.scraped_news;

DROP POLICY IF EXISTS "Editors and admins can view humanized news" ON public.humanized_news;
DROP POLICY IF EXISTS "Editors and admins can create humanized news" ON public.humanized_news;
DROP POLICY IF EXISTS "Editors and admins can update humanized news" ON public.humanized_news;

DROP POLICY IF EXISTS "Editors and admins can view broadcasts" ON public.news_broadcasts;
DROP POLICY IF EXISTS "Editors and admins can create broadcasts" ON public.news_broadcasts;
DROP POLICY IF EXISTS "Editors and admins can update their broadcasts" ON public.news_broadcasts;
DROP POLICY IF EXISTS "Admins can delete broadcasts" ON public.news_broadcasts;

DROP POLICY IF EXISTS "Editors and admins can view broadcast items" ON public.broadcast_news_items;
DROP POLICY IF EXISTS "Editors and admins can create broadcast items" ON public.broadcast_news_items;
DROP POLICY IF EXISTS "Editors and admins can delete broadcast items" ON public.broadcast_news_items;

DROP POLICY IF EXISTS "Editors and admins can view audio files" ON public.tts_audio_files;
DROP POLICY IF EXISTS "Editors and admins can create audio files" ON public.tts_audio_files;

DROP POLICY IF EXISTS "Editors and admins can view automation assets" ON public.automation_assets;
DROP POLICY IF EXISTS "Editors and admins can create automation assets" ON public.automation_assets;
DROP POLICY IF EXISTS "Editors and admins can update automation assets" ON public.automation_assets;
DROP POLICY IF EXISTS "Admins can delete automation assets" ON public.automation_assets;

DROP POLICY IF EXISTS "Editors and admins can view automation runs" ON public.automation_runs;
DROP POLICY IF EXISTS "Editors and admins can create automation runs" ON public.automation_runs;

DROP POLICY IF EXISTS "Editors and admins can view timeline events" ON public.timeline_events;
DROP POLICY IF EXISTS "Editors and admins can create timeline events" ON public.timeline_events;

DROP POLICY IF EXISTS "Editors and admins can view settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can create settings" ON public.settings;

-- ============================================
-- Recreate ALL policies with correct syntax (no EXISTS clause)
-- ============================================

-- Users table policies
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (
        auth.uid() = id
    );

CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (
        auth.uid() = id
    );

CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role = 'admin'
        )
    );

-- News sources policies
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

-- Scraped news policies
CREATE POLICY "Editors and admins can view scraped news" ON public.scraped_news
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create scraped news" ON public.scraped_news
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can update scraped news" ON public.scraped_news
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Admins can delete scraped news" ON public.scraped_news
    FOR DELETE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role = 'admin'
        )
    );

-- Humanized news policies
CREATE POLICY "Editors and admins can view humanized news" ON public.humanized_news
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create humanized news" ON public.humanized_news
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can update humanized news" ON public.humanized_news
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

-- News broadcasts policies
CREATE POLICY "Editors and admins can view broadcasts" ON public.news_broadcasts
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create broadcasts" ON public.news_broadcasts
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can update their broadcasts" ON public.news_broadcasts
    FOR UPDATE USING (
        created_by = auth.uid() OR
        auth.uid() IN (
            SELECT id FROM public.users WHERE role = 'admin'
        )
    );

CREATE POLICY "Admins can delete broadcasts" ON public.news_broadcasts
    FOR DELETE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role = 'admin'
        )
    );

-- Broadcast news items policies
CREATE POLICY "Editors and admins can view broadcast items" ON public.broadcast_news_items
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create broadcast items" ON public.broadcast_news_items
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can delete broadcast items" ON public.broadcast_news_items
    FOR DELETE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

-- TTS audio files policies
CREATE POLICY "Editors and admins can view audio files" ON public.tts_audio_files
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create audio files" ON public.tts_audio_files
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

-- Automation assets policies
CREATE POLICY "Editors and admins can view automation assets" ON public.automation_assets
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create automation assets" ON public.automation_assets
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can update automation assets" ON public.automation_assets
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Admins can delete automation assets" ON public.automation_assets
    FOR DELETE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role = 'admin'
        )
    );

-- Automation runs policies
CREATE POLICY "Editors and admins can view automation runs" ON public.automation_runs
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create automation runs" ON public.automation_runs
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

-- Timeline events policies
CREATE POLICY "Editors and admins can view timeline events" ON public.timeline_events
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create timeline events" ON public.timeline_events
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

-- Settings policies
CREATE POLICY "Editors and admins can view settings" ON public.settings
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Admins can update settings" ON public.settings
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role = 'admin'
        )
    );

CREATE POLICY "Admins can create settings" ON public.settings
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role = 'admin'
        )
    );

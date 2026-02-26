-- Fix Infinite Recursion by using a SECURITY DEFINER function
-- =========================================================

-- 1. Create a function to get the current user's role without triggering RLS
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER -- This bypasses RLS
SET search_path = public -- Secure search path
AS $$
DECLARE
  v_role user_role;
BEGIN
  -- Get the role for the current authenticated user
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  return v_role;
END;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;

-- 2. Update Users Table Policies
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Basic user access" ON public.users; -- Cleanup if exists

CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT USING (
        get_my_role() = 'admin'
    );
    
-- (The "Users can view their own profile" policy: auth.uid() = id is fine and doesn't need changes)

-- 3. Update News Sources Policies
DROP POLICY IF EXISTS "Editors and admins can view news sources" ON public.news_sources;
CREATE POLICY "Editors and admins can view news sources" ON public.news_sources
    FOR SELECT USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can create news sources" ON public.news_sources;
CREATE POLICY "Editors and admins can create news sources" ON public.news_sources
    FOR INSERT WITH CHECK ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can update news sources" ON public.news_sources;
CREATE POLICY "Editors and admins can update news sources" ON public.news_sources
    FOR UPDATE USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Admins can delete news sources" ON public.news_sources;
CREATE POLICY "Admins can delete news sources" ON public.news_sources
    FOR DELETE USING ( get_my_role() = 'admin' );

-- 4. Update Scraped News Policies
DROP POLICY IF EXISTS "Editors and admins can view scraped news" ON public.scraped_news;
CREATE POLICY "Editors and admins can view scraped news" ON public.scraped_news
    FOR SELECT USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can create scraped news" ON public.scraped_news;
CREATE POLICY "Editors and admins can create scraped news" ON public.scraped_news
    FOR INSERT WITH CHECK ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can update scraped news" ON public.scraped_news;
CREATE POLICY "Editors and admins can update scraped news" ON public.scraped_news
    FOR UPDATE USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Admins can delete scraped news" ON public.scraped_news;
CREATE POLICY "Admins can delete scraped news" ON public.scraped_news
    FOR DELETE USING ( get_my_role() = 'admin' );

-- 5. Humanized News
DROP POLICY IF EXISTS "Editors and admins can view humanized news" ON public.humanized_news;
CREATE POLICY "Editors and admins can view humanized news" ON public.humanized_news
    FOR SELECT USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can create humanized news" ON public.humanized_news;
CREATE POLICY "Editors and admins can create humanized news" ON public.humanized_news
    FOR INSERT WITH CHECK ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can update humanized news" ON public.humanized_news;
CREATE POLICY "Editors and admins can update humanized news" ON public.humanized_news
    FOR UPDATE USING ( get_my_role() IN ('editor', 'admin') );

-- 6. News Broadcasts
DROP POLICY IF EXISTS "Editors and admins can view broadcasts" ON public.news_broadcasts;
CREATE POLICY "Editors and admins can view broadcasts" ON public.news_broadcasts
    FOR SELECT USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can create broadcasts" ON public.news_broadcasts;
CREATE POLICY "Editors and admins can create broadcasts" ON public.news_broadcasts
    FOR INSERT WITH CHECK ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can update their broadcasts" ON public.news_broadcasts;
CREATE POLICY "Editors and admins can update their broadcasts" ON public.news_broadcasts
    FOR UPDATE USING (
        created_by = auth.uid() OR
        get_my_role() = 'admin'
    );

DROP POLICY IF EXISTS "Admins can delete broadcasts" ON public.news_broadcasts;
CREATE POLICY "Admins can delete broadcasts" ON public.news_broadcasts
    FOR DELETE USING ( get_my_role() = 'admin' );

-- 7. Broadcast News Items
DROP POLICY IF EXISTS "Editors and admins can view broadcast items" ON public.broadcast_news_items;
CREATE POLICY "Editors and admins can view broadcast items" ON public.broadcast_news_items
    FOR SELECT USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can create broadcast items" ON public.broadcast_news_items;
CREATE POLICY "Editors and admins can create broadcast items" ON public.broadcast_news_items
    FOR INSERT WITH CHECK ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can delete broadcast items" ON public.broadcast_news_items;
CREATE POLICY "Editors and admins can delete broadcast items" ON public.broadcast_news_items
    FOR DELETE USING ( get_my_role() IN ('editor', 'admin') );

-- 8. TTS Audio Files
DROP POLICY IF EXISTS "Editors and admins can view audio files" ON public.tts_audio_files;
CREATE POLICY "Editors and admins can view audio files" ON public.tts_audio_files
    FOR SELECT USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can create audio files" ON public.tts_audio_files;
CREATE POLICY "Editors and admins can create audio files" ON public.tts_audio_files
    FOR INSERT WITH CHECK ( get_my_role() IN ('editor', 'admin') );

-- 9. Automation Assets
DROP POLICY IF EXISTS "Editors and admins can view automation assets" ON public.automation_assets;
CREATE POLICY "Editors and admins can view automation assets" ON public.automation_assets
    FOR SELECT USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can create automation assets" ON public.automation_assets;
CREATE POLICY "Editors and admins can create automation assets" ON public.automation_assets
    FOR INSERT WITH CHECK ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can update automation assets" ON public.automation_assets;
CREATE POLICY "Editors and admins can update automation assets" ON public.automation_assets
    FOR UPDATE USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Admins can delete automation assets" ON public.automation_assets;
CREATE POLICY "Admins can delete automation assets" ON public.automation_assets
    FOR DELETE USING ( get_my_role() = 'admin' );

-- 10. Automation Runs
DROP POLICY IF EXISTS "Editors and admins can view automation runs" ON public.automation_runs;
CREATE POLICY "Editors and admins can view automation runs" ON public.automation_runs
    FOR SELECT USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can create automation runs" ON public.automation_runs;
CREATE POLICY "Editors and admins can create automation runs" ON public.automation_runs
    FOR INSERT WITH CHECK ( get_my_role() IN ('editor', 'admin') );

-- 11. Timeline Events
DROP POLICY IF EXISTS "Editors and admins can view timeline events" ON public.timeline_events;
CREATE POLICY "Editors and admins can view timeline events" ON public.timeline_events
    FOR SELECT USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Editors and admins can create timeline events" ON public.timeline_events;
CREATE POLICY "Editors and admins can create timeline events" ON public.timeline_events
    FOR INSERT WITH CHECK ( get_my_role() IN ('editor', 'admin') );

-- 12. Settings
DROP POLICY IF EXISTS "Editors and admins can view settings" ON public.settings;
CREATE POLICY "Editors and admins can view settings" ON public.settings
    FOR SELECT USING ( get_my_role() IN ('editor', 'admin') );

DROP POLICY IF EXISTS "Admins can update settings" ON public.settings;
CREATE POLICY "Admins can update settings" ON public.settings
    FOR UPDATE USING ( get_my_role() = 'admin' );

DROP POLICY IF EXISTS "Admins can create settings" ON public.settings;
CREATE POLICY "Admins can create settings" ON public.settings
    FOR INSERT WITH CHECK ( get_my_role() = 'admin' );

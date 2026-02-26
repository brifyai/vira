-- Enable access to scraped_news table
-- This is required for the 'news_with_source' view to return data to the frontend.

-- 1. Ensure RLS is enabled
ALTER TABLE public.scraped_news ENABLE ROW LEVEL SECURITY;

-- 2. Allow ALL authenticated users to READ scraped news
-- (This allows the view 'news_with_source' to work)
DROP POLICY IF EXISTS "Read access for scraped_news" ON public.scraped_news;
CREATE POLICY "Read access for scraped_news" ON public.scraped_news
FOR SELECT
TO authenticated
USING (true);

-- 3. Allow Super Admins and Admins to WRITE (Insert/Update/Delete)
DROP POLICY IF EXISTS "Write access for scraped_news" ON public.scraped_news;
CREATE POLICY "Write access for scraped_news" ON public.scraped_news
FOR ALL
TO authenticated
USING (
    public.get_my_role() IN ('super_admin', 'admin')
);

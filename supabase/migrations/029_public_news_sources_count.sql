CREATE OR REPLACE FUNCTION public.get_news_sources_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::integer
    FROM public.news_sources
    ;
$$;

GRANT EXECUTE ON FUNCTION public.get_news_sources_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_news_sources_count() TO authenticated;

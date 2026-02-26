-- Create the view news_with_source
-- This view joins scraped_news with news_sources to provide source details with each news item

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
    ns.name AS source_name,
    ns.url AS source_url,
    ns.category AS source_category
FROM
    public.scraped_news sn
LEFT JOIN
    public.news_sources ns ON sn.source_id = ns.id;

-- Grant access to the view
GRANT SELECT ON public.news_with_source TO authenticated;
GRANT SELECT ON public.news_with_source TO service_role;

-- Comment on view
COMMENT ON VIEW public.news_with_source IS 'View that joins scraped news with their source details';

-- Create the view broadcast_details
-- This view provides details about news broadcasts, including creator info and actual news item count

CREATE OR REPLACE VIEW public.broadcast_details AS
SELECT
    nb.id,
    nb.title,
    nb.description,
    nb.duration_minutes,
    nb.status,
    nb.total_news_count,
    nb.total_reading_time_seconds,
    nb.created_at,
    nb.updated_at,
    nb.published_at,
    u.full_name as created_by_name,
    u.email as created_by_email,
    (
        SELECT count(*)
        FROM public.broadcast_news_items bni
        WHERE bni.broadcast_id = nb.id
    )::integer as actual_news_count
FROM
    public.news_broadcasts nb
LEFT JOIN
    public.users u ON nb.created_by = u.id;

-- Grant access to the view
GRANT SELECT ON public.broadcast_details TO authenticated;
GRANT SELECT ON public.broadcast_details TO service_role;

-- Comment on view
COMMENT ON VIEW public.broadcast_details IS 'View that shows broadcast details with creator info and real-time news count';

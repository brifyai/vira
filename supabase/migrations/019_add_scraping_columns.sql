-- Add missing scraping columns to news_sources table
-- These columns are required by the FuentesComponent

ALTER TABLE public.news_sources 
ADD COLUMN IF NOT EXISTS selector_list_container TEXT,
ADD COLUMN IF NOT EXISTS selector_link TEXT,
ADD COLUMN IF NOT EXISTS selector_content TEXT,
ADD COLUMN IF NOT EXISTS selector_ignore TEXT;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'news_sources';

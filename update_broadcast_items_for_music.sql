-- Add music configuration columns to broadcast_news_items table

ALTER TABLE broadcast_news_items 
ADD COLUMN IF NOT EXISTS music_resource_id UUID REFERENCES music_resources(id),
ADD COLUMN IF NOT EXISTS voice_delay FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS music_volume FLOAT DEFAULT 0.5;

-- Optional: Comment on columns
COMMENT ON COLUMN broadcast_news_items.music_resource_id IS 'Reference to the background music resource';
COMMENT ON COLUMN broadcast_news_items.voice_delay IS 'Delay in seconds before the voice starts relative to music';
COMMENT ON COLUMN broadcast_news_items.music_volume IS 'Volume level of the background music (0.0 to 1.0)';

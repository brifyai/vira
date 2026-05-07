ALTER TABLE public.broadcast_news_items
  ADD COLUMN IF NOT EXISTS music_url text,
  ADD COLUMN IF NOT EXISTS music_position text,
  ADD COLUMN IF NOT EXISTS music_tail_seconds numeric,
  ADD COLUMN IF NOT EXISTS music_fade_out_seconds numeric,
  ADD COLUMN IF NOT EXISTS voice_delay numeric,
  ADD COLUMN IF NOT EXISTS music_volume numeric,
  ADD COLUMN IF NOT EXISTS voice_id text,
  ADD COLUMN IF NOT EXISTS voice_speed numeric,
  ADD COLUMN IF NOT EXISTS voice_pitch numeric;

ALTER TABLE public.broadcast_news_items
  ALTER COLUMN music_position SET DEFAULT 'during',
  ALTER COLUMN music_tail_seconds SET DEFAULT 0.8,
  ALTER COLUMN music_fade_out_seconds SET DEFAULT 0.5,
  ALTER COLUMN voice_delay SET DEFAULT 0,
  ALTER COLUMN music_volume SET DEFAULT 0.25;

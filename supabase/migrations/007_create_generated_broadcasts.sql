-- Create table for generated/exported broadcasts
CREATE TABLE IF NOT EXISTS generated_broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    broadcast_id UUID REFERENCES news_broadcasts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    audio_url TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE generated_broadcasts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public Access Select Generated"
ON generated_broadcasts FOR SELECT
USING (true);

CREATE POLICY "Public Access Insert Generated"
ON generated_broadcasts FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public Access Delete Generated"
ON generated_broadcasts FOR DELETE
USING (true);

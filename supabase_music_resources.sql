-- Create music_resources table
CREATE TABLE IF NOT EXISTS public.music_resources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('intro', 'outro', 'background', 'effect')),
    duration NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.music_resources ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for all users" ON public.music_resources
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.music_resources
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for users based on user_id" ON public.music_resources
    FOR DELETE USING (auth.uid() = user_id);

-- Create storage bucket for music if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('music-resources', 'music-resources', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for music-resources bucket
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT USING (bucket_id = 'music-resources');

CREATE POLICY "Authenticated users can upload music" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'music-resources' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can delete their own music" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'music-resources' 
    AND auth.uid() = owner
  );

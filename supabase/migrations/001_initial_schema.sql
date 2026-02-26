-- ============================================
-- VIRA Application - Initial Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ROLES AND PERMISSIONS
-- ============================================

-- Create custom role enum
CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');

-- ============================================
-- USERS TABLE (extends Supabase auth.users)
-- ============================================

CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create index on email
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);

-- ============================================
-- NEWS SOURCES TABLE
-- ============================================

CREATE TABLE public.news_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    category VARCHAR(100),
    scraping_config JSONB,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_news_sources_category ON public.news_sources(category);
CREATE INDEX idx_news_sources_active ON public.news_sources(is_active);

-- ============================================
-- SCRAPED NEWS TABLE
-- ============================================

CREATE TABLE public.scraped_news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID REFERENCES public.news_sources(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    original_url TEXT,
    image_url TEXT,
    published_at TIMESTAMP WITH TIME ZONE,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    is_processed BOOLEAN DEFAULT false,
    is_selected BOOLEAN DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_scraped_news_source ON public.scraped_news(source_id);
CREATE INDEX idx_scraped_news_published ON public.scraped_news(published_at DESC);
CREATE INDEX idx_scraped_news_selected ON public.scraped_news(is_selected);
CREATE INDEX idx_scraped_news_processed ON public.scraped_news(is_processed);

-- ============================================
-- HUMANIZED NEWS TABLE
-- ============================================

CREATE TABLE public.humanized_news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scraped_news_id UUID REFERENCES public.scraped_news(id) ON DELETE CASCADE,
    original_content TEXT NOT NULL,
    humanized_content TEXT NOT NULL,
    reading_time_seconds INTEGER,
    word_count INTEGER,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_humanized_news_scraped ON public.humanized_news(scraped_news_id);
CREATE INDEX idx_humanized_news_created_by ON public.humanized_news(created_by);

-- ============================================
-- NEWS BROADCASTS (NOTICIEROS) TABLE
-- ============================================

CREATE TABLE public.news_broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'draft', -- draft, generating, ready, published
    total_news_count INTEGER DEFAULT 0,
    total_reading_time_seconds INTEGER DEFAULT 0,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX idx_news_broadcasts_status ON public.news_broadcasts(status);
CREATE INDEX idx_news_broadcasts_created_by ON public.news_broadcasts(created_by);
CREATE INDEX idx_news_broadcasts_created_at ON public.news_broadcasts(created_at DESC);

-- ============================================
-- BROADCAST NEWS ITEMS TABLE
-- ============================================

CREATE TABLE public.broadcast_news_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    broadcast_id UUID REFERENCES public.news_broadcasts(id) ON DELETE CASCADE,
    humanized_news_id UUID REFERENCES public.humanized_news(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    reading_time_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_broadcast_news_items_broadcast ON public.broadcast_news_items(broadcast_id);
CREATE INDEX idx_broadcast_news_items_humanized ON public.broadcast_news_items(humanized_news_id);
CREATE INDEX idx_broadcast_news_items_order ON public.broadcast_news_items(broadcast_id, order_index);

-- ============================================
-- TTS AUDIO FILES TABLE
-- ============================================

CREATE TABLE public.tts_audio_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    humanized_news_id UUID REFERENCES public.humanized_news(id) ON DELETE CASCADE,
    broadcast_news_item_id UUID REFERENCES public.broadcast_news_items(id) ON DELETE CASCADE,
    audio_url TEXT NOT NULL,
    audio_duration_seconds INTEGER,
    voice_settings JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_tts_audio_humanized ON public.tts_audio_files(humanized_news_id);
CREATE INDEX idx_tts_audio_broadcast_item ON public.tts_audio_files(broadcast_news_item_id);

-- ============================================
-- AUTOMATION ASSETS TABLE
-- ============================================

CREATE TABLE public.automation_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL, -- scraper, humanizer, tts, scheduler
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    schedule JSONB, -- cron schedule configuration
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_automation_assets_type ON public.automation_assets(type);
CREATE INDEX idx_automation_assets_active ON public.automation_assets(is_active);
CREATE INDEX idx_automation_assets_created_by ON public.automation_assets(created_by);

-- ============================================
-- AUTOMATION RUNS TABLE
-- ============================================

CREATE TABLE public.automation_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID REFERENCES public.automation_assets(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL, -- running, completed, failed
    started_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    result JSONB,
    error_message TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX idx_automation_runs_asset ON public.automation_runs(asset_id);
CREATE INDEX idx_automation_runs_status ON public.automation_runs(status);
CREATE INDEX idx_automation_runs_started_at ON public.automation_runs(started_at DESC);

-- ============================================
-- TIMELINE EVENTS TABLE
-- ============================================

CREATE TABLE public.timeline_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    broadcast_id UUID REFERENCES public.news_broadcasts(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- news_start, news_end, ad_break, etc.
    title VARCHAR(255),
    description TEXT,
    start_time_seconds INTEGER NOT NULL,
    end_time_seconds INTEGER,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_timeline_events_broadcast ON public.timeline_events(broadcast_id);
CREATE INDEX idx_timeline_events_start_time ON public.timeline_events(broadcast_id, start_time_seconds);

-- ============================================
-- SETTINGS TABLE
-- ============================================

CREATE TABLE public.settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create index
CREATE INDEX idx_settings_key ON public.settings(key);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.humanized_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tts_audio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- News sources policies
CREATE POLICY "Editors and admins can view news sources" ON public.news_sources
FOR SELECT USING (
    auth.uid() IN (
        SELECT id FROM public.users WHERE role IN ('editor', 'admin')
    )
);

CREATE POLICY "Editors and admins can create news sources" ON public.news_sources
FOR INSERT WITH CHECK (
    auth.uid() IN (
        SELECT id FROM public.users WHERE role IN ('editor', 'admin')
    )
);

CREATE POLICY "Editors and admins can update news sources" ON public.news_sources
FOR UPDATE USING (
    auth.uid() IN (
        SELECT id FROM public.users WHERE role IN ('editor', 'admin')
    )
);

CREATE POLICY "Admins can delete news sources" ON public.news_sources
FOR DELETE USING (
    auth.uid() IN (
        SELECT id FROM public.users WHERE role = 'admin'
    )
);

-- Scraped news policies
CREATE POLICY "Editors and admins can view scraped news" ON public.scraped_news
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create scraped news" ON public.scraped_news
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can update scraped news" ON public.scraped_news
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Admins can delete scraped news" ON public.scraped_news
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Humanized news policies
CREATE POLICY "Editors and admins can view humanized news" ON public.humanized_news
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create humanized news" ON public.humanized_news
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can update humanized news" ON public.humanized_news
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

-- News broadcasts policies
CREATE POLICY "Editors and admins can view broadcasts" ON public.news_broadcasts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create broadcasts" ON public.news_broadcasts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can update their broadcasts" ON public.news_broadcasts
    FOR UPDATE USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can delete broadcasts" ON public.news_broadcasts
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Broadcast news items policies
CREATE POLICY "Editors and admins can view broadcast items" ON public.broadcast_news_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create broadcast items" ON public.broadcast_news_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can delete broadcast items" ON public.broadcast_news_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

-- TTS audio files policies
CREATE POLICY "Editors and admins can view audio files" ON public.tts_audio_files
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create audio files" ON public.tts_audio_files
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

-- Automation assets policies
CREATE POLICY "Editors and admins can view automation assets" ON public.automation_assets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create automation assets" ON public.automation_assets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can update automation assets" ON public.automation_assets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Admins can delete automation assets" ON public.automation_assets
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Automation runs policies
CREATE POLICY "Editors and admins can view automation runs" ON public.automation_runs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create automation runs" ON public.automation_runs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

-- Timeline events policies
CREATE POLICY "Editors and admins can view timeline events" ON public.timeline_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors and admins can create timeline events" ON public.timeline_events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

-- Settings policies
CREATE POLICY "Editors and admins can view settings" ON public.settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Admins can update settings" ON public.settings
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can create settings" ON public.settings
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================
-- TRIGGERS AND FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_news_sources_updated_at BEFORE UPDATE ON public.news_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_humanized_news_updated_at BEFORE UPDATE ON public.humanized_news
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_news_broadcasts_updated_at BEFORE UPDATE ON public.news_broadcasts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_assets_updated_at BEFORE UPDATE ON public.automation_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        'viewer'::user_role
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default settings
INSERT INTO public.settings (key, value, description) VALUES
('scrapingbee_api_key', '"YOUR_SCRAPING_BEE_API_KEY"', 'API key for ScrapingBee service'),
('gemini_api_key', '"YOUR_GEMINI_API_KEY"', 'API key for Google Gemini AI service'),
('google_tts_api_key', '"YOUR_GOOGLE_CLOUD_TTS_API_KEY"', 'API key for Google Cloud Text-to-Speech'),
('default_voice_settings', '{"language": "es-ES", "voice": "es-ES-Standard-A", "speakingRate": 1.0, "pitch": 1.0}', 'Default voice settings for TTS'),
('app_url', '"http://localhost:8888"', 'Application URL'),
('cron_secret', '"YOUR_CRON_SECRET"', 'Secret for cron job authentication');

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View for broadcast with details
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
    COUNT(bni.id) as actual_news_count
FROM public.news_broadcasts nb
LEFT JOIN public.users u ON nb.created_by = u.id
LEFT JOIN public.broadcast_news_items bni ON nb.id = bni.broadcast_id
GROUP BY nb.id, u.full_name, u.email;

-- View for news with source
CREATE OR REPLACE VIEW public.news_with_source AS
SELECT
    sn.id,
    sn.title,
    sn.content,
    sn.summary,
    sn.original_url,
    sn.image_url,
    sn.published_at,
    sn.scraped_at,
    sn.is_processed,
    sn.is_selected,
    ns.name as source_name,
    ns.url as source_url,
    ns.category as source_category
FROM public.scraped_news sn
LEFT JOIN public.news_sources ns ON sn.source_id = ns.id;

-- View for automation status
CREATE OR REPLACE VIEW public.automation_status AS
SELECT
    aa.id,
    aa.name,
    aa.type,
    aa.is_active,
    aa.schedule,
    aa.last_run_at,
    aa.next_run_at,
    ar.status as last_run_status,
    ar.started_at as last_run_started,
    ar.completed_at as last_run_completed
FROM public.automation_assets aa
LEFT JOIN LATERAL (
    SELECT status, started_at, completed_at
    FROM public.automation_runs
    WHERE asset_id = aa.id
    ORDER BY started_at DESC
    LIMIT 1
) ar ON true;

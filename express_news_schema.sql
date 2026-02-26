-- Script para crear/actualizar las tablas necesarias para el módulo "Express News"
-- Ejecutar en el Editor SQL de Supabase

-- 1. Tabla para noticias humanizadas (Express News)
CREATE TABLE IF NOT EXISTS public.humanized_news (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    scraped_news_id UUID REFERENCES public.scraped_news(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- El texto humanizado
    audio_url TEXT, -- URL del audio generado (si se guarda en Storage)
    audio_base64 TEXT, -- Opcional: Para guardar base64 directamente si es pequeño (no recomendado para prod)
    status TEXT DEFAULT 'draft', -- 'draft', 'published'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID REFERENCES auth.users(id) -- Quién creó la noticia
);

-- 2. Tabla para archivos de audio (si se desea gestionar metadatos de audios)
CREATE TABLE IF NOT EXISTS public.tts_audio_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    news_id UUID REFERENCES public.humanized_news(id),
    file_path TEXT NOT NULL,
    duration_seconds INTEGER,
    format TEXT DEFAULT 'mp3',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.humanized_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tts_audio_files ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso (Permitir todo a usuarios autenticados para desarrollo)
CREATE POLICY "Enable all access for authenticated users" ON public.humanized_news
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all access for authenticated users" ON public.tts_audio_files
    FOR ALL USING (auth.role() = 'authenticated');

-- Script para actualizar el esquema de la base de datos
-- Ejecuta este script en el Editor SQL de Supabase

-- 1. Actualizar tabla 'broadcast_news_items' para soportar bloques personalizados y metadatos
ALTER TABLE broadcast_news_items
ADD COLUMN IF NOT EXISTS type text DEFAULT 'news',
ADD COLUMN IF NOT EXISTS custom_title text,
ADD COLUMN IF NOT EXISTS custom_content text,
ADD COLUMN IF NOT EXISTS audio_url text,
ADD COLUMN IF NOT EXISTS duration_seconds integer DEFAULT 30;

-- 2. Asegurar que la tabla 'humanized_news' tenga la columna audio_url
ALTER TABLE humanized_news
ADD COLUMN IF NOT EXISTS audio_url text;

-- 3. Verificar permisos (opcional, por si acaso)
GRANT ALL ON broadcast_news_items TO authenticated;
GRANT ALL ON broadcast_news_items TO service_role;

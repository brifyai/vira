-- SQL para agregar columnas de configuración de voz a la tabla broadcast_news_items

ALTER TABLE public.broadcast_news_items
ADD COLUMN IF NOT EXISTS voice_id text DEFAULT 'es-CL-LorenzoNeural',
ADD COLUMN IF NOT EXISTS voice_speed numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS voice_pitch numeric DEFAULT 1.0;

-- Opcional: Actualizar registros existentes con valores por defecto si son nulos
UPDATE public.broadcast_news_items
SET voice_id = 'es-CL-LorenzoNeural'
WHERE voice_id IS NULL;

UPDATE public.broadcast_news_items
SET voice_speed = 1.0
WHERE voice_speed IS NULL;

UPDATE public.broadcast_news_items
SET voice_pitch = 1.0
WHERE voice_pitch IS NULL;

-- Tabla para Noticieros (Broadcasts)
CREATE TABLE IF NOT EXISTS news_broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'ready', 'published'
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para Items del Noticiero (Relación Many-to-Many entre Broadcast y Humanized News)
CREATE TABLE IF NOT EXISTS broadcast_news_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    broadcast_id UUID REFERENCES news_broadcasts(id) ON DELETE CASCADE,
    humanized_news_id UUID REFERENCES humanized_news(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_broadcast_news_items_broadcast_id ON broadcast_news_items(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_news_broadcasts_status ON news_broadcasts(status);

-- Política de Storage (Ejemplo - Ajustar según necesidades reales)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('noticias', 'noticias', true) ON CONFLICT DO NOTHING;

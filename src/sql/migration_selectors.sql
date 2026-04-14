-- 1. Agregar columnas para configuración dinámica de scraping
ALTER TABLE news_sources
ADD COLUMN IF NOT EXISTS selector_list_container TEXT,
ADD COLUMN IF NOT EXISTS selector_link TEXT,
ADD COLUMN IF NOT EXISTS selector_content TEXT,
ADD COLUMN IF NOT EXISTS selector_ignore TEXT;

-- 2. Migrar configuración de SoyChile (Ejemplo base)
-- NOTA: Se aplica a todas las fuentes que contengan 'SoyChile' en el nombre.
-- Si tienes fuentes específicas (ej. Economía) con selectores distintos, 
-- actualízalas individualmente en la plataforma o usa el ID específico aquí.
UPDATE news_sources
SET
    selector_list_container = '.destacadas-wrapper',
    selector_link = '.media-desc a',
    selector_content = '.textoDetalle'
WHERE name ILIKE '%SoyChile%' AND selector_list_container IS NULL;

-- 3. Migrar configuración de Emol (Ejemplo base)
UPDATE news_sources
SET
    selector_list_container = 'ucHomePage_cuNoticiasCentral_contTitular',
    selector_content = '.EmolText'
WHERE name ILIKE '%Emol%' AND selector_list_container IS NULL;

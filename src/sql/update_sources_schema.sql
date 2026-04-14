-- Add columns for dynamic scraping configuration
ALTER TABLE news_sources
ADD COLUMN selector_list_container TEXT,
ADD COLUMN selector_link TEXT,
ADD COLUMN selector_content TEXT,
ADD COLUMN selector_ignore TEXT;

-- Update SoyChile configuration
UPDATE news_sources
SET
    selector_list_container = '.destacadas-wrapper',
    selector_link = '.media-desc a',
    selector_content = '.textoDetalle',
    selector_ignore = NULL
WHERE name ILIKE '%SoyChile%';

-- Update Emol configuration
UPDATE news_sources
SET
    selector_list_container = '#ucHomePage_cuNoticiasCentral_contTitular, [id^="ucHomePage_cuNoticiasCentral_repNoticiasCetral_cajaSec_"]',
    selector_link = 'h1 a, h3 a',
    selector_content = '.EmolText',
    selector_ignore = '.contRelacionadas, .flo_left, .relacionadas'
WHERE name ILIKE '%Emol%';

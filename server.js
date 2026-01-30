const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase client
const supabaseUrl = 'https://themdawboacvgyyaftus.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZW1kYXdib2Fjdmd5eWFmdHVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3ODE3NTAsImV4cCI6MjA4NTM1Nzc1MH0.w1pw0S7fxz3qIBbB-VoZ5x6tf4AKWgc5p3ffgP2zYCc';
const supabase = createClient(supabaseUrl, supabaseKey);

const scrapingBeeApiKey = '0PP8W5U3GBAJ5LCIOHHZ2MDDVYAG4EQK599KIO00EWIVER2I0NN5MKV37TTRM51FWUJCZC56G2ZK0XK3';
// Using the same API Key as Gemini which follows the standard AIza format
const googleCloudTtsApiKey = 'AIzaSyCvgEjsSLxBC-UCUGiWg7CsbPe8IXx8EPc';
const AZURE_API_KEY = 'TU_API_KEY_AZURE'; // Reemplazar con la clave real
const AZURE_REGION = 'eastus'; // Reemplazar con la región correcta

// Helper for escaping XML
function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Helper for fetching with timeout
const fetchWithTimeout = async (url, options = {}, timeout = 60000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

// Scrape endpoint
app.post('/api/scrape', async (req, res) => {
    console.log('Scrape request received:', req.body);
    const startTime = Date.now();

    // Send standard JSON response (no streaming)
    // res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    // res.setHeader('Transfer-Encoding', 'chunked');

    const sendUpdate = (data) => {
        // Log updates to console instead of streaming to client
        console.log('[UPDATE]', JSON.stringify(data));
    };

    try {
        const { sources } = req.body;

        if (!sources || !Array.isArray(sources) || sources.length === 0) {
            return res.status(400).json({ error: 'No sources provided' });
        }

        // Get active sources from Supabase
        const { data: sourcesData, error: sourcesError } = await supabase
            .from('news_sources')
            .select('*')
            .in('id', sources)
            .eq('is_active', true);

        if (sourcesError) {
            console.error('Error fetching sources:', sourcesError);
            return res.status(500).json({ error: sourcesError.message });
        }

        if (!sourcesData || sourcesData.length === 0) {
            return res.status(404).json({ error: 'No active sources found' });
        }

        console.log(`Processing ${sourcesData.length} sources`);
        sendUpdate({ type: 'start', total: sourcesData.length, message: `Iniciando análisis de ${sourcesData.length} fuentes...` });

        // Scrape sources with concurrency limit
        const CONCURRENT_SOURCES = 3;
        const ARTICLES_PER_SOURCE = 3; 
        const scrapedNews = [];
        let processedCount = 0;

        // Helper function to process a single source
        const processSource = async (source) => {
            // ... (existing scraping logic)
            console.log(`[START] Scraping source: ${source.name} (${source.url})`);
            sendUpdate({ type: 'progress', message: `Contactando ScrapingBee para: ${source.name}...` });
            
            try {
                // Get HTML with render_js enabled and wait for content to load
                const sbUrl = `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(source.url)}&render_js=true&wait=2000&window_width=1920&window_height=1080`;
                
                const response = await fetchWithTimeout(sbUrl, {}, 45000); // Increased timeout

                // Check for ScrapingBee specific headers if possible (usually in response headers)
                const usedCredits = response.headers.get('Spb-Used-Credits');
                const remainingCredits = response.headers.get('Spb-Remaining-Credits');
                if (usedCredits) console.log(`[INFO] ScrapingBee Credits - Used: ${usedCredits}, Remaining: ${remainingCredits}`);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[ERROR] Failed to scrape ${source.name}: ${response.status} ${response.statusText} - Body: ${errorText}`);
                    sendUpdate({ type: 'error', error: `Error ScrapingBee (${response.status}): ${source.name}` });
                    return [];
                        candidates.push({
                            title: linkText,
                            url: fullUrl,
                            score: score
                        });
                        validLinksCount++;
                    }

                const html = await response.text();
                console.log(`[INFO] HTML content length for ${source.name}: ${html.length}`);
                
                if (html.length < 1000) {
                     console.warn(`[WARN] HTML content too short for ${source.name}. Possible bot detection or empty page.`);
                     sendUpdate({ type: 'error', error: `Contenido vacío/corto para: ${source.name}` });
                }

                sendUpdate({ type: 'progress', message: `Analizando enlaces de: ${source.name}...` });

                
                // Step 1: Extract news articles with their links
                const newsArticles = [];
                const seenUrls = new Set();
                
                // Fetch existing URLs for this source from Supabase to avoid duplicates
                const { data: existingNews } = await supabase
                    .from('scraped_news')
                    .select('original_url')
                    .eq('source_id', source.id)
                    .order('created_at', { ascending: false })
                    .limit(100);
                    
                const existingUrls = new Set(existingNews ? existingNews.map(n => n.original_url) : []);

                // Improved Regex to handle newlines and various attribute orders
                // Focus link extraction on specific containers if possible
                let searchHtml = html;
                
                // Prioritize "destacadas-wrapper" for SoyChile/Emol if present
                // Strategy: Extract high-priority URLs first based on specific structure
                const highPriorityUrls = new Set();
                
                // Dynamic Selector Support (High Priority)
                if (source.selector_list_container) {
                    console.log(`[DEBUG] Using dynamic selector_list_container: ${source.selector_list_container}`);
                    
                    let selector = source.selector_list_container;
                    let regexPattern;
                    
                    if (selector.startsWith('.')) {
                        const className = selector.substring(1);
                        regexPattern = new RegExp(`<div[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\/div>`, 'gi');
                    } else if (selector.startsWith('#')) {
                        const idName = selector.substring(1);
                        regexPattern = new RegExp(`<div[^>]*id=["']${idName}["'][^>]*>([\\s\\S]*?)<\/div>`, 'gi');
                    } else {
                         regexPattern = new RegExp(`<div[^>]*(?:id|class)=["']${selector}["'][^>]*>([\\s\\S]*?)<\/div>`, 'gi');
                    }

                    let containerMatch;
                    while ((containerMatch = regexPattern.exec(html)) !== null) {
                        const content = containerMatch[1];
                        
                        // Look for all links in the container
                        const linkMatches = content.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi);
                        for (const lm of linkMatches) {
                             let url = lm[1];
                             if (url.startsWith('/')) {
                                 try {
                                     const urlObj = new URL(source.url);
                                     url = `${urlObj.protocol}//${urlObj.host}${url}`;
                                 } catch (e) {}
                             }
                             highPriorityUrls.add(url);
                             console.log(`[DEBUG] Found High Priority URL via Dynamic Selector: ${url}`);
                        }
                    }
                } else {
                    // Legacy/Fallback Logic
                    if (source.url.includes('soychile.cl')) {
                        console.log(`[DEBUG] Scanning SoyChile specific structure: destacadas-wrapper -> media-desc -> a`);
                        const wrapperRegex = /<div[^>]*class=["'][^"']*destacadas-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
                        let wrapperMatch;
                        while ((wrapperMatch = wrapperRegex.exec(html)) !== null) {
                            const wrapperContent = wrapperMatch[1];
                            // content inside wrapper might contain media-desc
                            // Note: regex on partial HTML is safer
                            const mediaDescMatch = wrapperContent.match(/class=["'][^"']*media-desc[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["']/i);
                            if (mediaDescMatch) {
                                let url = mediaDescMatch[1];
                                if (url.startsWith('/')) {
                                    try {
                                        const urlObj = new URL(source.url);
                                        url = `${urlObj.protocol}//${urlObj.host}${url}`;
                                    } catch (e) {}
                                }
                                highPriorityUrls.add(url);
                                console.log(`[DEBUG] Found High Priority SoyChile URL: ${url}`);
                            }
                        }
                    }

                    if (source.url.includes('emol.com')) {
                        console.log(`[DEBUG] Scanning Emol specific structure: ucHomePage_cuNoticiasCentral`);
                        // Patterns: 
                        // 1. ucHomePage_cuNoticiasCentral_contTitular (Main)
                        // 2. ucHomePage_cuNoticiasCentral_repNoticiasCetral_cajaSec_X (Secondary)
                        // Both contain h1 or h3 with link
                        
                        const emolContainerRegex = /<div[^>]*id=["'](?:ucHomePage_cuNoticiasCentral_contTitular|ucHomePage_cuNoticiasCentral_repNoticiasCetral_cajaSec_\d+)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
                        let containerMatch;
                        while ((containerMatch = emolContainerRegex.exec(html)) !== null) {
                            const content = containerMatch[1];
                            // Look for <a href="..."> inside h1 or h3
                            // Simplify: just look for the first link in this container, it's usually the title
                            const linkMatch = content.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
                            if (linkMatch) {
                                let url = linkMatch[1];
                                if (url.startsWith('/')) {
                                    try {
                                        const urlObj = new URL(source.url);
                                        url = `${urlObj.protocol}//${urlObj.host}${url}`;
                                    } catch (e) {}
                                }
                                highPriorityUrls.add(url);
                                console.log(`[DEBUG] Found High Priority Emol URL: ${url}`);
                            }
                        }
                    }
                }

                const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
                let linkMatch;
                let foundLinksCount = 0;
                let validLinksCount = 0;
                
                const candidates = [];
                
                while ((linkMatch = linkRegex.exec(html)) !== null) {
                    foundLinksCount++;
                    const href = linkMatch[1];
                    // Clean link text: remove tags, replace newlines/tabs with spaces, trim
                    const linkText = linkMatch[2]
                        .replace(/<[^>]*>/g, '')
                        .replace(/[\n\r\t]+/g, ' ')
                        .trim();
                    
                    let fullUrl = href;
                    
                    if (href.startsWith('/')) {
                        try {
                            const urlObj = new URL(source.url);
                            fullUrl = `${urlObj.protocol}//${urlObj.host}${href}`;
                        } catch (e) {
                            console.warn(`[WARN] Invalid base URL for relative link: ${source.url}`);
                            continue;
                        }
                    } else if (!href.startsWith('http')) {
                        continue;
                    }

                    // Special handling for Emol
                    const isEmol = source.url.includes('emol.com');
                    const isSoyChile = source.url.includes('soychile.cl');

                    const isEmolNews = isEmol && href.includes('/noticias/');
                    const isSoyChileNews = isSoyChile && href.includes('.html') && (href.match(/\/202[0-9]\//) || href.match(/\/\d+\//)); // Requires .html and year or ID


                    // Debug log for first few links to verify patterns
                    if (foundLinksCount <= 5) {
                        console.log(`[DEBUG] Analyzing link: ${fullUrl} | Text: "${linkText}"`);
                    }
                    
                    if (linkText.length > 10 && // Reduced to 10 to catch very short titles
                        !seenUrls.has(fullUrl) &&
                        !existingUrls.has(fullUrl) && // Check against DB
                        !linkText.toLowerCase().includes('más') &&
                        !linkText.toLowerCase().includes('ver todo') &&
                        !linkText.toLowerCase().includes('menú') &&
                        !linkText.toLowerCase().includes('login') &&
                        !linkText.toLowerCase().includes('registrarse') &&
                        !linkText.toLowerCase().includes('suscríbete') &&
                        !linkText.toLowerCase().includes('términos') &&
                        !linkText.toLowerCase().includes('política de privacidad') &&
                        !linkText.toLowerCase().includes('&nbsp;') &&
                        !href.includes('#') &&
                        !href.includes('javascript') &&
                        (
                         isEmolNews || // Always accept Emol news links
                         isSoyChileNews || // Always accept SoyChile news links
                         (!isEmol && !isSoyChile && ( // Only apply generic rules if NOT special source
                            href.includes('/tv/') || 
                            href.includes('/noticia') || 
                            href.includes('/articulo') || 
                            href.includes('.html') || 
                            href.includes('.aspx') || // Added for sites like SoyChile
                            href.includes('/2024/') || 
                            href.includes('/2025/') || 
                            href.includes('/2026/') ||
                            href.match(/\/\d{4}\/\d{2}\/\d{2}\//) || 
                            href.match(/\/[a-z-]+\/\d+/) || 
                            (href.startsWith('/') && href.split('/').length > 2)
                         ))
                        )) { 
                        
                        seenUrls.add(fullUrl);
                        
                        // Calculate score
                        let score = 0;
                        if (href.match(/\/\d{4}\/\d{2}\/\d{2}\//)) score += 20; // High priority for dates
                        if (href.includes('/noticia') || href.includes('/articulo')) score += 10;
                        if (linkText.length > 40) score += 5; // Prefer longer titles
                        if (isEmolNews) score += 15;
                        if (isSoyChileNews) score += 15;
                        
                        // Boost score if link was found inside "destacadas-wrapper" (Legacy check)
                        // New High Priority check based on specific structure
                        if (highPriorityUrls.has(fullUrl)) {
                            score += 50; // Massive boost for structurally verified links
                            console.log(`[DEBUG] Boosted score for structural match: ${fullUrl}`);
                        }

                        candidates.push({
                            title: linkText,
                            url: fullUrl,
                            score: score
                        });
                        validLinksCount++;
                    }
                }
                
                // Sort by score and take top N
                candidates.sort((a, b) => b.score - a.score);
                const topCandidates = candidates.slice(0, ARTICLES_PER_SOURCE);
                newsArticles.push(...topCandidates);
                
                console.log(`[INFO] Found ${foundLinksCount} total links. Valid candidates: ${validLinksCount}. Selected top ${newsArticles.length} to process.`);
                sendUpdate({ type: 'progress', message: `Encontrados ${newsArticles.length} artículos nuevos en ${source.name}. Procesando...` });

                if (newsArticles.length === 0) {
                    console.warn(`[WARN] No new articles found for ${source.name}. Check link patterns or HTML structure.`);
                    sendUpdate({ type: 'progress', message: `No se encontraron artículos nuevos en ${source.name}` });
                    return [];
                }

                // Step 2: Visit each article in parallel
                const articlePromises = newsArticles.map(async (article, idx) => {
                    sendUpdate({ type: 'progress', message: `Extrayendo (${idx+1}/${newsArticles.length}): ${article.title.substring(0, 30)}...` });
                    try {
                        const articleResponse = await fetchWithTimeout(
                            `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(article.url)}&render_js=true&wait=1000`,
                            {},
                            20000
                        );

                        if (!articleResponse.ok) {
                            console.warn(`Skipping ${article.url} due to connection error`);
                            return null;
                        }

                        const articleHtml = await articleResponse.text();
                        const fullContent = extractContent(articleHtml, article.title, article.url, source);
                        
                        console.log(`[DEBUG] Extracted content length for ${article.url}: ${fullContent.length}`);
                        if (fullContent.length < 200) console.log(`[DEBUG] Content preview: ${fullContent}`);

                        // Validation: Check for invalid content phrases
                        const invalidPhrases = [
                            'Error de conexión', 
                            'timeout', 
                            'Ver términos y condiciones', 
                            'Suscríbete para leer',
                            'Contenido exclusivo',
                            'Inicia sesión',
                            '404 Not Found',
                            'Página no encontrada',
                            'No se pudo extraer el contenido completo',
                            'Debes estar registrado',
                            'Acceso restringido',
                            'Puertos y Logística Radio Temporada II' // Specific exclusion for the recurring boilerplate
                        ];
                        
                        const invalidPhrase = invalidPhrases.find(phrase => fullContent.toLowerCase().includes(phrase.toLowerCase()));
                        
                        if (invalidPhrase) {
                            console.warn(`Skipping ${article.url} due to invalid phrase: "${invalidPhrase}"`);
                            sendUpdate({ type: 'progress', message: `Omitido por contenido inválido: ${article.title.substring(0, 20)}...` });
                            return null;
                        }

                        if (fullContent.length < 100) {
                             console.warn(`Skipping ${article.url} due to short content (${fullContent.length} chars)`);
                             sendUpdate({ type: 'progress', message: `Omitido por contenido corto: ${article.title.substring(0, 20)}...` });
                             return null;
                        }

                        const imageUrl = extractImage(articleHtml, article.url);

                        return {
                            title: article.title,
                            content: fullContent,
                            summary: fullContent.substring(0, 200) + (fullContent.length > 200 ? '...' : ''),
                            original_url: article.url,
                            image_url: imageUrl,
                            published_at: new Date().toISOString(),
                            scraped_at: new Date().toISOString(),
                            is_processed: false,
                            is_selected: false,
                            source_id: source.id
                        };
                    } catch (error) {
                        console.warn(`Skipping ${article.url} due to exception:`, error);
                        return null;
                    }
                });

                const results = await Promise.all(articlePromises);
                
                // Filter out nulls and duplicates within the batch
                const uniqueContent = new Set();
                const filteredResults = [];
                
                for (const r of results) {
                    if (r && !uniqueContent.has(r.content)) {
                        uniqueContent.add(r.content);
                        filteredResults.push(r);
                    } else if (r) {
                        console.warn(`Skipping duplicate content for url: ${r.original_url}`);
                    }
                }
                
                return filteredResults;

            } catch (error) {
                console.error(`[ERROR] Critical error scraping source ${source.name}:`, error);
                return [];
            }
        };

        // Process sources in chunks
        for (let i = 0; i < sourcesData.length; i += CONCURRENT_SOURCES) {
            const chunk = sourcesData.slice(i, i + CONCURRENT_SOURCES);
            
            const chunkPromises = chunk.map(source => processSource(source));
            const chunkResults = await Promise.all(chunkPromises);
            
            chunkResults.forEach(results => {
                if (results && results.length > 0) {
                    scrapedNews.push(...results);
                }
            });

            processedCount += chunk.length;
            const percent = Math.round((processedCount / sourcesData.length) * 100);
            sendUpdate({ 
                type: 'progress', 
                percent: percent, 
                message: `Procesado ${processedCount}/${sourcesData.length} fuentes (${percent}%)` 
            });
        }

        // Insert scraped news into Supabase
        if (scrapedNews.length > 0) {
            sendUpdate({ type: 'saving', message: 'Guardando noticias en base de datos...' });
            const { error: insertError } = await supabase
                .from('scraped_news')
                .insert(scrapedNews);

            if (insertError) {
                console.error('Error inserting scraped news:', insertError);
                throw insertError;
            }
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`[COMPLETE] Scraped ${scrapedNews.length} news in ${duration}s`);
        
        res.json({
            success: true,
            count: scrapedNews.length,
            message: `Actualización completada: ${scrapedNews.length} noticias nuevas en ${duration}s`,
            data: scrapedNews
        });

    } catch (error) {
        console.error('Error in scrape endpoint:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error occurred' });
    }
});

// Helpers
function fallbackArticle(article, sourceId, errorMsg) {
    return {
        title: article.title,
        content: `${article.title}\n\n${errorMsg}`,
        summary: article.title.substring(0, 200),
        original_url: article.url,
        image_url: null,
        published_at: new Date().toISOString(),
        scraped_at: new Date().toISOString(),
        is_processed: false,
        is_selected: false,
        source_id: sourceId
    };
}

function extractContent(html, title, url, source) {
    let fullContent = '';
    
    // Pattern 0: Dynamic Selector (High Priority)
    if (source && source.selector_content) {
        console.log(`[DEBUG] Using dynamic selector_content: ${source.selector_content} for ${url}`);
        let selector = source.selector_content;
        let regexPattern;

        // Basic selector to regex conversion
        if (selector.startsWith('.')) {
            const className = selector.substring(1);
            // Match div with this class
            regexPattern = new RegExp(`<div[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\/div>`, 'i');
        } else if (selector.startsWith('#')) {
            const idName = selector.substring(1);
            // Match div with this id
            regexPattern = new RegExp(`<div[^>]*id=["']${idName}["'][^>]*>([\\s\\S]*?)<\/div>`, 'i');
        } else {
             // Fallback: try to match as class or id if no prefix
             regexPattern = new RegExp(`<div[^>]*(?:id|class)=["']${selector}["'][^>]*>([\\s\\S]*?)<\/div>`, 'i');
        }
        
        const match = html.match(regexPattern);
        if (match) {
             console.log(`[DEBUG] Found content using dynamic selector`);
             const chunk = match[0]; // The whole div
             // Use existing extraction logic on this chunk
             fullContent = extractParagraphs(chunk);
             
             // If result is short, try extracting text from divs inside (handling justify etc like in SoyChile)
             if (fullContent.length < 200) {
                 const divRegex = /<div[^>]*>([\s\S]*?)<\/div>/gi;
                 let divMatch;
                 while ((divMatch = divRegex.exec(chunk)) !== null) {
                     const text = divMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                     if (text.length > 20) fullContent += text + '\n\n';
                 }
             }
        }
    }

    // Pattern 1: Site Specific (Hardcoded Fallback)
    
    // SoyChile: id="textoDetalle" OR class="textoDetalle"
    const soyMatch = html.match(/<div[^>]*(?:id|class)=["']textoDetalle["'][^>]*>/i);
    if (soyMatch) {
        console.log(`[DEBUG] Found SoyChile content container for ${url}`);
        const soyIndex = soyMatch.index;
        const tagLength = soyMatch[0].length;
        
        // Take a chunk, but try to stop before comments or footer
        // Look for the comments section start to truncate the chunk
        let endIndex = html.indexOf('id="comentarios"', soyIndex);
        if (endIndex === -1) endIndex = html.indexOf('class="note-footer"', soyIndex);
        if (endIndex === -1) endIndex = soyIndex + 25000; // Fallback to large chunk
        
        const chunk = html.substring(soyIndex + tagLength, endIndex);
        
        // 1. Get text immediately after the opening tag (before first tag)
        const firstTagIndex = chunk.indexOf('<');
        if (firstTagIndex > 0) {
            const initialText = chunk.substring(0, firstTagIndex).trim();
            if (initialText.length > 20) {
                console.log(`[DEBUG] Found initial text in SoyChile: "${initialText.substring(0, 50)}..."`);
                fullContent += initialText + '\n\n';
            }
        }
        
        // 2. Get paragraphs from the chunk (Standard P tags)
        fullContent += extractParagraphs(chunk);

        // 3. Get text from divs with text-align: justify (Common in SoyChile)
        // This handles cases where they use <div style="text-align: justify;">Content</div> instead of <p>
        const justifiedDivRegex = /<div[^>]*style=["'][^"']*text-align:\s*justify[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
        let divMatch;
        while ((divMatch = justifiedDivRegex.exec(chunk)) !== null) {
            const text = divMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            // Avoid adding duplicates if extractParagraphs already caught it (unlikely if they are divs)
            if (text.length > 20 && !fullContent.includes(text)) {
                 fullContent += text + '\n\n';
            }
        }
        
        // 5. Special Case: Loose Text Nodes mixed with empty P tags (Found in SoyChile)
        // Match text that exists between a closing tag > and an opening tag < (e.g., </p> TEXT <p>)
        const textNodeRegex = />([^<]{30,})</g;
        let textNodeMatch;
        // Reset lastIndex just in case, though exec handles it on new string? No, regex is stateful if global.
        // We'll create a new regex instance or just rely on loop.
        
        // We need to be careful not to capture script content.
        // Let's remove script and style tags from chunk first for this specific check
        const cleanChunk = chunk.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
        
        while ((textNodeMatch = textNodeRegex.exec(cleanChunk)) !== null) {
            const text = textNodeMatch[1].trim();
            // Filter out common garbage
            if (text.length > 30 && 
                !fullContent.includes(text) && 
                !text.includes('function(') &&
                !text.includes('var ') &&
                !text.includes('window.') &&
                !text.includes('googletag')
               ) {
                 console.log(`[DEBUG] Found loose text node: "${text.substring(0, 30)}..."`);
                 fullContent += text + '\n\n';
            }
        }
    }

    // Emol: class="EmolText" (Specific per user request) or id="cuDetalle_cuTexto_textoNoticia"
    if (!fullContent) {
        // Try specific class first as requested
        let emolIndex = html.search(/class=["']EmolText["']/i);
        if (emolIndex === -1) {
             emolIndex = html.search(/id=["']cuDetalle_cuTexto_textoNoticia["']/i);
        }

        if (emolIndex !== -1) {
             console.log(`[DEBUG] Found Emol content container for ${url}`);
             const chunk = html.substring(emolIndex, emolIndex + 25000);
             
             // Emol uses <div> for paragraphs often, not just <p>
             // Capture text inside <div>...</div> that are not just <br>
             // IMPORTANT: Avoid divs with id starting with "contRelacionadas" or class "flo_left"
             
             const divRegex = /<div[^>]*>([\s\S]*?)<\/div>/gi;
             let divMatch;
             while ((divMatch = divRegex.exec(chunk)) !== null) {
                 const fullDiv = divMatch[0]; // The whole tag <div...>...</div>
                 const innerContent = divMatch[1];
                 
                 // Check attributes of the div itself (not just content)
                 // Regex stateful loop makes accessing the tag attributes tricky without re-parsing
                 // Let's use a simpler approach: check if the match includes forbidden attributes
                 // Actually, let's extract attributes from the opening tag
                 const openTag = fullDiv.match(/<div[^>]*>/i)[0];
                 
                 if (openTag.includes('contRelacionadas') || 
                     openTag.includes('flo_left') || 
                     openTag.includes('cont_items_detalle') ||
                     openTag.includes('relacionadas')) {
                     continue; // Skip related news and floaters
                 }

                 const text = innerContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                 
                 // Avoid capturing empty divs or just date/author info if possible
                 // Also avoid "Noticias relacionadas" text if it leaks
                 if (text.length > 20 && !text.includes('Noticias relacionadas')) {
                     fullContent += text + '\n\n';
                 }
                 
                 // Stop if we hit the "send correction" or footer area
                 if (innerContent.includes('id="contRelacionadas"') || innerContent.includes('class="error_txt"')) {
                     break;
                 }
             }
             
             // Fallback: if no divs found (maybe different structure), try p tags
             if (fullContent.length < 50) {
                 fullContent = extractParagraphs(chunk);
             }
        }
    }

    // Pattern 1: Article tag
    if (!fullContent) {
        const articleTagMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (articleTagMatch) {
            fullContent = extractParagraphs(articleTagMatch[1]);
        }
    }

    // Pattern 2: Main content divs
    if (!fullContent || fullContent.length < 100) {
        const contentPatterns = [
            /<div[^>]*class=["'][^"']*(?:article-content|post-content|entry-content|story-content|news-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
            /<div[^>]*id=["'][^"']*(?:article|content|post|entry)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
            /<main[^>]*>([\s\S]*?)<\/main>/i
        ];
        for (const pattern of contentPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                const content = extractParagraphs(match[1]);
                if (content.length > 50) {
                    fullContent = content;
                    break;
                }
            }
        }
    }

    // Pattern 3: Loose paragraphs (Improved)
    if (!fullContent || fullContent.length < 100) {
        // Match all p tags, non-greedy content
        const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        const paragraphs = [];
        let pMatch;
        while ((pMatch = paragraphRegex.exec(html)) !== null) {
            // Strip tags from the captured content
            const text = pMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            // Lower threshold to 40 chars to catch shorter paragraphs
            if (text.length > 40) paragraphs.push(text);
        }
        // Take top paragraphs, but limit to avoid huge dumps
        fullContent = paragraphs.slice(0, 20).join('\n\n');
    }

    if (!fullContent || fullContent.length < 50) {
        return `${title}\n\nNo se pudo extraer el contenido completo.`;
    }

    // CLEANING: Remove header menu garbage and modal text
    // 1. Remove SoyChile/SoyTV Header Menu if captured
    // Expanded list of cities to catch the start of the menu more reliably
    const menuStartMarkers = [
        'SOYTV Actualidad Entretención Economía',
        'piapó soyvalparaíso',
        'arica soyiquique',
        'soycalama soyan',
        'soyosorno soypuertomontt',
        'soychiloé'
    ];
    
    for (const marker of menuStartMarkers) {
        if (fullContent.includes(marker)) {
             console.log(`[DEBUG] Removing SoyChile header menu (marker: ${marker})`);
             // Try to find the end of the menu (usually 'soychiloé' is the last one, or 'soyosorno' etc)
             const lastCityIndex = fullContent.lastIndexOf('soychiloé');
             if (lastCityIndex !== -1) {
                  fullContent = fullContent.substring(lastCityIndex + 'soychiloé'.length).trim();
             } else {
                  // If we can't find the end, just remove the marker and hopefully what follows is content
                  fullContent = fullContent.replace(marker, '').trim();
             }
             // Break after first match to avoid over-cleaning
             break;
        }
    }

    // 2. Remove Modal/Dialog text
    const modalPhrases = [
        "This is a modal window",
        "Beginning of dialog window",
        "Escape will cancel and close the window"
    ];
    for (const phrase of modalPhrases) {
        const idx = fullContent.indexOf(phrase);
        if (idx !== -1) {
             console.log(`[DEBUG] Truncating content at modal phrase: "${phrase}"`);
             fullContent = fullContent.substring(0, idx).trim();
        }
    }

    return fullContent;
}

function extractParagraphs(html) {
    // Improved regex to capture content including nested tags (b, i, a, strong, span)
    const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs = [];
    let pMatch;
    while ((pMatch = paragraphRegex.exec(html)) !== null) {
        // Strip all tags to check text length
        const text = pMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (text.length > 20) paragraphs.push(text);
    }
    return paragraphs.join('\n\n');
}

function extractImage(html, url) {
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/i;
    const imgMatch = html.match(imgRegex);
    if (imgMatch) {
        let imageUrl = imgMatch[1];
        if (imageUrl.startsWith('/')) {
            const urlObj = new URL(url);
            imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
        }
        return imageUrl;
    }
    return null;
}

// TTS Endpoint
app.post('/api/tts', async (req, res) => {
    try {
        const { text, voice, audioConfig } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleCloudTtsApiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: { text },
                voice: voice || { languageCode: 'es-ES', name: 'es-ES-Standard-A' },
                audioConfig: audioConfig || { audioEncoding: 'MP3' }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('TTS API Error:', errorData);
            return res.status(response.status).json({ error: errorData.error?.message || 'TTS API Error' });
        }

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error('TTS Server Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Azure TTS Endpoint
app.post('/api/azure-tts', async (req, res) => {
    try {
        const { text, voice, speed } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: "El texto no puede estar vacío" });
        }
        if (text.length > 2500) {
            return res.status(400).json({ error: "El texto no puede exceder 2500 caracteres" });
        }

        const speechRate = speed && speed >= 0.5 && speed <= 1.5 ? speed : 1;
        const validVoices = [
            "es-MX-JorgeNeural", "es-US-AlonsoNeural", "es-AR-TomasNeural", "es-CL-LorenzoNeural",
            "es-AR-ElenaNeural", "es-MX-DaliaNeural", "es-US-PalomaNeural", "es-CL-CatalinaNeural"
        ];

        if (!voice || !validVoices.includes(voice)) {
            return res.status(400).json({ error: "Voz no válida" });
        }

        if (!AZURE_API_KEY || AZURE_API_KEY === "TU_API_KEY_AZURE") {
            return res.status(500).json({ 
                error: "API Key de Azure no configurada",
                message: "Configura AZURE_API_KEY en server.js"
            });
        }

        let lang = "es-CL";
        if (voice.startsWith("es-US")) lang = "es-US";
        else if (voice.startsWith("es-MX")) lang = "es-MX";
        else if (voice.startsWith("es-AR")) lang = "es-AR";

        let processedText = escapeXml(text)
            .replace(/,/g, ',<break time="100ms"/>')
            .replace(/\./g, '.<break time="140ms"/>')
            .replace(/;/g, ';<break time="120ms"/>')
            .replace(/:/g, ':<break time="100ms"/>')
            .replace(/\?/g, '?<break time="250ms"/>')
            .replace(/!/g, '!<break time="250ms"/>');

        const finalRate = 0.95 * speechRate;
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody rate="${finalRate}" pitch="0%" volume="+3%">${processedText}</prosody></voice></speak>`;

        const azureUrl = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
        console.log(`Sending request to Azure TTS: ${azureUrl}`);

        const azureResponse = await fetch(azureUrl, {
            method: "POST",
            headers: {
                "Ocp-Apim-Subscription-Key": AZURE_API_KEY,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-48khz-192kbitrate-mono-mp3",
                "User-Agent": "NodeServer"
            },
            body: ssml
        });

        if (!azureResponse.ok) {
            let errorText = await azureResponse.text().catch(() => "No se pudo leer el error");
            console.error("Azure API Error:", errorText);
            return res.status(azureResponse.status).json({
                error: "Error al generar el audio con Azure",
                azureError: errorText
            });
        }

        const audioBuffer = await azureResponse.arrayBuffer();
        if (audioBuffer.byteLength === 0) {
            return res.status(500).json({ error: "El audio generado está vacío" });
        }

        res.set('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(audioBuffer));

    } catch (error) {
        console.error("Error al generar audio Azure:", error);
        res.status(500).json({ error: "Error interno del servidor", details: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 8888;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/api/health`);
        console.log(`Scrape endpoint: http://localhost:${PORT}/api/scrape`);
    });
}

module.exports = app;

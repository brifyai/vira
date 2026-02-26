require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Initialize Express app
const app = express();
app.use(cors({
    origin: '*', // Allow all origins (including localhost and Vercel)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '50mb' })); // Increased limit for voice cloning audio uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Supabase client
const supabaseUrl = 'https://themdawboacvgyyaftus.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.supabaseAnonKey || 'YOUR_SUPABASE_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

const scrapingBeeApiKey =
  process.env.scrapingBeeApiKey ||
  process.env.SCRAPINGBEE_API_KEY ||
  'YOUR_SCRAPING_BEE_API_KEY';
const googleCloudTtsApiKey =
  process.env.googleCloudTtsApiKey ||
  process.env.GOOGLE_CLOUD_TTS_API_KEY ||
  'YOUR_GOOGLE_CLOUD_TTS_API_KEY';
const AZURE_API_KEY = process.env.AZURE_API_KEY || 'TU_API_KEY_AZURE'; // Configurar en Vercel Environment Variables
const AZURE_REGION = process.env.AZURE_REGION || 'eastus'; // Configurar en Vercel Environment Variables
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || 'YOUR_QWEN_API_KEY';

// --- Debug Environment Variables (Safe Log) ---
console.log('[Server] Starting...');
console.log('[Server] Environment Check:');
console.log(`- NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`- DASHSCOPE_API_KEY Present: ${!!process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_API_KEY !== 'YOUR_QWEN_API_KEY'}`);
console.log(`- AZURE_API_KEY Present: ${!!process.env.AZURE_API_KEY && process.env.AZURE_API_KEY !== 'TU_API_KEY_AZURE'}`);
console.log(`- AZURE_REGION: ${AZURE_REGION}`);
console.log(`- GEMINI_API_KEY Present: ${!!(process.env.GEMINI_API_KEY || process.env.geminiApiKey)}`);
// ----------------------------------------------

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
    // console.log('Scrape request received:', req.body);
    const startTime = Date.now();

    // Send standard JSON response (no streaming)
    // res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    // res.setHeader('Transfer-Encoding', 'chunked');

    const sendUpdate = (data) => {
        // Log updates to console instead of streaming to client
        // console.log('[UPDATE]', JSON.stringify(data));
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

        // console.log(`Processing ${sourcesData.length} sources`);
        sendUpdate({ type: 'start', total: sourcesData.length, message: `Iniciando análisis de ${sourcesData.length} fuentes...` });

        // Scrape sources with concurrency limit
        const CONCURRENT_SOURCES = 3;
        const ARTICLES_PER_SOURCE = 3; 
        const scrapedNews = [];
        let processedCount = 0;

        // Helper function to process a single source
        const processSource = async (source) => {
            // ... (existing scraping logic)
            // console.log(`[START] Scraping source: ${source.name} (${source.url})`);
            sendUpdate({ type: 'progress', message: `Contactando ScrapingBee para: ${source.name}...` });
            
            try {
                // Get HTML with render_js enabled and wait for content to load
                const sbUrl = `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(source.url)}&render_js=true&wait=2000&window_width=1920&window_height=1080`;
                
                const response = await fetchWithTimeout(sbUrl, {}, 45000); // Increased timeout

                // Check for ScrapingBee specific headers if possible (usually in response headers)
                const usedCredits = response.headers.get('Spb-Used-Credits');
                const remainingCredits = response.headers.get('Spb-Remaining-Credits');
                if (usedCredits) // console.log(`[INFO] ScrapingBee Credits - Used: ${usedCredits}, Remaining: ${remainingCredits}`);

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
                // console.log(`[INFO] HTML content length for ${source.name}: ${html.length}`);
                
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
                    // console.log(`[DEBUG] Using dynamic selector_list_container: ${source.selector_list_container}`);
                    
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
                             // console.log(`[DEBUG] Found High Priority URL via Dynamic Selector: ${url}`);
                        }
                    }
                } else {
                    // Legacy/Fallback Logic
                    if (source.url.includes('soychile.cl')) {
                        // console.log(`[DEBUG] Scanning SoyChile specific structure: destacadas-wrapper -> media-desc -> a`);
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
                                // console.log(`[DEBUG] Found High Priority SoyChile URL: ${url}`);
                            }
                        }
                    }

                    if (source.url.includes('emol.com')) {
                        // console.log(`[DEBUG] Scanning Emol specific structure: ucHomePage_cuNoticiasCentral`);
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
                                // console.log(`[DEBUG] Found High Priority Emol URL: ${url}`);
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
                        // console.log(`[DEBUG] Analyzing link: ${fullUrl} | Text: "${linkText}"`);
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
                            // console.log(`[DEBUG] Boosted score for structural match: ${fullUrl}`);
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
                
                // console.log(`[INFO] Found ${foundLinksCount} total links. Valid candidates: ${validLinksCount}. Selected top ${newsArticles.length} to process.`);
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
                        
                        // console.log(`[DEBUG] Extracted content length for ${article.url}: ${fullContent.length}`);
                        
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
        // console.log(`[COMPLETE] Scraped ${scrapedNews.length} news in ${duration}s`);
        
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
        // console.log(`[DEBUG] Using dynamic selector_content: ${source.selector_content} for ${url}`);
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
             // console.log(`[DEBUG] Found content using dynamic selector`);
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
        // console.log(`[DEBUG] Found SoyChile content container for ${url}`);
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
                // console.log(`[DEBUG] Found initial text in SoyChile: "${initialText.substring(0, 50)}..."`);
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
                 // console.log(`[DEBUG] Found loose text node: "${text.substring(0, 30)}..."`);
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
             // console.log(`[DEBUG] Found Emol content container for ${url}`);
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
             // console.log(`[DEBUG] Removing SoyChile header menu (marker: ${marker})`);
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
             // console.log(`[DEBUG] Truncating content at modal phrase: "${phrase}"`);
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
        const { text, voice, speed, pitch } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: "El texto no puede estar vacío" });
        }
        if (text.length > 2500) {
            return res.status(400).json({ error: "El texto no puede exceder 2500 caracteres" });
        }

        const speechRate = speed && speed >= 0.1 && speed <= 10.0 ? speed : 1;
        // Pitch mapping: 1.0 is base. range 0.2 to 10.0.
        // Convert to percentage: (pitch - 1) * 100
        // E.g. 1.5 -> +50%, 0.8 -> -20%
        let pitchValue = pitch !== undefined ? parseFloat(pitch) : 1.0;
        if (isNaN(pitchValue)) pitchValue = 1.0;
        
        // Clamp reasonable limits if needed, but SSML is flexible.
        // Ensure it has a sign if not 0
        let pitchPercent = Math.round((pitchValue - 1.0) * 100);
        let pitchStr = pitchPercent === 0 ? "0%" : (pitchPercent > 0 ? `+${pitchPercent}%` : `${pitchPercent}%`);

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

        let processedText = text.replace(/;/g, '___SEMICOLON___');
        processedText = escapeXml(processedText)
            .replace(/___SEMICOLON___/g, ';<break time="120ms"/>')
            .replace(/,/g, ',<break time="100ms"/>')
            .replace(/\./g, '.<break time="200ms"/>')
            .replace(/:/g, ':<break time="100ms"/>')
            .replace(/\?/g, '?<break time="250ms"/>')
            .replace(/!/g, '!<break time="250ms"/>');

        const finalRate = speechRate;
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody rate="${finalRate}" pitch="${pitchStr}" volume="+3%">${processedText}</prosody></voice></speak>`;

        const azureUrl = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
        // console.log(`Sending request to Azure TTS: ${azureUrl}`);

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

// Qwen Voice Enrollment (Clone) Endpoint
app.post('/api/qwen-voice-create', async (req, res) => {
    try {
        const { audioUrl, audio_data, preferred_name, target_model } = req.body;

        console.log('[QWEN] /api/qwen-voice-create called', { preferred_name, target_model, hasAudioData: !!audio_data, hasAudioUrl: !!audioUrl });

        if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY === 'YOUR_QWEN_API_KEY') {
            console.error('[QWEN] API Key missing for voice creation');
            return res.status(500).json({
                error: 'API Key de DashScope no configurada',
                message: 'Configura DASHSCOPE_API_KEY en variables de entorno'
            });
        }

        if ((!audioUrl && !audio_data) || !preferred_name || !target_model) {
            return res.status(400).json({ error: 'Parámetros inválidos: audio_data (o audioUrl), preferred_name y target_model son requeridos' });
        }

        // Validación estricta de preferred_name para evitar errores de DashScope
        const normalized = String(preferred_name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '') // Elimina todo lo que no sea a-z o 0-9
            .trim();
            
        // Asegurar que empiece con letra y tenga longitud válida
        let fixed = normalized;
        if (!fixed) fixed = `voz${Date.now()}`;
        if (!/^[a-z]/.test(fixed)) fixed = `v${fixed}`;
        
        // Longitud entre 3 y 20 caracteres (para estar seguros)
        fixed = fixed.slice(0, 20);
        if (fixed.length < 3) fixed = fixed.padEnd(3, 'x');

        const validPattern = /^[a-z][a-z0-9]{2,31}$/;
        if (!validPattern.test(fixed)) {
            // Fallback final si algo falla
            fixed = `voz${Date.now()}`;
        }

        let dataUri;
        if (audio_data && typeof audio_data === 'string' && audio_data.startsWith('data:')) {
            dataUri = audio_data;
        } else if (audioUrl) {
            // Download audio from URL to convert to base64
            // Note: DashScope enrollment usually requires base64 or OSS URL. Public URL support varies.
            // Safest approach is base64 for small files (< 10MB).
            console.log('[QWEN] Downloading audio from URL:', audioUrl);
            const audioResp = await fetchWithTimeout(audioUrl, {}, 45000); // Increased timeout
            if (!audioResp.ok) {
                const errText = await audioResp.text().catch(() => '');
                console.error('[QWEN] Failed to download audio from URL:', errText);
                return res.status(400).json({ error: 'No se pudo obtener el audio de referencia', details: errText });
            }
            const contentType = audioResp.headers.get('content-type') || 'audio/mpeg';
            const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
            const base64Str = audioBuffer.toString('base64');
            dataUri = `data:${contentType};base64,${base64Str}`;
        } else {
            return res.status(400).json({ error: 'Se requiere audio_data (data URI) o audioUrl válido' });
        }

        const url = 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization';
        const payload = {
            model: 'qwen-voice-enrollment',
            input: {
                action: 'create',
                target_model,
                preferred_name: fixed,
                audio: { data: dataUri }
            }
        };
        const headers = {
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json'
        };

        console.log('[QWEN] Sending enrollment request to DashScope...');
        const resp = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(payload) }, 60000);
        const textBody = await resp.text();
        
        if (!resp.ok) {
            console.error('[QWEN] DashScope Enrollment Error:', textBody);
            let details = textBody;
            try {
                const parsed = JSON.parse(textBody);
                details = parsed; // Send full object
            } catch (_) {}
            return res.status(resp.status).json({ error: 'Error al crear voz clonada en DashScope', details });
        }

        let json;
        try {
            json = JSON.parse(textBody);
        } catch (e) {
            console.error('[QWEN] Invalid JSON response:', textBody);
            return res.status(500).json({ error: 'Respuesta inválida de DashScope (JSON parse error)' });
        }

        // Check for specific DashScope error codes in success 200 response (if any)
        if (json.code && json.code !== 'Success') {
             console.error('[QWEN] DashScope Logical Error:', json);
             return res.status(500).json({ error: 'Error lógico de DashScope', details: json });
        }

        console.log('[QWEN] Voice created successfully:', json);
        const voice = json?.output?.voice;
        if (!voice) {
            console.error('[QWEN] No voice ID in response:', json);
            return res.status(500).json({ error: 'No se recibió parámetro de voz en la respuesta de DashScope', response: json });
        }
        
        res.json({ voice, target_model, preferred_name });

    } catch (error) {
        console.error('[QWEN] Voice Create Endpoint Error:', error);
        res.status(500).json({ error: 'Error interno al crear voz clonada', details: error.message });
    }
});

// Qwen TTS Endpoint (Voice Cloned Usage)
app.post('/api/qwen-tts', async (req, res) => {
    try {
        const { text, voice, speed, rate, pitch } = req.body;

        console.log('[QWEN] /api/qwen-tts called', { voice, textLength: text?.length });

        if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY === 'YOUR_QWEN_API_KEY') {
            console.error('[QWEN] API Key missing');
            return res.status(500).json({
                error: 'API Key de DashScope no configurada',
                message: 'Configura DASHSCOPE_API_KEY en variables de entorno'
            });
        }

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'El texto no puede estar vacío' });
        }
        if (!voice || (typeof voice !== 'string')) {
            return res.status(400).json({ error: 'Parámetro de voz inválido' });
        }

        // Qwen Speed: Accept 'rate' (preferred) or 'speed' (legacy/UI)
        // Range 0.5 to 2.0. Default 1.0.
        // Note: Qwen might support wider range, but keeping it safe.
        let parsedRate = 1.0;
        if (rate !== undefined) {
            parsedRate = parseFloat(rate);
        } else if (speed !== undefined) {
            parsedRate = parseFloat(speed);
        }
        
        if (isNaN(parsedRate)) parsedRate = 1.0;
        const speechRate = Math.max(0.5, Math.min(parsedRate, 2.0));
            
        // Qwen Pitch: Range 0.5 to 2.0? Documentation varies.
        // Let's stick to safe range.
        let parsedPitch = parseFloat(pitch);
        if (isNaN(parsedPitch)) parsedPitch = 1.0;
        const speechPitch = Math.max(0.5, Math.min(parsedPitch, 2.0));

        const voiceId = voice.startsWith('qwen:') ? voice.substring(5) : voice;

        // Generate natural language instructions for style control
        let styleInstruction = "";
        if (speechRate >= 1.5) {
            styleInstruction += "Speak fast. ";
        } else if (speechRate <= 0.8) {
            styleInstruction += "Speak slowly. ";
        }

        // Use the unified multimodal generation HTTP API
        // NOTE: We use qwen3-tts-vc-2026-01-22 as it matches the enrollment target model.
        const url = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
        
        // Construct payload compatible with Qwen3-TTS
        const payload = {
            model: 'qwen3-tts-vc-2026-01-22',
            input: {
                text,
                voice: voiceId,
                prompt: styleInstruction.trim() || undefined
            },
            parameters: {
                rate: speechRate,
                pitch: speechPitch
                // Removed style_instruction from parameters to avoid potential conflicts
            }
        };

        // console.log('[QWEN] Payload:', JSON.stringify(payload));

        const headers = {
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json'
            // 'X-DashScope-Async': 'enable' // Disabled: User API key does not support async calls
        };
        
        const resp = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(payload) }, 60000);
        const bodyText = await resp.text();
        
        if (!resp.ok) {
            console.error('[QWEN] DashScope TTS Error:', bodyText);
            return res.status(resp.status).json({ error: 'Error al generar audio con Qwen', dashscopeError: bodyText });
        }

        let json;
        try {
            json = JSON.parse(bodyText);
        } catch {
            return res.status(500).json({ error: 'Respuesta inválida de DashScope TTS (JSON parse error)' });
        }

        // Handle Async Response
        if (json.output && json.output.task_id) {
            console.log('[QWEN] Async task started:', json.output.task_id);
            // Poll for result
            const taskId = json.output.task_id;
            const taskUrl = `https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`;
            
            // Poll loop (max 55 seconds to stay within Vercel 60s limit)
            const startTime = Date.now();
            while (Date.now() - startTime < 55000) {
                await new Promise(r => setTimeout(r, 2000)); // Wait 2s between polls
                
                const taskResp = await fetchWithTimeout(taskUrl, { headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` } }, 10000);
                if (!taskResp.ok) {
                    console.warn('[QWEN] Task poll failed, retrying...', taskResp.status);
                    continue;
                }
                
                const taskJson = await taskResp.json();
                const status = taskJson.output?.task_status;

                if (status === 'SUCCEEDED') {
                    console.log('[QWEN] Async task succeeded');
                    // Try multiple paths for audio URL
                    const audioUrl = taskJson.output.results?.[0]?.url || 
                                     taskJson.output.audio_url || 
                                     taskJson.output.audio?.url ||
                                     taskJson.output.result?.audio_url;

                     if (audioUrl) {
                        return await downloadAndSendAudio(audioUrl, res);
                     }
                     
                     console.error('[QWEN] Audio URL not found in SUCCEEDED task:', JSON.stringify(taskJson));
                     return res.status(500).json({ error: 'Audio URL no encontrada en respuesta exitosa', details: taskJson });

                } else if (status === 'FAILED' || status === 'CANCELED') {
                     console.error('[QWEN] Async task failed:', taskJson);
                     return res.status(500).json({ error: 'Qwen TTS Async Task Failed', details: taskJson });
                } else {
                    // RUNNING, PENDING, etc. -> Continue polling
                    // console.log('[QWEN] Task status:', status);
                }
            }
            return res.status(504).json({ error: 'Timeout waiting for Qwen TTS generation (Async)' });
        }

        // Handle Sync Response (if supported)
        const audioUrl = json?.output?.url || json?.output?.audio_url || json?.output?.audio?.url;
        if (!audioUrl) {
            console.error('[QWEN] No audio URL in response:', json);
            return res.status(500).json({ error: 'URL de audio no encontrada en respuesta de DashScope', response: json });
        }
        
        await downloadAndSendAudio(audioUrl, res);

    } catch (error) {
        console.error('[QWEN] TTS Endpoint Error:', error);
        res.status(500).json({ error: 'Error interno al generar audio con Qwen', details: error.message });
    }
});

async function downloadAndSendAudio(url, res) {
    try {
        const audioResp = await fetchWithTimeout(url, {}, 60000);
        if (!audioResp.ok) {
            const errText = await audioResp.text().catch(() => '');
            console.error('[QWEN] Fetch audio URL error:', errText);
            return res.status(502).json({ error: 'No se pudo descargar el audio generado', details: errText });
        }
        const buf = Buffer.from(await audioResp.arrayBuffer());
        const mime = audioResp.headers.get('content-type') || 'audio/mpeg';
        res.set('Content-Type', mime);
        res.send(buf);
    } catch (e) {
        console.error('[QWEN] Download error:', e);
        res.status(500).json({ error: 'Error downloading audio file' });
    }
}
// Gemini Endpoint
app.post('/api/gemini', async (req, res) => {
    try {
        const { action, text, targetSeconds, targetWords } = req.body;
        const geminiApiKey = process.env.geminiApiKey || process.env.GEMINI_API_KEY;

        if (!geminiApiKey) {
            return res.status(500).json({ error: 'Gemini API Key not configured on server' });
        }

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        let prompt = '';

        switch (action) {
            case 'humanize':
                prompt = `Actúa como un redactor de noticias de radio de élite.
      
      Tu misión es reescribir el siguiente texto para ser LEÍDO EN VOZ ALTA por una IA avanzada de clonación de voz.
      
      OBJETIVO: Lograr una prosodia humana perfecta, natural y respirada.
      
      Reglas de ORO para la Humanización:
      1. PUNTUACIÓN RESPIRADA: La IA usa la puntuación para respirar.
         - Usa COMAS (,) para pausas breves y naturales dentro de la frase.
         - Usa PUNTOS (.) para pausas completas y cambios de idea.
         - EVITA frases interminables sin pausas.
      2. RITMO VARIADO: Alterna frases cortas de impacto con frases de longitud media. Evita la monotonía.
      3. LENGUAJE HABLADO: Usa un tono conversacional pero profesional. Evita construcciones pasivas complejas.
      4. NÚMEROS Y SIGLAS: 
         - Escribe TODOS los números en letras (ej: "veinte mil" en vez de "20.000").
         - Expande las siglas o sepáralas con guiones si se deletrean (ej: "O-N-U").
      5. LIMPIEZA TOTAL: 
         - ELIMINA cualquier rastro de texto web (leér más, click aquí, fuentes, fechas irrelevantes).
         - NO uses paréntesis, corchetes, asteriscos ni guiones bajos.
         - NO uses formato Markdown.
      6. SOLO LA NOTICIA: Entrega el texto limpio listo para locutar, sin saludos ni introducciones ("Aquí tienes el texto...").
      
      Texto original:
      ${text}`;
                break;

            case 'clean':
                prompt = `Actúa como un editor de corrección de estilo (proofreader) para guiones de radio.
      
      Tu tarea es REVISAR y LIMPIAR el siguiente texto que ya fue procesado por una IA.
      
      OBJETIVOS:
      1. ELIMINAR cualquier frase introductoria o de cierre que no sea parte de la noticia (ej: 'Aquí tienes la noticia', 'Claro, aquí está', 'Texto reescrito:', 'Espero que te guste', etc.).
      2. CORREGIR errores ortográficos y tipográficos (ej: 'jotel' -> 'hotel', 'policia' -> 'policía').
      3. VERIFICAR formato de radio:
         - Números deben estar en letras (ej: 'veinte' no '20').
         - Sin símbolos especiales ni markdown (*, #, [], ()).
      4. MANTENER el contenido y estilo original si es correcto. Solo limpia y corrige.
      5. RESPUESTA: ÚNICAMENTE el texto corregido. Nada más.
      
      Texto a revisar:
      ${text}`;
                break;

            case 'adjustTime':
                if (!targetSeconds) return res.status(400).json({ error: 'targetSeconds required for adjustTime' });
                const targetWordsTime = Math.round((targetSeconds * 150) / 60); // 150 words per minute
        
                prompt = `Actúa como un editor de noticias experto.
        
        Reescribe y ajusta la longitud del siguiente texto para que pueda ser leído en voz alta en aproximadamente ${targetSeconds} segundos (alrededor de ${targetWordsTime} palabras).

        Instrucciones:
        1. Si el texto es muy largo, RESUME manteniendo los puntos clave.
        2. Si el texto es muy corto, EXPANDE agregando detalles de contexto o conectores naturales, sin inventar hechos.
        3. Mantén un tono periodístico, formal pero accesible.
        4. PUNTUACIÓN RESPIRADA (CRUCIAL):
           - Usa COMAS para marcar pausas breves de respiración.
           - Usa PUNTOS para separar ideas claramente.
        5. NÚMEROS: Escríbelos en letras.
        6. NO uses formato Markdown.
        7. Objetivo de longitud: ~${targetWordsTime} palabras.
        8. CRUCIAL: Solo el texto de la noticia. NUNCA incluyas frases como "Aquí está la noticia", "Reescrito:", etc. Directo al contenido.

        Texto original:
        ${text}`;
                break;

            case 'adjustWords':
                if (!targetWords) return res.status(400).json({ error: 'targetWords required for adjustWords' });
                const currentWords = text.split(/\s+/).length;
                const minWords = Math.floor(targetWords * 0.95); // 5% margin down
                const maxWords = Math.ceil(targetWords * 1.05);  // 5% margin up

                prompt = `Actúa como un editor de noticias experto.

        OBJETIVO: Reescribir el siguiente texto para que tenga EXACTAMENTE alrededor de ${targetWords} palabras.
        
        Estado actual: ${currentWords} palabras.
        Meta: ${targetWords} palabras.

        Instrucciones:
        1. Si necesitas reducir: Resume, fusiona ideas, elimina redundancias.
        2. Si necesitas expandir: Agrega contexto, explicaciones o conectores (sin inventar datos).
        3. MANTÉN EL ESTILO DE NOTICIERO DE RADIO (fluido, hablado).
        4. PUNTUACIÓN RESPIRADA (CRUCIAL):
           - Usa COMAS para marcar pausas breves de respiración.
           - Usa PUNTOS para separar ideas claramente.
        5. NÚMEROS: Escríbelos en letras.
        6. Longitud permitida: entre ${minWords} y ${maxWords} palabras.
        7. CRUCIAL: Solo el texto de la noticia. NUNCA incluyas frases como "Aquí está la noticia", "Reescrito:", etc. Directo al contenido.

        Texto original:
        ${text}`;
                break;

            case 'humanizeAndAdjust':
                 if (!targetSeconds) return res.status(400).json({ error: 'targetSeconds required for humanizeAndAdjust' });
                 const currentWords2 = text.split(/\s+/).length;
                 const targetWords2 = Math.round((targetSeconds * 150) / 60); // 150 words per minute
                 
                 // Stricter limits to avoid overshooting (User feedback: prefers under than over)
                 const minWords2 = Math.floor(targetWords2 * 0.90); // -10%
                 const maxWords2 = targetWords2; // Hard cap at target (0% margin upwards)
         
                 const ratio = targetWords2 / currentWords2;
                 let strategyInstruction = "";
         
                 if (ratio < 0.8) {
                     strategyInstruction = `⚠️ ALERTA: DEBES REDUCIR EL TEXTO UN ${Math.round((1-ratio)*100)}%.
                     - Elimina oraciones secundarias, citas no esenciales y detalles de fondo.
                     - Fusiona párrafos.
                     - Ve directo al grano.`;
                 } else if (ratio > 1.2) {
                     strategyInstruction = `⚠️ ALERTA: DEBES EXPANDIR EL TEXTO UN ${Math.round((ratio-1)*100)}%.
                     - Agrega contexto explicativo (sin inventar noticias).
                     - Usa conectores más elaborados.
                     - Explica las implicancias de la noticia.`;
                 } else {
                     strategyInstruction = `AJUSTE FINO: El texto está cerca de la longitud deseada. Solo ajusta el estilo y fluidez.`;
                 }
         
                 prompt = `Actúa como un editor de noticias de radio experto con un CRONÓMETRO ESTRICTO.
         
                 METAS NUMÉRICAS (INVIOLABLES):
                 - Palabras actuales: ${currentWords2}
                 - OBJETIVO EXACTO: ${targetWords2} palabras.
                 - Rango permitido: ${minWords2} a ${maxWords2} palabras.
                 - TIEMPO AL AIRE: ${targetSeconds} segundos.
         
                 ESTRATEGIA REQUERIDA:
                 ${strategyInstruction}
         
                 REGLAS DE FORMATO Y PROSODIA:
                 1. LENGUAJE HABLADO: Tono natural de radio/TV.
                 2. PUNTUACIÓN RESPIRADA (CRUCIAL):
                    - Usa COMAS para marcar pausas breves de respiración.
                    - Usa PUNTOS para separar ideas claramente.
                    - Evita frases largas sin aire.
                 3. NÚMEROS: Escríbelos en letras ("veinte mil").
                 4. LIMPIEZA: Texto plano sin markdown, sin introducciones.
                 5. JAMÁS excedas de ${maxWords2} palabras. Es mejor quedarse corto que pasarse.
                 6. CRUCIAL: Solo el texto de la noticia. NUNCA incluyas frases como "Aquí está la noticia", "Reescrito:", etc. Directo al contenido.
         
                 Texto original:
                 ${text}`;
                break;

            default:
                return res.status(400).json({ error: 'Invalid action' });
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const generatedText = response.text();

        res.json({ result: generatedText });

    } catch (error) {
        console.error('Gemini API Error:', error);
        
        // Detect specific Google API configuration errors
        if (error.message && error.message.includes('API_KEY_HTTP_REFERRER_BLOCKED')) {
            return res.status(500).json({ 
                error: 'Configuración incorrecta de API Key: Por favor elimina las restricciones de "Sitios web" (HTTP Referrer) en la consola de Google. Al usar la API desde el servidor, estas restricciones bloquean la petición.' 
            });
        }
        
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Gemini TTS Endpoint
app.post('/api/gemini-tts', async (req, res) => {
    try {
        const { text, voice, speed, pitch } = req.body;
        const geminiApiKey = process.env.geminiApiKey || process.env.GEMINI_API_KEY;

        if (!geminiApiKey) {
            return res.status(500).json({ error: 'Gemini API Key not configured on server' });
        }

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);
        // Use preview model for TTS as per original code
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.0-flash-exp', // Updated model name for better performance/stability
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: voice || "Puck",
                    },
                  },
                },
            }
        });

        // Construct prompt with instructions
        const speedDesc = (speed || 1) < 0.8 ? "muy lenta" : (speed || 1) < 1.0 ? "lenta" : (speed || 1) > 1.5 ? "muy rápida" : (speed || 1) > 1.2 ? "rápida" : "normal";
        const pitchDesc = (pitch || 1) < -5 ? "muy grave" : (pitch || 1) < 0 ? "grave" : (pitch || 1) > 5 ? "muy aguda" : (pitch || 1) > 0 ? "aguda" : "neutra";
        
        const textPrompt = `
        Instrucciones:
        - Idioma: Español.
        - Acento: Fuertemente CHILENO (usa modismos si aplica).
        - Velocidad: ${speedDesc}.
        - Tono: ${pitchDesc}.
        - Efectos: Interpreta [risa], [grito], [llanto], [pausa] (silencio 2s) como acciones sonoras, NO leas las etiquetas.
        
        Di lo siguiente:
        ${text}
        `;

        const result = await model.generateContent({
            contents: [{ parts: [{ text: textPrompt }] }],
        });

        const response = await result.response;
        
        // Extract audio data
        // The structure depends on the library version, but typically it's in candidates[0].content.parts[0].inlineData
        // However, the library helper might provide it differently.
        // Let's check how the library returns it. 
        // Based on documentation, we might need to handle the response carefully.
        
        // For server-side generation, we might receive base64 or buffer.
        // Let's try to get the audio content.
        
        if (!response.candidates || !response.candidates[0] || !response.candidates[0].content || !response.candidates[0].content.parts || !response.candidates[0].content.parts[0].inlineData) {
             throw new Error("No audio generated in response");
        }
        
        const audioData = response.candidates[0].content.parts[0].inlineData.data;
        const mimeType = response.candidates[0].content.parts[0].inlineData.mimeType || 'audio/wav';

        // Convert base64 to buffer
        const buffer = Buffer.from(audioData, 'base64');

        res.set('Content-Type', mimeType);
        res.send(buffer);

    } catch (error) {
        console.error('Gemini TTS API Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
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

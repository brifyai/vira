import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { sources } = await req.json();

        if (!sources || !Array.isArray(sources) || sources.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'No sources provided' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get active sources
        const { data: sourcesData, error: sourcesError } = await supabase
            .from('news_sources')
            .select('*')
            .in('id', sources)
            .eq('is_active', true);

        if (sourcesError) {
            console.error('Error fetching sources:', sourcesError);
            throw sourcesError;
        }

        if (!sourcesData || sourcesData.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'No active sources found' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        const scrapingBeeApiKey = Deno.env.get('SCRAPINGBEE_API_KEY');
        if (!scrapingBeeApiKey) {
            throw new Error('SCRAPINGBEE_API_KEY not configured');
        }

        const scrapedNews: any[] = [];

        // Scrape each source
        for (const source of sourcesData) {
            try {
                console.log(`Scraping source: ${source.name} (${source.url})`);

                const response = await fetch(
                    `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(source.url)}&render_js=true`
                );

                if (!response.ok) {
                    console.error(`Failed to scrape ${source.name}:`, response.status, response.statusText);
                    continue;
                }

                const html = await response.text();

                // Simple extraction - in production, you'd use a proper HTML parser
                // For now, we'll create a simulated news item
                const newsItem = {
                    title: `Noticia de ${source.name} - ${new Date().toLocaleString('es-ES')}`,
                    content: `Contenido extraído de ${source.name}. Esta es una noticia generada automáticamente desde la fuente ${source.url}.`,
                    summary: `Resumen de noticia de ${source.name}`,
                    original_url: source.url,
                    image_url: null,
                    published_at: new Date().toISOString(),
                    scraped_at: new Date().toISOString(),
                    is_processed: false,
                    is_selected: false,
                    source_id: source.id,
                    source_name: source.name,
                    category: source.category
                };

                scrapedNews.push(newsItem);
                console.log(`Successfully scraped ${source.name}`);
            } catch (error) {
                console.error(`Error scraping ${source.name}:`, error);
                continue;
            }
        }

        // Insert scraped news into database
        if (scrapedNews.length > 0) {
            const { error: insertError } = await supabase
                .from('scraped_news')
                .insert(scrapedNews);

            if (insertError) {
                console.error('Error inserting scraped news:', insertError);
                throw insertError;
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                count: scrapedNews.length,
                message: `Successfully scraped ${scrapedNews.length} news items`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Error in scrape function:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});

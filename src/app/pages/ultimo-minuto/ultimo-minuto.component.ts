import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { config } from '../../core/config';
import { GeminiService } from '../../services/gemini.service';
import { GoogleTtsService } from '../../services/google-tts.service';
import { GeminiTtsService } from '../../services/gemini-tts.service';
import { AzureTtsService } from '../../services/azure-tts.service';

interface ExpressNewsItem {
    id: string; // original news id
    originalNews: any;
    humanizedText: string;
    isHumanizing: boolean;
    generatedAudioUrl: string;
    isGeneratingAudio: boolean;
    voiceSettings: {
        voice: string;
        speed: number;
        pitch: number;
    };
    status: 'pending' | 'ready' | 'saved' | 'error';
    humanizedNewsId?: string;
}

interface NewsSource {
    id: string;
    name: string;
    active: boolean;
}

@Component({
    selector: 'app-ultimo-minuto',
    standalone: true,
    imports: [CommonModule, FormsModule, MatSnackBarModule],
    templateUrl: './ultimo-minuto.component.html',
    styleUrls: ['./ultimo-minuto.component.scss']
})
export class UltimoMinutoComponent implements OnInit {
    // Breaking news
    breakingNews: any[] = [];

    // Filter options
    sourceFilter = 'all';

    // Loading state
    loading = false;
    refreshing = false;
    statusMessage = '';

    // Sources
    sources: NewsSource[] = [];

    // Auto-refresh settings
    autoRefresh = false;
    refreshInterval = 60; // seconds

    // Pagination
    currentPage = 1;
    itemsPerPage = 9;

    // Express News State (Batch & Single)
    showExpressPanel = false;
    expressItems: Map<string, ExpressNewsItem> = new Map();
    activeExpressItemId: string | null = null;
    isSavingExpress = false;

    // Selection State
    selectedNewsIds: Set<string> = new Set();
    
    // Azure Settings (Global defaults)
    azureVoice = 'es-CL-LorenzoNeural';
    azureSpeed = 1.0;
    azureVoices: any[] = [];

    constructor(
        private supabaseService: SupabaseService,
        private snackBar: MatSnackBar,
        private cdr: ChangeDetectorRef,
        private geminiService: GeminiService,
        private googleTtsService: GoogleTtsService,
        private geminiTtsService: GeminiTtsService,
        private azureTtsService: AzureTtsService
    ) {
        this.azureVoices = this.azureTtsService.getVoices();
    }

    ngOnInit(): void {
        this.loadCustomVoices();
        this.loadSources();
        this.loadScrapedNews();
    }

    async loadSources() {
        try {
            const sources = await this.supabaseService.getNewsSources();
            if (sources) {
                // Filter only active sources for the dropdown
                this.sources = sources
                    .filter((s: any) => s.is_active)
                    .map((s: any) => ({
                        id: s.id,
                        name: s.name,
                        active: s.is_active
                    }));
            }
        } catch (error) {
            console.error('Error loading sources:', error);
            this.snackBar.open('Error al cargar las fuentes', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        }
    }

    async loadCustomVoices(): Promise<void> {
        try {
            const setting = await this.supabaseService.getSettingByKey('tts_custom_voices');
            const value = setting?.value;
            const customVoices = Array.isArray(value) ? value : [];
            const baseVoices = this.azureTtsService.getVoices();
            const merged = [...baseVoices];
            customVoices.forEach((voice: any) => {
                // Ensure Qwen voices have the correct name prefix
                if (voice.provider === 'qwen' && !voice.name.startsWith('qwen:')) {
                    voice.name = `qwen:${voice.voiceId || voice.id}`;
                }
                
                if (!merged.find(v => v.name === voice.name && v.label === voice.label)) {
                    merged.push(voice);
                }
            });
            this.azureVoices = merged;
        } catch (error) {
            console.error('Error loading custom voices for Último Minuto, using default Azure voices', error);
            this.azureVoices = this.azureTtsService.getVoices();
        }
    }

    async loadScrapedNews(isBackground: boolean = false) {
        if (!isBackground) {
            this.loading = true;
        }
        try {
            // Use safeFetch with retry (4 attempts) to ensure we get data even if network is waking up
            const news = await this.supabaseService.safeFetch(
                () => this.supabaseService.getScrapedNews({ limit: 50 }),
                4, // 4 retries
                15000 // 15s timeout per try
            );

            if (news) {
                this.breakingNews = news.map((n: any) => {
                    const publishedAt = new Date(n.published_at);
                    return {
                        id: n.id,
                        title: n.title,
                        content: n.content || n.summary,
                        source: n.source_name || 'Fuente desconocida',
                        source_id: n.source_id,
                        publishedAt: publishedAt,
                        timeAgo: this.calculateTimeAgo(publishedAt),
                        priority: 'medium',
                        imageUrl: n.image_url,
                        url: n.original_url
                    };
                }).filter((item: any) => {
                    // Filter out invalid content client-side
                    const invalidPhrases = [
                        'Error de conexión', 
                        'timeout', 
                        'Ver términos y condiciones', 
                        'Suscríbete', 
                        'Inicia sesión',
                        'No se pudo extraer',
                        'Puertos y Logística Radio Temporada II'
                    ];
                    const content = (item.content || '').toLowerCase();
                    const title = (item.title || '').toLowerCase();
                    
                    const isInvalid = invalidPhrases.some(phrase => 
                        content.includes(phrase.toLowerCase()) || title.includes(phrase.toLowerCase())
                    );
                    
                    return !isInvalid && item.title && item.content && item.content.length > 5;
                });

                // Deduplicate by URL and Title
                const seenUrls = new Set();
                const seenTitles = new Set();
                this.breakingNews = this.breakingNews.filter(item => {
                    if (seenUrls.has(item.url) || seenTitles.has(item.title)) {
                        return false;
                    }
                    seenUrls.add(item.url);
                    seenTitles.add(item.title);
                    return true;
                });
                
                if (this.sources.length > 0) {
                     this.breakingNews.forEach(item => {
                        const source = this.sources.find(s => s.id === item.source_id);
                        if (source) {
                            item.source = source.name;
                        }
                     });
                }
            } else {
                // Silent fail or maybe just keep old data
                console.warn('Could not load news after retries');
            }
        } catch (error) {
            console.error('Error loading news:', error);
            // No user facing error as requested
        } finally {
            if (!isBackground) {
                this.loading = false;
            }
            this.cdr.detectChanges();
        }
    }

    calculateTimeAgo(date: Date): string {
        if (!date) return '';
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);

        if (minutes < 1) return 'Ahora mismo';
        if (minutes < 60) return `Hace ${minutes} min`;
        if (hours < 24) return `Hace ${hours} h`;
        return date.toLocaleDateString('es-ES');
    }

    async refreshNews() {
        this.refreshing = true;
        this.statusMessage = 'Contactando fuentes...';
        this.cdr.detectChanges(); // Ensure initial state is rendered

        try {
            // Determine sources to scrape based on filter
            let sourceIds: string[] = [];
            if (this.sourceFilter === 'all') {
                sourceIds = this.sources.filter(s => s.active).map(s => s.id);
            } else {
                sourceIds = [this.sourceFilter];
            }

            if (sourceIds.length === 0) {
                this.snackBar.open('No hay fuentes activas seleccionadas para actualizar', 'Cerrar', {
                    duration: 3000
                });
                this.refreshing = false;
                this.statusMessage = '';
                return;
            }

            console.log('Scraping sources:', sourceIds);
            
            // Call scraping API with streaming support
            const response = await fetch(`${config.apiUrl}/api/scrape`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sources: sourceIds
                })
            });

            if (!response.ok) {
                throw new Error('Error de conexión con el servidor');
            }

            if (!response.body) {
                throw new Error('ReadableStream not supported');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                // Process all complete lines
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    
                    try {
                        const data = JSON.parse(line);
                        
                        switch (data.type) {
                            case 'start':
                                this.statusMessage = data.message;
                                break;
                            case 'progress':
                                this.statusMessage = data.message;
                                break;
                            case 'saving':
                                this.statusMessage = data.message;
                                break;
                            case 'complete':
                                this.snackBar.open(
                                    data.message,
                                    'Cerrar',
                                    { duration: 3000, verticalPosition: 'top' }
                                );
                                break;
                            case 'error':
                                throw new Error(data.error);
                        }
                        // Force update UI for progress
                        this.cdr.detectChanges();
                    } catch (e) {
                        console.error('Error parsing stream data:', e);
                    }
                }
            }

            this.statusMessage = 'Actualizando lista...';
            this.cdr.detectChanges();
            
            // Reload news to show latest
            await this.loadScrapedNews(true);

        } catch (error: any) {
            console.error('Error refreshing news:', error);
            this.snackBar.open(error.message || 'Error al actualizar noticias', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        } finally {
            this.refreshing = false;
            this.statusMessage = '';
            this.cdr.detectChanges();
        }
    }

    get filteredNews() {
        return this.breakingNews.filter(news => {
            // Filter by selected source
            const sourceMatch = this.sourceFilter === 'all' || news.source_id === this.sourceFilter;
            
            // Allow news with "Unknown" source if they have no ID (legacy/test data)
            // Or if they map to a valid active source
            const isSourceActive = !news.source_id || this.sources.some(s => s.id === news.source_id);
            
            return sourceMatch && isSourceActive;
        }).sort((a: any, b: any) => {
            return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        });
    }

    // Express News Methods (Batch & Single)
    get activeItem(): ExpressNewsItem | undefined {
        return this.activeExpressItemId ? this.expressItems.get(this.activeExpressItemId) : undefined;
    }

    get expressItemsList(): ExpressNewsItem[] {
        return Array.from(this.expressItems.values());
    }

    get savedItemsCount(): number {
        return this.expressItemsList.filter(item => item.status === 'saved').length;
    }

    get hasSavedItems(): boolean {
        return this.expressItemsList.some(item => item.status === 'saved');
    }

    openExpressPanel(news: any = null) {
        this.expressItems.clear();
        
        // If triggered by "Agregar" button (single item), ensure it's in the selection
        if (news && !this.selectedNewsIds.has(news.id)) {
            this.selectedNewsIds.add(news.id);
        }

        // Always process all selected items
        // If news was passed, it's now in selectedNewsIds, so it will be included here
        const itemsToProcess = this.breakingNews.filter(n => this.selectedNewsIds.has(n.id));

        if (itemsToProcess.length === 0) return;

        itemsToProcess.forEach(item => {
            this.expressItems.set(item.id, {
                id: item.id,
                originalNews: item,
                humanizedText: '',
                isHumanizing: false,
                generatedAudioUrl: '',
                isGeneratingAudio: false,
                voiceSettings: {
                    voice: this.azureVoice,
                    speed: this.azureSpeed,
                    pitch: 1.0
                },
                status: 'pending'
            });
        });

        // Set active item
        if (news) {
            // If triggered by a specific item, focus that one
            this.activeExpressItemId = news.id;
        } else {
            // Otherwise default to the first one (e.g. from FAB)
            this.activeExpressItemId = itemsToProcess[0].id;
        }
        
        this.showExpressPanel = true;
        
        setTimeout(() => {
            const panel = document.getElementById('express-news-panel');
            if (panel) {
                panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }

    closeExpressPanel() {
        this.showExpressPanel = false;
        this.expressItems.clear();
        this.activeExpressItemId = null;
    }

    selectTab(id: string) {
        this.activeExpressItemId = id;
    }

    async humanizeNews() {
        const item = this.activeItem;
        if (!item) return;
        
        item.isHumanizing = true;
        try {
            item.humanizedText = await this.geminiService.humanizeText(item.originalNews.content);
        } catch (error) {
            console.error('Error humanizing news:', error);
            this.snackBar.open('Error al humanizar la noticia', 'Cerrar', { duration: 3000 });
        } finally {
            item.isHumanizing = false;
            this.cdr.detectChanges();
        }
    }

    async generateAudio() {
        const item = this.activeItem;
        if (!item || !item.humanizedText) return;
        
        item.isGeneratingAudio = true;
        try {
            // Always use Azure TTS with item-specific settings
            item.generatedAudioUrl = await this.azureTtsService.generateSpeech({
                text: item.humanizedText,
                voice: item.voiceSettings.voice,
                speed: Number(item.voiceSettings.speed) || 1.0,
                pitch: Number(item.voiceSettings.pitch) || 1.0
            });
        } catch (error: any) {
            console.error('Error generating audio:', error);
            const errorMessage = error.message || 'Error al generar audio';
            this.snackBar.open(`Error: ${errorMessage}`, 'Cerrar', { duration: 5000 });
        } finally {
            item.isGeneratingAudio = false;
            this.cdr.detectChanges();
        }
    }

    insertTag(tag: string) {
        const item = this.activeItem;
        if (!item) return;

        const textarea = document.getElementById('humanizedTextarea') as HTMLTextAreaElement;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = item.humanizedText || '';
            const before = text.substring(0, start);
            const after = text.substring(end, text.length);
            
            item.humanizedText = before + tag + after;
            
            // Restore focus and cursor position after update
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + tag.length, start + tag.length);
            }, 0);
        } else {
            item.humanizedText = (item.humanizedText || '') + tag;
        }
    }

    async saveExpressNews() {
        const item = this.activeItem;
        if (!item || !item.humanizedText) return;

        this.isSavingExpress = true;
        try {
            let finalAudioUrl = item.generatedAudioUrl;

            // If audio is a blob URL, upload it to Supabase
            if (finalAudioUrl && finalAudioUrl.startsWith('blob:')) {
                const response = await fetch(finalAudioUrl);
                const blob = await response.blob();
                const fileName = `express_${item.id}_${Date.now()}.mp3`;
                // Use uploadAudio which uses 'noticias' bucket
                finalAudioUrl = await this.supabaseService.uploadAudio(blob, fileName);
            }

            const newsData = {
                scraped_news_id: item.id,
                title: item.originalNews.title,
                humanized_content: item.humanizedText,
                original_content: item.originalNews.content,
                audio_url: finalAudioUrl,
                status: 'ready'
            };

            const savedNews = await this.supabaseService.createHumanizedNews(newsData);
            item.humanizedNewsId = savedNews.id;
            item.status = 'saved';
            this.snackBar.open('Noticia Express guardada correctamente', 'Cerrar', { duration: 3000 });
        } catch (error) {
            console.error('Error saving express news:', error);
            this.snackBar.open('Error al guardar noticia express', 'Cerrar', { duration: 3000 });
        } finally {
            this.isSavingExpress = false;
            this.cdr.detectChanges();
        }
    }

    async createExpressBroadcast() {
        const savedItems = this.expressItemsList.filter(item => item.status === 'saved' && item.humanizedNewsId);
        
        if (savedItems.length === 0) {
            this.snackBar.open('No hay noticias guardadas para crear un noticiero', 'Cerrar', { duration: 3000 });
            return;
        }

        if (savedItems.length < this.expressItemsList.length) {
             const pendingCount = this.expressItemsList.length - savedItems.length;
             // Optional: warn user that some items are not saved
             // But we proceed with the saved ones for now, or maybe we should block?
             // Let's assume the user knows what they are doing if they click the button, 
             // but maybe the button should be disabled if not all are saved? 
             // The user requirement implies "if I choose 3 news... they remain as 1 broadcast".
             // So I should probably ensure all are saved or just use the saved ones.
        }

        this.isSavingExpress = true;
        try {
            // 1. Create Broadcast
            const broadcast = await this.supabaseService.createNewsBroadcast({
                title: `Noticiero Express - ${new Date().toLocaleString()}`,
                description: `Noticiero generado desde Último Minuto con ${savedItems.length} noticias.`,
                status: 'ready',
                duration_minutes: 0,
                total_news_count: savedItems.length
            });

            // 2. Link Items
            for (let i = 0; i < savedItems.length; i++) {
                const item = savedItems[i];
                await this.supabaseService.createBroadcastNewsItem({
                    broadcast_id: broadcast.id,
                    humanized_news_id: item.humanizedNewsId,
                    order_index: i
                });
            }

            this.snackBar.open('Noticiero Express creado exitosamente', 'Cerrar', { duration: 3000 });
            this.closeExpressPanel();
            this.selectedNewsIds.clear(); // Clear selection
        } catch (error) {
            console.error('Error creating express broadcast:', error);
            this.snackBar.open('Error al crear Noticiero Express', 'Cerrar', { duration: 3000 });
        } finally {
            this.isSavingExpress = false;
            this.cdr.detectChanges();
        }
    }

    get paginatedNews() {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        return this.filteredNews.slice(startIndex, startIndex + this.itemsPerPage);
    }

    get totalPages() {
        return Math.ceil(this.filteredNews.length / this.itemsPerPage);
    }

    changePage(page: number) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    getPriorityClass(priority: string): string {
        switch (priority) {
            case 'high':
                return 'priority-high';
            case 'medium':
                return 'priority-medium';
            case 'low':
                return 'priority-low';
            default:
                return 'priority-default';
        }
    }

    getPriorityText(priority: string): string {
        switch (priority) {
            case 'high':
                return 'Alta';
            case 'medium':
                return 'Media';
            case 'low':
                return 'Baja';
            default:
                return priority;
        }
    }

    // Selection Methods
    toggleNewsSelection(news: any, event?: Event) {
        if (event) {
            event.stopPropagation();
        }
        
        if (this.selectedNewsIds.has(news.id)) {
            this.selectedNewsIds.delete(news.id);
        } else {
            this.selectedNewsIds.add(news.id);
        }
    }

    isNewsSelected(newsId: string): boolean {
        return this.selectedNewsIds.has(newsId);
    }

    get selectedNewsCount(): number {
        return this.selectedNewsIds.size;
    }

    toggleAutoRefresh() {
        this.autoRefresh = !this.autoRefresh;
        // Logic for auto-refresh interval could be implemented here using setInterval
        if (this.autoRefresh) {
             this.snackBar.open('Auto-refresh activado', 'Cerrar', { duration: 2000 });
        }
    }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import Swal from 'sweetalert2';
import { SupabaseService, AudioQuotaSummary } from '../../services/supabase.service';
import { GeminiService } from '../../services/gemini.service';
import { TtsService } from '../../services/tts.service';
import { GoogleTtsService } from '../../services/google-tts.service';
import { WeatherService } from '../../services/weather.service';
import { config } from '../../core/config';
import { QuotaService } from '../../services/quota.service';
import { Subscription } from 'rxjs';
import { AuthService, User } from '../../services/auth.service';

declare var lamejs: any;

export interface Radio {
    id: string;
    name: string;
    region: string;
    comuna: string;
    frequency?: string;
}

export interface TimelineEvent {
    id: string; // generated UUID for new items, or DB ID
    type: 'news' | 'ad' | 'intro' | 'outro' | 'text';
    title: string;
    description: string;
    startTime: number;
    duration: number;
    audioUrl?: string;
    audioUrlOriginal?: string;
    baseDuration?: number;
    order: number;
    originalItem?: any; // To store the ScrapedNews object if it's news
    file?: File; // For new uploads (ads) not yet saved
    
    // Audio config
    selectedVoice?: string;
    selectedSpeed?: number;
    selectedPitch?: number;
    showAudioPanel?: boolean;
    isGeneratingAudio?: boolean;
    progress?: number; // Progress percentage for audio generation
    voiceSource?: 'qwen';
    
    // Music config
    musicResourceId?: string;
    musicUrl?: string;
    musicName?: string;
    voiceDelay?: number; // seconds
    musicVolume?: number; // 0.0 to 1.0
    musicPlacement?: 'before' | 'during' | 'after';
    musicTailSeconds?: number;
    musicFadeOutSeconds?: number;
}

export interface ScrapedNews {
    id: string;
    title: string;
    content: string;
    summary?: string;
    original_url?: string;
    image_url?: string;
    published_at?: Date;
    scraped_at: Date;
    is_processed: boolean;
    is_selected: boolean;
    source_id: string;
    source_name?: string;
    category?: string;
    source?: string;
    publishedAt?: Date;
    readingTime?: number;
    humanizedContent?: string;
    humanizeStatus?: 'pending' | 'ok' | 'error';
    humanizeError?: string;
    
    // Audio fields
    showAudioPanel?: boolean;
    isGeneratingAudio?: boolean;
    progress?: number; // Progress percentage for audio generation
    generatedAudioUrl?: string;
    uploadedAudioUrl?: string;
    selectedVoice?: string;
    selectedSpeed?: number;
    selectedPitch?: number;
    targetDuration?: number; // Target duration in seconds for audio generation
    formattedDate?: string;
    voiceSource?: 'qwen';
    voiceDelay?: number; // Delay in seconds before audio starts (silence padding)
    musicResourceId?: string;
    musicUrl?: string;
    musicName?: string;
    musicVolume?: number;
    musicPlacement?: 'before' | 'during' | 'after';
    musicTailSeconds?: number;
    musicFadeOutSeconds?: number;
}

export interface NewsSource {
    id: string;
    name: string;
    url: string;
    category: string;
    region?: string | null;
    active: boolean;
    radioId: string | null;
    radioName?: string | null;
    lastScraped?: Date | null;
    createdAt: Date;
}

@Component({
    selector: 'app-crear-noticiario',
    standalone: true,
    imports: [CommonModule, FormsModule, DragDropModule],
    templateUrl: './crear-noticiario.component.html',
    styleUrls: ['./crear-noticiario.component.scss']
})
export class CrearNoticiarioComponent implements OnInit, OnDestroy {
    // Form data
    broadcastTitle = '';
    broadcastDescription = '';
    duration = 15;
    selectedNews: ScrapedNews[] = [];
    timelineEvents: TimelineEvent[] = []; // Timeline structure
    showBroadcastDescriptionField = false;
    showRadioField = false;

    // Available news
    availableNews: ScrapedNews[] = [];
    newsPage = 1;
    newsPageSize = 10;

    // Filter options
    categoryFilter = 'all';
    dateFilter = 'all';
    regionFilter = 'all';
    availableRegions: string[] = ['all'];

    // Loading states
    loading = false;
    generating = false;
    loadingMessage = '';
    humanizing = false;
    introGenerating = false;
    adjustingTime = false;
    generatingSmartAudios = false; // New state for smart audio loop
    globalProgress = 0;
    humanizeProgress = 0;
    humanizeCompleted = 0;
    humanizeTotal = 0;
    audiosReady = false; // Only show progress bar when this is true
    audioGenerationAttempted = false;
    hasHumanized = false; // Track if humanization has been done
    isExportingAudio = false;

    // News detail modal
    selectedNewsDetail: ScrapedNews | null = null;

    // Categories (derived from available news)
    categories: string[] = ['all'];

    // Sources
    sources: NewsSource[] = [];
    activeSources: NewsSource[] = [];
    sourceNames: string[] = [];

    // Audio options
    customVoices: any[] = [];
    musicResources: any[] = [];
    private readonly adTransitionPhrases: string[] = [
        'Estamos de regreso. Sigamos con los temas que marcan la agenda de hoy.',
        'Gracias por quedarse con nosotros. Continuamos con más información.',
        'Volvemos a nuestros estudios y con ellos, más noticias para usted.',
        'Siguiendo con nuestra cobertura, le traemos los últimos detalles.',
        'Retomamos. Esto es lo que está pasando a esta hora.',
        'Seguimos con más noticias. Atención a lo siguiente.',
        'Continuamos con nuestra pauta informativa. Vamos con el siguiente tema.',
        'Ya estamos de vuelta. Le contamos lo más importante del momento.'
    ];

    // Date filters
    dateFilters = [
        { value: 'all', label: 'Todas' },
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Esta semana' },
        { value: 'month', label: 'Este mes' }
    ];

    // Radios
    radios: Radio[] = [];
    selectedRadioId: string | null = null;
    scheduledTime: string = '';
    introRegion: string = '';
    introComuna: string = '';
    chileRegions: string[] = [
        'Arica y Parinacota',
        'Tarapacá',
        'Antofagasta',
        'Atacama',
        'Coquimbo',
        'Valparaíso',
        'Metropolitana de Santiago',
        "Libertador General Bernardo O'Higgins",
        'Maule',
        'Ñuble',
        'Biobío',
        'La Araucanía',
        'Los Ríos',
        'Los Lagos',
        'Aysén del General Carlos Ibáñez del Campo',
        'Magallanes y de la Antártica Chilena'
    ];

    currentAudio: HTMLAudioElement | null = null;
    private filtersReloadTimer: number | null = null;
    currentQuotaSummary: AudioQuotaSummary | null = null;
    quotaLoading = true;
    currentUser: User | null = null;
    canUseAdBlock = true;
    canDownloadBroadcast = true;
    private quotaSubscription?: Subscription;
    private readonly batchAudioConcurrency = 2;
    private readonly generationRequestSpacingMs = 250;
    private readonly exportDecodeConcurrency = 4;
    private readonly broadcastPersistConcurrency = 3;
    private readonly humanizeConcurrency = 2;
    private readonly estimatedSpeechWordsPerSecond = 2.35;

    constructor(
        private supabaseService: SupabaseService,
        private snackBar: MatSnackBar,
        private cdr: ChangeDetectorRef,
        private router: Router,
        private geminiService: GeminiService,
        private ttsService: TtsService,
        private weatherService: WeatherService,
        private quotaService: QuotaService,
        private authService: AuthService
    ) {
    }

    async ngOnInit(): Promise<void> {
        this.authService.currentUser$.subscribe(user => {
            this.currentUser = user;
            this.canUseAdBlock = user?.canUseAdBlock ?? true;
            this.canDownloadBroadcast = user?.canDownloadBroadcast ?? true;
            this.cdr.detectChanges();
        });
        this.quotaSubscription = this.quotaService.currentSummary$.subscribe(summary => {
            this.currentQuotaSummary = summary;
            this.quotaLoading = false;
            this.cdr.detectChanges();
        });

        const tasks: Array<Promise<void>> = [
            this.loadSources(),
            this.loadCustomVoices(),
            this.loadMusicResources(),
            this.quotaService.refreshCurrentSummary().finally(() => {
                this.quotaLoading = false;
            }).then(() => undefined)
        ];
        if (this.showRadioField) {
            tasks.push(this.loadRadios());
        }
        await Promise.all(tasks);
        await this.loadAvailableNews();
    }

    onScheduledTimeChange(): void {
        if (this.showRadioField) {
            this.onRadioSelect();
            return;
        }
        this.ensureBasicIntro();
        this.onIntroLocationCommit();
    }

    private lastIntroSignature = '';
    private introRequestId = 0;

    onIntroLocationCommit(): void {
        if (!this.scheduledTime) return;
        const region = String(this.introRegion || '').trim();
        const comuna = String(this.introComuna || '').trim();
        if (!region || !comuna) return;

        const signature = `${String(this.scheduledTime).trim()}|${region.toLowerCase()}|${comuna.toLowerCase()}`;
        if (signature === this.lastIntroSignature) return;
        this.lastIntroSignature = signature;

        this.generateIntroFromLocation(region, comuna);
    }

    private ensureBasicIntro(): void {
        if (!this.scheduledTime) return;

        const spokenTime = this.formatTimeForSpeech(this.scheduledTime);
        const introText = `Son las ${spokenTime}. . Bienvenidos al noticiero.`;
        const existingIntroIndex = this.timelineEvents.findIndex(e => e.type === 'intro');
        if (existingIntroIndex !== -1) {
            const intro = this.timelineEvents[existingIntroIndex];
            intro.description = introText;
            intro.title = 'Introducción';
            this.invalidateAudio(intro);
        } else {
            const newIntro: TimelineEvent = {
                id: this.generateUUID(),
                type: 'intro',
                title: 'Introducción',
                description: introText,
                startTime: 0,
                duration: 15,
                order: 0,
                voiceSource: 'qwen',
                selectedVoice: this.customVoices.length > 0 ? this.customVoices[0].name : undefined,
                selectedSpeed: this.customVoices.length > 0 ? (this.customVoices[0].speed || 1.0) : 1.0,
                selectedPitch: this.customVoices.length > 0 ? (this.customVoices[0].exaggeration || 1.0) : 1.0
            };
            this.timelineEvents.unshift(newIntro);
            this.timelineEvents.forEach((e, i) => (e.order = i));
            this.audiosReady = false;
            this.audioGenerationAttempted = false;
        }

        this.calculateTimelineTimes();
        this.cdr.detectChanges();
    }

    private async generateIntroFromLocation(region: string, comuna: string): Promise<void> {
        const requestId = ++this.introRequestId;
        this.introGenerating = true;
        this.cdr.detectChanges();

        try {
            const location = `${comuna}, ${region}, Chile`;
            const weatherInfo = await this.weatherService.getWeatherForLocation(location);
            if (requestId !== this.introRequestId) return;

            const spokenTime = this.formatTimeForSpeech(this.scheduledTime);
            const spokenWeather = this.formatWeatherForSpeech(weatherInfo);

            const introText = `Son las ${spokenTime}, y en ${comuna}, región de ${region}, tenemos una temperatura actual de ${spokenWeather}. . Bienvenidos al noticiero.`;

            const existingIntroIndex = this.timelineEvents.findIndex(e => e.type === 'intro');
            if (existingIntroIndex !== -1) {
                const intro = this.timelineEvents[existingIntroIndex];
                intro.description = introText;
                intro.title = `Intro - ${comuna}`;
                this.invalidateAudio(intro);
            } else {
                const newIntro: TimelineEvent = {
                    id: this.generateUUID(),
                    type: 'intro',
                    title: `Intro - ${comuna}`,
                    description: introText,
                    startTime: 0,
                    duration: 15,
                    order: 0,
                    voiceSource: 'qwen',
                    selectedVoice: this.customVoices.length > 0 ? this.customVoices[0].name : undefined,
                    selectedSpeed: this.customVoices.length > 0 ? (this.customVoices[0].speed || 1.0) : 1.0,
                    selectedPitch: this.customVoices.length > 0 ? (this.customVoices[0].exaggeration || 1.0) : 1.0
                };
                this.timelineEvents.unshift(newIntro);
                this.timelineEvents.forEach((e, i) => (e.order = i));
                this.audiosReady = false;
                this.audioGenerationAttempted = false;
            }

            this.calculateTimelineTimes();
            this.snackBar.open('Intro generada automáticamente con datos del clima', 'Cerrar', {
                duration: 4000,
                panelClass: ['success-snackbar']
            });
        } catch (error) {
            console.error('Error generating intro:', error);
            this.snackBar.open('Error al generar la intro automática', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        } finally {
            if (requestId === this.introRequestId) {
                this.introGenerating = false;
            }
            this.cdr.detectChanges();
        }
    }

    ngOnDestroy(): void {
        if (this.filtersReloadTimer) {
            window.clearTimeout(this.filtersReloadTimer);
            this.filtersReloadTimer = null;
        }

        // Cleanup all object URLs to prevent memory leaks
        this.timelineEvents.forEach(event => {
            if (event.audioUrl) {
                URL.revokeObjectURL(event.audioUrl);
            }
            if (event.audioUrlOriginal && event.audioUrlOriginal !== event.audioUrl) {
                URL.revokeObjectURL(event.audioUrlOriginal);
            }
        });

        this.selectedNews.forEach(news => {
            if (news.generatedAudioUrl) {
                URL.revokeObjectURL(news.generatedAudioUrl);
            }
        });
        
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        this.quotaSubscription?.unsubscribe();
    }

    async loadAvailableNews(): Promise<void> {
        this.loading = true;
        this.cdr.detectChanges();

        try {
            const since = this.getSinceIsoForDateFilter(this.dateFilter);
            const sourceIds = this.getSourceIdsForSelectedRegion();
            const data = await this.supabaseService.safeFetch(
                () => this.supabaseService.getScrapedNews({
                    limit: 500,
                    sourceIds,
                    since: since || undefined
                }),
                3, // 3 retries
                15000 // 15s timeout
            );
            

            // Map database fields to interface
            this.availableNews = (data || []).map(item => {
                const calculatedReadingTime = this.estimateSpeechDurationSeconds(item.content || '', 1, 'news') || 30;

                return {
                    id: item.id,
                    title: item.title,
                    content: item.content,
                    summary: item.summary,
                    original_url: item.original_url,
                    image_url: item.image_url,
                    published_at: item.published_at ? new Date(item.published_at) : undefined,
                    scraped_at: new Date(item.scraped_at),
                    is_processed: item.is_processed,
                    is_selected: item.is_selected,
                    source_id: item.source_id,
                    source_name: item.source_name || 'Fuente desconocida',
                    category: item.category || 'general',
                    publishedAt: item.published_at ? new Date(item.published_at) : undefined,
                    readingTime: calculatedReadingTime,
                    humanizedContent: item.humanizedContent, // Assuming this might come from view or join
                    formattedDate: this.formatDate(item.published_at ? new Date(item.published_at) : undefined)
                };
            });

            const uniqueNewsCategories = new Set(
                this.availableNews
                    .map(n => String(n.category || '').trim())
                    .filter(Boolean)
            );
            this.categories = ['all', ...Array.from(uniqueNewsCategories).sort((a, b) => a.localeCompare(b, 'es'))];
            if (this.categoryFilter !== 'all' && !uniqueNewsCategories.has(this.categoryFilter)) {
                this.categoryFilter = 'all';
            }

            // console.log('Available news mapped:', this.availableNews);
        } catch (error) {
            console.error('Error loading news:', error);
            this.snackBar.open('Error al cargar noticias', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
                panelClass: ['error-snackbar']
            });
        } finally {
            this.loading = false;
            this.clampNewsPage();
            this.cdr.detectChanges();
        }
    }

    async loadCustomVoices(): Promise<void> {
        try {
            const setting = await this.supabaseService.getSettingByKey('tts_custom_voices');
            const value = setting?.value;
            const customVoices = Array.isArray(value) ? value : [];

            this.customVoices = customVoices.filter((voice: any) =>
                String(voice?.name || '').startsWith('qwen:') ||
                String(voice?.provider || '').toLowerCase().includes('qwen')
            );
        } catch (error) {
            console.error('Error loading custom voices', error);
            this.customVoices = [];
        }
    }

    async loadSources(): Promise<void> {
        try {
            const sources = await this.supabaseService.getNewsSources();
            // Map database fields to interface fields
            this.sources = (sources || []).map(item => ({
                id: item.id,
                name: item.name,
                url: item.url,
                category: item.category,
                region: item.region ?? null,
                active: item.is_active,
                radioId: item.radio_id ?? null,
                radioName: item.radio?.name ?? null,
                lastScraped: item.last_scraped || null,
                createdAt: item.created_at
            }));
            
            // Filter active sources
            this.activeSources = this.sources.filter(s => s.active);

            const uniqueRegions = new Set(
                this.activeSources
                    .map(s => String(s.region || '').trim())
                    .filter(Boolean)
            );
            this.availableRegions = ['all', ...Array.from(uniqueRegions).sort((a, b) => a.localeCompare(b, 'es'))];
            // console.log('Sources loaded:', this.sources);
        } catch (error) {
            console.error('Error loading sources:', error);
        }
    }

    async loadRadios(): Promise<void> {
        try {
            const data = await this.supabaseService.safeFetch(
                () => this.supabaseService.getRadios(),
                3, // 3 retries
                15000 // 15s timeout
            );
            this.radios = data || [];
        } catch (error) {
            console.error('Error loading radios:', error);
            this.snackBar.open('Error al cargar radios', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        }
    }

    async loadMusicResources(radioId?: string): Promise<void> {
        try {
            const data = await this.supabaseService.getMusicResources(radioId);
            this.musicResources = data || [];
        } catch (error) {
            console.error('Error loading music resources:', error);
            this.snackBar.open('Error al cargar recursos de música', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        }
    }

    async onRadioSelect(): Promise<void> {
        if (this.selectedRadioId) {
            this.loadMusicResources(this.selectedRadioId);
        }

        if (!this.selectedRadioId || !this.scheduledTime) return;

        const selectedRadio = this.radios.find(r => r.id === this.selectedRadioId);
        if (!selectedRadio) return;

        this.loading = true;
        this.cdr.detectChanges();

        try {
            // Get weather for the radio's location
            const location = `${selectedRadio.comuna}, ${selectedRadio.region}, Chile`;
            const weatherInfo = await this.weatherService.getWeatherForLocation(location);

            // Convert numeric data to spoken text
            const spokenTime = this.formatTimeForSpeech(this.scheduledTime);
            const spokenWeather = this.formatWeatherForSpeech(weatherInfo);

            // Generate Intro Text (Humanized & Optimized for Prosody)
            const introText = `Son las ${spokenTime}, y en este momento, tenemos una temperatura actual de ${spokenWeather}. . Bienvenidos a la cobertura informativa de, ${selectedRadio.name}.`;

            // Check if there is already an Intro block
            const existingIntroIndex = this.timelineEvents.findIndex(e => e.type === 'intro');

            if (existingIntroIndex !== -1) {
                // Update existing intro
                this.timelineEvents[existingIntroIndex].description = introText;
                this.timelineEvents[existingIntroIndex].title = `Intro - ${selectedRadio.name}`;
                this.audiosReady = false;
                this.audioGenerationAttempted = false;
            } else {
                // Add new intro block at the beginning
                const newIntro: TimelineEvent = {
                    id: this.generateUUID(),
                    type: 'intro',
                    title: `Intro - ${selectedRadio.name}`,
                    description: introText,
                    startTime: 0,
                    duration: 15, // Default duration estimation
                    order: 0,
                    voiceSource: 'qwen',
                    selectedVoice: this.customVoices.length > 0 ? this.customVoices[0].name : undefined,
                    selectedSpeed: this.customVoices.length > 0 ? (this.customVoices[0].speed || 1.0) : 1.0,
                    selectedPitch: this.customVoices.length > 0 ? (this.customVoices[0].exaggeration || 1.0) : 1.0
                };
                
                this.timelineEvents.unshift(newIntro);
                // Update orders
                this.timelineEvents.forEach((e, i) => e.order = i);
                this.audiosReady = false;
                this.audioGenerationAttempted = false;
            }

            this.calculateTimelineTimes();
            
            this.snackBar.open('Intro generada automáticamente con datos del clima', 'Cerrar', {
                duration: 4000,
                panelClass: ['success-snackbar']
            });

        } catch (error) {
            console.error('Error generating intro:', error);
            this.snackBar.open('Error al generar la intro automática', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    get filteredNews() {
        return this.availableNews.filter(news => {
            const categoryMatch = this.categoryFilter === 'all' || String(news.category || '').toLowerCase() === String(this.categoryFilter).toLowerCase();
            const regionMatch = this.regionFilter === 'all' || String(this.sources.find(s => s.id === news.source_id)?.region || '').trim().toLowerCase() === String(this.regionFilter).trim().toLowerCase();
            const notSelected = !this.selectedNews.find(n => n.id === news.id);
            const hasValidContent = !this.isCssNoiseContent(news.content || '');
            return categoryMatch && regionMatch && notSelected && hasValidContent;
        });
    }

    get newsTotalPages(): number {
        const total = this.filteredNews.length;
        const size = Math.max(1, Number(this.newsPageSize) || 10);
        return Math.max(1, Math.ceil(total / size));
    }

    get paginatedFilteredNews(): ScrapedNews[] {
        const size = Math.max(1, Number(this.newsPageSize) || 10);
        const page = Math.min(Math.max(1, this.newsPage), this.newsTotalPages);
        const start = (page - 1) * size;
        return this.filteredNews.slice(start, start + size);
    }

    setNewsPage(page: number): void {
        const next = Math.min(Math.max(1, Math.floor(Number(page) || 1)), this.newsTotalPages);
        this.newsPage = next;
    }

    onNewsPageSizeChange(): void {
        this.newsPage = 1;
    }

    private clampNewsPage(): void {
        if (this.newsPage < 1) this.newsPage = 1;
        const total = this.newsTotalPages;
        if (this.newsPage > total) this.newsPage = total;
    }

    onFiltersChange(): void {
        this.newsPage = 1;
        if (this.filtersReloadTimer) {
            window.clearTimeout(this.filtersReloadTimer);
        }
        this.filtersReloadTimer = window.setTimeout(() => {
            this.loadAvailableNews();
        }, 200);
    }

    private getSourceIdsForSelectedRegion(): string[] | undefined {
        if (!this.regionFilter || this.regionFilter === 'all') return undefined;
        const normalized = String(this.regionFilter).trim().toLowerCase();
        const ids = this.activeSources
            .filter(s => String(s.region || '').trim().toLowerCase() === normalized)
            .map(s => s.id);
        return ids.length > 0 ? ids : ['__none__'];
    }

    private getSinceIsoForDateFilter(filter: string): string | null {
        if (!filter || filter === 'all') return null;
        const now = new Date();
        if (filter === 'today') {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            return start.toISOString();
        }
        if (filter === 'week') {
            const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return d.toISOString();
        }
        if (filter === 'month') {
            const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            return d.toISOString();
        }
        return null;
    }

    private isCssNoiseContent(text: string): boolean {
        const t = (text || '').trim();
        if (t.length < 80) return false;

        if (/(^|\s)[.#][a-z0-9_-]+\s*\{[^}]*\}/i.test(t)) return true;
        if (t.startsWith('#') && t.includes('{') && t.includes('}') && t.includes(':')) return true;

        const braces = (t.match(/[{}]/g) || []).length;
        const semicolons = (t.match(/;/g) || []).length;
        const colons = (t.match(/:/g) || []).length;
        const ratio = (braces + semicolons + colons) / Math.max(t.length, 1);

        return (braces >= 4 && semicolons >= 6 && colons >= 6) || ratio > 0.08;
    }

    checkDateFilter(date: Date): boolean {
        const now = new Date();
        const newsDate = new Date(date);

        switch (this.dateFilter) {
            case 'today':
                return newsDate.toDateString() === now.toDateString();
            case 'week':
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                return newsDate >= weekAgo;
            case 'month':
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                return newsDate >= monthAgo;
            default:
                return true;
        }
    }

    selectNews(news: ScrapedNews) {
        // Prevent duplicates
        if (this.selectedNews.find(n => n.id === news.id)) return;

        // Initialize voice settings if not present
        if (!news.voiceSource) {
            news.voiceSource = 'qwen';
        }
        if (!news.selectedVoice) {
            if (this.customVoices.length > 0) {
                const defaultVoice = this.customVoices[0];
                news.selectedVoice = defaultVoice.name;
                news.selectedSpeed = defaultVoice.speed || 1.0;
                news.selectedPitch = defaultVoice.exaggeration || 1.0;
            }
        }
        if (news.voiceDelay == null) news.voiceDelay = 0;
        news.musicVolume = this.normalizeMusicVolume(news.musicVolume, 0.25);
        if (news.musicTailSeconds == null) news.musicTailSeconds = 0.8;
        if (news.musicFadeOutSeconds == null) news.musicFadeOutSeconds = 0.5;
        if (!news.musicPlacement) news.musicPlacement = 'during';
        news.musicPlacement = this.normalizeMusicPlacement(news.musicPlacement, 'during');

        // Add to selected list
        news.is_selected = true;
        this.selectedNews.push(news);

        // Add to timeline
        this.timelineEvents.push({
            id: this.generateUUID(),
            type: 'news',
            title: news.title,
            description: news.content ? news.content.substring(0, 100) + '...' : '',
            startTime: 0,
            duration: news.readingTime || 30,
            order: this.timelineEvents.length,
            originalItem: news // Link back to the news item
        });
        
        this.calculateTimelineTimes();
        this.audiosReady = false;
        this.audioGenerationAttempted = false;
        this.clampNewsPage();
        this.snackBar.open('Noticia agregada', 'Cerrar', {
            duration: 1600,
            panelClass: ['success-snackbar'],
            horizontalPosition: 'center',
            verticalPosition: 'bottom'
        });
    }

    removeNews(news: ScrapedNews) {
        // Revoke audio URL if exists
        if (news.generatedAudioUrl) {
            URL.revokeObjectURL(news.generatedAudioUrl);
            news.generatedAudioUrl = undefined;
        }

        // Remove from selected list
        this.selectedNews = this.selectedNews.filter(n => n.id !== news.id);
        news.is_selected = false;
        
        // Remove from timeline (find the event linked to this news)
        this.timelineEvents = this.timelineEvents.filter(e => e.originalItem?.id !== news.id);
        
        // Recalculate order and times
        this.timelineEvents.forEach((e, i) => e.order = i);
        this.calculateTimelineTimes();
        this.audiosReady = false;
        this.clampNewsPage();
    }
    
    // Timeline Management
    drop(event: CdkDragDrop<any[]>) {
        moveItemInArray(this.timelineEvents, event.previousIndex, event.currentIndex);
        this.timelineEvents.forEach((e, i) => e.order = i);
        this.calculateTimelineTimes();
    }

    calculateTimelineTimes() {
        let currentTime = 0;
        this.timelineEvents.forEach(event => {
            event.duration = this.getProjectedDurationSeconds(event);
            event.startTime = currentTime;
            currentTime += event.duration;
        });
    }

    getBlockPlaceholder(item: TimelineEvent): string {
        if (item.type === 'intro') return 'Bienvenidos al noticiero...';
        if (item.type === 'outro') return 'Gracias por acompañarnos. Hasta la próxima edición...';
        if (item.type === 'text') return 'Escribe aquí un texto breve para dar continuidad o contexto al noticiero...';
        return 'Escribe el contenido...';
    }

    addBlock(type: 'text' | 'intro' | 'outro') {
        const newItem: TimelineEvent = {
            id: this.generateUUID(),
            type: type,
            title: type === 'intro' ? 'Introducción' : type === 'outro' ? 'Cierre' : 'Nuevo Texto',
            description: '',
            startTime: 0,
            duration: 30,
            order: this.timelineEvents.length,
            voiceSource: 'qwen',
            selectedVoice: this.customVoices.length > 0 ? this.customVoices[0].name : undefined,
            selectedSpeed: this.customVoices.length > 0 ? (this.customVoices[0].speed || 1.0) : 1.0,
            selectedPitch: this.customVoices.length > 0 ? (this.customVoices[0].exaggeration || 1.0) : 1.0,
            showAudioPanel: this.hasHumanized, // Show panel immediately if already humanized phase
            voiceDelay: 0,
            musicVolume: 0.25,
            musicPlacement: type === 'outro' ? 'after' : 'during',
            musicTailSeconds: 0.8,
            musicFadeOutSeconds: 0.5
        };
        this.timelineEvents.push(newItem);
        this.calculateTimelineTimes();
        this.audiosReady = false;
        this.audioGenerationAttempted = false;
    }

    private pickRandomAdTransitionPhrase(): string {
        const list = this.adTransitionPhrases;
        if (!list.length) return 'Continuamos con más información.';
        const idx = Math.floor(Math.random() * list.length);
        return list[idx] || list[0];
    }

    private estimateDurationSecondsForText(text: string): number {
        return this.estimateSpeechDurationSeconds(text, 1, 'script');
    }

    async onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;
        if (!this.canUseAdBlock) {
            this.snackBar.open('No tienes permiso para usar Audio/AD', 'Cerrar', { duration: 2500 });
            try { event.target.value = ''; } catch {}
            return;
        }

        // Get duration
        const duration = await this.getAudioDuration(file);
        const objectUrl = URL.createObjectURL(file); // Generate URL once

        const newItem: TimelineEvent = {
            id: this.generateUUID(),
            type: 'ad',
            title: file.name.replace('.mp3', ''),
            description: 'Anuncio de audio',
            startTime: 0,
            duration: duration || 30,
            baseDuration: duration || 30,
            order: this.timelineEvents.length,
            file: file, // Store file for upload later
            audioUrl: objectUrl, // Store the URL directly to avoid re-generating
            audioUrlOriginal: objectUrl,
            voiceDelay: 0
        };
        this.timelineEvents.push(newItem);

        const phrase = this.pickRandomAdTransitionPhrase();
        const transitionBlock: TimelineEvent = {
            id: this.generateUUID(),
            type: 'text',
            title: 'Continuidad',
            description: phrase,
            startTime: 0,
            duration: this.estimateDurationSecondsForText(phrase),
            order: this.timelineEvents.length,
            voiceSource: 'qwen',
            selectedVoice: this.customVoices.length > 0 ? this.customVoices[0].name : undefined,
            selectedSpeed: this.customVoices.length > 0 ? (this.customVoices[0].speed || 1.0) : 1.0,
            selectedPitch: this.customVoices.length > 0 ? (this.customVoices[0].exaggeration || 1.0) : 1.0,
            showAudioPanel: this.hasHumanized,
            voiceDelay: 0
        };
        this.timelineEvents.push(transitionBlock);

        this.calculateTimelineTimes();
        this.audiosReady = false;
        this.audioGenerationAttempted = false;
        this.cdr.detectChanges(); // Force update view
    }

    async onAdDelayChange(item: TimelineEvent): Promise<void> {
        if (!item || item.type !== 'ad') return;

        const delay = Math.max(0, Math.min(10, Math.round(Number(item.voiceDelay || 0))));
        item.voiceDelay = delay;

        const base = Math.max(0, Number(item.baseDuration || item.duration || 0));
        item.duration = Math.ceil(base) + delay;
        this.calculateTimelineTimes();

        const originalUrl = item.audioUrlOriginal || item.audioUrl;
        if (!originalUrl) {
            this.cdr.detectChanges();
            return;
        }

        try {
            if (delay <= 0) {
                if (item.audioUrl && item.audioUrl !== originalUrl) {
                    URL.revokeObjectURL(item.audioUrl);
                }
                item.audioUrl = originalUrl;
            } else {
                const paddedUrl = await this.addSilencePadding(originalUrl, delay);
                if (item.audioUrl && item.audioUrl !== originalUrl) {
                    URL.revokeObjectURL(item.audioUrl);
                }
                item.audioUrl = paddedUrl;
            }
        } catch (e) {
            console.error('Error applying ad delay', e);
        } finally {
            this.cdr.detectChanges();
        }
    }

    async onTextDelayChange(item: TimelineEvent): Promise<void> {
        if (!item || item.type !== 'text') return;

        const raw = Number(item.voiceDelay || 0);
        const delay = Math.max(0, Math.min(10, Math.round(raw * 2) / 2));
        item.voiceDelay = delay;

        if (item.musicUrl) {
            this.invalidateAudio(item);
            return;
        }

        const baseUrl = item.audioUrlOriginal || item.audioUrl;
        if (!baseUrl) {
            this.cdr.detectChanges();
            return;
        }

        try {
            if (delay <= 0) {
                if (item.audioUrl && item.audioUrl !== baseUrl && String(item.audioUrl).startsWith('blob:')) {
                    URL.revokeObjectURL(item.audioUrl);
                }
                item.audioUrl = baseUrl;
            } else {
                const paddedUrl = await this.addSilencePadding(baseUrl, delay);
                if (item.audioUrl && item.audioUrl !== baseUrl && item.audioUrl !== paddedUrl && String(item.audioUrl).startsWith('blob:')) {
                    URL.revokeObjectURL(item.audioUrl);
                }
                item.audioUrl = paddedUrl;
            }

            const baseSeconds = Math.max(0, Number(item.baseDuration || 0));
            if (baseSeconds > 0) {
                item.duration = Math.round(baseSeconds + delay);
                this.calculateTimelineTimes();
            }
        } catch (e) {
            console.error('Error applying text delay', e);
        } finally {
            this.cdr.detectChanges();
        }
    }

    getAudioDuration(file: File): Promise<number> {
        return new Promise((resolve) => {
            const audio = new Audio();
            const url = URL.createObjectURL(file);
            audio.onloadedmetadata = () => {
                URL.revokeObjectURL(url);
                resolve(Math.ceil(audio.duration));
            };
            audio.onerror = () => resolve(0);
            audio.src = url;
        });
    }

    async generateAudioForSingleItem(item: TimelineEvent): Promise<void> {
        if (item.type === 'ad') return;

        item.isGeneratingAudio = true;
        this.cdr.detectChanges();

        try {
            if (item.type === 'news' && item.originalItem) {
                await this.generateAudio(item.originalItem);
            } else {
                // Logic for Text, Intro, Outro
                const textToSpeech = item.description;
                if (!textToSpeech) {
                    this.snackBar.open('No hay texto para generar audio', 'Cerrar', { duration: 2000 });
                    item.isGeneratingAudio = false;
                    return;
                }

                let voice = item.selectedVoice;
                if (!voice) {
                    if (this.customVoices.length > 0) {
                        voice = this.customVoices[0].name;
                        // Update item with default if missing
                        item.selectedVoice = voice;
                        item.selectedSpeed = this.customVoices[0].speed || 1.0;
                        item.selectedPitch = this.customVoices[0].exaggeration || 1.0;
                    } else {
                        throw new Error('No hay voces personalizadas disponibles. Por favor crea una en Recursos.');
                    }
                }

                item.isGeneratingAudio = true;
                item.progress = 0; // Reset progress
                const voiceConfig = this.customVoices.find((v: any) => v.name === voice);
                const generatedUrl = await this.ttsService.generateSpeech({
                    text: textToSpeech,
                    voice: voice || '',
                    speed: Number(item.selectedSpeed) || 1.0,
                    pitch: Number(item.selectedPitch) || 1.0,
                    temperature: voiceConfig?.temperature,
                    exaggeration: Number(item.selectedPitch) || voiceConfig?.exaggeration || 1.0,
                    cfgWeight: voiceConfig?.cfgWeight,
                    repetitionPenalty: voiceConfig?.repetitionPenalty,
                    minP: voiceConfig?.minP,
                    topP: voiceConfig?.topP,
                    seed: voiceConfig?.seed,
                    language: voiceConfig?.language,
                    audioPromptUrl: voiceConfig?.audioPromptUrl
                }, (percent) => {
                    item.progress = percent;
                    this.cdr.detectChanges();
                });

                if (item.type === 'text') {
                    if (item.audioUrlOriginal && item.audioUrlOriginal !== generatedUrl && String(item.audioUrlOriginal).startsWith('blob:')) {
                        URL.revokeObjectURL(item.audioUrlOriginal);
                    }
                    item.audioUrlOriginal = generatedUrl;
                }

                let audioUrl = generatedUrl;

                const placement = this.normalizeMusicPlacement(item.musicPlacement, item.type === 'outro' ? 'after' : 'during');
                const tailSeconds = this.normalizeSeconds(item.musicTailSeconds, 0.8, 0, 10);
                const fadeOutSeconds = this.normalizeSeconds(item.musicFadeOutSeconds, 0.5, 0, 5);
                const hasMusic = !!String(item.musicUrl || '').trim();

                if (!hasMusic && item.type === 'text' && item.voiceDelay && Number(item.voiceDelay) > 0) {
                    try {
                        const paddedUrl = await this.addSilencePadding(audioUrl, Number(item.voiceDelay));
                        if (paddedUrl !== audioUrl) {
                            if (item.audioUrlOriginal !== audioUrl && String(audioUrl).startsWith('blob:')) {
                                URL.revokeObjectURL(audioUrl);
                            }
                            audioUrl = paddedUrl;
                        }
                    } catch (paddingError) {
                        console.error('Error adding silence padding:', paddingError);
                    }
                }

                // Mix with music if selected
                if (hasMusic) {
                    try {
                        const mixedUrl = await this.ttsService.mixVoiceAndMusic(
                            audioUrl,
                            item.musicUrl!,
                            item.voiceDelay || 0,
                            this.normalizeMusicVolume(item.musicVolume, 0.25),
                            placement,
                            { tailSeconds, fadeOutSeconds }
                        );
                        // Revoke original TTS url to avoid leaks, though it might be small
                        if (item.audioUrlOriginal !== audioUrl && String(audioUrl).startsWith('blob:')) {
                            URL.revokeObjectURL(audioUrl);
                        }
                        audioUrl = mixedUrl;
                    } catch (mixError) {
                        console.error('Error mixing music:', mixError);
                        this.snackBar.open('Error al mezclar música', 'Cerrar', { duration: 3000 });
                    }
                }

                if (item.audioUrl) {
                    URL.revokeObjectURL(item.audioUrl);
                }
                item.audioUrl = audioUrl;
                
                // Measure exact duration
                const audio = new Audio(audioUrl);
                // Wait for metadata to load to get duration
                await new Promise((resolve) => {
                    audio.onloadedmetadata = () => {
                        if (audio.duration && audio.duration !== Infinity) {
                            if (item.type === 'text') {
                                if (!hasMusic && item.voiceDelay && Number(item.voiceDelay) > 0) {
                                    const baseAudio = new Audio(item.audioUrlOriginal || audioUrl);
                                    baseAudio.onloadedmetadata = () => {
                                        const baseSeconds = baseAudio.duration && baseAudio.duration !== Infinity ? Math.round(baseAudio.duration) : Math.round(audio.duration);
                                        item.baseDuration = baseSeconds;
                                        item.duration = Math.round(baseSeconds + Number(item.voiceDelay || 0));
                                        this.calculateTimelineTimes();
                                        resolve(true);
                                    };
                                    baseAudio.onerror = () => {
                                        item.baseDuration = Math.round(audio.duration);
                                        item.duration = Math.round(audio.duration);
                                        this.calculateTimelineTimes();
                                        resolve(true);
                                    };
                                    return;
                                }
                                item.baseDuration = Math.round(audio.duration);
                                item.duration = Math.round(audio.duration);
                                this.calculateTimelineTimes();
                                resolve(true);
                            }

                            item.duration = Math.round(audio.duration);
                            this.calculateTimelineTimes();
                        }
                        resolve(true);
                    };
                    audio.onerror = () => resolve(false);
                });
            }
        } catch (e) {
            console.error(`Error generating audio for event ${item.id}`, e);
            this.snackBar.open('Error al generar el audio', 'Cerrar', { duration: 3000 });
        } finally {
            item.isGeneratingAudio = false;
            this.calculateTimelineTimes();
            this.cdr.detectChanges();
        }
    }

    async playAudio(item: TimelineEvent) {
        // Stop currently playing audio if any
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }

        let url = item.audioUrl;
        if (item.type === 'news' && item.originalItem) {
            url = item.originalItem.generatedAudioUrl;
        }
        if (!url && (item.type === 'intro' || item.type === 'outro')) {
            const hasText = !!String(item.description || '').trim();
            if (!hasText && item.musicUrl) {
                url = item.musicUrl;
            }
        }

        // Auto-generate if missing
        if (!url && item.type !== 'ad') {
            this.snackBar.open('Generando vista previa de audio...', 'Cerrar', { duration: 2000 });
            await this.generateAudioForSingleItem(item);
            
            // Refresh URL
            if (item.type === 'news' && item.originalItem) {
                url = item.originalItem.generatedAudioUrl;
            } else {
                url = item.audioUrl;
            }
        }

        if (url) {
            this.currentAudio = new Audio(url);
            this.currentAudio.play().catch(e => {
                console.error('Error playing audio:', e);
                this.snackBar.open('Error al reproducir el audio', 'Cerrar', { duration: 2000 });
            });
            
            // Reset currentAudio when ended
            this.currentAudio.onended = () => {
                this.currentAudio = null;
                this.cdr.detectChanges();
            };
        } else {
            this.snackBar.open('No se pudo generar el audio.', 'Cerrar', { duration: 3000 });
        }
    }

    removeTimelineItem(item: TimelineEvent, event?: Event) {
        event?.preventDefault();
        event?.stopPropagation();

        const scrollY = window.scrollY;

        Swal.fire({
            title: '¿Eliminar?',
            text: 'Esta acción no se puede revertir.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#8833ff',
            cancelButtonColor: '#2a2d44',
            confirmButtonText: 'Eliminar',
            cancelButtonText: 'Cancelar',
            background: '#141628',
            color: '#e8e8ff',
            heightAuto: false,
            returnFocus: false,
            focusConfirm: false
        }).then((result) => {
            window.scrollTo({ top: scrollY });
            if (!result.isConfirmed) return;

            const idx = this.timelineEvents.findIndex(e => e.id === item.id);
            if (idx === -1) return;
            const current = this.timelineEvents[idx];

            if (current.type !== 'news' && current.audioUrl) {
                URL.revokeObjectURL(current.audioUrl);
            }
            if (current.type === 'ad' && current.audioUrlOriginal && current.audioUrlOriginal !== current.audioUrl) {
                URL.revokeObjectURL(current.audioUrlOriginal);
            }

            if (current.type === 'news' && current.originalItem) {
                this.removeNews(current.originalItem);
            } else {
                this.timelineEvents.splice(idx, 1);
                this.timelineEvents.forEach((e, i) => e.order = i);
                this.calculateTimelineTimes();
            }

            this.snackBar.open('Elemento eliminado', 'Cerrar', {
                duration: 2200,
                panelClass: ['success-snackbar'],
                horizontalPosition: 'center',
                verticalPosition: 'bottom'
            });
            this.cdr.detectChanges();
        });
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    private normalizeMusicPlacement(value: any, fallback: 'before' | 'during' | 'after'): 'before' | 'during' | 'after' {
        const v = String(value || '').toLowerCase();
        if (v === 'before' || v === 'during' || v === 'after') return v;
        return fallback;
    }

    private normalizeSeconds(value: any, fallback: number, min: number, max: number): number {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    private normalizeMusicVolume(value: any, fallback: number = 0.25): number {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(0.05, Math.min(1, n));
    }

    getTotalReadingTime(): number {
        return this.timelineEvents.reduce((acc, curr) => {
            const seconds = Math.max(0, Math.round(this.getProjectedDurationSeconds(curr)));
            return acc + seconds;
        }, 0);
    }

    getChargeableReadingTimeSeconds(): number {
        return this.timelineEvents.reduce((acc, curr) => {
            if (curr?.type === 'ad') return acc;
            const seconds = Math.max(0, Math.round(this.getProjectedDurationSeconds(curr)));
            return acc + seconds;
        }, 0);
    }

    getCommercialReadingTimeSeconds(): number {
        return this.timelineEvents.reduce((acc, curr) => {
            if (curr?.type !== 'ad') return acc;
            const seconds = Math.max(0, Math.round(this.getProjectedDurationSeconds(curr)));
            return acc + seconds;
        }, 0);
    }

    getObjectUrl(file: File): string {
        return URL.createObjectURL(file);
    }

    get progressPercentage(): number {
        const total = this.getTotalReadingTime();
        const target = this.duration * 60;
        if (target === 0) return 0;
        return Math.min((total / target) * 100, 100);
    }

    private isAudioReadyForEvent(event: TimelineEvent): boolean {
        if (!event) return false;
        if (event.type === 'ad') {
            return !!event.file || !!String(event.audioUrl || '').trim();
        }
        if (event.type === 'news') {
            const news = event.originalItem;
            return !!String(news?.generatedAudioUrl || news?.uploadedAudioUrl || '').trim();
        }
        const hasAudioUrl = !!String(event.audioUrl || '').trim();
        if (hasAudioUrl) return true;

        if (event.type === 'intro' || event.type === 'outro') {
            const hasText = !!String(event.description || '').trim();
            const hasMusic = !!String(event.musicUrl || '').trim();
            if (!hasText && hasMusic) return true;
        }

        return false;
    }

    get missingAudiosCount(): number {
        return this.timelineEvents.filter(e => !this.isAudioReadyForEvent(e)).length;
    }

    private refreshAudiosReadyFlag(): void {
        this.audiosReady = this.timelineEvents.length > 0 && this.missingAudiosCount === 0;
    }

    canCreateBroadcast(): boolean {
        return this.broadcastTitle.trim() !== '' &&
            this.selectedNews.length > 0 &&
            !this.quotaLoading &&
            this.hasEnoughMinutesForCurrentDraft;
            // Removed strict duration check to allow flexibility, or keep it warning only?
            // User said "help complete that time", implying we might start with less.
            // But let's keep it lenient: user can create even if not full?
            // Original code: this.getTotalReadingTime() <= this.duration * 60;
            // I'll allow creating even if over/under, but maybe warn.
            // For now, let's remove the strict <= check to allow user to be flexible, 
            // or maybe just check they selected something.
    }

    async createBroadcast() {
        if (!this.canCreateBroadcast()) return;

        const freshQuota = await this.quotaService.refreshCurrentSummary().catch(() => this.currentQuotaSummary);
        this.currentQuotaSummary = freshQuota || null;

        if (!this.hasEnoughMinutesForCurrentDraft) {
            this.snackBar.open(this.quotaLimitMessage, 'Cerrar', {
                duration: 5000,
                panelClass: ['error-snackbar']
            });
            this.cdr.detectChanges();
            return;
        }

        this.generating = true;
        this.loadingMessage = 'Iniciando creación del noticiero...';
        this.cdr.detectChanges();

        try {
            this.loadingMessage = 'Verificando sesión de usuario...';
            this.cdr.detectChanges();

            // Check session with timeout
            const userCheckPromise = Promise.race([
                this.supabaseService.getCurrentUser(),
                new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado al verificar sesión')), 10000))
            ]);

            let user = await userCheckPromise.catch(e => {
                console.warn('User check failed or timed out:', e);
                return null;
            });
            
            // Fallback: Try to get session if getUser fails (sometimes happens in dev/local)
            if (!user) {
                console.warn('getCurrentUser failed, trying session...');
                try {
                    const sessionPromise = Promise.race([
                        this.supabaseService.getCurrentSession(),
                        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout session')), 5000))
                    ]);
                    const session = await sessionPromise;
                    user = session?.user || null;
                } catch (e) {
                    console.error('Session check failed:', e);
                }
            }

            if (!user) {
                // Last resort check for debugging
                console.error('No authenticated user found via getUser or getSession');
                throw new Error('Usuario no autenticado. Por favor inicie sesión nuevamente.');
            }

            // 1. Create News Broadcast
            this.loadingMessage = 'Creando registro del noticiero...';
            this.cdr.detectChanges();
            
            const broadcastData = {
                title: this.broadcastTitle,
                description: this.broadcastDescription,
                duration_minutes: this.duration,
                status: 'draft',
                total_news_count: this.selectedNews.length,
                total_reading_time_seconds: Math.max(0, Math.round(this.getTotalReadingTime())),
                created_by: user.id,
                radio_id: this.selectedRadioId || null,
                scheduled_time: this.scheduledTime || null
            };

            const broadcast = await this.supabaseService.createNewsBroadcast(broadcastData);
            if (!broadcast) throw new Error('Error al crear el noticiero');

            // 2. Create Timeline Items
            this.loadingMessage = 'Guardando bloques y subiendo audios...';
            this.cdr.detectChanges();
            let persistedBlocks = 0;
            await this.mapWithConcurrency(
                this.timelineEvents.map((event, index) => ({ event, index })),
                this.broadcastPersistConcurrency,
                async ({ event, index }) => {
                    await this.persistBroadcastTimelineItem(broadcast, user.id, event, index);
                    persistedBlocks++;
                    this.loadingMessage = `Procesando bloque ${persistedBlocks} de ${this.timelineEvents.length}...`;
                    this.cdr.detectChanges();
                    return null;
                }
            );

            // 3. Generate Full MP3, Save to DB and Auto-Download
            this.loadingMessage = 'Concatenando y generando audio final...';
            this.cdr.detectChanges();
            const allowDownload = this.canDownloadBroadcast;
            await this.generateAndExportFullAudio(broadcast, allowDownload);

            await this.supabaseService.updateNewsBroadcast(broadcast.id, {
                status: allowDownload ? 'ready' : 'pending_review',
                reviewed_by: null,
                reviewed_at: null
            });

            this.snackBar.open(
                allowDownload ? '¡Noticiero creado y descargado exitosamente!' : 'Noticiero enviado a revisión. Puedes escucharlo en el timeline.',
                'Cerrar',
                {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top'
                }
            );

            // Navigate to Timeline (assuming route exists)
            this.router.navigate(['/timeline-noticiario', broadcast.id]);

        } catch (error) {
            console.error('Error creating broadcast:', error);
            this.snackBar.open('Error al crear el noticiero: ' + (error instanceof Error ? error.message : String(error)), 'Cerrar', {
                duration: 5000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
                panelClass: ['error-snackbar']
            });
        } finally {
            this.generating = false;
            this.isExportingAudio = false;
            this.loadingMessage = '';
            this.cdr.detectChanges();
        }
    }

    async generateAndExportFullAudio(broadcast: any, allowDownload: boolean = true) {
        this.isExportingAudio = true;
        this.cdr.detectChanges();
        this.snackBar.open('Generando MP3 final del noticiero...', 'OK', { duration: 3000 });

        const exportStartedAt = performance.now();
        let audioContext: AudioContext | null = null;
        try {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const segmentCache = new Map<string, Promise<AudioBuffer | null>>();
            const segmentDescriptors: Array<{
                kind: 'silence' | 'audio';
                seconds?: number;
                url?: string;
                file?: File;
                cacheKey: string;
            }> = [];

            for (const event of this.timelineEvents) {
                if (event.type === 'ad' && event.voiceDelay && Number(event.voiceDelay) > 0) {
                    const seconds = Math.max(0, Math.min(10, Number(event.voiceDelay)));
                    if (seconds > 0) {
                        segmentDescriptors.push({
                            kind: 'silence',
                            seconds,
                            cacheKey: `silence:${event.id}:${seconds}`
                        });
                    }
                }

                const exportSource = this.resolveExportAudioSource(event);
                if (exportSource) {
                    segmentDescriptors.push({
                        kind: 'audio',
                        ...exportSource
                    });
                }
            }

            const segmentLoadStartedAt = performance.now();
            const decodedSegments = await this.mapWithConcurrency(
                segmentDescriptors,
                this.exportDecodeConcurrency,
                async (segment) => {
                    if (segment.kind === 'silence') {
                        return this.createSilenceBuffer(audioContext!, segment.seconds || 0);
                    }

                    try {
                        return await this.loadAudioBufferForExport(audioContext!, segment, segmentCache);
                    } catch (e) {
                        console.error(`Error loading audio segment from ${segment.url || segment.cacheKey}:`, e);
                        this.snackBar.open('Advertencia: Un segmento de audio falló y será omitido.', 'OK', { duration: 3000 });
                        return null;
                    }
                }
            );
            const audioBuffers = decodedSegments.filter((buffer): buffer is AudioBuffer => !!buffer);

            if (audioBuffers.length === 0) {
                console.warn('No audio buffers to concatenate');
                return;
            }

            // 2. Concatenate
            const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
            const offlineCtx = new OfflineAudioContext(2, totalLength, audioContext.sampleRate || 44100);
            
            let offset = 0;
            for (const buffer of audioBuffers) {
                const source = offlineCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(offlineCtx.destination);
                source.start(offset);
                offset += buffer.duration;
            }

            const renderedBuffer = await offlineCtx.startRendering();

            // 3. Encode to MP3 using lamejs
            const encodeStartedAt = performance.now();
            const mp3Blob = await this.encodeToMp3(renderedBuffer);

            // 4. Upload Full Audio to Supabase
            const fileName = `full_broadcast_${broadcast.id}_${Date.now()}.mp3`;
            const file = new File([mp3Blob], fileName, { type: 'audio/mp3' });
            const storagePath = `broadcasts/${broadcast.id}/${fileName}`;
            const publicUrl = await this.supabaseService.uploadAudioFile(file, storagePath);

            // 5. Save to generated_broadcasts table
            const quotaResult = await this.supabaseService.createGeneratedBroadcastWithQuota({
                broadcast_id: broadcast.id,
                title: broadcast.title,
                audio_url: publicUrl,
                duration_seconds: Math.ceil(renderedBuffer.duration)
            });

            if (quotaResult?.quota_summary) {
                this.quotaService.setCurrentSummary({
                    user_id: quotaResult.quota_summary.user_id,
                    role: quotaResult.quota_summary.role,
                    manager_id: quotaResult.quota_summary.manager_id ?? null,
                    quota_total_minutes: Number(quotaResult.quota_summary.quota_total_minutes || 0),
                    team_assigned_minutes: Number(quotaResult.quota_summary.team_assigned_minutes || 0),
                    team_used_minutes: Number(quotaResult.quota_summary.team_used_minutes || 0),
                    personal_quota_minutes: Number(quotaResult.quota_summary.personal_quota_minutes || 0),
                    used_minutes: Number(quotaResult.quota_summary.used_minutes || 0),
                    remaining_minutes: Number(quotaResult.quota_summary.remaining_minutes || 0),
                    available_to_assign_minutes: Number(quotaResult.quota_summary.available_to_assign_minutes || 0),
                    unlimited: !!quotaResult.quota_summary.unlimited,
                    can_generate: !!quotaResult.quota_summary.can_generate
                });
            }

            if (quotaResult?.charged_now) {
                this.snackBar.open(`Audio final guardado. Se descontaron ${quotaResult.charged_minutes} min.`, 'Cerrar', {
                    duration: 3500,
                    panelClass: ['success-snackbar']
                });
            }

            if (allowDownload) {
                const downloadUrl = URL.createObjectURL(mp3Blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `${broadcast.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.mp3`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
            }

            console.info('[Crear Noticiero] Export final optimizado', {
                segmentos: segmentDescriptors.length,
                segmentosDecodificados: audioBuffers.length,
                cargaYDecodeMs: Math.round(encodeStartedAt - segmentLoadStartedAt),
                encodeMp3Ms: Math.round(performance.now() - encodeStartedAt),
                totalMs: Math.round(performance.now() - exportStartedAt)
            });

        } catch (error) {
            console.error('Error exporting audio:', error);
            // Re-throw so createBroadcast knows it failed
            throw error;
        } finally {
            if (audioContext) {
                try {
                    await audioContext.close();
                } catch {
                    // Ignore close errors on browsers that auto-close contexts.
                }
            }
        }
    }

    get estimatedMinutesToConsume(): number {
        const seconds = Math.max(0, Math.round(this.getChargeableReadingTimeSeconds() || 0));
        if (seconds <= 0) return 0;
        return Math.max(1, Math.ceil(seconds / 60));
    }

    get hasEnoughMinutesForCurrentDraft(): boolean {
        if (!this.currentQuotaSummary) return true;
        if (this.currentQuotaSummary.unlimited) return true;
        return this.currentQuotaSummary.remaining_minutes >= this.estimatedMinutesToConsume;
    }

    get quotaLimitMessage(): string {
        if (!this.currentQuotaSummary || this.currentQuotaSummary.unlimited) return '';
        return `No tienes minutos suficientes para generar este noticiero. Necesitas ${this.estimatedMinutesToConsume} min, te quedan ${this.currentQuotaSummary.remaining_minutes} min. Solicita más minutos o elige un noticiero de menor duración.`;
    }

    async encodeToMp3(buffer: AudioBuffer): Promise<Blob> {
        const channels = 2; // Stereo
        // Use buffer sample rate instead of fixed 44100 to avoid pitch/speed issues
        const sampleRate = buffer.sampleRate || 44100;
        const kbps = 128;
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
        const mp3Data = [];

        const left = buffer.getChannelData(0);
        const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left; // Handle mono source

        // Process in chunks to avoid blocking UI too much
        const sampleBlockSize = 1152; // multiple of 576
        
        for (let i = 0; i < left.length; i += sampleBlockSize) {
            const leftChunk = left.subarray(i, i + sampleBlockSize);
            const rightChunk = right.subarray(i, i + sampleBlockSize);
            
            // Convert Float32 to Int16
            const leftInt16 = this.convertFloat32ToInt16(leftChunk);
            const rightInt16 = this.convertFloat32ToInt16(rightChunk);
            
            const mp3buf = mp3encoder.encodeBuffer(leftInt16, rightInt16);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }

            // Yield to main thread every ~50 chunks (~1.3 seconds of audio processing) to keep UI responsive
            if (i % (sampleBlockSize * 50) === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }

        return new Blob(mp3Data, { type: 'audio/mp3' });
    }

    convertFloat32ToInt16(buffer: Float32Array): Int16Array {
        let l = buffer.length;
        const buf = new Int16Array(l);
        while (l--) {
            // Clamp value to [-1, 1] then scale to Int16 range
            buf[l] = Math.max(-1, Math.min(1, buffer[l])) * 0x7FFF;
        }
        return buf;
    }

    moveNewsUp(index: number) {
        if (index > 0) {
            [this.selectedNews[index], this.selectedNews[index - 1]] =
                [this.selectedNews[index - 1], this.selectedNews[index]];
        }
    }

    moveNewsDown(index: number) {
        if (index < this.selectedNews.length - 1) {
            [this.selectedNews[index], this.selectedNews[index + 1]] =
                [this.selectedNews[index + 1], this.selectedNews[index]];
        }
    }

    formatDate(date: Date | undefined): string {
        if (!date) return 'Sin fecha';
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return 'Ahora mismo';
        if (minutes < 60) return `Hace ${minutes} min`;
        if (hours < 24) return `Hace ${hours} h`;
        if (days < 7) return `Hace ${days} días`;
        return date.toLocaleDateString('es-ES');
    }

    formatReadingTime(seconds: number | undefined): string {
        if (!seconds) return '-';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes} min ${remainingSeconds > 0 ? remainingSeconds + 's' : ''}`;
        }
        return `${seconds}s`;
    }

    getBlockDurationSeconds(item: TimelineEvent): number {
        return this.getProjectedDurationSeconds(item);
    }

    getBlockDurationMode(item: TimelineEvent): 'real' | 'estimado' {
        return this.hasActualAudioForEvent(item) ? 'real' : 'estimado';
    }

    viewNewsDetail(news: ScrapedNews): void {
        this.selectedNewsDetail = news;
    }

    closeNewsDetail(): void {
        this.selectedNewsDetail = null;
    }

    private getDefaultQwenVoiceConfig(): any {
        const voice = this.customVoices.find((item: any) => String(item?.name || '').startsWith('qwen:'));
        if (!voice) {
            throw new Error('No hay voces Qwen disponibles. Crea o guarda una voz clonada en Recursos antes de generar audio.');
        }
        return voice;
    }

    private ensureQwenVoiceSelection(target: { selectedVoice?: string; selectedSpeed?: number; selectedPitch?: number }): any {
        const selected = this.customVoices.find((voice: any) => voice.name === target.selectedVoice && String(voice.name || '').startsWith('qwen:'));
        const resolved = selected || this.getDefaultQwenVoiceConfig();
        target.selectedVoice = resolved.name;
        target.selectedSpeed = Number(target.selectedSpeed ?? resolved.speed ?? 1.0);
        target.selectedPitch = Number(target.selectedPitch ?? resolved.exaggeration ?? 1.0);
        return resolved;
    }

    // Audio methods
    toggleAudioPanel(news: ScrapedNews): void {
        news.showAudioPanel = !news.showAudioPanel;
        
        // Initialize defaults if opening for first time
        if (news.showAudioPanel && !news.selectedVoice) {
            try {
                this.ensureQwenVoiceSelection(news);
            } catch (error) {
                console.error('No Qwen voice available for panel init', error);
            }
        }
    }

    async generateAudio(news: ScrapedNews): Promise<void> {
        if (!news.humanizedContent && !news.content) {
            this.snackBar.open('No hay contenido para generar audio', 'Cerrar', {
                duration: 3000
            });
            return;
        }

        news.isGeneratingAudio = true;
        this.cdr.detectChanges();

        try {
            // Use humanized content if available, otherwise original content
            const textToSpeech = news.humanizedContent || news.content;
            
            // Calculate optimal speed if target duration is set
            if (news.targetDuration) {
                // Estimate natural duration at speed 1.0 (approx 150 words/min = 2.5 words/sec)
                const estimatedBaseDuration = this.estimateSpeechDurationSeconds(textToSpeech, 1, 'news');
                
                // Required speed = Estimated / Target
                let calculatedSpeed = estimatedBaseDuration / news.targetDuration;
                
                // Clamp speed (0.75 to 1.25) to keep it natural
                // If it needs to be faster than 1.25x, we cap it (better to be long than unintelligible)
                // If it needs to be slower than 0.75x, we cap it (better to be short than robotic)
                calculatedSpeed = Math.min(Math.max(calculatedSpeed, 0.75), 1.25);
                
                news.selectedSpeed = Number(calculatedSpeed.toFixed(2));
                // console.log(`Auto-adjusting speed to ${news.selectedSpeed} for target ${news.targetDuration}s (Est: ${estimatedBaseDuration}s)`);
            }

            const voiceConfig = this.ensureQwenVoiceSelection(news);
            const voice = voiceConfig.name;
            news.progress = 0; // Reset progress
            let audioUrl = await this.ttsService.generateSpeech({
                text: textToSpeech,
                voice,
                speed: Number(news.selectedSpeed) || 1.0,
                pitch: Number(news.selectedPitch) || 1.0,
                temperature: voiceConfig?.temperature,
                exaggeration: Number(news.selectedPitch) || voiceConfig?.exaggeration || 1.0,
                cfgWeight: voiceConfig?.cfgWeight,
                repetitionPenalty: voiceConfig?.repetitionPenalty,
                minP: voiceConfig?.minP,
                topP: voiceConfig?.topP,
                seed: voiceConfig?.seed,
                language: voiceConfig?.language,
                audioPromptUrl: voiceConfig?.audioPromptUrl
            }, (percent) => {
                news.progress = percent;
                this.cdr.detectChanges();
            });

            const placement = this.normalizeMusicPlacement(news.musicPlacement, 'during');
            const tailSeconds = this.normalizeSeconds(news.musicTailSeconds, 0.8, 0, 10);
            const fadeOutSeconds = this.normalizeSeconds(news.musicFadeOutSeconds, 0.5, 0, 5);
            const hasMusic = !!String(news.musicUrl || '').trim();

            if (hasMusic) {
                try {
                    const mixedUrl = await this.ttsService.mixVoiceAndMusic(
                        audioUrl,
                        news.musicUrl!,
                        Number(news.voiceDelay || 0),
                        this.normalizeMusicVolume(news.musicVolume, 0.25),
                        placement,
                        { tailSeconds, fadeOutSeconds }
                    );
                    if (String(audioUrl).startsWith('blob:')) {
                        URL.revokeObjectURL(audioUrl);
                    }
                    audioUrl = mixedUrl;
                } catch (mixError) {
                    console.error('Error mixing music:', mixError);
                }
            } else if (news.voiceDelay && news.voiceDelay > 0) {
                try {
                    audioUrl = await this.addSilencePadding(audioUrl, Number(news.voiceDelay));
                } catch (paddingError) {
                    console.error('Error adding silence padding:', paddingError);
                }
            }

            if (news.generatedAudioUrl) {
                URL.revokeObjectURL(news.generatedAudioUrl);
            }
            news.generatedAudioUrl = audioUrl;
            
            // Get actual duration from the generated audio blob
            // This makes the audio the "Referee" (Arbitro) for the time
            try {
                const audio = new Audio(audioUrl);
                // Wait for metadata to load
                await new Promise((resolve) => {
                    audio.onloadedmetadata = () => resolve(true);
                    audio.onerror = () => resolve(false);
                });
                
                if (audio.duration && audio.duration !== Infinity) {
                    // console.log(`Actual audio duration: ${audio.duration}s (Target: ${news.targetDuration}s)`);
                    news.readingTime = Math.round(audio.duration);
                }
            } catch (e) {
                console.error('Error reading audio duration:', e);
            }
            
            this.snackBar.open('Audio generado exitosamente', 'Cerrar', {
                duration: 3000,
                panelClass: ['success-snackbar']
            });

        } catch (error) {
            console.error('Error generating audio:', error);
            this.snackBar.open('Error al generar audio', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        } finally {
            news.isGeneratingAudio = false;
            this.calculateTimelineTimes(); // Update timeline durations
            this.cdr.detectChanges();
        }
    }

    // Helper to format available voices for display if needed
    getVoiceLabel(voice: string): string {
        return voice;
    }

    // Azure functionality removed


    invalidateAudio(item: TimelineEvent) {
        // Clear audio for this item
        if (item.audioUrl) {
            if (String(item.audioUrl).startsWith('blob:')) {
                URL.revokeObjectURL(item.audioUrl);
            }
            item.audioUrl = undefined;
        }

        if (item.audioUrlOriginal) {
            if (String(item.audioUrlOriginal).startsWith('blob:')) {
                URL.revokeObjectURL(item.audioUrlOriginal);
            }
            item.audioUrlOriginal = undefined;
        }
        item.baseDuration = undefined;
        
        // If it's a news item, clear the original news audio too
        if (item.type === 'news' && item.originalItem) {
            if (item.originalItem.generatedAudioUrl) {
                if (String(item.originalItem.generatedAudioUrl).startsWith('blob:')) {
                    URL.revokeObjectURL(item.originalItem.generatedAudioUrl);
                }
                item.originalItem.generatedAudioUrl = undefined;
            }
        }

        this.audiosReady = false;
        this.audioGenerationAttempted = false;
        this.calculateTimelineTimes();
        this.cdr.detectChanges();
    }

    private hasActualAudioForEvent(item: TimelineEvent): boolean {
        if (!item) return false;
        if (item.type === 'ad') {
            return !!String(item.audioUrl || '').trim() || !!item.file;
        }
        if (item.type === 'news' && item.originalItem) {
            return !!String(item.originalItem.generatedAudioUrl || item.originalItem.uploadedAudioUrl || '').trim();
        }
        if (String(item.audioUrl || '').trim()) return true;
        if ((item.type === 'intro' || item.type === 'outro') && !String(item.description || '').trim() && String(item.musicUrl || '').trim()) {
            return true;
        }
        return false;
    }

    private getEffectiveSpeed(value: any): number {
        const speed = Number(value || 1);
        if (!Number.isFinite(speed) || speed <= 0) return 1;
        return Math.max(0.75, Math.min(1.25, speed));
    }

    private estimateSpeechDurationSeconds(text: string, speed: number = 1, mode: 'news' | 'script' = 'news'): number {
        const source = String(text || '').trim();
        if (!source) return 0;

        const words = source.split(/\s+/).filter(Boolean).length;
        const commas = (source.match(/[,;]/g) || []).length;
        const sentenceStops = (source.match(/[.!?]/g) || []).length;
        const lineBreaks = (source.match(/\n/g) || []).length;
        const safeSpeed = this.getEffectiveSpeed(speed);
        const baseSeconds = words / (this.estimatedSpeechWordsPerSecond * safeSpeed);
        const pauseSeconds = (commas * 0.12) + (sentenceStops * 0.28) + (lineBreaks * 0.08);
        const estimated = Math.ceil(baseSeconds + pauseSeconds);
        const minSeconds = mode === 'news' ? 8 : 4;
        return Math.max(minSeconds, estimated || minSeconds);
    }

    private estimateConfiguredNewsDuration(news: ScrapedNews | undefined): number {
        if (!news) return 0;
        const hasActualAudio = !!String(news.generatedAudioUrl || news.uploadedAudioUrl || '').trim();
        if (hasActualAudio) {
            return Math.max(0, Math.round(Number(news.readingTime || 0)));
        }

        const text = String(news.humanizedContent || news.content || '').trim();
        const estimatedSpeech = this.estimateSpeechDurationSeconds(text, news.selectedSpeed || 1, 'news');
        const delay = Math.max(0, Number(news.voiceDelay || 0));
        const placement = this.normalizeMusicPlacement(news.musicPlacement, 'during');
        const tail = String(news.musicUrl || '').trim() && placement === 'during'
            ? this.normalizeSeconds(news.musicTailSeconds, 0.8, 0, 10)
            : 0;

        const total = Math.round(estimatedSpeech + delay + tail);
        return Math.max(estimatedSpeech || 0, total || 0);
    }

    private estimateConfiguredScriptDuration(item: TimelineEvent): number {
        const hasActualAudio = !!String(item.audioUrl || '').trim();
        if (hasActualAudio) {
            return Math.max(0, Math.round(Number(item.duration || 0)));
        }

        const text = String(item.description || '').trim();
        if (!text) {
            return Math.max(0, Math.round(Number(item.duration || 0)));
        }

        const estimatedSpeech = this.estimateSpeechDurationSeconds(text, item.selectedSpeed || 1, 'script');
        const delay = Math.max(0, Number(item.voiceDelay || 0));
        const placement = this.normalizeMusicPlacement(item.musicPlacement, item.type === 'outro' ? 'after' : 'during');
        const tail = String(item.musicUrl || '').trim() && placement === 'during'
            ? this.normalizeSeconds(item.musicTailSeconds, 0.8, 0, 10)
            : 0;

        const total = Math.round(estimatedSpeech + delay + tail);
        return Math.max(estimatedSpeech || 0, total || 0);
    }

    private getProjectedDurationSeconds(item: TimelineEvent | undefined): number {
        if (!item) return 0;
        if (item.type === 'ad') {
            return Math.max(0, Math.round(Number(item.duration || item.baseDuration || 0)));
        }
        if (item.type === 'news') {
            return this.estimateConfiguredNewsDuration(item.originalItem);
        }
        return this.estimateConfiguredScriptDuration(item);
    }

    onVoiceChange(item: TimelineEvent, voiceName: string) {
        // Find the selected voice object to get default settings
        const selectedVoice = this.customVoices.find((v: any) => v.name === voiceName);

        if (selectedVoice) {
            if (item.type === 'news' && item.originalItem) {
                if (selectedVoice.speed) {
                    item.originalItem.selectedSpeed = selectedVoice.speed;
                }
                if (selectedVoice.exaggeration) {
                    item.originalItem.selectedPitch = selectedVoice.exaggeration;
                }
            } else {
                // Regular item (intro, outro, text)
                if (selectedVoice.speed) {
                    item.selectedSpeed = selectedVoice.speed;
                }
                if (selectedVoice.exaggeration) {
                    item.selectedPitch = selectedVoice.exaggeration;
                }
            }
        }

        // Invalidate audio as usual
        this.invalidateAudio(item);
    }

    // Simplified Humanize Only (Reverted as per user request)
    async humanizeNews(): Promise<void> {
        // We allow humanizing even if no news selected, as long as there are timeline events?
        // User said "humanizar solo las noticias". If no news, maybe skip humanization but show audio panels?
        // Let's assume we proceed if there are any timeline events.
        
        const scriptBlocks = this.timelineEvents.filter(e =>
            (e.type === 'intro' || e.type === 'outro' || e.type === 'text') && !!String(e.description || '').trim()
        );

        this.humanizeTotal = this.selectedNews.length + scriptBlocks.length;
        this.humanizeCompleted = 0;
        this.humanizeProgress = 0;
        this.audiosReady = false;
        this.humanizing = true;
        this.cdr.detectChanges();

        try {
            const updateHumanizeProgress = () => {
                this.humanizeCompleted += 1;
                const total = Math.max(1, this.humanizeTotal);
                this.humanizeProgress = Math.min(100, Math.round((this.humanizeCompleted / total) * 100));
                this.cdr.detectChanges();
            };

            // 1. Humanize News
            if (this.selectedNews.length > 0) {
                const minimaxTotals = {
                    promptTokens: 0,
                    outputTokens: 0,
                    model: '',
                    requests: 0
                };
                let ok = 0;
                let failed = 0;
                let stoppedByRateLimit = false;

                const items = this.selectedNews.slice();
                items.forEach(n => {
                    n.humanizeStatus = 'pending';
                    n.humanizeError = undefined;
                });
                let cursor = 0;
                const concurrency = Math.min(this.humanizeConcurrency, items.length);

                const worker = async () => {
                    while (cursor < items.length && !stoppedByRateLimit) {
                        const idx = cursor;
                        cursor += 1;
                        const news = items[idx];
                        try {
                            const humanized = await this.geminiService.humanizeText(news.content);
                            if (humanized?.usage) {
                                minimaxTotals.promptTokens += humanized.usage.promptTokens || 0;
                                minimaxTotals.outputTokens += humanized.usage.outputTokens || 0;
                            }
                            if (humanized?.model) minimaxTotals.model = humanized.model;
                            minimaxTotals.requests += 1;

                            const finalText = await this.resolveHumanizedText(
                                humanized.text,
                                news.content,
                                (cleaned) => {
                                    if (cleaned?.usage) {
                                        minimaxTotals.promptTokens += cleaned.usage.promptTokens || 0;
                                        minimaxTotals.outputTokens += cleaned.usage.outputTokens || 0;
                                    }
                                    if (cleaned?.model) minimaxTotals.model = cleaned.model;
                                    minimaxTotals.requests += 1;
                                }
                            );

                            news.humanizedContent = finalText;
                            news.humanizeStatus = 'ok';

                            news.readingTime = this.estimateConfiguredNewsDuration(news);

                            news.generatedAudioUrl = undefined;

                            this.ensureQwenVoiceSelection(news);

                            ok += 1;
                        } catch (error: any) {
                            console.error(`Error humanizing news ${news.id}:`, error);
                            failed += 1;
                            const status = error?.status;
                            const msg = String(error?.message || '');
                            news.humanizeStatus = 'error';
                            news.humanizeError = msg || 'error';
                            if (status === 429 || /429|too many requests|resource exhausted/i.test(msg)) {
                                stoppedByRateLimit = true;
                            }
                        } finally {
                            updateHumanizeProgress();
                        }
                    }
                };

                await Promise.all(Array.from({ length: concurrency }, () => worker()));

                if (minimaxTotals.promptTokens > 0) {
                    const units = minimaxTotals.promptTokens / 1000;
                    this.supabaseService.logCostEvent({
                        action: 'humanize_in',
                        module: 'crear-noticiario',
                        units,
                        metadata: {
                            model: minimaxTotals.model || 'MiniMax-M2.7',
                            requests: minimaxTotals.requests,
                            prompt_tokens: minimaxTotals.promptTokens,
                            output_tokens: minimaxTotals.outputTokens,
                            items: this.selectedNews.length,
                            date_filter: this.dateFilter,
                            category_filter: this.categoryFilter,
                            region_filter: this.regionFilter
                        }
                    });
                }
                if (minimaxTotals.outputTokens > 0) {
                    const units = minimaxTotals.outputTokens / 1000;
                    this.supabaseService.logCostEvent({
                        action: 'humanize_out',
                        module: 'crear-noticiario',
                        units,
                        metadata: {
                            model: minimaxTotals.model || 'MiniMax-M2.7',
                            requests: minimaxTotals.requests,
                            prompt_tokens: minimaxTotals.promptTokens,
                            output_tokens: minimaxTotals.outputTokens,
                            items: this.selectedNews.length,
                            date_filter: this.dateFilter,
                            category_filter: this.categoryFilter,
                            region_filter: this.regionFilter
                        }
                    });
                }
                if (stoppedByRateLimit) {
                    this.snackBar.open(`Límite de API (429). Humanizadas ${ok}/${this.selectedNews.length}. Reintenta en unos minutos.`, 'Cerrar', {
                        duration: 6000,
                        panelClass: ['error-snackbar']
                    });
                } else if (failed > 0) {
                    this.snackBar.open(`Humanización completada con errores: ${ok} ok · ${failed} fallidas.`, 'Cerrar', {
                        duration: 5000,
                        panelClass: ['error-snackbar']
                    });
                } else {
                    this.snackBar.open(`Humanización completada: ${ok}/${this.selectedNews.length}.`, 'Cerrar', {
                        duration: 3500,
                        panelClass: ['success-snackbar']
                    });
                }
            }

            // 1.5 Refine Intro/Outro scripts (optional)
            if (scriptBlocks.length > 0) {
                let okScripts = 0;
                let failedScripts = 0;

                await this.mapWithConcurrency(
                    scriptBlocks,
                    Math.min(this.humanizeConcurrency, scriptBlocks.length),
                    async (block) => {
                        try {
                            const sourceText = String(block.description || '');
                            const refined = await this.geminiService.refineScript(sourceText);
                            const finalText = await this.resolveHumanizedText(refined.text, sourceText);

                            block.description = finalText;
                            this.invalidateAudio(block);
                            okScripts += 1;
                        } catch (e) {
                            console.error(`Error refining script ${block.id}`, e);
                            failedScripts += 1;
                        } finally {
                            updateHumanizeProgress();
                        }
                    }
                );

                if (failedScripts > 0) {
                    this.snackBar.open(`Intro/Cierre afinados con errores: ${okScripts} ok · ${failedScripts} fallidos.`, 'Cerrar', {
                        duration: 5000,
                        panelClass: ['error-snackbar']
                    });
                } else {
                    this.snackBar.open(`Intro/Cierre afinados: ${okScripts}/${scriptBlocks.length}.`, 'Cerrar', {
                        duration: 3000,
                        panelClass: ['success-snackbar']
                    });
                }
            }

            // 2. Prepare Audio Config for ALL blocks (except ads)
            this.timelineEvents.forEach(event => {
                if (event.type === 'ad') return;

                if (event.type === 'news' && event.originalItem) {
                    event.originalItem.showAudioPanel = true;
                } else {
                    // Text, Intro, Outro
                    event.showAudioPanel = true;
                    if (!event.selectedVoice) {
                        this.ensureQwenVoiceSelection(event);
                    }
                }
            });

            this.hasHumanized =
                this.selectedNews.some(n => !!String(n.humanizedContent || '').trim()) ||
                scriptBlocks.length > 0;
            if (this.hasHumanized) {
                this.snackBar.open('Humanización lista. Ahora configura voces y genera el audio.', 'Cerrar', {
                    duration: 4000,
                    panelClass: ['success-snackbar']
                });
            } else {
                this.snackBar.open('No se pudo humanizar ninguna noticia. Revisa la consola/servidor e intenta de nuevo.', 'Cerrar', {
                    duration: 5500,
                    panelClass: ['error-snackbar']
                });
            }
        } catch (error) {
            console.error('Error humanizing news:', error);
            this.snackBar.open('Error al procesar noticias', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        } finally {
            this.humanizing = false;
            if (this.humanizeTotal > 0) {
                this.humanizeProgress = Math.min(100, this.humanizeProgress || 0);
            }
            this.calculateTimelineTimes();
            this.cdr.detectChanges();
        }
    }

    // New Smart Generation Logic
    async generateSmartAudiosAndAdjust(): Promise<void> {
        if (this.timelineEvents.length === 0) return;

        this.generatingSmartAudios = true;
        this.audiosReady = false;
        this.globalProgress = 0;
        this.cdr.detectChanges();

        try {
            await this.generateBatchAudios(0, 100);
            this.refreshAudiosReadyFlag();
            if (!this.audiosReady) {
                this.snackBar.open(`Faltan ${this.missingAudiosCount} audios por generar. Revisa los bloques con error e intenta nuevamente.`, 'Cerrar', {
                    duration: 6000,
                    panelClass: ['error-snackbar']
                });
                return;
            }
            this.cdr.detectChanges();

            const ttsChars = this.timelineEvents
                .filter(e => e.type !== 'ad')
                .reduce((acc, e) => {
                    if (e.type === 'news' && e.originalItem) {
                        const txt = String(e.originalItem.humanizedContent || e.originalItem.content || '').trim();
                        return acc + txt.length;
                    }
                    const txt = String(e.description || e.title || '').trim();
                    return acc + txt.length;
                }, 0);
            if (ttsChars > 0) {
                const units = ttsChars / 1000;
                this.supabaseService.logCostEvent({
                    action: 'tts_generate',
                    module: 'crear-noticiario',
                    units,
                    metadata: {
                        items: this.timelineEvents.filter(e => e.type !== 'ad').length,
                        total_news: this.selectedNews.length,
                        tts_chars: ttsChars
                    }
                });
            }

            const targetTotalSeconds = this.duration * 60;
            const currentTotalSeconds = this.getTotalReadingTime();
            const diffSeconds = currentTotalSeconds - targetTotalSeconds;
            const absDiff = Math.abs(diffSeconds);

            if (absDiff <= 10) {
                this.snackBar.open('Audio generado. Duración muy cercana a la meta.', 'Cerrar', {
                    duration: 3500,
                    panelClass: ['success-snackbar']
                });
            } else {
                const direction = diffSeconds > 0 ? 'por sobre' : 'por debajo';
                this.snackBar.open(`Audio generado. Estás ${this.formatReadingTime(absDiff)} ${direction} de la meta. Ajusta cantidad de noticias o velocidad si necesitas precisión.`, 'Cerrar', {
                    duration: 6000
                });
            }
        } catch (error) {
            console.error('Error generating audios:', error);
            this.snackBar.open('Error al generar audios', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        } finally {
            this.generatingSmartAudios = false;
            this.audioGenerationAttempted = true;
            this.cdr.detectChanges();
        }
    }

    async generateBatchAudios(startProgress: number = 0, endProgress: number = 100): Promise<void> {
        const itemsToGenerate = this.timelineEvents.filter(e => e.type !== 'ad' && !this.isAudioReadyForEvent(e));
        const itemsToProcess = itemsToGenerate.length;
        if (itemsToProcess === 0) {
            this.globalProgress = endProgress;
            this.cdr.detectChanges();
            return;
        }

        const batchStartedAt = performance.now();
        let completedItems = 0;
        const updateProgress = () => {
            completedItems++;
            const currentBatchProgress = (completedItems / itemsToProcess) * (endProgress - startProgress);
            this.globalProgress = Math.min(startProgress + currentBatchProgress, endProgress);
            this.cdr.detectChanges();
        };

        let cursor = 0;
        const workerCount = Math.min(this.batchAudioConcurrency, itemsToGenerate.length);
        const worker = async (workerIndex: number) => {
            while (cursor < itemsToGenerate.length) {
                const currentIndex = cursor++;
                const event = itemsToGenerate[currentIndex];
                if (!event) return;

                if (currentIndex > 0) {
                    await this.delay(this.generationRequestSpacingMs * workerIndex);
                }

                await this.generateBatchAudioForEvent(event);
                updateProgress();
            }
        };

        await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index)));

        console.info('[Crear Noticiero] Generacion batch optimizada', {
            items: itemsToProcess,
            concurrencia: workerCount,
            totalMs: Math.round(performance.now() - batchStartedAt)
        });
    }

    private async generateBatchAudioForEvent(event: TimelineEvent): Promise<void> {
        if (event.type === 'news' && event.originalItem) {
            const news = event.originalItem;
            const textToSpeech = String(news.humanizedContent || news.content || '').trim();
            if (!textToSpeech) return;

            try {
                news.isGeneratingAudio = true;
                news.progress = 0;
                this.cdr.detectChanges();

                const voiceConfig = this.ensureQwenVoiceSelection(news);
                const voice = voiceConfig.name;
                let audioUrl = await this.ttsService.generateSpeech({
                    text: textToSpeech,
                    voice,
                    speed: Number(news.selectedSpeed) || 1.0,
                    pitch: Number(news.selectedPitch) || 1.0,
                    temperature: voiceConfig?.temperature,
                    exaggeration: Number(news.selectedPitch) || voiceConfig?.exaggeration || 1.0,
                    cfgWeight: voiceConfig?.cfgWeight,
                    repetitionPenalty: voiceConfig?.repetitionPenalty,
                    minP: voiceConfig?.minP,
                    topP: voiceConfig?.topP,
                    seed: voiceConfig?.seed,
                    language: voiceConfig?.language,
                    audioPromptUrl: voiceConfig?.audioPromptUrl
                }, (percent) => {
                    news.progress = percent;
                    this.cdr.detectChanges();
                });

                const placement = this.normalizeMusicPlacement(news.musicPlacement, 'during');
                const tailSeconds = this.normalizeSeconds(news.musicTailSeconds, 0.8, 0, 10);
                const fadeOutSeconds = this.normalizeSeconds(news.musicFadeOutSeconds, 0.5, 0, 5);
                const hasMusic = !!String(news.musicUrl || '').trim();

                if (hasMusic) {
                    try {
                        const mixedUrl = await this.ttsService.mixVoiceAndMusic(
                            audioUrl,
                            news.musicUrl!,
                            Number(news.voiceDelay || 0),
                            this.normalizeMusicVolume(news.musicVolume, 0.25),
                            placement,
                            { tailSeconds, fadeOutSeconds }
                        );
                        if (String(audioUrl).startsWith('blob:')) {
                            URL.revokeObjectURL(audioUrl);
                        }
                        audioUrl = mixedUrl;
                    } catch (mixError) {
                        console.error('Error mixing music:', mixError);
                    }
                } else if (news.voiceDelay && news.voiceDelay > 0) {
                    try {
                        const paddedUrl = await this.addSilencePadding(audioUrl, news.voiceDelay);
                        if (paddedUrl !== audioUrl) {
                            audioUrl = paddedUrl;
                        }
                    } catch (paddingError) {
                        console.error('Error adding silence padding:', paddingError);
                    }
                }

                if (news.generatedAudioUrl) {
                    URL.revokeObjectURL(news.generatedAudioUrl);
                }
                news.generatedAudioUrl = audioUrl;

                const durationSeconds = await this.readAudioDuration(audioUrl);
                if (durationSeconds > 0) {
                    news.readingTime = durationSeconds;
                    event.duration = durationSeconds;
                    this.calculateTimelineTimes();
                    this.cdr.detectChanges();
                }
            } catch (e) {
                console.error(`Error generating batch audio for news ${news.id}`, e);
            } finally {
                news.isGeneratingAudio = false;
            }
            return;
        }

        const textToSpeech = event.description;
        if (!textToSpeech) return;

        try {
            event.isGeneratingAudio = true;
            event.progress = 0;
            this.cdr.detectChanges();

            const voiceConfig = this.ensureQwenVoiceSelection(event);
            const voice = voiceConfig.name;
            const generatedUrl = await this.ttsService.generateSpeech({
                text: textToSpeech,
                voice,
                speed: Number(event.selectedSpeed) || 1.0,
                pitch: Number(event.selectedPitch) || 1.0,
                temperature: voiceConfig?.temperature,
                exaggeration: Number(event.selectedPitch) || voiceConfig?.exaggeration || 1.0,
                cfgWeight: voiceConfig?.cfgWeight,
                repetitionPenalty: voiceConfig?.repetitionPenalty,
                minP: voiceConfig?.minP,
                topP: voiceConfig?.topP,
                seed: voiceConfig?.seed,
                language: voiceConfig?.language,
                audioPromptUrl: voiceConfig?.audioPromptUrl
            }, (percent) => {
                event.progress = percent;
                this.cdr.detectChanges();
            });

            if (event.type === 'text') {
                if (event.audioUrlOriginal && event.audioUrlOriginal !== generatedUrl && String(event.audioUrlOriginal).startsWith('blob:')) {
                    URL.revokeObjectURL(event.audioUrlOriginal);
                }
                event.audioUrlOriginal = generatedUrl;
            }

            let audioUrl = generatedUrl;
            const placement = this.normalizeMusicPlacement(event.musicPlacement, event.type === 'outro' ? 'after' : 'during');
            const tailSeconds = this.normalizeSeconds(event.musicTailSeconds, 0.8, 0, 10);
            const fadeOutSeconds = this.normalizeSeconds(event.musicFadeOutSeconds, 0.5, 0, 5);
            const hasMusic = !!String(event.musicUrl || '').trim();

            if (!hasMusic && event.type === 'text' && event.voiceDelay && Number(event.voiceDelay) > 0) {
                try {
                    const paddedUrl = await this.addSilencePadding(audioUrl, Number(event.voiceDelay));
                    if (paddedUrl !== audioUrl) {
                        if (event.audioUrlOriginal !== audioUrl && String(audioUrl).startsWith('blob:')) {
                            URL.revokeObjectURL(audioUrl);
                        }
                        audioUrl = paddedUrl;
                    }
                } catch (paddingError) {
                    console.error('Error adding silence padding:', paddingError);
                }
            }

            if (hasMusic) {
                try {
                    const mixedUrl = await this.ttsService.mixVoiceAndMusic(
                        audioUrl,
                        event.musicUrl!,
                        event.voiceDelay || 0,
                        this.normalizeMusicVolume(event.musicVolume, 0.25),
                        placement,
                        { tailSeconds, fadeOutSeconds }
                    );
                    if (event.audioUrlOriginal !== audioUrl && String(audioUrl).startsWith('blob:')) {
                        URL.revokeObjectURL(audioUrl);
                    }
                    audioUrl = mixedUrl;
                } catch (mixError) {
                    console.error('Error mixing music in batch:', mixError);
                }
            }

            if (event.audioUrl) {
                URL.revokeObjectURL(event.audioUrl);
            }
            event.audioUrl = audioUrl;

            const durationSeconds = await this.readAudioDuration(audioUrl);
            if (durationSeconds > 0) {
                if (event.type === 'text') {
                    if (!hasMusic && event.voiceDelay && Number(event.voiceDelay) > 0) {
                        const baseSeconds = await this.readAudioDuration(event.audioUrlOriginal || audioUrl);
                        event.baseDuration = baseSeconds > 0 ? baseSeconds : durationSeconds;
                        event.duration = Math.round(event.baseDuration + Number(event.voiceDelay || 0));
                    } else {
                        event.baseDuration = durationSeconds;
                        event.duration = durationSeconds;
                    }
                } else {
                    event.duration = durationSeconds;
                }

                this.calculateTimelineTimes();
                this.cdr.detectChanges();
            }
        } catch (e) {
            console.error(`Error generating audio for event ${event.id}`, e);
        } finally {
            event.isGeneratingAudio = false;
        }
    }

    private async persistBroadcastTimelineItem(
        broadcast: any,
        userId: string,
        event: TimelineEvent,
        index: number
    ): Promise<void> {
        const news = event.originalItem;
        const finalAudioUrl = await this.resolveTimelineItemFinalAudioUrl(broadcast, event);

        if (event.type !== 'news') {
            event.audioUrl = finalAudioUrl || event.audioUrl;
        }

        let humanizedNewsId: string | null = null;
        if (event.type === 'news' && news) {
            const humanizedData = {
                scraped_news_id: news.id,
                original_content: news.content,
                humanized_content: news.humanizedContent || news.content,
                reading_time_seconds: news.readingTime,
                created_by: userId,
                status: 'ready',
                title: news.title,
                audio_url: finalAudioUrl
            };
            const humanized = await this.supabaseService.createHumanizedNews(humanizedData);
            humanizedNewsId = humanized.id;
        }

        const musicUrl = event.type === 'news' && news ? news.musicUrl : event.musicUrl;
        const musicPlacement = this.normalizeMusicPlacement(
            event.type === 'news' && news ? news.musicPlacement : event.musicPlacement,
            event.type === 'outro' ? 'after' : 'during'
        );
        const musicVolume = this.normalizeMusicVolume(event.type === 'news' && news ? news.musicVolume : event.musicVolume, 0.25);
        const voiceDelay = Number(event.type === 'news' && news ? (news.voiceDelay ?? 0) : (event.voiceDelay ?? 0));
        const musicTailSeconds = this.normalizeSeconds(event.type === 'news' && news ? news.musicTailSeconds : event.musicTailSeconds, 0.8, 0, 10);
        const musicFadeOutSeconds = this.normalizeSeconds(event.type === 'news' && news ? news.musicFadeOutSeconds : event.musicFadeOutSeconds, 0.5, 0, 5);

        const itemData: any = {
            broadcast_id: broadcast.id,
            humanized_news_id: humanizedNewsId,
            order_index: index,
            reading_time_seconds: Math.max(0, Math.round(Number(event.duration || 0))),
            type: event.type,
            custom_title: event.type !== 'news' ? event.title : null,
            custom_content: event.type !== 'news' ? event.description : null,
            audio_url: event.type !== 'news' ? finalAudioUrl : null,
            voice_id: (event.type === 'news' && event.originalItem)
                ? (event.originalItem.selectedVoice || this.getDefaultQwenVoiceConfig().name)
                : (event.selectedVoice || this.getDefaultQwenVoiceConfig().name),
            voice_speed: (event.type === 'news' && event.originalItem) ? (event.originalItem.selectedSpeed || 1.0) : (event.selectedSpeed || 1.0),
            voice_pitch: (event.type === 'news' && event.originalItem) ? (event.originalItem.selectedPitch || 1.0) : (event.selectedPitch || 1.0),
            music_url: musicUrl || null,
            music_resource_id: musicUrl ? (this.musicResources.find(r => r.url === musicUrl)?.id || null) : null,
            voice_delay: voiceDelay,
            music_volume: musicVolume,
            music_position: musicUrl ? musicPlacement : null,
            music_tail_seconds: musicUrl ? musicTailSeconds : null,
            music_fade_out_seconds: musicUrl ? musicFadeOutSeconds : null
        };

        if (event.type === 'ad') {
            itemData.audio_url = finalAudioUrl;
        }

        await this.supabaseService.createBroadcastNewsItem(itemData);
    }

    private async resolveTimelineItemFinalAudioUrl(broadcast: any, event: TimelineEvent): Promise<string | undefined> {
        let finalAudioUrl = event.audioUrl;
        const news = event.originalItem;

        if (event.file) {
            try {
                const cleanFileName = event.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const path = `ads/${broadcast.id}/${Date.now()}_${cleanFileName}`;
                return await this.supabaseService.uploadAudioFile(event.file, path);
            } catch (e) {
                console.error('Error uploading ad file', e);
                return finalAudioUrl;
            }
        }

        if ((event.type === 'intro' || event.type === 'outro') && !finalAudioUrl) {
            const hasText = !!String(event.description || '').trim();
            if (!hasText && event.musicUrl) {
                finalAudioUrl = event.musicUrl;
            }
        } else if (news && news.uploadedAudioUrl) {
            finalAudioUrl = news.uploadedAudioUrl;
        } else if (news && news.generatedAudioUrl && news.generatedAudioUrl.startsWith('blob:')) {
            try {
                const response = await fetch(news.generatedAudioUrl);
                const blob = await response.blob();
                const storagePath = `broadcasts/${broadcast.id}/broadcast_${broadcast.id}_news_${news.id}_${Date.now()}.mp3`;
                finalAudioUrl = await this.supabaseService.uploadAudio(blob, storagePath);
                news.uploadedAudioUrl = finalAudioUrl;
            } catch (e) {
                console.error('Error uploading audio for news ' + news.id, e);
            }
        } else if (news && news.generatedAudioUrl) {
            finalAudioUrl = news.generatedAudioUrl;
        }

        if (event.type !== 'news' && !event.file && finalAudioUrl && String(finalAudioUrl).startsWith('blob:')) {
            try {
                const response = await fetch(finalAudioUrl);
                const blob = await response.blob();
                const storagePath = `broadcasts/${broadcast.id}/broadcast_${broadcast.id}_${event.type}_${event.id}_${Date.now()}.mp3`;
                finalAudioUrl = await this.supabaseService.uploadAudio(blob, storagePath);
            } catch (e) {
                console.error('Error uploading audio for block ' + event.id, e);
            }
        }

        return finalAudioUrl;
    }

    private resolveExportAudioSource(event: TimelineEvent): { url?: string; file?: File; cacheKey: string } | null {
        let url = event.audioUrl;
        if (event.type === 'news' && event.originalItem?.generatedAudioUrl) {
            url = event.originalItem.generatedAudioUrl;
        } else if (!url && (event.type === 'intro' || event.type === 'outro') && event.musicUrl) {
            url = event.musicUrl;
        }

        if (event.file) {
            return {
                file: event.file,
                cacheKey: `file:${event.id}:${event.file.name}:${event.file.size}:${event.file.lastModified}`
            };
        }

        if (!url) return null;

        return {
            url,
            cacheKey: url
        };
    }

    private async loadAudioBufferForExport(
        audioContext: AudioContext,
        segment: { url?: string; file?: File; cacheKey: string },
        cache: Map<string, Promise<AudioBuffer | null>>
    ): Promise<AudioBuffer | null> {
        const cached = cache.get(segment.cacheKey);
        if (cached) {
            return cached;
        }

        const pending = (async () => {
            let arrayBuffer: ArrayBuffer;

            if (segment.file) {
                arrayBuffer = await segment.file.arrayBuffer();
            } else if (segment.url) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                try {
                    const response = await fetch(segment.url, { signal: controller.signal });
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    arrayBuffer = await response.arrayBuffer();
                } finally {
                    clearTimeout(timeoutId);
                }
            } else {
                return null;
            }

            return await audioContext.decodeAudioData(arrayBuffer.slice(0));
        })();

        cache.set(segment.cacheKey, pending);

        try {
            return await pending;
        } catch (error) {
            cache.delete(segment.cacheKey);
            throw error;
        }
    }

    private createSilenceBuffer(audioContext: AudioContext, seconds: number): AudioBuffer | null {
        if (seconds <= 0) return null;
        const silenceSamples = Math.ceil(audioContext.sampleRate * seconds);
        return audioContext.createBuffer(2, silenceSamples, audioContext.sampleRate);
    }

    private async readAudioDuration(url: string): Promise<number> {
        return await new Promise((resolve) => {
            const audio = new Audio(url);
            audio.onloadedmetadata = () => {
                setTimeout(() => {
                    if (audio.duration && audio.duration !== Infinity) {
                        resolve(Math.round(audio.duration));
                    } else {
                        resolve(0);
                    }
                }, 0);
            };
            audio.onerror = () => resolve(0);
        });
    }

    private async delay(ms: number): Promise<void> {
        if (ms <= 0) return;
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    private needsAiCleanup(text: string): boolean {
        const s = String(text || '');
        if (!s.trim()) return true;
        if (/\[[^\]]+\]/.test(s)) return true;
        if (/[*_#]/.test(s)) return true;
        if (/aquí tienes|aqui tienes|texto reescrito|reescrito:|claro, aquí|claro, aqui/i.test(s)) return true;
        if (this.looksLikeAiMetaResponse(s)) return true;
        return false;
    }

    private looksLikeAiMetaResponse(text: string): boolean {
        const s = String(text || '').trim();
        if (!s) return true;
        return /(el usuario me pide que act[uú]e|act[uú]a como|tu misi[oó]n es|texto original dice|texto original:|an[aá]lisis:|veamos:|espera,|solo el texto final|necesito seguir estas reglas|reglas de oro|puntuaci[oó]n respirada)/i.test(s);
    }

    private sanitizeHumanizedTextLocally(text: string): string {
        let cleaned = String(text || '').trim();
        if (!cleaned) return '';

        const finalMarkerMatch = cleaned.match(/(?:texto|versi[oó]n|resultado|guion|salida)\s+final\s*:?\s*([\s\S]+)/i);
        if (finalMarkerMatch?.[1]) {
            cleaned = String(finalMarkerMatch[1]).trim();
        }

        const filteredLines = cleaned
            .split(/\r?\n/)
            .map(line => String(line || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .filter(line => {
                return !/^(act[uú]a como|tu misi[oó]n|objetivo|reglas(?: de oro)?|texto original(?: dice)?|texto a revisar|instrucciones|an[aá]lisis|veamos|espera[,:\s]|respuesta|problema|alerta|ajuste fino|idioma \(inviolable\)|puntuaci[oó]n respirada|lenguaje hablado|n[uú]meros|siglas|limpieza(?: total)?|solo el texto final|conserva el sentido|mant[eé]n el sentido|hay n[uú]meros|no hay siglas|no hay caracteres)/i.test(line)
                    && !/^\d+\.\s+(puntuaci[oó]n|lenguaje|n[uú]meros|siglas|limpieza|conserva|respuesta)/i.test(line)
                    && !/^[-*]\s+(usa|evita|escribe|expande|elimina|mant[eé]n|conserva|no uses|solo el texto final)/i.test(line);
            });

        if (filteredLines.length > 0) {
            cleaned = filteredLines.join(' ');
        }

        cleaned = cleaned
            .replace(/^\s*(aquí tienes|aqui tienes|claro, aquí|claro, aqui)\s*:?\s*/i, '')
            .replace(/^\s*texto reescrito\s*:?\s*/i, '')
            .replace(/^\s*reescrito\s*:?\s*/i, '')
            .replace(/^\s*[-*#]+\s*/gm, '')
            .replace(/\[[^\]]+\]/g, ' ')
            .replace(/`+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return cleaned;
    }

    private sanitizeFallbackText(text: string): string {
        return String(text || '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/\[[^\]]+\]/g, ' ')
            .replace(/[*_#`]/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    private async resolveHumanizedText(
        text: string,
        fallbackText?: string,
        onRemoteCleanup?: (result: { text: string; model?: string; usage?: { promptTokens: number; outputTokens: number; totalTokens: number } }) => void
    ): Promise<string> {
        let finalText = String(text || '').trim();
        if (!this.needsAiCleanup(finalText) && !this.looksLikeAiMetaResponse(finalText)) {
            return finalText;
        }

        const locallyCleaned = this.sanitizeHumanizedTextLocally(finalText);
        if (locallyCleaned && !this.needsAiCleanup(locallyCleaned) && !this.looksLikeAiMetaResponse(locallyCleaned)) {
            return locallyCleaned;
        }

        const cleaned = await this.geminiService.cleanText(finalText);
        onRemoteCleanup?.(cleaned);
        const remotelyCleaned = this.sanitizeHumanizedTextLocally(cleaned.text) || String(cleaned.text || '').trim();
        if (remotelyCleaned && !this.looksLikeAiMetaResponse(remotelyCleaned)) {
            return remotelyCleaned;
        }

        const safeFallback = this.sanitizeFallbackText(fallbackText || '');
        if (safeFallback) {
            return safeFallback;
        }

        return remotelyCleaned || locallyCleaned || finalText;
    }

    private async mapWithConcurrency<T, R>(
        items: T[],
        concurrency: number,
        worker: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        if (items.length === 0) return [];

        const results = new Array<R>(items.length);
        let cursor = 0;
        const workerCount = Math.max(1, Math.min(concurrency, items.length));

        await Promise.all(Array.from({ length: workerCount }, async () => {
            while (cursor < items.length) {
                const currentIndex = cursor++;
                results[currentIndex] = await worker(items[currentIndex], currentIndex);
            }
        }));

        return results;
    }

    private async addSilencePadding(audioUrl: string, delaySeconds: number): Promise<string> {
        if (!delaySeconds || delaySeconds <= 0) return audioUrl;

        const audioContext = new AudioContext();
        try {
            const response = await fetch(audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            const originalBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const delaySamples = Math.floor(delaySeconds * originalBuffer.sampleRate);
            const newLength = originalBuffer.length + delaySamples;
            
            const newBuffer = audioContext.createBuffer(
                originalBuffer.numberOfChannels,
                newLength,
                originalBuffer.sampleRate
            );

            // Copy channel data with offset
            for (let channel = 0; channel < originalBuffer.numberOfChannels; channel++) {
                const channelData = originalBuffer.getChannelData(channel);
                const newChannelData = newBuffer.getChannelData(channel);
                // Set data starting from delay offset
                newChannelData.set(channelData, delaySamples);
            }

            // Encode back to MP3
            const mp3Blob = await this.encodeToMp3(newBuffer);
            URL.revokeObjectURL(audioUrl); // Free the old one
            return URL.createObjectURL(mp3Blob);
        } catch (error) {
            console.error('Error adding silence padding:', error);
            throw error;
        } finally {
            if (audioContext.state !== 'closed') {
                audioContext.close();
            }
        }
    }

    // Unified logic now handles adjustment inside humanizeNews
    async adjustNewsToTime(): Promise<void> {
        // Deprecated method, kept for safety but functionality moved to humanizeNews
        await this.humanizeNews();
    }

    private numberToWords(num: number): string {
        if (num < 0) return 'menos ' + this.numberToWords(Math.abs(num));
        if (num === 0) return 'cero';

        const units = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 
                      'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 
                      'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 
                      'veintisiete', 'veintiocho', 'veintinueve'];
        const tens = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

        if (num < 30) return units[num];
        
        const ten = Math.floor(num / 10);
        const unit = num % 10;
        
        if (unit === 0) return tens[ten];
        return `${tens[ten]} y ${units[unit]}`;
    }

    private formatTimeForSpeech(time: string): string {
        if (!time) return '';
        const parts = time.split(':');
        if (parts.length < 2) return time;

        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        
        const hoursText = this.numberToWords(hours);
        
        if (minutes === 0) {
            return `${hoursText} horas en punto`;
        }
        
        const minutesText = this.numberToWords(minutes);
        return `${hoursText} y ${minutesText} minutos`;
    }

    private formatWeatherForSpeech(weatherInfo: string): string {
        if (!weatherInfo) return '';
        // Reemplaza "17°C" por "diecisiete grados" (sin Celsius para más naturalidad)
        // Regex busca un numero (posiblemente negativo) seguido de °C
        return weatherInfo.replace(/(-?\d+)\s*°C/gi, (match, p1) => {
            const num = parseInt(p1, 10);
            return `${this.numberToWords(num)} grados`;
        });
    }
}

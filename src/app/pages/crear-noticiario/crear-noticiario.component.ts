import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import Swal from 'sweetalert2';
import { SupabaseService } from '../../services/supabase.service';
import { GeminiService } from '../../services/gemini.service';
import { AzureTtsService } from '../../services/azure-tts.service';
import { GoogleTtsService } from '../../services/google-tts.service';
import { WeatherService } from '../../services/weather.service';

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
    voiceSource?: 'azure' | 'custom';
    
    // Music config
    musicResourceId?: string;
    musicUrl?: string;
    musicName?: string;
    voiceDelay?: number; // seconds
    musicVolume?: number; // 0.0 to 1.0
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
    voiceSource?: 'azure' | 'custom';
    voiceDelay?: number; // Delay in seconds before audio starts (silence padding)
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

    // Available news
    availableNews: ScrapedNews[] = [];

    // Filter options
    categoryFilter = 'all';
    sourceFilter = 'all';
    dateFilter = 'all';

    // Source selection for scraping
    selectedSourceId: string = 'all';

    // Loading states
    loading = false;
    generating = false;
    loadingMessage = '';
    humanizing = false;
    adjustingTime = false;
    generatingSmartAudios = false; // New state for smart audio loop
    globalProgress = 0;
    audiosReady = false; // Only show progress bar when this is true
    hasHumanized = false; // Track if humanization has been done
    isExportingAudio = false;

    // News detail modal
    selectedNewsDetail: ScrapedNews | null = null;

    // Categories
    categories = ['all', 'general', 'deportes', 'tecnología', 'economía', 'política', 'entretenimiento'];

    // Sources
    sources: any[] = [];
    activeSources: any[] = [];
    sourceNames: string[] = [];

    // Audio options
    availableVoices: any[] = [];
    azureVoices: any[] = [];
    customVoices: any[] = [];
    musicResources: any[] = [];

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

    currentAudio: HTMLAudioElement | null = null;

    constructor(
        private supabaseService: SupabaseService,
        private snackBar: MatSnackBar,
        private cdr: ChangeDetectorRef,
        private router: Router,
        private geminiService: GeminiService,
        private azureTtsService: AzureTtsService,
        private weatherService: WeatherService
    ) {
        this.azureVoices = this.azureTtsService.getVoices();
        this.availableVoices = this.azureVoices;
    }

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.loadAvailableNews(),
            this.loadSources(),
            this.loadRadios(),
            this.loadCustomVoices(),
            this.loadMusicResources()
        ]);
    }

    ngOnDestroy(): void {
        // Cleanup all object URLs to prevent memory leaks
        this.timelineEvents.forEach(event => {
            if (event.audioUrl) {
                URL.revokeObjectURL(event.audioUrl);
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
    }

    async loadAvailableNews(): Promise<void> {
        this.loading = true;
        this.cdr.detectChanges();

        try {
            console.log('Loading scraped news...');
            const data = await this.supabaseService.safeFetch(
                () => this.supabaseService.getScrapedNews(),
                3, // 3 retries
                15000 // 15s timeout
            );
            console.log('Scraped news loaded:', data);

            // Map database fields to interface
            this.availableNews = (data || []).map(item => {
                // Calculate reading time based on content length (approx 150 words/min = 2.5 words/sec)
                const wordCount = item.content ? item.content.split(/\s+/).length : 0;
                const calculatedReadingTime = Math.ceil(wordCount / 2.5) || 30; // Default to 30s if empty

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
                    category: item.source_category || 'General',
                    publishedAt: item.published_at ? new Date(item.published_at) : undefined,
                    readingTime: calculatedReadingTime,
                    humanizedContent: item.humanizedContent, // Assuming this might come from view or join
                    formattedDate: this.formatDate(item.published_at ? new Date(item.published_at) : undefined)
                };
            });

            console.log('Available news mapped:', this.availableNews);
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
            this.cdr.detectChanges();
        }
    }

    async loadCustomVoices(): Promise<void> {
        try {
            const setting = await this.supabaseService.getSettingByKey('tts_custom_voices');
            const value = setting?.value;
            const customVoices = Array.isArray(value) ? value : [];
            
            this.azureVoices = this.azureTtsService.getVoices();
            
            this.customVoices = customVoices.map((voice: any) => {
                // Ensure Qwen voices have the correct name prefix for the service to recognize them
                const isQwen = voice.provider?.toLowerCase() === 'qwen';
                if (isQwen && !voice.name.startsWith('qwen:')) {
                    return { ...voice, name: `qwen:${voice.voiceId || voice.id}` };
                }
                return voice;
            });

            this.availableVoices = [...this.azureVoices, ...this.customVoices];
        } catch (error) {
            console.error('Error loading custom voices, using default Azure voices', error);
            this.azureVoices = this.azureTtsService.getVoices();
            this.customVoices = [];
            this.availableVoices = this.azureVoices;
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
                active: item.is_active,
                lastScraped: item.last_scraped || null,
                createdAt: item.created_at
            }));
            
            // Filter active sources
            this.activeSources = this.sources.filter(s => s.active);

            // Extract source names for the dropdown (only active sources)
            this.sourceNames = ['all', ...this.activeSources.map(s => s.name)];
            console.log('Sources loaded:', this.sources);
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
                    voiceSource: 'azure',
                    selectedVoice: 'es-CL-LorenzoNeural'
                };
                
                this.timelineEvents.unshift(newIntro);
                // Update orders
                this.timelineEvents.forEach((e, i) => e.order = i);
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
            const sourceMatch = this.sourceFilter === 'all' || news.source_name === this.sourceFilter;
            const dateMatch = this.dateFilter === 'all' || (news.publishedAt && this.checkDateFilter(news.publishedAt));
            const notSelected = !this.selectedNews.find(n => n.id === news.id);

            return sourceMatch && dateMatch && notSelected;
        });
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
            news.voiceSource = 'azure';
        }
        if (!news.selectedVoice) {
            news.selectedVoice = 'es-CL-LorenzoNeural';
        }

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
            // Update duration if it's a news item that might have been updated (e.g. audio generated)
            if (event.type === 'news' && event.originalItem) {
                event.duration = event.originalItem.readingTime || event.duration;
            }
            
            event.startTime = currentTime;
            currentTime += event.duration;
        });
    }

    addBlock(type: 'text' | 'intro' | 'outro') {
        const newItem: TimelineEvent = {
            id: this.generateUUID(),
            type: type,
            title: type === 'intro' ? 'Introducción' : type === 'outro' ? 'Cierre' : 'Nuevo Texto',
            description: type === 'intro' ? 'Bienvenidos al noticiero...' : type === 'outro' ? 'Gracias por sintonizar...' : 'Escribe aquí...',
            startTime: 0,
            duration: 30,
            order: this.timelineEvents.length,
            selectedVoice: 'es-CL-LorenzoNeural',
            voiceSource: 'azure',
            selectedSpeed: 1.0,
            showAudioPanel: this.hasHumanized, // Show panel immediately if already humanized phase
            voiceDelay: 0,
            musicVolume: 0.5
        };
        this.timelineEvents.push(newItem);
        this.calculateTimelineTimes();
    }

    async onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

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
            order: this.timelineEvents.length,
            file: file, // Store file for upload later
            audioUrl: objectUrl // Store the URL directly to avoid re-generating
        };
        this.timelineEvents.push(newItem);
        this.calculateTimelineTimes();
        this.cdr.detectChanges(); // Force update view
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
                if (item.voiceSource === 'custom') {
                     if (!voice) {
                        if (this.customVoices.length > 0) {
                            voice = this.customVoices[0].name;
                        } else {
                            throw new Error('No hay voces personalizadas disponibles');
                        }
                     }
                } else {
                    if (!voice) voice = 'es-CL-LorenzoNeural';
                }

                item.isGeneratingAudio = true;
                item.progress = 0; // Reset progress
                let audioUrl = await this.azureTtsService.generateSpeech({
                    text: textToSpeech,
                    voice: voice || 'es-CL-LorenzoNeural',
                    speed: Number(item.selectedSpeed) || 1.0,
                    pitch: Number(item.selectedPitch) || 1.0
                }, (percent) => {
                    item.progress = percent;
                    this.cdr.detectChanges();
                });

                // Mix with music if selected
                if (item.musicUrl) {
                    try {
                        const mixedUrl = await this.azureTtsService.mixVoiceAndMusic(
                            audioUrl,
                            item.musicUrl,
                            item.voiceDelay || 0,
                            item.musicVolume || 0.5
                        );
                        // Revoke original TTS url to avoid leaks, though it might be small
                        URL.revokeObjectURL(audioUrl);
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

    removeTimelineItem(index: number) {
        Swal.fire({
            title: '¿Estás seguro?',
            text: "No podrás revertir esto",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                const item = this.timelineEvents[index];
                
                // Revoke audio URL for non-news items (news are handled in removeNews)
                if (item.type !== 'news' && item.audioUrl) {
                    URL.revokeObjectURL(item.audioUrl);
                }

                if (item.type === 'news' && item.originalItem) {
                    // If it's a news item, remove from selectedNews as well
                    this.removeNews(item.originalItem);
                } else {
                    this.timelineEvents.splice(index, 1);
                    this.timelineEvents.forEach((e, i) => e.order = i);
                    this.calculateTimelineTimes();
                }
                Swal.fire(
                    'Eliminado!',
                    'El bloque ha sido eliminado.',
                    'success'
                );
            }
        });
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    getTotalReadingTime(): number {
        return this.timelineEvents.reduce((acc, curr) => acc + curr.duration, 0);
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

    canCreateBroadcast(): boolean {
        return this.broadcastTitle.trim() !== '' &&
            this.selectedNews.length > 0;
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
                total_reading_time_seconds: this.getTotalReadingTime(),
                created_by: user.id,
                radio_id: this.selectedRadioId || null,
                scheduled_time: this.scheduledTime || null
            };

            const broadcast = await this.supabaseService.createNewsBroadcast(broadcastData);
            if (!broadcast) throw new Error('Error al crear el noticiero');

            // 2. Create Timeline Items
            this.loadingMessage = 'Guardando bloques y subiendo audios...';
            this.cdr.detectChanges();
            
            for (let i = 0; i < this.timelineEvents.length; i++) {
                this.loadingMessage = `Procesando bloque ${i + 1} de ${this.timelineEvents.length}...`;
                this.cdr.detectChanges();
                
                const event = this.timelineEvents[i];
                let finalAudioUrl = event.audioUrl;
                let news = event.originalItem; // If it's a news item

                // Handle Audio Uploads for non-news items (Ads) or generated audio for news
                if (event.file) {
                    // Upload ad file
                    try {
                        const cleanFileName = event.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                        const path = `ads/${broadcast.id}/${Date.now()}_${cleanFileName}`;
                        finalAudioUrl = await this.supabaseService.uploadAudioFile(event.file, path);
                    } catch (e) {
                        console.error('Error uploading ad file', e);
                    }
                } else if (news && news.uploadedAudioUrl) {
                    finalAudioUrl = news.uploadedAudioUrl;
                } else if (news && news.generatedAudioUrl && news.generatedAudioUrl.startsWith('blob:')) {
                    // Upload generated news audio
                    try {
                        const response = await fetch(news.generatedAudioUrl);
                        const blob = await response.blob();
                        const fileName = `broadcast_${broadcast.id}_news_${news.id}_${Date.now()}.mp3`;
                        // Ensure uploadAudio exists in SupabaseService
                        finalAudioUrl = await this.supabaseService.uploadAudio(blob, fileName);
                        news.uploadedAudioUrl = finalAudioUrl;
                    } catch (e) {
                        console.error('Error uploading audio for news ' + news.id, e);
                    }
                } else if (news && news.generatedAudioUrl) {
                    finalAudioUrl = news.generatedAudioUrl; // Already a URL (if reused)
                }

                // Assign the final URL back to the event/news so we can use it for concatenation if needed (though we can use blobs too)
                // For concatenation, we might want to fetch from the URL if we don't have the blob anymore, 
                // but since we are in the same session, we might still have access.
                // However, for the export function, let's use the URLs we just established.
                if (event.type === 'news' && news) {
                    // news.generatedAudioUrl = finalAudioUrl; // Do NOT overwrite blob URL to avoid re-downloading
                } else {
                    event.audioUrl = finalAudioUrl;
                }

                // Create humanized_news entry if it's a news item
                let humanizedNewsId = null;
                if (event.type === 'news' && news) {
                    const humanizedData = {
                        scraped_news_id: news.id,
                        original_content: news.content,
                        humanized_content: news.humanizedContent || news.content,
                        reading_time_seconds: news.readingTime,
                        created_by: user.id,
                        status: 'ready',
                        title: news.title,
                        audio_url: finalAudioUrl
                    };
                    const humanized = await this.supabaseService.createHumanizedNews(humanizedData);
                    humanizedNewsId = humanized.id;
                }

                // Create Broadcast Item
                const itemData = {
                    broadcast_id: broadcast.id,
                    humanized_news_id: humanizedNewsId,
                    order_index: i,
                    reading_time_seconds: event.duration,
                    type: event.type,
                    custom_title: event.type !== 'news' ? event.title : null,
                    custom_content: event.type !== 'news' ? event.description : null,
                    audio_url: event.type !== 'news' ? finalAudioUrl : null,
                    // Save voice configuration
                    voice_id: (event.type === 'news' && event.originalItem) ? (event.originalItem.selectedVoice || 'es-CL-LorenzoNeural') : (event.selectedVoice || 'es-CL-LorenzoNeural'),
                    voice_speed: (event.type === 'news' && event.originalItem) ? (event.originalItem.selectedSpeed || 1.0) : (event.selectedSpeed || 1.0),
                    voice_pitch: (event.type === 'news' && event.originalItem) ? (event.originalItem.selectedPitch || 1.0) : (event.selectedPitch || 1.0),
                    
                    // Save music configuration
                    music_resource_id: event.musicUrl ? (this.musicResources.find(r => r.url === event.musicUrl)?.id || null) : null,
                    voice_delay: event.voiceDelay || 0,
                    music_volume: event.musicVolume || 0.5
                };
                
                // If it's an ad, audio_url goes to item. 
                if (event.type === 'ad') {
                    itemData.audio_url = finalAudioUrl;
                }

                await this.supabaseService.createBroadcastNewsItem(itemData);
            }

            // 3. Generate Full MP3, Save to DB and Auto-Download
            this.loadingMessage = 'Concatenando y generando audio final...';
            this.cdr.detectChanges();
            await this.generateAndExportFullAudio(broadcast);

            this.snackBar.open('¡Noticiero creado y descargado exitosamente!', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top'
            });

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

    async generateAndExportFullAudio(broadcast: any) {
        this.isExportingAudio = true;
        this.cdr.detectChanges();
        this.snackBar.open('Generando MP3 final del noticiero...', 'OK', { duration: 3000 });

        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffers: AudioBuffer[] = [];

            // 1. Fetch and Decode all audio segments
            for (const event of this.timelineEvents) {
                let url = event.audioUrl;
                if (event.type === 'news' && event.originalItem?.generatedAudioUrl) {
                    url = event.originalItem.generatedAudioUrl;
                } else if (event.file) {
                    url = URL.createObjectURL(event.file);
                }

                if (url) {
                    try {
                        // Add timeout to prevent hanging
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
                        
                        const response = await fetch(url, { signal: controller.signal });
                        clearTimeout(timeoutId);
                        
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        
                        const arrayBuffer = await response.arrayBuffer();
                        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                        audioBuffers.push(audioBuffer);
                    } catch (e) {
                        console.error(`Error loading audio segment from ${url}:`, e);
                        // Don't fail completely, just skip this segment but log it
                        this.snackBar.open('Advertencia: Un segmento de audio falló y será omitido.', 'OK', { duration: 3000 });
                    }
                }
            }

            if (audioBuffers.length === 0) {
                console.warn('No audio buffers to concatenate');
                return;
            }

            // 2. Concatenate
            const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
            const offlineCtx = new OfflineAudioContext(2, totalLength, 44100); // Standard 44.1kHz
            
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
            const mp3Blob = await this.encodeToMp3(renderedBuffer);

            // 4. Upload Full Audio to Supabase
            const fileName = `full_broadcast_${broadcast.id}_${Date.now()}.mp3`;
            const file = new File([mp3Blob], fileName, { type: 'audio/mp3' });
            const storagePath = `broadcasts/${broadcast.id}/${fileName}`;
            const publicUrl = await this.supabaseService.uploadAudioFile(file, storagePath);

            // 5. Save to generated_broadcasts table
            await this.supabaseService.createGeneratedBroadcast({
                broadcast_id: broadcast.id,
                title: broadcast.title,
                audio_url: publicUrl,
                duration_seconds: Math.ceil(renderedBuffer.duration)
            });

            // 6. Trigger Download
            const downloadUrl = URL.createObjectURL(mp3Blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `${broadcast.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);

        } catch (error) {
            console.error('Error exporting audio:', error);
            // Re-throw so createBroadcast knows it failed
            throw error;
        }
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

    async scrapeNews(): Promise<void> {
        if (this.sources.length === 0) {
            this.snackBar.open('No hay fuentes configuradas para scrapear', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
                panelClass: ['error-snackbar']
            });
            return;
        }

        this.loading = true;
        this.cdr.detectChanges();

        try {
            console.log('Scraping news from selected sources...');

            // Get source IDs based on selection
            let sourceIds: string[];
            if (this.selectedSourceId === 'all') {
                sourceIds = this.activeSources.map(s => s.id);
            } else {
                sourceIds = [this.selectedSourceId];
            }

            console.log('Selected sources:', sourceIds);

            // Call the backend API to scrape news
            const response = await fetch(`/api/scrape`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sources: sourceIds
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error scraping news:', errorData);
                throw new Error(errorData.error || 'Error al obtener noticias');
            }

            const data = await response.json();
            console.log('Scraping response:', data);

            this.snackBar.open(
                `Noticias obtenidas exitosamente: ${data.count} noticias`,
                'Cerrar',
                {
                    duration: 3000,
                    horizontalPosition: 'end',
                    verticalPosition: 'top'
                }
            );

            // Reload news after scraping
            await this.loadAvailableNews();
        } catch (error) {
            console.error('Error scraping sources:', error);
            this.snackBar.open(
                'Error al obtener noticias. Por favor intenta nuevamente.',
                'Cerrar',
                {
                    duration: 3000,
                    horizontalPosition: 'end',
                    verticalPosition: 'top',
                    panelClass: ['error-snackbar']
                }
            );
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    viewNewsDetail(news: ScrapedNews): void {
        this.selectedNewsDetail = news;
    }

    closeNewsDetail(): void {
        this.selectedNewsDetail = null;
    }

    // Audio methods
    toggleAudioPanel(news: ScrapedNews): void {
        news.showAudioPanel = !news.showAudioPanel;
        
        // Initialize defaults if opening for first time
        if (news.showAudioPanel && !news.selectedVoice) {
            news.selectedVoice = 'es-CL-LorenzoNeural';
            news.selectedSpeed = 1.0;
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
                const wordCount = textToSpeech.split(/\s+/).length;
                const estimatedBaseDuration = wordCount / 2.5;
                
                // Required speed = Estimated / Target
                let calculatedSpeed = estimatedBaseDuration / news.targetDuration;
                
                // Clamp speed (0.75 to 1.25) to keep it natural
                // If it needs to be faster than 1.25x, we cap it (better to be long than unintelligible)
                // If it needs to be slower than 0.75x, we cap it (better to be short than robotic)
                calculatedSpeed = Math.min(Math.max(calculatedSpeed, 0.75), 1.25);
                
                news.selectedSpeed = Number(calculatedSpeed.toFixed(2));
                console.log(`Auto-adjusting speed to ${news.selectedSpeed} for target ${news.targetDuration}s (Est: ${estimatedBaseDuration}s)`);
            }

            let voice = news.selectedVoice;
            if (news.voiceSource === 'custom') {
                 if (!voice) {
                    if (this.customVoices.length > 0) {
                        voice = this.customVoices[0].name;
                    } else {
                        throw new Error('No hay voces personalizadas disponibles. Por favor seleccione una voz de Recursos.');
                    }
                 }
            } else {
                // Azure default
                if (!voice) voice = 'es-CL-LorenzoNeural';
            }

            news.progress = 0; // Reset progress
            const audioUrl = await this.azureTtsService.generateSpeech({
                text: textToSpeech,
                voice: voice || 'es-CL-LorenzoNeural',
                speed: Number(news.selectedSpeed) || 1.0,
                pitch: Number(news.selectedPitch) || 1.0
            }, (percent) => {
                news.progress = percent;
                this.cdr.detectChanges();
            });

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
                    console.log(`Actual audio duration: ${audio.duration}s (Target: ${news.targetDuration}s)`);
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

    setVoiceSource(item: any, source: 'azure' | 'custom'): void {
        const targetItem = item.originalItem || item;
        targetItem.voiceSource = source;

        if (source === 'custom') {
            if (this.customVoices.length > 0) {
                // Check if current selection is valid for custom
                const exists = this.customVoices.find(v => v.name === targetItem.selectedVoice);
                if (!exists) {
                    targetItem.selectedVoice = this.customVoices[0].name;
                }
            } else {
                targetItem.selectedVoice = null; // No custom voices
            }
        } else {
            // Default to Azure
            if (this.azureVoices.length > 0) {
                 // Check if current selection is valid for azure
                const exists = this.azureVoices.find(v => v.name === targetItem.selectedVoice);
                if (!exists) {
                    targetItem.selectedVoice = 'es-CL-LorenzoNeural'; // Default fallback
                }
            }
        }

        // Invalidate existing audio when source changes
        this.invalidateAudio(item);
    }

    invalidateAudio(item: TimelineEvent) {
        // Clear audio for this item
        if (item.audioUrl) {
            URL.revokeObjectURL(item.audioUrl);
            item.audioUrl = undefined;
        }
        
        // If it's a news item, clear the original news audio too
        if (item.type === 'news' && item.originalItem) {
            if (item.originalItem.generatedAudioUrl) {
                URL.revokeObjectURL(item.originalItem.generatedAudioUrl);
                item.originalItem.generatedAudioUrl = undefined;
            }
        }
        
        this.cdr.detectChanges();
    }

    // Simplified Humanize Only (Reverted as per user request)
    async humanizeNews(): Promise<void> {
        // We allow humanizing even if no news selected, as long as there are timeline events?
        // User said "humanizar solo las noticias". If no news, maybe skip humanization but show audio panels?
        // Let's assume we proceed if there are any timeline events.
        
        this.humanizing = true;
        this.cdr.detectChanges();

        try {
            // 1. Humanize News
            if (this.selectedNews.length > 0) {
                // Process sequentially to avoid 429 Resource Exhausted errors
                for (const news of this.selectedNews) {
                    try {
                        // Just humanize style, don't worry about length yet
                        const humanized = await this.geminiService.humanizeText(news.content);
                        
                        // Second pass: Clean and proofread (User request: "segunda consulta de ia para limpiar")
                        const cleaned = await this.geminiService.cleanText(humanized);

                        news.humanizedContent = cleaned;
                        
                        // Initial reading time estimate
                        const words = cleaned.split(/\s+/).length;
                        news.readingTime = Math.ceil((words / 150) * 60);
                        
                        // Reset audio
                        news.generatedAudioUrl = undefined;
                        
                        // Set default voice if not set
                        if (!news.selectedVoice) {
                            news.selectedVoice = 'es-CL-LorenzoNeural';
                            news.selectedSpeed = 1.0;
                        }
                        
                        // Small delay to be gentle on the API
                        await new Promise(resolve => setTimeout(resolve, 1000));

                    } catch (error) {
                        console.error(`Error humanizing news ${news.id}:`, error);
                    }
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
                        event.selectedVoice = 'es-CL-LorenzoNeural';
                        event.selectedSpeed = 1.0;
                    }
                }
            });

            this.hasHumanized = true;

            this.snackBar.open('Noticias humanizadas. Ahora configura voces y genera el audio exacto.', 'Cerrar', {
                duration: 4000,
                panelClass: ['success-snackbar']
            });
        } catch (error) {
            console.error('Error humanizing news:', error);
            this.snackBar.open('Error al procesar noticias', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        } finally {
            this.humanizing = false;
            this.calculateTimelineTimes();
            this.cdr.detectChanges();
        }
    }

    // New Smart Generation Logic
    async generateSmartAudiosAndAdjust(): Promise<void> {
        if (this.selectedNews.length === 0) return;

        this.generatingSmartAudios = true;
        this.audiosReady = false;
        this.globalProgress = 0;
        this.cdr.detectChanges();

        try {
            // 1. Initial Audio Generation (Pass 1)
            // We need to know the REAL duration of what we currently have
            console.log('Starting Smart Audio Generation - Pass 1');
            // Assume 50% progress for first pass, will jump to 100% if no adjustment needed
            await this.generateBatchAudios(0, 50);

            // 2. Check Total Duration
            const targetTotalSeconds = this.duration * 60;
            const currentTotalSeconds = this.getTotalReadingTime(); // Now based on audio duration
            
            const diff = Math.abs(currentTotalSeconds - targetTotalSeconds);
            console.log(`Duration check: Target ${targetTotalSeconds}s, Actual ${currentTotalSeconds}s, Diff ${diff}s`);

            // Tolerance: +/- 5 seconds (User wants "EXACTO" but we need a break condition)
            if (diff > 5) {
                this.snackBar.open(`Ajustando duración (Diferencia: ${diff}s)...`, 'OK', { duration: 2000 });
                
                // 3. Adjustment Loop
                // Calculate global ratio needed
                const ratio = targetTotalSeconds / currentTotalSeconds;
                console.log(`Adjustment needed. Ratio: ${ratio}`);

                // Process sequentially to avoid 429 errors
                let processedAdjustments = 0;
                const totalAdjustments = this.selectedNews.length;

                for (const news of this.selectedNews) {
                    // Only adjust if we have a valid audio duration to base calculations on
                    if (news.readingTime && news.humanizedContent) {
                        const currentWords = news.humanizedContent.split(/\s+/).length;
                        // Calculate WPM for this specific voice/speed combo
                        const wpm = (currentWords / news.readingTime) * 60;
                        
                        // Calculate new target words for this item to match the global ratio
                        // Target Time = Current Time * Ratio
                        // Target Words = (Target Time / 60) * WPM
                        const targetItemTime = news.readingTime * ratio;
                        const targetItemWords = Math.round((targetItemTime / 60) * wpm);

                        console.log(`Adjusting News ${news.id}: Current ${news.readingTime}s (${currentWords} words) -> Target ${targetItemTime.toFixed(1)}s (${targetItemWords} words)`);

                        // Call Gemini to resize text
                        try {
                            let adjustedText = await this.geminiService.adjustToWordCount(news.humanizedContent, targetItemWords);
                            
                            // Also clean adjusted text to be safe
                            adjustedText = await this.geminiService.cleanText(adjustedText);
                            
                            news.humanizedContent = adjustedText;
                            
                            // Clear audio to force regeneration
                            news.generatedAudioUrl = undefined;

                            // Small delay
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (err) {
                            console.error(`Error adjusting news ${news.id}`, err);
                        }
                    }
                    // Update progress for adjustment phase (50% -> 60%)
                    processedAdjustments++;
                    this.globalProgress = 50 + ((processedAdjustments / totalAdjustments) * 10);
                    this.cdr.detectChanges();
                }

                // 4. Regenerate Audio (Pass 2)
                console.log('Regenerating Audios after adjustment...');
                // Pass 2: 60% -> 100%
                await this.generateBatchAudios(60, 100);
            } else {
                // If no adjustment needed, complete progress
                this.globalProgress = 100;
                this.cdr.detectChanges();
            }

            // Success
            this.audiosReady = true;
            this.snackBar.open('¡Audio generado y ajustado al tiempo exacto!', 'Cerrar', {
                duration: 4000,
                panelClass: ['success-snackbar']
            });

        } catch (error) {
            console.error('Error in smart generation:', error);
            this.snackBar.open('Error al generar audios inteligentes', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        } finally {
            this.generatingSmartAudios = false;
            this.cdr.detectChanges();
        }
    }

    async generateBatchAudios(startProgress: number = 0, endProgress: number = 100): Promise<void> {
        // Calculate total items to process for progress tracking
        const itemsToProcess = this.timelineEvents.filter(e => e.type !== 'ad').length;
        let completedItems = 0;
        const updateProgress = () => {
            completedItems++;
            const currentBatchProgress = (completedItems / itemsToProcess) * (endProgress - startProgress);
            this.globalProgress = Math.min(startProgress + currentBatchProgress, endProgress);
            this.cdr.detectChanges();
        };

        // Generate audio for all timeline events (except ads) - SEQUENTIAL to avoid 429
        for (const event of this.timelineEvents) {
            if (event.type === 'ad') continue;

            // Small delay between requests to be gentle with APIs
            await new Promise(resolve => setTimeout(resolve, 500));

            // Logic for News
            if (event.type === 'news' && event.originalItem) {
                const news = event.originalItem;
                const textToSpeech = news.humanizedContent || news.content;
                
                let voice = news.selectedVoice;
                if (news.voiceSource === 'custom') {
                    if (!voice && this.customVoices.length > 0) {
                        voice = this.customVoices[0].name;
                    }
                } else {
                    if (!voice) voice = 'es-CL-LorenzoNeural';
                }

                try {
                    news.isGeneratingAudio = true;
                    news.progress = 0; // Reset progress
                    this.cdr.detectChanges(); // Ensure UI reflects loading state

                    let audioUrl = await this.azureTtsService.generateSpeech({
                        text: textToSpeech,
                        voice: voice || 'es-CL-LorenzoNeural',
                        speed: Number(news.selectedSpeed) || 1.0,
                        pitch: Number(news.selectedPitch) || 1.0
                    }, (percent) => {
                        news.progress = percent;
                        this.cdr.detectChanges();
                    });

                    // Add silence padding if requested
                    if (news.voiceDelay && news.voiceDelay > 0) {
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

                    // Measure exact duration
                    const audio = new Audio(audioUrl);
                    await new Promise((resolve) => {
                        audio.onloadedmetadata = () => {
                            setTimeout(() => {
                                if (audio.duration && audio.duration !== Infinity) {
                                    news.readingTime = Math.round(audio.duration);
                                    // Update event duration as well
                                    event.duration = news.readingTime;
                                    this.calculateTimelineTimes();
                                    this.cdr.detectChanges();
                                }
                                resolve(true);
                            }, 0);
                        };
                        audio.onerror = () => resolve(false);
                    });
                } catch (e) {
                    console.error(`Error generating batch audio for news ${news.id}`, e);
                    // Continue with next item even if this one failed
                } finally {
                    news.isGeneratingAudio = false;
                    updateProgress(); // Update progress when item is done
                }
                continue;
            }

            // Logic for Text, Intro, Outro
            const textToSpeech = event.description;
            if (!textToSpeech) {
                updateProgress(); // Skip but count as done
                continue;
            }

            let voice = event.selectedVoice;
            if (event.voiceSource === 'custom') {
                if (!voice && this.customVoices.length > 0) {
                    voice = this.customVoices[0].name;
                }
            } else {
                if (!voice) voice = 'es-CL-LorenzoNeural';
            }

            try {
                event.isGeneratingAudio = true;
                event.progress = 0; // Reset progress
                this.cdr.detectChanges(); // Ensure UI reflects loading state

                let audioUrl = await this.azureTtsService.generateSpeech({
                    text: textToSpeech,
                    voice: voice || 'es-CL-LorenzoNeural',
                    speed: Number(event.selectedSpeed) || 1.0,
                    pitch: Number(event.selectedPitch) || 1.0
                }, (percent) => {
                    event.progress = percent;
                    this.cdr.detectChanges();
                });

                // Mix with music if selected (only for intro/outro)
                if ((event.type === 'intro' || event.type === 'outro') && event.musicUrl) {
                     try {
                        const mixedUrl = await this.azureTtsService.mixVoiceAndMusic(
                            audioUrl,
                            event.musicUrl,
                            event.voiceDelay || 0,
                            event.musicVolume || 0.5,
                            event.type as 'intro' | 'outro' // Pass the mode
                        );
                        URL.revokeObjectURL(audioUrl);
                        audioUrl = mixedUrl;
                    } catch (mixError) {
                        console.error('Error mixing music in batch:', mixError);
                    }
                }

                if (event.audioUrl) {
                    URL.revokeObjectURL(event.audioUrl);
                }
                event.audioUrl = audioUrl;
                
                // Measure exact duration
                const audio = new Audio(audioUrl);
                await new Promise((resolve) => {
                    audio.onloadedmetadata = () => {
                        setTimeout(() => {
                            if (audio.duration && audio.duration !== Infinity) {
                                event.duration = Math.round(audio.duration);
                                this.calculateTimelineTimes();
                                this.cdr.detectChanges();
                            }
                            resolve(true);
                        }, 0);
                    };
                    audio.onerror = () => resolve(false);
                });
            } catch (e) {
                console.error(`Error generating audio for event ${event.id}`, e);
            } finally {
                event.isGeneratingAudio = false;
                updateProgress(); // Update progress when item is done
            }
        }
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

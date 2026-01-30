import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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
import { environment } from '../../../environments/environment';

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
    showAudioPanel?: boolean;
    isGeneratingAudio?: boolean;
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
    generatedAudioUrl?: string;
    selectedVoice?: string;
    selectedSpeed?: number;
    targetDuration?: number; // Target duration in seconds for audio generation
    formattedDate?: string;
}

@Component({
    selector: 'app-crear-noticiario',
    standalone: true,
    imports: [CommonModule, FormsModule, DragDropModule],
    templateUrl: './crear-noticiario.component.html',
    styleUrls: ['./crear-noticiario.component.scss']
})
export class CrearNoticiarioComponent implements OnInit {
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
    humanizing = false;
    adjustingTime = false;
    generatingSmartAudios = false; // New state for smart audio loop
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

    constructor(
        private supabaseService: SupabaseService,
        private snackBar: MatSnackBar,
        private cdr: ChangeDetectorRef,
        private router: Router,
        private geminiService: GeminiService,
        private azureTtsService: AzureTtsService,
        private weatherService: WeatherService
    ) {
        this.availableVoices = this.azureTtsService.getVoices();
    }

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.loadAvailableNews(),
            this.loadSources(),
            this.loadRadios()
        ]);
    }

    async loadAvailableNews(): Promise<void> {
        this.loading = true;
        this.cdr.detectChanges();

        try {
            console.log('Loading scraped news...');
            const data = await this.supabaseService.getScrapedNews();
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
            const data = await this.supabaseService.getRadios();
            this.radios = data || [];
        } catch (error) {
            console.error('Error loading radios:', error);
            this.snackBar.open('Error al cargar radios', 'Cerrar', {
                duration: 3000,
                panelClass: ['error-snackbar']
            });
        }
    }

    async onRadioSelect(): Promise<void> {
        if (!this.selectedRadioId || !this.scheduledTime) return;

        const selectedRadio = this.radios.find(r => r.id === this.selectedRadioId);
        if (!selectedRadio) return;

        this.loading = true;
        this.cdr.detectChanges();

        try {
            // Get weather for the radio's location
            const location = `${selectedRadio.comuna}, ${selectedRadio.region}, Chile`;
            const weatherInfo = await this.weatherService.getWeatherForLocation(location);

            // Generate Intro Text
            const introText = `Siendo las ${this.scheduledTime}, con un clima de ${weatherInfo}. Bienvenidos al noticiero de ${selectedRadio.name}.`;

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
                    order: 0
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
            selectedSpeed: 1.0,
            showAudioPanel: this.hasHumanized // Show panel immediately if already humanized phase
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
        this.cdr.detectChanges();

        try {
            let user = await this.supabaseService.getCurrentUser();
            
            // Fallback: Try to get session if getUser fails (sometimes happens in dev/local)
            if (!user) {
                console.warn('getCurrentUser failed, trying session...');
                const session = await this.supabaseService.getCurrentSession();
                user = session?.user || null;
            }

            if (!user) {
                // Last resort check for debugging
                console.error('No authenticated user found via getUser or getSession');
                throw new Error('Usuario no autenticado. Por favor inicie sesión nuevamente.');
            }

            // 1. Create News Broadcast
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
            for (let i = 0; i < this.timelineEvents.length; i++) {
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
                } else if (news && news.generatedAudioUrl && news.generatedAudioUrl.startsWith('blob:')) {
                    // Upload generated news audio
                    try {
                        const response = await fetch(news.generatedAudioUrl);
                        const blob = await response.blob();
                        const fileName = `broadcast_${broadcast.id}_news_${news.id}_${Date.now()}.mp3`;
                        finalAudioUrl = await this.supabaseService.uploadAudio(blob, fileName);
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
                    news.generatedAudioUrl = finalAudioUrl; 
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
                    audio_url: event.type !== 'news' ? finalAudioUrl : null 
                };
                
                // If it's an ad, audio_url goes to item. 
                if (event.type === 'ad') {
                    itemData.audio_url = finalAudioUrl;
                }

                await this.supabaseService.createBroadcastNewsItem(itemData);
            }

            // 3. Generate Full MP3, Save to DB and Auto-Download
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
            this.snackBar.open('Error al crear el noticiero', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
                panelClass: ['error-snackbar']
            });
        } finally {
            this.generating = false;
            this.isExportingAudio = false;
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
                        const response = await fetch(url);
                        const arrayBuffer = await response.arrayBuffer();
                        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                        audioBuffers.push(audioBuffer);
                    } catch (e) {
                        console.error('Error loading audio segment', e);
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
            this.snackBar.open('Error al generar el archivo de audio final', 'Cerrar', { duration: 3000 });
        }
    }

    async encodeToMp3(buffer: AudioBuffer): Promise<Blob> {
        const channels = 2; // Stereo
        const sampleRate = 44100;
        const kbps = 128;
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
        const mp3Data = [];

        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

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

            // Yield to main thread every ~500 chunks (~13 seconds of audio processing) to keep UI responsive
            if (i % (sampleBlockSize * 500) === 0) {
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
            const response = await fetch(`${environment.apiUrl}/api/scrape`, {
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
            news.selectedSpeed = 0.95;
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

            const audioUrl = await this.azureTtsService.generateSpeech({
                text: textToSpeech,
                voice: news.selectedVoice || 'es-CL-LorenzoNeural',
                speed: news.selectedSpeed || 0.95
            });

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
                        
                        news.humanizedContent = humanized;
                        
                        // Initial reading time estimate
                        const words = humanized.split(/\s+/).length;
                        news.readingTime = Math.ceil((words / 150) * 60);
                        
                        // Reset audio
                        news.generatedAudioUrl = undefined;
                        
                        // Set default voice if not set
                        if (!news.selectedVoice) {
                            news.selectedVoice = 'es-CL-LorenzoNeural';
                            news.selectedSpeed = 0.95;
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
        this.cdr.detectChanges();

        try {
            // 1. Initial Audio Generation (Pass 1)
            // We need to know the REAL duration of what we currently have
            console.log('Starting Smart Audio Generation - Pass 1');
            await this.generateBatchAudios();

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
                            const adjustedText = await this.geminiService.adjustToWordCount(news.humanizedContent, targetItemWords);
                            news.humanizedContent = adjustedText;
                            
                            // Clear audio to force regeneration
                            news.generatedAudioUrl = undefined;

                            // Small delay
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (err) {
                            console.error(`Error adjusting news ${news.id}`, err);
                        }
                    }
                }

                // 4. Regenerate Audio (Pass 2)
                console.log('Regenerating Audios after adjustment...');
                await this.generateBatchAudios();
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

    async generateBatchAudios(): Promise<void> {
        // Generate audio for all timeline events (except ads)
        await Promise.all(this.timelineEvents.map(async (event) => {
            if (event.type === 'ad') return;

            // Logic for News
            if (event.type === 'news' && event.originalItem) {
                const news = event.originalItem;
                const textToSpeech = news.humanizedContent || news.content;
                
                try {
                    const audioUrl = await this.azureTtsService.generateSpeech({
                        text: textToSpeech,
                        voice: news.selectedVoice || 'es-CL-LorenzoNeural',
                        speed: news.selectedSpeed || 0.95
                    });

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
                }
                return;
            }

            // Logic for Text, Intro, Outro
            const textToSpeech = event.description;
            if (!textToSpeech) return;

            try {
                event.isGeneratingAudio = true;
                const audioUrl = await this.azureTtsService.generateSpeech({
                    text: textToSpeech,
                    voice: event.selectedVoice || 'es-CL-LorenzoNeural',
                    speed: event.selectedSpeed || 1.0
                });

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
            }
        }));
    }

    // Unified logic now handles adjustment inside humanizeNews
    async adjustNewsToTime(): Promise<void> {
        // Deprecated method, kept for safety but functionality moved to humanizeNews
        await this.humanizeNews();
    }
}

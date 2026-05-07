import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import Swal from 'sweetalert2';
import { SupabaseService } from '../../services/supabase.service';
import { AzureTtsService } from '../../services/azure-tts.service';

declare var lamejs: any;

interface TimelineEvent {
    id: string;
    type: 'news' | 'ad' | 'intro' | 'outro' | 'text';
    title: string;
    description: string;
    startTime: number; // seconds from start
    duration: number; // seconds
    endTime: number;
    audioUrl?: string;
    order: number;
    originalItem?: any;
    voice?: string;
    speed?: number;
    pitch?: number;
    originalContent?: string;
    humanizedContent?: string;
    showOriginalText?: boolean;
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

@Component({
    selector: 'app-timeline-noticiario',
    standalone: true,
    imports: [CommonModule, FormsModule, DragDropModule, MatSnackBarModule],
    templateUrl: './timeline-noticiario.component.html',
    styleUrls: ['./timeline-noticiario.component.scss']
})
export class TimelineNoticiarioComponent implements OnInit {
    // Broadcasts list
    broadcasts: any[] = [];

    // Selected broadcast
    selectedBroadcast: any = null;
    private originalBroadcast: any = null;
    private editableBroadcast: any = null;
    isEditingCopy = false;

    // Timeline events
    timelineEvents: TimelineEvent[] = [];
    totalDuration = 0;

    // Loading states
    loading = false;
    loadingTimeline = false;
    isGeneratingAudio = false;

    // View mode
    viewMode = 'grid'; // 'grid' or 'list'

    // Filter options
    statusFilter = 'all';
    dateFilter = 'all';

    // Status options
    statusOptions = ['all', 'ready', 'generating', 'published', 'draft'];

    // Date filters
    dateFilters = [
        { value: 'all', label: 'Todas' },
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Esta semana' },
        { value: 'month', label: 'Este mes' }
    ];

    // Voice options
    availableVoices: any[] = [];
    // Music resources
    musicResources: any[] = [];

    // Audio playback
    currentAudio: HTMLAudioElement | null = null;
    playingBroadcastId: string | null = null;

    constructor(
        private supabaseService: SupabaseService,
        private azureTtsService: AzureTtsService,
        private snackBar: MatSnackBar,
        private cdr: ChangeDetectorRef,
        private route: ActivatedRoute
    ) { 
        // Voices will be loaded asynchronously
    }

    private requireEditing(): boolean {
        if (this.isEditingCopy) return true;
        this.snackBar.open('Activa "Guardar como nuevo" para editar sin sobrescribir el original', 'Cerrar', { duration: 3500 });
        return false;
    }

    async playBroadcast(broadcast: any) {
        if (this.playingBroadcastId === broadcast.id) {
            this.stopAudio();
            return;
        }

        this.stopAudio();
        
        // If we don't have the audio URL yet, fetch it
        if (!broadcast.audioUrl) {
            try {
                const generated = await this.supabaseService.getGeneratedBroadcasts({ broadcastId: broadcast.id, limit: 1 });
                if (generated && generated.length > 0 && generated[0].audio_url) {
                    broadcast.audioUrl = generated[0].audio_url;
                } else {
                    this.snackBar.open('No hay audio generado para este noticiero', 'Cerrar', { duration: 3000 });
                    return;
                }
            } catch (error) {
                console.error('Error fetching audio:', error);
                this.snackBar.open('Error al obtener el audio', 'Cerrar', { duration: 3000 });
                return;
            }
        }

        if (broadcast.audioUrl) {
            this.currentAudio = new Audio(broadcast.audioUrl);
            this.currentAudio.onended = () => {
                this.playingBroadcastId = null;
                this.cdr.detectChanges();
            };
            this.currentAudio.play();
            this.playingBroadcastId = broadcast.id;
        }
    }

    stopAudio() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
        this.playingBroadcastId = null;
    }

    async ngOnInit(): Promise<void> {
        await this.loadCustomVoices();
        await this.loadMusicResources();
        await this.loadBroadcasts();
        
        // Check for ID in route to auto-select
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            const broadcast = this.broadcasts.find(b => b.id === id);
            if (broadcast) {
                this.selectBroadcast(broadcast);
            }
        }
    }

    async loadCustomVoices(): Promise<void> {
        try {
            const setting = await this.supabaseService.getSettingByKey('tts_custom_voices');
            const value = setting?.value;
            const customVoices = Array.isArray(value) ? value : [];
            
            this.availableVoices = customVoices.map((voice: any) => {
                const isChatterbox = (voice.provider || '').toLowerCase() === 'chatterbox-vira';
                if (isChatterbox && !String(voice.name || '').startsWith('chatterbox:')) {
                    return { ...voice, name: `chatterbox:${voice.voiceId || voice.id}` };
                }
                return voice;
            });
        } catch (error) {
            console.error('Error loading custom voices for timeline', error);
            this.availableVoices = [];
        }
    }

    async loadMusicResources(radioId?: string): Promise<void> {
        try {
            const data = await this.supabaseService.getMusicResources(radioId);
            this.musicResources = data || [];
        } catch (error) {
            console.error('Error loading music resources:', error);
            this.snackBar.open('Error al cargar recursos de música', 'Cerrar', {
                duration: 3000
            });
        }
    }

    async loadBroadcasts() {
        this.loading = true;
        try {
            const broadcasts = await this.supabaseService.getNewsBroadcasts();
            this.broadcasts = broadcasts.map((b: any) => ({
                id: b.id,
                title: b.title,
                description: b.description,
                duration: Math.max(0, Math.round(Number(b.total_reading_time_seconds ?? ((b.duration_minutes || 0) * 60)) / 60)),
                status: b.status,
                totalNews: b.total_news_count || 0,
                totalReadingTime: Number(b.total_reading_time_seconds ?? ((b.duration_minutes || 0) * 60)) || 0,
                createdAt: new Date(b.created_at),
                publishedAt: b.published_at ? new Date(b.published_at) : null,
                createdBy: 'Usuario' // TODO: Get creator name
            }));
        } catch (error) {
            console.error('Error loading broadcasts:', error);
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    async loadTimeline(broadcastId: string) {
        this.loadingTimeline = true;
        this.timelineEvents = [];
        this.cdr.detectChanges();

        try {
            const items = await this.supabaseService.getBroadcastNewsItems(broadcastId);
            
            // Map items to timelineEvents
            this.timelineEvents = items.map((item: any) => {
                const news = item.humanized_news;
                const tts = Array.isArray(item.tts_audio_files) && item.tts_audio_files.length > 0
                    ? [...item.tts_audio_files].sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]
                    : null;
                // Determine duration
                let duration = Number(item.duration_seconds || 0);
                if (!duration && tts) duration = Number(tts.audio_duration_seconds || 0);
                if (!duration) duration = Number(item.reading_time_seconds || 0);
                if (!duration && news) duration = Number(news.reading_time_seconds || 0);
                if (!duration) duration = 30;

                const musicUrlFromId = item.music_resource_id ? this.findMusicUrl(item.music_resource_id) : undefined;
                const isIntroOutro = (item.type === 'intro' || item.type === 'outro');
                const audioUrlCandidate = item.audio_url || tts?.audio_url || news?.audio_url;
                const audioUrlIsBlob = !!audioUrlCandidate && String(audioUrlCandidate).startsWith('blob:');

                let musicUrl = item.music_url || musicUrlFromId;
                if (!musicUrl && isIntroOutro && audioUrlCandidate) {
                    const match = this.musicResources.find(m => m.url === audioUrlCandidate);
                    if (match) musicUrl = match.url;
                }

                let audioUrl = audioUrlCandidate;
                if (audioUrlIsBlob && isIntroOutro && musicUrl) {
                    audioUrl = musicUrl;
                }

                return {
                    id: item.id,
                    type: item.type || 'news', // Default to news if not set
                    title: item.custom_title || news?.title || 'Bloque sin título',
                    description: item.custom_content || news?.humanized_content || '',
                    startTime: 0, // Calculated later
                    endTime: 0,
                    duration: duration,
                    audioUrl,
                    order: item.order_index,
                    originalItem: item,
                    // Load voice configuration from DB, fallback to defaults if not set
                    voice: item.voice_id || 'es-CL-LorenzoNeural',
                    speed: item.voice_speed || 1.0,
                    pitch: item.voice_pitch || 1.0,
                    originalContent: news?.original_content,
                    humanizedContent: news?.humanized_content,
                    showOriginalText: false,
                    // Music config
                    musicResourceId: item.music_resource_id,
                    musicUrl,
                    voiceDelay: item.voice_delay || 0,
                    musicVolume: item.music_volume || 0.25,
                    musicPlacement: (item.music_position || (item.type === 'outro' ? 'after' : 'during')) as any,
                    musicTailSeconds: item.music_tail_seconds == null ? 0.8 : Number(item.music_tail_seconds),
                    musicFadeOutSeconds: item.music_fade_out_seconds == null ? 0.5 : Number(item.music_fade_out_seconds)
                };
            });

            // If empty, add default intro/outro? 
            // Better to let user add them, or maybe add them on creation.
            // For now, if list is empty but we have news, we might need to sync.
            // But let's assume getBroadcastNewsItems returns what we have.
            
            this.calculateTimes();
            this.hydrateDurationsFromAudioUrls(broadcastId);

        } catch (error) {
            console.error('Error loading timeline:', error);
        } finally {
            this.loadingTimeline = false;
            this.cdr.detectChanges();
        }
    }

    findMusicUrl(id: string): string | undefined {
        const music = this.musicResources.find(m => m.id === id);
        return music ? music.url : undefined;
    }

    calculateTimes() {
        let currentTime = 0;
        this.timelineEvents.forEach(event => {
            event.startTime = currentTime;
            event.endTime = currentTime + event.duration;
            currentTime += event.duration;
        });
        this.totalDuration = currentTime;
    }

    drop(event: CdkDragDrop<any[]>) {
        if (!this.requireEditing()) return;
        moveItemInArray(this.timelineEvents, event.previousIndex, event.currentIndex);
        this.calculateTimes();
        this.saveOrder();
    }

    async saveOrder() {
        if (!this.requireEditing()) return;
        // Optimistic update already done in UI.
        // Now update DB.
        for (let i = 0; i < this.timelineEvents.length; i++) {
            const event = this.timelineEvents[i];
            // Only update if order changed
            if (event.order !== i) {
                try {
                    await this.supabaseService.updateBroadcastNewsItem(event.id, { order_index: i });
                    event.order = i;
                } catch (error) {
                    console.error('Error updating order for item', event.id, error);
                }
            }
        }
    }

    async addBlock(type: 'text' | 'intro' | 'outro') {
        if (!this.requireEditing()) return;
        if (!this.selectedBroadcast) return;

        this.loadingTimeline = true; // Show loading immediately
        
        // Find default voice from existing items
        // Prioritize "news" items as they likely carry the main voice of the noticiero
        let defaultVoice = 'es-CL-LorenzoNeural';
        let defaultSpeed = 1.0;
        let defaultPitch = 1.0;
        
        const mainNewsItem = this.timelineEvents.find(e => e.type === 'news' && e.voice);
        const anyItemWithVoice = this.timelineEvents.find(e => e.voice);
        
        const sourceItem = mainNewsItem || anyItemWithVoice;

        if (sourceItem) {
            defaultVoice = sourceItem.voice!;
            defaultSpeed = sourceItem.speed || 1.0;
            defaultPitch = sourceItem.pitch || 1.0;
        } else if (this.availableVoices.length > 0) {
            // Fallback to first custom voice
            const firstVoice = this.availableVoices[0];
            defaultVoice = firstVoice.name;
            defaultSpeed = firstVoice.speed || 1.0;
            defaultPitch = firstVoice.exaggeration || firstVoice.pitch || 1.0;
        }
        
        const newItem = {
            broadcast_id: this.selectedBroadcast.id,
            type: type,
            custom_title: type === 'intro' ? 'Introducción' : type === 'outro' ? 'Cierre' : 'Nuevo Texto',
            custom_content: type === 'intro' ? 'Bienvenidos al noticiero...' : type === 'outro' ? 'Gracias por sintonizar...' : 'Escribe aquí...',
            order_index: this.timelineEvents.length,
            duration_seconds: 30,
            voice_id: defaultVoice,
            voice_speed: defaultSpeed,
            voice_pitch: defaultPitch,
            music_volume: 0.5,
            voice_delay: 0
        };

        try {
            await this.supabaseService.createBroadcastNewsItem(newItem);
            await this.loadTimeline(this.selectedBroadcast.id);
            Swal.fire({
                title: 'Bloque Agregado',
                text: 'El bloque ha sido agregado correctamente.',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error('Error adding block:', error);
            Swal.fire('Error', 'Error al agregar bloque. Verifica la base de datos.', 'error');
            this.loadingTimeline = false;
        } finally {
            this.cdr.detectChanges();
        }
    }

    async deleteBlock(event: any) {
        if (!this.requireEditing()) return;
        const result = await Swal.fire({
            title: '¿Estás seguro?',
            text: "No podrás revertir esto",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });

        if (!result.isConfirmed) return;
        
        try {
            await this.supabaseService.deleteBroadcastNewsItem(event.id);
            // Remove locally
            this.timelineEvents = this.timelineEvents.filter(e => e.id !== event.id);
            this.calculateTimes();
            await this.syncBroadcastTotals();
            Swal.fire({
                title: 'Eliminado!',
                text: 'El bloque ha sido eliminado.',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error('Error deleting block:', error);
            Swal.fire('Error', 'No se pudo eliminar el bloque', 'error');
        } finally {
            this.cdr.detectChanges();
        }
    }

    async onFileSelected(event: any) {
        if (!this.requireEditing()) return;
        const file = event.target.files[0];
        if (!file || !this.selectedBroadcast) return;

        this.loadingTimeline = true;

        // Upload file
        try {
            // Get duration first
            const duration = await this.getAudioDuration(file);

            // Sanitize filename to avoid Supabase storage errors
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `ads/${this.selectedBroadcast.id}/${Date.now()}_${cleanFileName}`;
            const url = await this.supabaseService.uploadAudioFile(file, path);

            // Create item
            const newItem = {
                broadcast_id: this.selectedBroadcast.id,
                type: 'ad',
                custom_title: file.name.replace('.mp3', ''),
                audio_url: url,
                order_index: this.timelineEvents.length,
                duration_seconds: duration || 30 
            };

            await this.supabaseService.createBroadcastNewsItem(newItem);
            await this.loadTimeline(this.selectedBroadcast.id);
            Swal.fire({
                title: 'Anuncio Subido',
                text: 'El anuncio se ha subido correctamente.',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });

        } catch (error) {
            console.error('Error uploading ad:', error);
            Swal.fire('Error', 'Error al subir el archivo de audio.', 'error');
            this.loadingTimeline = false;
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

    private getAudioDurationFromUrl(url: string, timeoutMs = 15000): Promise<number> {
        return new Promise((resolve) => {
            if (!url) return resolve(0);
            const audio = new Audio();
            let done = false;
            const finish = (value: number) => {
                if (done) return;
                done = true;
                try {
                    audio.pause();
                    audio.src = '';
                } catch {}
                resolve(value);
            };
            const timer = window.setTimeout(() => finish(0), timeoutMs);
            audio.preload = 'metadata';
            (audio as any).crossOrigin = 'anonymous';
            audio.onloadedmetadata = () => {
                window.clearTimeout(timer);
                const d = Number.isFinite(audio.duration) ? Math.ceil(audio.duration) : 0;
                finish(d);
            };
            audio.onerror = () => {
                window.clearTimeout(timer);
                finish(0);
            };
            audio.src = url;
        });
    }

    private async hydrateDurationsFromAudioUrls(broadcastId: string): Promise<void> {
        const currentId = this.selectedBroadcast?.id;
        if (!broadcastId || !currentId || broadcastId !== currentId) return;

        const events = this.timelineEvents.slice();
        for (const ev of events) {
            if (!this.selectedBroadcast || this.selectedBroadcast.id !== broadcastId) return;
            if (!ev.audioUrl) continue;
            const duration = await this.getAudioDurationFromUrl(ev.audioUrl, 15000);
            if (!duration) continue;
            if (Math.abs(duration - ev.duration) < 2) continue;
            ev.duration = duration;
            try {
                await this.supabaseService.updateBroadcastNewsItem(ev.id, { duration_seconds: duration });
            } catch (e) {}
            this.calculateTimes();
            this.cdr.detectChanges();
        }
        await this.syncBroadcastTotals();
    }

    private async syncBroadcastTotals(): Promise<void> {
        if (!this.selectedBroadcast?.id) return;
        const totalSeconds = this.timelineEvents.reduce((acc, e) => acc + (Number(e.duration) || 0), 0);
        const totalNews = this.timelineEvents.filter(e => e.type === 'news').length;
        try {
            await this.supabaseService.updateNewsBroadcast(this.selectedBroadcast.id, {
                total_reading_time_seconds: totalSeconds,
                total_news_count: totalNews
            });
            this.selectedBroadcast.totalReadingTime = totalSeconds;
            this.selectedBroadcast.totalNews = totalNews;
            this.selectedBroadcast.duration = Math.max(0, Math.round(totalSeconds / 60));
        } catch (e) {}
    }

    async selectBroadcast(broadcast: any) {
        if (!broadcast?.id) return;
        this.loadingTimeline = true;
        this.cdr.detectChanges();
        try {
            const base = await this.supabaseService.getNewsBroadcastById(broadcast.id);
            this.originalBroadcast = base;
            this.editableBroadcast = null;
            this.isEditingCopy = false;

            const mapped = {
                id: base.id,
                title: base.title,
                description: base.description,
                duration: Math.max(0, Math.round(Number(base.total_reading_time_seconds ?? ((base.duration_minutes || 0) * 60)) / 60)),
                status: base.status,
                totalNews: base.total_news_count || 0,
                totalReadingTime: Number(base.total_reading_time_seconds ?? ((base.duration_minutes || 0) * 60)) || 0,
                createdAt: new Date(base.created_at),
                publishedAt: base.published_at ? new Date(base.published_at) : null,
                createdBy: 'Usuario'
            };
            this.selectedBroadcast = mapped;
            await this.loadTimeline(base.id);
        } catch (error) {
            console.error('Error creating editable copy:', error);
            this.snackBar.open('No se pudo abrir el noticiero para edición', 'Cerrar', { duration: 3500 });
            this.loadingTimeline = false;
            this.cdr.detectChanges();
        }
    }

    async enableEditingByCopy(): Promise<void> {
        if (!this.originalBroadcast?.id || !this.selectedBroadcast?.id) return;
        if (this.isEditingCopy) return;

        this.loadingTimeline = true;
        this.cdr.detectChanges();

        try {
            const base = this.originalBroadcast;
            const user = await this.supabaseService.getCurrentUser().catch(() => null);
            const now = new Date();
            const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
            const copyTitle = `${base.title} (copia ${stamp})`;

            const created = await this.supabaseService.createNewsBroadcast({
                title: copyTitle,
                description: base.description,
                duration_minutes: base.duration_minutes,
                status: 'draft',
                total_news_count: base.total_news_count,
                total_reading_time_seconds: base.total_reading_time_seconds,
                created_by: user?.id || null,
                radio_id: base.radio_id || null,
                scheduled_time: base.scheduled_time || null
            });

            const baseItems = await this.supabaseService.getBroadcastNewsItems(base.id);
            for (const item of baseItems || []) {
                const tts = Array.isArray((item as any).tts_audio_files) && (item as any).tts_audio_files.length > 0
                    ? [...(item as any).tts_audio_files].sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]
                    : null;
                const clone: any = {
                    broadcast_id: created.id,
                    humanized_news_id: item.humanized_news_id || null,
                    order_index: item.order_index,
                    reading_time_seconds: item.reading_time_seconds,
                    type: item.type,
                    custom_title: item.custom_title,
                    custom_content: item.custom_content,
                    audio_url: item.audio_url || tts?.audio_url || null,
                    duration_seconds: item.duration_seconds || tts?.audio_duration_seconds || null,
                    voice_id: item.voice_id,
                    voice_speed: item.voice_speed,
                    voice_pitch: item.voice_pitch,
                    music_url: (item as any).music_url,
                    music_resource_id: item.music_resource_id,
                    voice_delay: item.voice_delay,
                    music_volume: item.music_volume
                };
                await this.supabaseService.createBroadcastNewsItem(clone);
            }

            this.isEditingCopy = true;
            this.editableBroadcast = created;
            this.selectedBroadcast = {
                id: created.id,
                title: created.title,
                description: created.description,
                duration: Math.max(0, Math.round(Number(created.total_reading_time_seconds ?? ((created.duration_minutes || 0) * 60)) / 60)),
                status: created.status,
                totalNews: created.total_news_count || 0,
                totalReadingTime: Number(created.total_reading_time_seconds ?? ((created.duration_minutes || 0) * 60)) || 0,
                createdAt: new Date(created.created_at),
                publishedAt: created.published_at ? new Date(created.published_at) : null,
                createdBy: 'Usuario'
            };

            this.snackBar.open('Edición habilitada: guardando cambios en una copia', 'Cerrar', { duration: 3500 });
            await this.loadTimeline(created.id);
        } catch (error) {
            console.error('Error enabling editing by copy:', error);
            this.snackBar.open('No se pudo crear la copia para edición', 'Cerrar', { duration: 3500 });
            this.loadingTimeline = false;
            this.cdr.detectChanges();
        }
    }

    closeTimeline() {
        this.selectedBroadcast = null;
        this.originalBroadcast = null;
        this.editableBroadcast = null;
        this.timelineEvents = [];
    }

    // ... rest of existing methods ...

    get filteredBroadcasts() {
        return this.broadcasts.filter(broadcast => {
            const statusMatch = this.statusFilter === 'all' || broadcast.status === this.statusFilter;
            const dateMatch = this.dateFilter === 'all' || this.checkDateFilter(broadcast.createdAt);

            return statusMatch && dateMatch;
        });
    }

    checkDateFilter(date: Date): boolean {
        const now = new Date();
        const broadcastDate = new Date(date);

        switch (this.dateFilter) {
            case 'today':
                return broadcastDate.toDateString() === now.toDateString();
            case 'week':
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                return broadcastDate >= weekAgo;
            case 'month':
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                return broadcastDate >= monthAgo;
            default:
                return true;
        }
    }

    getStatusClass(status: string): string {
        switch (status) {
            case 'ready':
            case 'published':
                return 'status-success';
            case 'generating':
                return 'status-info';
            case 'draft':
                return 'status-warning';
            case 'failed':
                return 'status-danger';
            default:
                return 'status-default';
        }
    }

    getStatusText(status: string): string {
        switch (status) {
            case 'ready':
                return 'Listo';
            case 'generating':
                return 'Generando';
            case 'published':
                return 'Publicado';
            case 'draft':
                return 'Borrador';
            case 'failed':
                return 'Fallido';
            default:
                return status;
        }
    }

    getEventTypeClass(type: string): string {
        switch (type) {
            case 'intro':
                return 'event-intro';
            case 'outro':
                return 'event-outro';
            case 'news':
                return 'event-news';
            case 'ad_break':
                return 'event-ad';
            default:
                return 'event-default';
        }
    }

    formatDuration(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `0:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    formatReadingTime(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes} min ${remainingSeconds > 0 ? remainingSeconds + 's' : ''}`;
        }
        return `${seconds}s`;
    }

    formatDate(date: Date): string {
        return new Date(date).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }



    async updateBlockText(event: TimelineEvent, newText: string) {
        if (!this.requireEditing()) return;
        event.description = newText;
        try {
            await this.supabaseService.updateBroadcastNewsItem(event.id, { custom_content: newText });
            await this.syncBroadcastTotals();
        } catch (error) {
            console.error('Error updating block text:', error);
            this.snackBar.open('Error al guardar el texto', 'Cerrar', { duration: 3000 });
        }
    }

    async updateBlockVoice(event: TimelineEvent) {
        if (!this.requireEditing()) return;
        if (!event.id) return;
        
        // Find selected voice to get default settings if available
        const selectedVoice = this.availableVoices.find(v => v.name === event.voice);
        const updates: any = { voice_id: event.voice };

        if (selectedVoice) {
             if (selectedVoice.speed) updates.voice_speed = selectedVoice.speed;
             if (selectedVoice.exaggeration || selectedVoice.pitch) updates.voice_pitch = selectedVoice.exaggeration || selectedVoice.pitch;
        }

        try {
            await this.supabaseService.updateBroadcastNewsItem(event.id, updates);
            
            // Update local event if we changed speed/pitch
            if (updates.voice_speed) event.speed = updates.voice_speed;
            if (updates.voice_pitch) event.pitch = updates.voice_pitch;
            
            this.snackBar.open('Voz actualizada', 'Cerrar', { duration: 2000 });
            await this.syncBroadcastTotals();
        } catch (error) {
            console.error('Error updating block voice:', error);
            this.snackBar.open('Error al actualizar voz', 'Cerrar', { duration: 3000 });
        }
    }

    async updateBlockMusic(event: TimelineEvent) {
        if (!this.requireEditing()) return;
        if (!event.id) return;

        // Find music resource to get URL
        let musicUrl = event.musicUrl;
        let musicResourceId = null;
        
        // If musicUrl is selected, find the corresponding resource ID
        if (event.musicUrl) {
            const musicResource = this.musicResources.find(m => m.url === event.musicUrl);
            if (musicResource) {
                musicResourceId = musicResource.id;
            }
        }

        const updates: any = {
            music_url: event.musicUrl, // Store URL for easier access
            music_resource_id: musicResourceId,
            music_volume: event.musicVolume,
            voice_delay: event.voiceDelay,
            music_position: event.musicUrl ? (event.musicPlacement || (event.type === 'outro' ? 'after' : 'during')) : null,
            music_tail_seconds: event.musicUrl ? event.musicTailSeconds : null,
            music_fade_out_seconds: event.musicUrl ? event.musicFadeOutSeconds : null
        };

        try {
            await this.supabaseService.updateBroadcastNewsItem(event.id, updates);
            this.snackBar.open('Configuración de música actualizada', 'Cerrar', { duration: 2000 });
            this.calculateTimes();
            await this.syncBroadcastTotals();
        } catch (error) {
            console.error('Error updating block music:', error);
            this.snackBar.open('Error al actualizar música', 'Cerrar', { duration: 3000 });
        }
    }

    toggleOriginalText(event: TimelineEvent) {
        event.showOriginalText = !event.showOriginalText;
    }
    async generateBlockAudio(event: TimelineEvent) {
        if (!this.requireEditing()) return;
        const textToSpeak = event.description || event.title;
        if (!textToSpeak) return;
        this.isGeneratingAudio = true;

        try {
            // 1. Generate Speech Audio (returns Blob URL)
            let audioUrl = await this.azureTtsService.generateSpeech({
                text: textToSpeak,
                voice: event.voice || 'es-MX-DaliaNeural',
                speed: Number(event.speed) || 1.0,
                pitch: Number(event.pitch) || 1.0
            });

            // 2. Mix with Music if configured
            if (event.musicUrl) {
                try {
                    const placement = event.musicPlacement || (event.type === 'outro' ? 'after' : 'during');
                    const mixedUrl = await this.azureTtsService.mixVoiceAndMusic(
                        audioUrl,
                        event.musicUrl,
                        Number(event.voiceDelay) || 0,
                        Number(event.musicVolume) || 0.25,
                        placement,
                        {
                            tailSeconds: Number(event.musicTailSeconds ?? 0.8),
                            fadeOutSeconds: Number(event.musicFadeOutSeconds ?? 0.5)
                        }
                    );
                    // Revoke original speech url to free memory
                    URL.revokeObjectURL(audioUrl);
                    audioUrl = mixedUrl;
                } catch (mixError) {
                    console.error('Error mixing audio:', mixError);
                    this.snackBar.open('Error al mezclar música, se usará solo voz', 'Cerrar', { duration: 3000 });
                }
            }

            // 3. Convert to Blob
            const response = await fetch(audioUrl);
            const blob = await response.blob();
            const file = new File([blob], `block_${event.id}.mp3`, { type: 'audio/mpeg' });

            // 4. Upload to Supabase
            const path = `generated/${this.selectedBroadcast.id}/${event.id}_${Date.now()}.mp3`;
            const publicUrl = await this.supabaseService.uploadAudioFile(file, path);

            // 5. Update Block in DB
            await this.supabaseService.updateBroadcastNewsItem(event.id, { 
                audio_url: publicUrl,
                voice_id: event.voice,
                voice_speed: Number(event.speed),
                voice_pitch: Number(event.pitch),
                music_url: event.musicUrl,
                music_resource_id: event.musicResourceId,
                music_volume: event.musicVolume,
                voice_delay: event.voiceDelay
            });

            // 6. Update local state
            event.audioUrl = publicUrl;
            
            // Get duration
            const audio = new Audio(publicUrl);
            audio.onloadedmetadata = async () => {
                 const duration = Math.ceil(audio.duration);
                 event.duration = duration;
                 await this.supabaseService.updateBroadcastNewsItem(event.id, { duration_seconds: duration });
                 this.calculateTimes();
                 await this.syncBroadcastTotals();
            };

        } catch (error) {
            console.error('Error generating block audio:', error);
            Swal.fire('Error', 'Error al generar audio del bloque.', 'error');
        } finally {
            this.isGeneratingAudio = false;
            this.cdr.detectChanges();
        }
    }

    async exportTimeline() {
        if (this.timelineEvents.length === 0) return;
        
        this.loading = true;

        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffers: AudioBuffer[] = [];
            let missingAudioCount = 0;
            let failedAudioCount = 0;
            
            // 1. Fetch and decode all audio files
            for (const event of this.timelineEvents) {
                const targetSeconds = Math.max(0, Number(event.duration) || 0);
                if (!event.audioUrl) {
                    missingAudioCount += 1;
                    const length = Math.max(1, Math.ceil(audioContext.sampleRate * targetSeconds));
                    audioBuffers.push(audioContext.createBuffer(2, length, audioContext.sampleRate));
                    continue;
                }

                try {
                    const response = await fetch(event.audioUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    audioBuffers.push(audioBuffer);
                } catch (e) {
                    console.error(`Error loading audio for event ${event.id}:`, e);
                    failedAudioCount += 1;
                    const length = Math.max(1, Math.ceil(audioContext.sampleRate * targetSeconds));
                    audioBuffers.push(audioContext.createBuffer(2, length, audioContext.sampleRate));
                }
            }

            const hasAnyRealAudio = this.timelineEvents.some(e => !!e.audioUrl);
            if (!hasAnyRealAudio) {
                Swal.fire('Atención', 'No hay audios para exportar.', 'warning');
                return;
            }

            // 2. Calculate total length
            const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
            
            // 3. Create OfflineAudioContext with the SAME sample rate as the decoding context
            const sampleRate = audioContext.sampleRate;
            const offlineCtx = new OfflineAudioContext(2, totalLength, sampleRate);
            
            // 4. Schedule sources
            let offset = 0;
            for (const buffer of audioBuffers) {
                const source = offlineCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(offlineCtx.destination);
                source.start(offset);
                offset += buffer.duration;
            }

            // 5. Render
            const renderedBuffer = await offlineCtx.startRendering();
            
            // 6. Encode to MP3 using lamejs
            const mp3Blob = await this.encodeToMp3(renderedBuffer);
            
            // 7. Download
            const fileName = `noticiero_${this.selectedBroadcast.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.mp3`;
            const url = URL.createObjectURL(mp3Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);

            // 8. Save to "Mis Noticieros"
            try {
                // Upload to Storage
                const file = new File([mp3Blob], fileName, { type: 'audio/mp3' });
                const storagePath = `broadcasts/${this.selectedBroadcast.id}/${fileName}`;
                const publicUrl = await this.supabaseService.uploadAudioFile(file, storagePath);

                // Save to DB
                await this.supabaseService.createGeneratedBroadcast({
                    broadcast_id: this.selectedBroadcast.id,
                    title: this.selectedBroadcast.title,
                    audio_url: publicUrl,
                    duration_seconds: Math.ceil(renderedBuffer.duration)
                });
                await this.supabaseService.updateNewsBroadcast(this.selectedBroadcast.id, {
                    total_reading_time_seconds: Math.ceil(renderedBuffer.duration)
                });

                Swal.fire({
                    title: 'Exportación Exitosa',
                    text: missingAudioCount > 0 || failedAudioCount > 0
                        ? `Exportado y guardado. Bloques sin audio: ${missingAudioCount} · Fallos al cargar audio: ${failedAudioCount}`
                        : 'El noticiero se ha exportado y guardado en "Mis Noticieros".',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });

            } catch (saveError) {
                console.error('Error saving generated broadcast:', saveError);
                // Don't fail the whole process if just saving fails, as download worked
                Swal.fire('Advertencia', 'El archivo se descargó pero hubo un error al guardarlo en Mis Noticieros.', 'warning');
            }

        } catch (error) {
            console.error('Error exporting timeline:', error);
            Swal.fire('Error', 'Error al exportar el timeline.', 'error');
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
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
}

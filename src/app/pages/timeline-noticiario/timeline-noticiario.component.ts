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
        this.availableVoices = this.azureTtsService.getVoices();
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
            this.availableVoices = merged;
        } catch (error) {
            console.error('Error loading custom voices for timeline, using default Azure voices', error);
            this.availableVoices = this.azureTtsService.getVoices();
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
                duration: b.duration_minutes || 0,
                status: b.status,
                totalNews: b.total_news_count || 0,
                totalReadingTime: (b.duration_minutes || 0) * 60,
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
                // Determine duration
                let duration = item.duration_seconds || 0;
                if (!duration && news) {
                    duration = news.reading_time_seconds || 60;
                }
                if (!duration) duration = 30; // Default

                return {
                    id: item.id,
                    type: item.type || 'news', // Default to news if not set
                    title: item.custom_title || news?.title || 'Bloque sin título',
                    description: item.custom_content || news?.humanized_content || '',
                    startTime: 0, // Calculated later
                    endTime: 0,
                    duration: duration,
                    audioUrl: item.audio_url || news?.audio_url,
                    order: item.order_index,
                    originalItem: item,
                    // Load voice configuration from DB, fallback to defaults if not set
                    voice: item.voice_id || 'es-CL-LorenzoNeural',
                    speed: item.voice_speed || 1.0,
                    pitch: item.voice_pitch || 1.0
                };
            });

            // If empty, add default intro/outro? 
            // Better to let user add them, or maybe add them on creation.
            // For now, if list is empty but we have news, we might need to sync.
            // But let's assume getBroadcastNewsItems returns what we have.
            
            this.calculateTimes();

        } catch (error) {
            console.error('Error loading timeline:', error);
        } finally {
            this.loadingTimeline = false;
            this.cdr.detectChanges();
        }
    }

    calculateTimes() {
        let currentTime = 0;
        this.timelineEvents.forEach(event => {
            event.startTime = currentTime;
            event.endTime = currentTime + event.duration;
            currentTime += event.duration;
        });
    }

    drop(event: CdkDragDrop<any[]>) {
        moveItemInArray(this.timelineEvents, event.previousIndex, event.currentIndex);
        this.calculateTimes();
        this.saveOrder();
    }

    async saveOrder() {
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
        if (!this.selectedBroadcast) return;

        this.loadingTimeline = true; // Show loading immediately
        
        const newItem = {
            broadcast_id: this.selectedBroadcast.id,
            type: type,
            custom_title: type === 'intro' ? 'Introducción' : type === 'outro' ? 'Cierre' : 'Nuevo Texto',
            custom_content: type === 'intro' ? 'Bienvenidos al noticiero...' : type === 'outro' ? 'Gracias por sintonizar...' : 'Escribe aquí...',
            order_index: this.timelineEvents.length,
            duration_seconds: 30
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

    selectBroadcast(broadcast: any) {
        this.selectedBroadcast = broadcast;
        this.loadTimeline(broadcast.id);
    }

    closeTimeline() {
        this.selectedBroadcast = null;
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
        event.description = newText;
        try {
            await this.supabaseService.updateBroadcastNewsItem(event.id, { custom_content: newText });
        } catch (error) {
            console.error('Error updating block text:', error);
            this.snackBar.open('Error al guardar el texto', 'Cerrar', { duration: 3000 });
        }
    }
    async generateBlockAudio(event: TimelineEvent) {
        const textToSpeak = event.description || event.title;
        if (!textToSpeak) return;
        this.isGeneratingAudio = true;

        try {
            // 1. Generate Audio (returns Blob URL)
            const audioUrl = await this.azureTtsService.generateSpeech({
                text: textToSpeak,
                voice: event.voice || 'es-MX-DaliaNeural',
                speed: Number(event.speed) || 1.0,
                pitch: Number(event.pitch) || 1.0
            });

            // 2. Convert to Blob
            const response = await fetch(audioUrl);
            const blob = await response.blob();
            const file = new File([blob], `block_${event.id}.mp3`, { type: 'audio/mpeg' });

            // 3. Upload to Supabase
            // Ensure bucket exists or handle error gracefully if possible, but bucket should exist.
            // Using 'noticias' bucket as updated in service.
            const path = `generated/${this.selectedBroadcast.id}/${event.id}_${Date.now()}.mp3`;
            const publicUrl = await this.supabaseService.uploadAudioFile(file, path);

            // 4. Update Block in DB with audio URL and voice settings
            await this.supabaseService.updateBroadcastNewsItem(event.id, { 
                audio_url: publicUrl,
                voice_id: event.voice,
                voice_speed: Number(event.speed),
                voice_pitch: Number(event.pitch)
            });

            // 5. Update local state
            event.audioUrl = publicUrl;
            
            // Get duration
            const audio = new Audio(publicUrl);
            audio.onloadedmetadata = async () => {
                 const duration = Math.ceil(audio.duration);
                 event.duration = duration;
                 await this.supabaseService.updateBroadcastNewsItem(event.id, { duration_seconds: duration });
                 this.calculateTimes();
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
            
            // 1. Fetch and decode all audio files
            for (const event of this.timelineEvents) {
                if (event.audioUrl) {
                    try {
                        const response = await fetch(event.audioUrl);
                        const arrayBuffer = await response.arrayBuffer();
                        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                        audioBuffers.push(audioBuffer);
                    } catch (e) {
                        console.error(`Error loading audio for event ${event.id}:`, e);
                    }
                }
            }

            if (audioBuffers.length === 0) {
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

                Swal.fire({
                    title: 'Exportación Exitosa',
                    text: 'El noticiero se ha exportado y guardado en "Mis Noticieros".',
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

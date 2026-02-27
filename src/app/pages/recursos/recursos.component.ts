import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SupabaseService } from '../../services/supabase.service';
import { AzureTtsService } from '../../services/azure-tts.service';
import { config } from '../../core/config';

interface CustomVoice {
  id: string;
  name: string;
  label: string;
  gender: string;
  description?: string;
  provider?: string;
  voiceId?: string;
  targetModel?: string;
  speed?: number;
  tone?: number;
}

@Component({
  selector: 'app-recursos',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSnackBarModule],
  templateUrl: './recursos.component.html',
  styleUrls: ['./recursos.component.scss']
})
export class RecursosComponent implements OnInit {
  voices: CustomVoice[] = [];
  musicResources: any[] = []; // Array for music resources
  radios: any[] = []; // Array for radios
  activeTab: 'voices' | 'music' = 'voices'; // Tab state
  loading = false;
  showCreateModal = false;
  showEditModal = false;
  showMusicModal = false; // Modal for uploading music
  selectedVoice: CustomVoice | null = null;

  formData = {
    name: '',
    label: '',
    gender: 'Male',
    description: ''
  };
  
  musicFormData = {
    name: '',
    type: 'intro' as 'intro' | 'outro' | 'background' | 'effect',
    file: null as File | null,
    radioId: null as string | null
  };

  qwenFile: File | null = null;
  qwenPreferredName = '';
  // Para la API HTTP usamos el modelo no-realtime, que es el recomendado
  // para speech synthesis y debe coincidir con target_model en el clonado.
  qwenTargetModel = 'qwen3-tts-vc-2026-01-22';
  qwenCreating = false;
  qwenLastVoiceId: string | null = null;
  qwenSampleDownloading = false;
  qwenStep: 'idle' | 'uploading' | 'creating' = 'idle';
  
  // New properties for Qwen voice configuration
  qwenVoiceSpeed = 1.0;
  qwenVoiceTone = 1.0;

  saving = false;
  creationMode: 'azure' | 'qwen' = 'qwen';
  playingVoiceId: string | null = null;
  playingVoiceUrl: string | null = null;
  playingVoiceLoadingId: string | null = null;

  // Qwen Preview State
  qwenPreviewPlaying: boolean = false;
  qwenPreviewLoading: boolean = false;
  qwenPreviewAudio: HTMLAudioElement | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private azureTtsService: AzureTtsService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadVoices();
    await this.loadRadios();
  }

  ngOnDestroy(): void {
    if (this.qwenPreviewAudio) {
      this.qwenPreviewAudio.pause();
      this.qwenPreviewAudio = null;
    }
  }

  async loadRadios(): Promise<void> {
    try {
        this.radios = await this.supabaseService.getRadios();
    } catch (error) {
        console.error('Error loading radios:', error);
    }
  }

  onQwenFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      this.snackBar.open('Archivo demasiado grande (máximo 10MB). Elige uno más liviano.', 'Cerrar', {
        duration: 4000
      });
      return;
    }
    this.qwenFile = file;
  }

  async createQwenVoice(): Promise<void> {
    if (!this.qwenFile) {
      this.snackBar.open('Debes seleccionar un audio de referencia', 'Cerrar', {
        duration: 3000
      });
      return;
    }
    const id = this.generateId();
    const safeLabel =
      this.formData.label.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'voz_clonada';
    this.qwenCreating = true;
    this.qwenStep = 'uploading';
    this.cdr.detectChanges();
    try {
      this.qwenStep = 'uploading';
      this.cdr.detectChanges();

      // Subir archivo a Supabase Storage para obtener URL pública
      // Esto evita enviar el archivo en base64 al backend, lo que causa errores 413 Payload Too Large en Vercel
      const filePath = `temp-voice-cloning/${Date.now()}_${this.qwenFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      let audioUrl: string;
      try {
        audioUrl = await this.supabaseService.uploadAudioFile(this.qwenFile, filePath);
      } catch (uploadError: any) {
        console.error('Error uploading file to Supabase:', uploadError);
        throw new Error('Error al subir el archivo de audio. Verifica tu conexión o permisos.');
      }

      // preferred_name es requerido por DashScope. Aseguramos un valor válido con patrón estricto:
      // ^[a-z][a-z0-9]{2,19}$  (inicia con letra, 3–20 chars, minúsculas, números, SIN guiones bajos)
      const basePref = (this.formData.label || '').trim() || `voz${Date.now()}`;
      let preferredName = basePref
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '') // Elimina todo lo que no sea a-z o 0-9
        .trim();

      if (!preferredName) preferredName = `voz${Date.now()}`;
      if (!/^[a-z]/.test(preferredName)) preferredName = `v${preferredName}`;
      
      // Longitud entre 3 y 20 caracteres
      preferredName = preferredName.slice(0, 20);
      if (preferredName.length < 3) preferredName = preferredName.padEnd(3, 'x');

      this.qwenPreferredName = preferredName;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for backend processing
      
      this.qwenStep = 'creating';
      this.cdr.detectChanges();
      
      // console.log('[QWEN] Calling backend /api/qwen-voice-create with audioUrl:', audioUrl);
      
      const apiUrl = config.apiUrl || ''; // Fallback to empty string for relative path if not set
      const resp = await fetch(`${apiUrl}/api/qwen-voice-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl: audioUrl, // Send URL instead of base64 data
          preferred_name: preferredName,
          target_model: this.qwenTargetModel
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({} as any));
        const msg = err.details || err.error || 'Error al crear voz clonada';
        throw new Error(JSON.stringify(msg));
      }
      
      const data = await resp.json();
      const voiceParam = data.voice;
      this.qwenLastVoiceId = voiceParam;
      
      this.snackBar.open('Voz clonada creada correctamente. Ahora puedes guardarla.', 'Cerrar', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
      // No limpiamos el archivo para permitir regenerar la voz si el usuario lo desea
      // this.qwenFile = null; 
      this.qwenPreferredName = '';
      
    } catch (error: any) {
      console.error('Error creating Qwen voice', error);
      const message =
        error?.name === 'AbortError'
          ? 'Tiempo de espera agotado (45s) al crear la voz. Verifica conexión y backend.'
          : error?.message || 'Error al crear voz clonada';
      this.snackBar.open(message, 'Cerrar', { duration: 5000, panelClass: ['error-snackbar'] });
    } finally {
      this.qwenCreating = false;
      this.qwenStep = 'idle';
      this.cdr.detectChanges();
    }
  }

  private saveQwenVoice(label: string): boolean {
    if (this.selectedVoice) {
      this.voices = this.voices.map(v =>
        v.id === this.selectedVoice?.id
          ? {
              ...v,
              label,
              description: this.formData.description.trim()
            }
          : v
      );
      return true;
    }

    if (!this.qwenLastVoiceId) {
      this.snackBar.open('Primero debes crear la voz clonada con Qwen', 'Cerrar', {
        duration: 3000
      });
      return false;
    }

    const newVoice: CustomVoice = {
      id: this.generateId(),
      name: `qwen:${this.qwenLastVoiceId}`,
      label,
      gender: 'Other',
      description: this.formData.description.trim() || undefined,
      provider: 'qwen',
      voiceId: this.qwenLastVoiceId,
      targetModel: this.qwenTargetModel
    };
    this.voices = [...this.voices, newVoice];
    return true;
  }

  async downloadQwenSample(): Promise<void> {
    if (!this.qwenLastVoiceId) {
      this.snackBar.open('Primero crea una voz clonada con Qwen', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    this.qwenSampleDownloading = true;
    this.cdr.detectChanges();

    try {
      const baseLabel = this.formData.label.trim() || 'voz_clonada';
      const safeLabel = baseLabel.replace(/[^a-zA-Z0-9_-]+/g, '_');
      const text = 'Esta es una muestra de la voz clonada para el noticiero de radio.';
      const url = await this.azureTtsService.generateSpeech({
        text,
        voice: `qwen:${this.qwenLastVoiceId}`,
        speed: this.qwenVoiceSpeed,
        pitch: this.qwenVoiceTone
      });
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const fileName = `qwen_preview_${safeLabel}.mp3`;

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      this.snackBar.open('Descarga de muestra Qwen iniciada', 'Cerrar', {
        duration: 2000
      });
    } catch (error) {
      console.error('Error downloading Qwen sample audio', error);
      this.snackBar.open('Error al descargar la muestra de voz Qwen', 'Cerrar', {
        duration: 4000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.qwenSampleDownloading = false;
      this.cdr.detectChanges();
    }
  }

  onParamChange(): void {
    if (this.qwenPreviewPlaying && this.qwenPreviewAudio) {
      this.qwenPreviewAudio.pause();
      this.qwenPreviewAudio = null;
      this.qwenPreviewPlaying = false;
      this.cdr.detectChanges();
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
  }

  async loadVoices(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();

    try {
      const setting = await this.supabaseService.getSettingByKey('tts_custom_voices');
      const value = setting?.value;
      if (Array.isArray(value)) {
        this.voices = value;
      } else {
        this.voices = [];
      }
    } catch (error) {
      console.error('Error loading custom voices', error);
      this.voices = [];
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  openCreateModal(): void {
    this.formData = {
      name: '',
      label: '',
      gender: 'Male',
      description: ''
    };
    this.selectedVoice = null;
    this.creationMode = 'qwen';
    
    // Reset Qwen specific fields
    this.qwenLastVoiceId = null;
    this.qwenVoiceSpeed = 1.0;
    this.qwenVoiceTone = 1.0;
    this.qwenFile = null;
    this.qwenPreferredName = '';
    this.qwenCreating = false;
    this.qwenSampleDownloading = false;

    // Reset preview state
    if (this.qwenPreviewAudio) {
      this.qwenPreviewAudio.pause();
      this.qwenPreviewAudio = null;
    }
    this.qwenPreviewPlaying = false;
    this.qwenPreviewLoading = false;

    this.showCreateModal = true;
  }

  openEditModal(voice: CustomVoice): void {
    this.selectedVoice = voice;
    this.formData = {
      name: voice.name,
      label: voice.label,
      gender: voice.gender,
      description: voice.description || ''
    };
    
    // Load speed and tone if available, otherwise default
    this.qwenVoiceSpeed = voice.speed || 1.0;
    this.qwenVoiceTone = voice.tone || 1.0;
    
    // Load Qwen specific fields
    this.qwenLastVoiceId = voice.voiceId || null;
    this.qwenTargetModel = voice.targetModel || 'qwen3-tts-vc-2026-01-22';

    this.creationMode = 'qwen';
    this.showEditModal = true;
  }

  closeModals(): void {
    // Stop preview if playing
    if (this.qwenPreviewAudio) {
      this.qwenPreviewAudio.pause();
      this.qwenPreviewAudio = null;
    }
    this.qwenPreviewPlaying = false;
    this.qwenPreviewLoading = false;

    this.showCreateModal = false;
    this.showEditModal = false;
    this.selectedVoice = null;
  }

  async previewQwenParams(): Promise<void> {
    if (!this.qwenLastVoiceId) return;

    if (this.qwenPreviewPlaying && this.qwenPreviewAudio) {
      this.qwenPreviewAudio.pause();
      this.qwenPreviewAudio = null;
      this.qwenPreviewPlaying = false;
      this.cdr.detectChanges();
      return;
    }

    this.qwenPreviewLoading = true;
    this.cdr.detectChanges();

    try {
      const text = 'Esta es una prueba de voz con los ajustes seleccionados.';
      // Use AzureTtsService which handles Qwen if voice starts with qwen:
      const url = await this.azureTtsService.generateSpeech({
        text,
        voice: `qwen:${this.qwenLastVoiceId}`,
        speed: this.qwenVoiceSpeed,
        pitch: this.qwenVoiceTone
      });

      if (this.qwenPreviewAudio) {
        this.qwenPreviewAudio.pause();
      }
      
      this.qwenPreviewAudio = new Audio(url);
      this.qwenPreviewAudio.onended = () => {
        this.qwenPreviewPlaying = false;
        this.qwenPreviewAudio = null;
        this.cdr.detectChanges();
      };
      
      this.qwenPreviewLoading = false;
      this.qwenPreviewPlaying = true;
      this.qwenPreviewAudio.play();
      
    } catch (error) {
      console.error('Error previewing Qwen voice:', error);
      this.snackBar.open('Error al generar la prueba de voz', 'Cerrar', { duration: 3000 });
      this.qwenPreviewLoading = false;
      this.qwenPreviewPlaying = false;
    } finally {
      this.cdr.detectChanges();
    }
  }

  async saveVoice(): Promise<void> {
    if (this.saving) return;

    const label = this.formData.label.trim();
    if (!label) {
      this.snackBar.open('Debes ingresar una etiqueta visible para la voz', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();

    try {
      // Get existing voices first to ensure we have the latest list
      let currentVoices: CustomVoice[] = [];
      try {
        const setting = await this.supabaseService.getSettingByKey('tts_custom_voices');
        if (setting?.value && Array.isArray(setting.value)) {
          currentVoices = setting.value;
        }
      } catch (e) {
        // Ignore error if setting does not exist yet (first time)
        console.warn('No existing voices found or error fetching setting, starting with empty list.', e);
        currentVoices = [];
      }

      if (this.selectedVoice) {
        // Update existing voice
        let updatedVoice: CustomVoice = {
          ...this.selectedVoice,
          label: label,
          description: this.formData.description.trim()
        };
        
        // Update speed/tone if it's a Qwen voice
        updatedVoice.speed = this.qwenVoiceSpeed;
        updatedVoice.tone = this.qwenVoiceTone;
        
        const updatedVoices = currentVoices.map(v => 
          v.id === this.selectedVoice?.id ? updatedVoice : v
        );
        
        await this.supabaseService.upsertSetting('tts_custom_voices', updatedVoices);
        
        this.snackBar.open('Voz actualizada correctamente', 'Cerrar', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      } else {
        // Create new Qwen voice
        let newVoice: CustomVoice;

        if (!this.qwenLastVoiceId) {
            this.snackBar.open('Primero debes crear la voz clonada (botón Crear)', 'Cerrar', { duration: 3000 });
            this.saving = false;
            return;
        }
        newVoice = {
            id: this.generateId(),
            name: `qwen:${this.qwenLastVoiceId}`, // Prefijo para identificar proveedor
            label: label,
            gender: this.formData.gender,
            description: this.formData.description.trim(),
            provider: 'qwen',
            voiceId: this.qwenLastVoiceId,
            targetModel: this.qwenTargetModel,
            speed: this.qwenVoiceSpeed,
            tone: this.qwenVoiceTone
        };
        
        const updatedVoices = [...currentVoices, newVoice];
        await this.supabaseService.upsertSetting('tts_custom_voices', updatedVoices);
        
        this.snackBar.open('Voz creada correctamente', 'Cerrar', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      }

      this.closeModals();
      await this.loadVoices();
    } catch (error) {
      console.error('Error saving voice', error);
      this.snackBar.open('Error al guardar la voz', 'Cerrar', {
        duration: 4000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  // Music Methods

  async loadMusic(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      this.musicResources = await this.supabaseService.getMusicResources();
    } catch (error) {
      console.error('Error loading music resources', error);
      this.snackBar.open('Error al cargar recursos de música', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  onTabChange(tab: 'voices' | 'music'): void {
    this.activeTab = tab;
    if (tab === 'music') {
      this.loadMusic();
    } else {
      this.loadVoices();
    }
  }

  openMusicModal(): void {
    this.musicFormData = {
      name: '',
      type: 'intro',
      file: null,
      radioId: null
    };
    this.showMusicModal = true;
  }

  onMusicFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.musicFormData.file = file;
    }
  }

  async uploadMusic(): Promise<void> {
    if (!this.musicFormData.name || !this.musicFormData.file) {
      this.snackBar.open('Debes completar el nombre y seleccionar un archivo', 'Cerrar', { duration: 3000 });
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();
    try {
      await this.supabaseService.uploadMusicResource(
        this.musicFormData.file,
        this.musicFormData.name,
        this.musicFormData.type,
        this.musicFormData.radioId || undefined
      );
      this.snackBar.open('Música subida correctamente', 'Cerrar', { duration: 3000 });
      this.showMusicModal = false;
      this.loadMusic();
    } catch (error) {
      console.error('Error uploading music', error);
      this.snackBar.open('Error al subir música', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async deleteMusic(id: string, url: string): Promise<void> {
    if (!confirm('ADVERTENCIA: ¿Estás seguro de eliminar este recurso de música?\n\nNOTA: Los audios YA GENERADOS (mp3) NO se verán afectados, pero si intentas regenerar noticias que usaban esta música, ya no la tendrán de fondo.')) return;

    this.loading = true;
    this.cdr.detectChanges();
    try {
      await this.supabaseService.deleteMusicResource(id, url);
      this.snackBar.open('Música eliminada correctamente', 'Cerrar', { duration: 3000 });
      this.loadMusic();
    } catch (error) {
      console.error('Error deleting music', error);
      this.snackBar.open('Error al eliminar música', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async deleteVoice(voice: CustomVoice): Promise<void> {
    if (!confirm('ADVERTENCIA: ¿Estás seguro de eliminar esta voz personalizada?\n\nNOTA: Los audios YA GENERADOS (mp3) con esta voz seguirán funcionando, pero si intentas regenerar o editar noticias que usaban esta voz, el sistema ya no podrá usarla.')) return;

    this.voices = this.voices.filter(v => v.id !== voice.id);
    await this.persistVoices();
  }

  async playVoice(voice: CustomVoice): Promise<void> {
    const text =
      'Esta es una muestra corta de la voz que usarás en tus noticieros.';
    const isQwen = voice.provider === 'qwen' || voice.name.startsWith('qwen:');
    const voiceName = isQwen
      ? `qwen:${voice.voiceId || voice.name.replace(/^qwen:/, '')}`
      : voice.name;

    this.playingVoiceLoadingId = voice.id;
    this.playingVoiceId = voice.id;
    this.playingVoiceUrl = null;
    this.cdr.detectChanges();

    try {
      const url = await this.azureTtsService.generateSpeech({
        text,
        voice: voiceName,
        speed: 1 // Default speed for sample play
      });
      this.playingVoiceUrl = url;
    } catch (error) {
      console.error('Error reproduciendo voz', error);
      this.snackBar.open('Error al reproducir esta voz', 'Cerrar', {
        duration: 4000,
        panelClass: ['error-snackbar']
      });
      this.playingVoiceId = null;
      this.playingVoiceUrl = null;
    } finally {
      this.playingVoiceLoadingId = null;
      this.cdr.detectChanges();
    }
  }

  private async persistVoices(): Promise<void> {
    try {
      await this.supabaseService.upsertSetting('tts_custom_voices', this.voices);
    } catch (error) {
      console.error('Error saving voices', error);
      this.snackBar.open('Error al guardar voces', 'Cerrar', {
        duration: 4000,
        panelClass: ['error-snackbar']
      });
      throw error;
    }
  }
}

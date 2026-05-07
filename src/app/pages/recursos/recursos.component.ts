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
  audioPromptUrl?: string;
  targetModel?: string;
  speed?: number;
  language?: string;
  temperature?: number;
  exaggeration?: number;
  cfgWeight?: number;
  repetitionPenalty?: number;
  minP?: number;
  topP?: number;
  seed?: number;
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
  currentUserRole: 'user' | 'admin' | 'super_admin' = 'user';
  currentUserId: string | null = null;
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

  chatterboxFile: File | null = null;
  chatterboxCreating = false;
  chatterboxLastVoiceId: string | null = null;
  chatterboxLastAudioUrl: string | null = null;
  chatterboxSampleDownloading = false;
  chatterboxStep: 'idle' | 'uploading' | 'creating' = 'idle';
  chatterboxLanguage = 'Spanish (es)';
  chatterboxExaggeration = 0.45;
  chatterboxCfgWeight = 0.3;
  chatterboxTemperature = 0.8;
  chatterboxRepetitionPenalty = 2.0;
  chatterboxMinP = 0.05;
  chatterboxTopP = 1.0;
  chatterboxSeed = 163260306;
  chatterboxUseCpu = false;
  chatterboxKeepModelLoaded = false;

  saving = false;
  creationMode: 'azure' | 'qwen' = 'qwen';
  playingVoiceId: string | null = null;
  playingVoiceUrl: string | null = null;
  playingVoiceLoadingId: string | null = null;
  lastPlayErrorVoiceId: string | null = null;
  private lastPlayErrorResetTimer: number | null = null;

  chatterboxPreviewPlaying: boolean = false;
  chatterboxPreviewLoading: boolean = false;
  chatterboxPreviewAudio: HTMLAudioElement | null = null;

  qwenFile: File | null = null;
  qwenCreating = false;
  qwenLastVoiceId: string | null = null;
  qwenLastAudioUrl: string | null = null;
  qwenTargetModel = 'qwen3-tts-vc-2026-01-22';
  qwenRate = 1.0;
  qwenPitch = 1.0;
  qwenStep: 'idle' | 'uploading' | 'creating' = 'idle';
  qwenSampleDownloading = false;
  qwenPreviewPlaying: boolean = false;
  qwenPreviewLoading: boolean = false;
  qwenPreviewAudio: HTMLAudioElement | null = null;
  qwenFileDurationSec: number | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private azureTtsService: AzureTtsService
  ) {}

  get canManageVoices(): boolean {
    return this.currentUserRole === 'super_admin';
  }

  canDeleteMusic(music: any): boolean {
    if (this.currentUserRole === 'super_admin') return true;
    if (!this.currentUserId) return false;
    return String(music?.user_id || '') === this.currentUserId;
  }

  async ngOnInit(): Promise<void> {
    await this.loadCurrentUserRole();
    await this.loadVoices();
    await this.loadRadios();
  }

  ngOnDestroy(): void {
    if (this.chatterboxPreviewAudio) {
      this.chatterboxPreviewAudio.pause();
      this.chatterboxPreviewAudio = null;
    }
    if (this.qwenPreviewAudio) {
      this.qwenPreviewAudio.pause();
      this.qwenPreviewAudio = null;
    }
  }

  async onQwenFileSelected(event: any): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      this.snackBar.open('Archivo demasiado grande (máximo 10MB). Elige uno más liviano.', 'Cerrar', {
        duration: 4000
      });
      return;
    }
    this.qwenFile = file;
    this.qwenFileDurationSec = null;
    try {
      const dur = await this.getAudioDurationSeconds(file);
      if (typeof dur === 'number' && isFinite(dur) && dur > 0) {
        this.qwenFileDurationSec = dur;
      }
    } catch {}
  }

  onQwenParamChange(): void {
    if (this.qwenPreviewPlaying && this.qwenPreviewAudio) {
      this.qwenPreviewAudio.pause();
      this.qwenPreviewAudio = null;
      this.qwenPreviewPlaying = false;
      this.cdr.detectChanges();
    }
  }

  async createQwenVoice(): Promise<void> {
    if (!this.canManageVoices) {
      this.snackBar.open('No autorizado', 'Cerrar', { duration: 2500 });
      return;
    }
    if (!this.qwenFile) {
      this.snackBar.open('Debes seleccionar un audio de referencia', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    const baseLabel = this.formData.label.trim() || 'voz_clonada';
    const preferredName = baseLabel.replace(/[^a-zA-Z0-9_-]+/g, '_');

    this.qwenCreating = true;
    this.qwenStep = 'uploading';
    this.cdr.detectChanges();

    try {
      const filePath = `temp-voice-cloning/${Date.now()}_${this.qwenFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      let audioUrl: string;
      try {
        audioUrl = await this.supabaseService.uploadAudioFile(this.qwenFile, filePath);
      } catch (uploadError: any) {
        console.error('Error uploading file to Supabase:', uploadError);
        throw new Error('Error al subir el archivo de audio. Verifica tu conexión o permisos.');
      }

      this.qwenLastAudioUrl = audioUrl;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      this.qwenStep = 'creating';
      this.cdr.detectChanges();

      const apiUrl = config.apiUrl || '';
      const resp = await fetch(`${apiUrl}/api/qwen-voice-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl,
          preferred_name: preferredName,
          target_model: this.qwenTargetModel
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({} as any));
        throw new Error(this.formatQwenVoiceCreateError(err));
      }

      const data = await resp.json().catch(() => ({} as any));
      const voiceParam = data.voice || data.voiceId || data.id;
      if (!voiceParam) {
        throw new Error('Respuesta inválida: no se recibió voice');
      }
      this.qwenLastVoiceId = voiceParam;

      this.snackBar.open('Voz clonada creada correctamente. Ahora puedes guardarla.', 'Cerrar', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
    } catch (error: any) {
      console.error('Error creating Qwen voice', error);
      const message = error?.name === 'AbortError'
        ? 'Tiempo de espera agotado al crear la voz. Verifica conexión y backend.'
        : this.formatQwenVoiceCreateError(error?.message || error);
      this.snackBar.open(message, 'Cerrar', { duration: 5000, panelClass: ['error-snackbar'] });
    } finally {
      this.qwenCreating = false;
      this.qwenStep = 'idle';
      this.cdr.detectChanges();
    }
  }

  private async getAudioDurationSeconds(file: File): Promise<number | null> {
    const url = URL.createObjectURL(file);
    try {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = url;
      const loaded = await new Promise<boolean>((resolve) => {
        audio.onloadedmetadata = () => resolve(true);
        audio.onerror = () => resolve(false);
      });
      if (!loaded) return null;
      const d = audio.duration;
      if (!d || !isFinite(d)) return null;
      return d;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private parseJsonMaybe(value: any): any {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  private formatQwenVoiceCreateError(raw: any): string {
    const parsed = this.parseJsonMaybe(raw);
    const payload = parsed || raw || {};
    const details = payload?.details || payload?.dashscopeError || payload;
    const code = details?.code || payload?.code;
    const requestId = details?.request_id || details?.requestId || payload?.request_id || payload?.requestId;
    const baseMsg =
      details?.message ||
      payload?.message ||
      payload?.error ||
      (typeof raw === 'string' ? raw : '');

    if (code === 'Audio.DurationLimitError' || /DurationLimitError/i.test(String(code || '')) || /duration exceeds/i.test(String(baseMsg || ''))) {
      const dur = this.qwenFileDurationSec ? `${Math.round(this.qwenFileDurationSec)}s` : null;
      const durPart = dur ? ` Duración detectada: ${dur}.` : '';
      const idPart = requestId ? ` ID: ${String(requestId)}` : '';
      return `El audio de referencia es demasiado largo para la API de Qwen.${durPart} Recórtalo y vuelve a intentarlo.${idPart}`;
    }

    const idPart = requestId ? ` (ID: ${String(requestId)})` : '';
    const pretty = typeof baseMsg === 'string' && baseMsg.trim().length > 0 ? baseMsg.trim() : 'Error al crear voz clonada';
    return `${pretty}${idPart}`;
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
      const url = await this.azureTtsService.generateSpeech({
        text,
        voice: `qwen:${this.qwenLastVoiceId}`,
        speed: this.qwenRate,
        pitch: this.qwenPitch
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

  async downloadQwenSample(): Promise<void> {
    if (!this.qwenLastVoiceId) {
      this.snackBar.open('Primero crea una voz clonada', 'Cerrar', {
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
        speed: this.qwenRate,
        pitch: this.qwenPitch
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

      this.snackBar.open('Descarga de muestra iniciada', 'Cerrar', {
        duration: 2000
      });
    } catch (error) {
      console.error('Error downloading Qwen sample audio', error);
      this.snackBar.open('Error al descargar la muestra de voz', 'Cerrar', {
        duration: 4000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.qwenSampleDownloading = false;
      this.cdr.detectChanges();
    }
  }

  async loadRadios(): Promise<void> {
    try {
        this.radios = await this.supabaseService.getRadios();
    } catch (error) {
        console.error('Error loading radios:', error);
    }
  }

  onChatterboxFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      this.snackBar.open('Archivo demasiado grande (máximo 10MB). Elige uno más liviano.', 'Cerrar', {
        duration: 4000
      });
      return;
    }
    this.chatterboxFile = file;
  }

  async createChatterboxVoice(): Promise<void> {
    if (!this.chatterboxFile) {
      this.snackBar.open('Debes seleccionar un audio de referencia', 'Cerrar', {
        duration: 3000
      });
      return;
    }
    this.chatterboxCreating = true;
    this.chatterboxStep = 'uploading';
    this.cdr.detectChanges();
    try {
      this.chatterboxStep = 'uploading';
      this.cdr.detectChanges();

      // Subir archivo a Supabase Storage para obtener URL pública
      // Esto evita enviar el archivo en base64 al backend, lo que causa errores 413 Payload Too Large en Vercel
      const filePath = `temp-voice-cloning/${Date.now()}_${this.chatterboxFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      let audioUrl: string;
      try {
        audioUrl = await this.supabaseService.uploadAudioFile(this.chatterboxFile, filePath);
      } catch (uploadError: any) {
        console.error('Error uploading file to Supabase:', uploadError);
        throw new Error('Error al subir el archivo de audio. Verifica tu conexión o permisos.');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      
      this.chatterboxStep = 'creating';
      this.cdr.detectChanges();
      
      const apiUrl = config.apiUrl || ''; // Fallback to empty string for relative path if not set
      const languageRaw = (this.chatterboxLanguage || '').trim();
      const languageMatch = languageRaw.match(/\(([^)]+)\)\s*$/);
      const languageCode = (languageMatch?.[1]?.trim() || (languageRaw.length <= 5 ? languageRaw : '') || 'es').trim();
      const resp = await fetch(`${apiUrl}/api/chatterbox-voice-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl: audioUrl,
          language: languageCode,
          language_code: languageCode,
          languageCode,
          lang: languageCode,
          temperature: this.chatterboxTemperature,
          exaggeration: this.chatterboxExaggeration,
          cfg_weight: this.chatterboxCfgWeight,
          cfgWeight: this.chatterboxCfgWeight,
          repetition_penalty: this.chatterboxRepetitionPenalty,
          repetitionPenalty: this.chatterboxRepetitionPenalty,
          min_p: this.chatterboxMinP,
          minP: this.chatterboxMinP,
          top_p: this.chatterboxTopP,
          topP: this.chatterboxTopP,
          seed: this.chatterboxSeed,
          use_cpu: this.chatterboxUseCpu,
          useCpu: this.chatterboxUseCpu,
          keep_model_loaded: this.chatterboxKeepModelLoaded,
          keepModelLoaded: this.chatterboxKeepModelLoaded
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({} as any));
        const msg = err.details || err.error || 'Error al crear voz clonada';
        throw new Error(JSON.stringify(msg));
      }
      
      const data = await resp.json();
      const voiceParam = data.voiceId || data.voice;
      this.chatterboxLastVoiceId = voiceParam;
      this.chatterboxLastAudioUrl = audioUrl;
      
      this.snackBar.open('Voz clonada creada correctamente. Ahora puedes guardarla.', 'Cerrar', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
    } catch (error: any) {
      console.error('Error creating Chatterbox voice', error);
      const message =
        error?.name === 'AbortError'
          ? 'Tiempo de espera agotado al crear la voz. Verifica conexión y backend.'
          : error?.message || 'Error al crear voz clonada';
      this.snackBar.open(message, 'Cerrar', { duration: 5000, panelClass: ['error-snackbar'] });
    } finally {
      this.chatterboxCreating = false;
      this.chatterboxStep = 'idle';
      this.cdr.detectChanges();
    }
  }

  private saveChatterboxVoice(label: string): boolean {
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

    if (!this.chatterboxLastVoiceId) {
      this.snackBar.open('Primero debes crear la voz clonada', 'Cerrar', {
        duration: 3000
      });
      return false;
    }

    const newVoice: CustomVoice = {
      id: this.generateId(),
      name: `chatterbox:${this.chatterboxLastVoiceId}`,
      label,
      gender: 'Other',
      description: this.formData.description.trim() || undefined,
      provider: 'chatterbox-vira',
      voiceId: this.chatterboxLastVoiceId,
      audioPromptUrl: this.chatterboxLastAudioUrl || undefined,
      exaggeration: this.chatterboxExaggeration,
      cfgWeight: this.chatterboxCfgWeight,
      temperature: this.chatterboxTemperature,
      repetitionPenalty: this.chatterboxRepetitionPenalty,
      minP: this.chatterboxMinP,
      topP: this.chatterboxTopP,
      seed: this.chatterboxSeed,
      language: this.chatterboxLanguage
    };
    this.voices = [...this.voices, newVoice];
    return true;
  }

  async downloadChatterboxSample(): Promise<void> {
    if (!this.chatterboxLastVoiceId) {
      this.snackBar.open('Primero crea una voz clonada', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    this.chatterboxSampleDownloading = true;
    this.cdr.detectChanges();

    try {
      const baseLabel = this.formData.label.trim() || 'voz_clonada';
      const safeLabel = baseLabel.replace(/[^a-zA-Z0-9_-]+/g, '_');
      const text = 'Esta es una muestra de la voz clonada para el noticiero de radio.';
      const url = await this.azureTtsService.generateSpeech({
        text,
        voice: `chatterbox:${this.chatterboxLastVoiceId}`,
        exaggeration: this.chatterboxExaggeration,
        temperature: this.chatterboxTemperature,
        cfgWeight: this.chatterboxCfgWeight,
        repetitionPenalty: this.chatterboxRepetitionPenalty,
        minP: this.chatterboxMinP,
        topP: this.chatterboxTopP,
        seed: this.chatterboxSeed,
        language: this.chatterboxLanguage
      });
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const fileName = `chatterbox_preview_${safeLabel}.mp3`;

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      this.snackBar.open('Descarga de muestra iniciada', 'Cerrar', {
        duration: 2000
      });
    } catch (error) {
      console.error('Error downloading Chatterbox sample audio', error);
      this.snackBar.open('Error al descargar la muestra de voz', 'Cerrar', {
        duration: 4000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.chatterboxSampleDownloading = false;
      this.cdr.detectChanges();
    }
  }

  onParamChange(): void {
    if (this.chatterboxPreviewPlaying && this.chatterboxPreviewAudio) {
      this.chatterboxPreviewAudio.pause();
      this.chatterboxPreviewAudio = null;
      this.chatterboxPreviewPlaying = false;
      this.cdr.detectChanges();
    }
  }

  randomizeChatterboxSeed(): void {
    this.chatterboxSeed = Math.floor(Math.random() * 2147483647);
    this.onParamChange();
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

  private async loadCurrentUserRole(): Promise<void> {
    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) {
        this.currentUserRole = 'user';
        this.currentUserId = null;
        return;
      }
      this.currentUserId = user.id;
      const profile = await this.supabaseService.getUserProfile(user.id);
      const role = String(profile?.role || 'user') as any;
      if (role === 'super_admin' || role === 'admin' || role === 'user') {
        this.currentUserRole = role;
      } else {
        this.currentUserRole = 'user';
      }
    } catch (e) {
      this.currentUserRole = 'user';
      this.currentUserId = null;
    }
  }

  openCreateModal(): void {
    if (!this.canManageVoices) return;
    this.formData = {
      name: '',
      label: '',
      gender: 'Male',
      description: ''
    };
    this.selectedVoice = null;
    this.creationMode = 'qwen';
    
    this.chatterboxLastVoiceId = null;
    this.chatterboxLastAudioUrl = null;
    this.chatterboxLanguage = 'Spanish (es)';
    this.chatterboxExaggeration = 0.45;
    this.chatterboxCfgWeight = 0.3;
    this.chatterboxTemperature = 0.8;
    this.chatterboxRepetitionPenalty = 2.0;
    this.chatterboxMinP = 0.05;
    this.chatterboxTopP = 1.0;
    this.chatterboxSeed = 163260306;
    this.chatterboxUseCpu = false;
    this.chatterboxKeepModelLoaded = false;
    this.chatterboxFile = null;
    this.chatterboxCreating = false;
    this.chatterboxSampleDownloading = false;

    // Reset preview state
    if (this.chatterboxPreviewAudio) {
      this.chatterboxPreviewAudio.pause();
      this.chatterboxPreviewAudio = null;
    }
    this.chatterboxPreviewPlaying = false;
    this.chatterboxPreviewLoading = false;
    this.qwenLastVoiceId = null;
    this.qwenLastAudioUrl = null;
    this.qwenTargetModel = 'qwen3-tts-vc-2026-01-22';
    this.qwenRate = 1.0;
    this.qwenPitch = 1.0;
    this.qwenFile = null;
    this.qwenCreating = false;
    this.qwenStep = 'idle';
    this.qwenSampleDownloading = false;

    if (this.qwenPreviewAudio) {
      this.qwenPreviewAudio.pause();
      this.qwenPreviewAudio = null;
    }
    this.qwenPreviewPlaying = false;
    this.qwenPreviewLoading = false;

    this.showCreateModal = true;
  }

  openEditModal(voice: CustomVoice): void {
    if (!this.canManageVoices) return;
    this.selectedVoice = voice;
    this.formData = {
      name: voice.name,
      label: voice.label,
      gender: voice.gender,
      description: voice.description || ''
    };

    const isQwen = String(voice.name || '').startsWith('qwen:') || (voice.provider || '').toLowerCase().includes('qwen');
    if (isQwen) {
      this.qwenLastVoiceId = voice.voiceId || String(voice.name || '').replace(/^qwen:/, '') || null;
      this.qwenLastAudioUrl = voice.audioPromptUrl || null;
      this.qwenTargetModel = voice.targetModel || 'qwen3-tts-vc-2026-01-22';
      this.qwenRate = voice.speed ?? 1.0;
      this.qwenPitch = voice.exaggeration ?? 1.0;
      this.creationMode = 'qwen';
    } else {
      this.chatterboxLanguage = voice.language || 'Spanish (es)';
      this.chatterboxTemperature = voice.temperature ?? 0.7;
      this.chatterboxExaggeration = voice.exaggeration ?? 1.0;
      this.chatterboxCfgWeight = voice.cfgWeight ?? 0.5;
      this.chatterboxRepetitionPenalty = voice.repetitionPenalty ?? 2.0;
      this.chatterboxMinP = voice.minP ?? 0.05;
      this.chatterboxTopP = voice.topP ?? 1.0;
      this.chatterboxSeed = voice.seed ?? 163260306;
      this.chatterboxLastVoiceId = voice.voiceId || null;
      this.chatterboxLastAudioUrl = voice.audioPromptUrl || null;
      this.creationMode = 'qwen';
    }
    this.showEditModal = true;
  }

  closeModals(): void {
    // Stop preview if playing
    if (this.chatterboxPreviewAudio) {
      this.chatterboxPreviewAudio.pause();
      this.chatterboxPreviewAudio = null;
    }
    this.chatterboxPreviewPlaying = false;
    this.chatterboxPreviewLoading = false;
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

  async previewChatterboxParams(): Promise<void> {
    if (!this.chatterboxLastVoiceId) return;

    if (this.chatterboxPreviewPlaying && this.chatterboxPreviewAudio) {
      this.chatterboxPreviewAudio.pause();
      this.chatterboxPreviewAudio = null;
      this.chatterboxPreviewPlaying = false;
      this.cdr.detectChanges();
      return;
    }

    this.chatterboxPreviewLoading = true;
    this.cdr.detectChanges();

    try {
      const text = 'Esta es una prueba de voz con los ajustes seleccionados.';
      const url = await this.azureTtsService.generateSpeech({
        text,
        voice: `chatterbox:${this.chatterboxLastVoiceId}`,
        temperature: this.chatterboxTemperature,
        exaggeration: this.chatterboxExaggeration,
        cfgWeight: this.chatterboxCfgWeight,
        repetitionPenalty: this.chatterboxRepetitionPenalty,
        minP: this.chatterboxMinP,
        topP: this.chatterboxTopP,
        seed: this.chatterboxSeed,
        language: this.chatterboxLanguage
      });

      if (this.chatterboxPreviewAudio) {
        this.chatterboxPreviewAudio.pause();
      }
      
      this.chatterboxPreviewAudio = new Audio(url);
      this.chatterboxPreviewAudio.onended = () => {
        this.chatterboxPreviewPlaying = false;
        this.chatterboxPreviewAudio = null;
        this.cdr.detectChanges();
      };
      
      this.chatterboxPreviewLoading = false;
      this.chatterboxPreviewPlaying = true;
      this.chatterboxPreviewAudio.play();
      
    } catch (error) {
      console.error('Error previewing Chatterbox voice:', error);
      this.snackBar.open('Error al generar la prueba de voz', 'Cerrar', { duration: 3000 });
      this.chatterboxPreviewLoading = false;
      this.chatterboxPreviewPlaying = false;
    } finally {
      this.cdr.detectChanges();
    }
  }

  async saveVoice(): Promise<void> {
    if (!this.canManageVoices) return;
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

        const isQwen = String(updatedVoice.name || '').startsWith('qwen:') || (updatedVoice.provider || '').toLowerCase().includes('qwen');
        if (isQwen) {
          updatedVoice.provider = updatedVoice.provider || 'qwen-dashscope';
          updatedVoice.voiceId = this.qwenLastVoiceId || updatedVoice.voiceId || String(updatedVoice.name || '').replace(/^qwen:/, '');
          updatedVoice.name = `qwen:${updatedVoice.voiceId}`;
          updatedVoice.speed = this.qwenRate;
          updatedVoice.exaggeration = this.qwenPitch;
          updatedVoice.targetModel = this.qwenTargetModel;
          updatedVoice.audioPromptUrl = this.qwenLastAudioUrl || updatedVoice.audioPromptUrl;
        } else {
          updatedVoice.temperature = this.chatterboxTemperature;
          updatedVoice.exaggeration = this.chatterboxExaggeration;
          updatedVoice.cfgWeight = this.chatterboxCfgWeight;
          updatedVoice.repetitionPenalty = this.chatterboxRepetitionPenalty;
          updatedVoice.minP = this.chatterboxMinP;
          updatedVoice.topP = this.chatterboxTopP;
          updatedVoice.seed = this.chatterboxSeed;
          updatedVoice.language = this.chatterboxLanguage;
          updatedVoice.audioPromptUrl = this.chatterboxLastAudioUrl || updatedVoice.audioPromptUrl;
        }
        
        const updatedVoices = currentVoices.map(v => 
          v.id === this.selectedVoice?.id ? updatedVoice : v
        );
        
        await this.supabaseService.upsertSetting('tts_custom_voices', updatedVoices);
        
        this.snackBar.open('Voz actualizada correctamente', 'Cerrar', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      } else {
        let newVoice: CustomVoice;

        if (!this.qwenLastVoiceId) {
          this.snackBar.open('Primero debes crear la voz clonada (botón Crear)', 'Cerrar', { duration: 3000 });
          this.saving = false;
          return;
        }

        newVoice = {
          id: this.generateId(),
          name: `qwen:${this.qwenLastVoiceId}`,
          label: label,
          gender: this.formData.gender,
          description: this.formData.description.trim(),
          provider: 'qwen-dashscope',
          voiceId: this.qwenLastVoiceId,
          targetModel: this.qwenTargetModel,
          speed: this.qwenRate,
          exaggeration: this.qwenPitch,
          audioPromptUrl: this.qwenLastAudioUrl || undefined,
          language: 'es'
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
    if (!this.canManageVoices) return;
    if (!confirm('ADVERTENCIA: ¿Estás seguro de eliminar esta voz personalizada?\n\nNOTA: Los audios YA GENERADOS (mp3) con esta voz seguirán funcionando, pero si intentas regenerar o editar noticias que usaban esta voz, el sistema ya no podrá usarla.')) return;

    this.voices = this.voices.filter(v => v.id !== voice.id);
    await this.persistVoices();
  }

  async playVoice(voice: CustomVoice): Promise<void> {
    const text =
      'Esta es una muestra corta de la voz que usarás en tus noticieros.';
    const isChatterbox = voice.provider === 'chatterbox-vira' || voice.name.startsWith('chatterbox:');
    const voiceName = isChatterbox
      ? `chatterbox:${voice.voiceId || voice.name.replace(/^chatterbox:/, '')}`
      : voice.name;

    if (this.lastPlayErrorResetTimer) {
      window.clearTimeout(this.lastPlayErrorResetTimer);
      this.lastPlayErrorResetTimer = null;
    }

    this.lastPlayErrorVoiceId = null;
    this.playingVoiceLoadingId = voice.id;
    this.playingVoiceId = voice.id;
    this.playingVoiceUrl = null;
    this.cdr.detectChanges();

    try {
      const timeoutMs = 120000;
      const timeoutPromise = new Promise<string>((_, reject) => {
        window.setTimeout(() => reject(new Error('Tiempo de espera agotado al generar audio')), timeoutMs);
      });

      const url = await Promise.race([
        this.azureTtsService.generateSpeech({
        text,
        voice: voiceName,
        speed: voice.speed || 1,
        language: voice.language,
        temperature: voice.temperature,
        exaggeration: voice.exaggeration,
        cfgWeight: voice.cfgWeight,
        repetitionPenalty: voice.repetitionPenalty,
        minP: voice.minP,
        topP: voice.topP,
        seed: voice.seed,
        audioPromptUrl: voice.audioPromptUrl
        }),
        timeoutPromise
      ]);
      this.playingVoiceUrl = url;
    } catch (error) {
      console.error('Error reproduciendo voz', error);
      this.snackBar.open('Error al reproducir esta voz', 'Cerrar', {
        duration: 4000,
        panelClass: ['error-snackbar']
      });
      this.lastPlayErrorVoiceId = voice.id;
      this.lastPlayErrorResetTimer = window.setTimeout(() => {
        if (this.lastPlayErrorVoiceId === voice.id) {
          this.lastPlayErrorVoiceId = null;
          this.cdr.detectChanges();
        }
      }, 6000);
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

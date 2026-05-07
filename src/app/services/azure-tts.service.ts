import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { config } from '../core/config';
import { firstValueFrom } from 'rxjs';

declare var lamejs: any;

@Injectable({
  providedIn: 'root'
})
export class AzureTtsService {
  private apiUrl = config.azureWorkerUrl || `${config.apiUrl}/api/azure-tts`;

  constructor(private http: HttpClient) {}

  private normalizeLanguage(language?: string): { label?: string; code?: string } {
    const raw = (language || '').trim();
    if (!raw) return {};

    const m = raw.match(/\(([^)]+)\)\s*$/);
    const code = m?.[1]?.trim() || (raw.length <= 5 ? raw : undefined);
    const label = raw === 'es' ? 'Spanish (es)' : raw;
    const normalizedCode = code === 'es' ? 'es' : code;
    return { label, code: normalizedCode };
  }

  async generateSpeech(params: { text: string; voice: string; speed?: number; pitch?: number; language?: string; temperature?: number; exaggeration?: number; cfgWeight?: number; repetitionPenalty?: number; minP?: number; topP?: number; seed?: number; audioPromptUrl?: string }, onProgress?: (percent: number) => void): Promise<string> {
    const AZURE_MAX_CHARS = 2400; // Safety margin below 2500
    const CHATTERBOX_MAX_CHARS = 800;
    const QWEN_MAX_CHARS = 900;

    try {
      if (params.voice && params.voice.startsWith('qwen:')) {
        if (params.text.length <= QWEN_MAX_CHARS) {
          if (onProgress) onProgress(100);
          return await this.callQwenApi(params.text, params.voice, params.speed, params.pitch);
        }

        const chunks = this.splitTextIntoChunks(params.text, QWEN_MAX_CHARS);
        const blobs: Blob[] = [];
        let completed = 0;
        for (const chunk of chunks) {
          const blobUrl = await this.callQwenApi(chunk, params.voice, params.speed, params.pitch);
          const response = await fetch(blobUrl);
          const blob = await response.blob();
          blobs.push(blob);
          URL.revokeObjectURL(blobUrl);
          completed++;
          if (onProgress) onProgress(Math.round((completed / chunks.length) * 100));
          await new Promise(resolve => setTimeout(resolve, 350));
        }

        try {
          const finalBlob = await this.mergeAudioBlobs(blobs);
          return URL.createObjectURL(finalBlob);
        } catch {
          const fallback = new Blob(blobs, { type: 'audio/mpeg' });
          return URL.createObjectURL(fallback);
        }
      }

      if (params.voice && params.voice.startsWith('chatterbox:')) {
        if (params.text.length <= CHATTERBOX_MAX_CHARS) {
          if (onProgress) onProgress(100);
          const lang = this.normalizeLanguage(params.language);
          return await this.callChatterboxApi(params.text, params.voice, {
            speed: params.speed ?? 1.0,
            exaggeration: params.exaggeration ?? params.pitch ?? 1.0,
            temperature: params.temperature ?? 0.7,
            cfgWeight: params.cfgWeight ?? 0.5,
            repetitionPenalty: params.repetitionPenalty,
            minP: params.minP,
            topP: params.topP,
            seed: params.seed,
            audioPromptUrl: params.audioPromptUrl,
            language: lang.code || lang.label,
            languageCode: lang.code
          });
        }
        const chunks = this.splitTextIntoChunks(params.text, CHATTERBOX_MAX_CHARS);
        
        return this.processChunksParallel(chunks, params, onProgress);
      }
      
      if (params.text.length <= AZURE_MAX_CHARS) {
        if (onProgress) onProgress(100);
        return await this.callApi(params.text, params.voice, params.speed, params.pitch);
      }

      // Split text into chunks for Azure
      const chunks = this.splitTextIntoChunks(params.text, AZURE_MAX_CHARS);
      // console.log(`[Azure] Text too long (${params.text.length} chars). Split into ${chunks.length} chunks.`);

      // Generate audio for each chunk
      const blobs: Blob[] = [];
      let completed = 0;
      for (const chunk of chunks) {
        const blobUrl = await this.callApi(chunk, params.voice, params.speed, params.pitch);
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        blobs.push(blob);
        URL.revokeObjectURL(blobUrl); // Clean up intermediate URLs
        completed++;
        if (onProgress) onProgress(Math.round((completed / chunks.length) * 100));
      }

      // Combine blobs
      const finalBlob = new Blob(blobs, { type: 'audio/mpeg' });
      return URL.createObjectURL(finalBlob);

    } catch (error: any) {
      console.error('Error generating Azure speech:', error);
      throw error;
    }
  }

  private async processChunksParallel(chunks: string[], params: any, onProgress?: (percent: number) => void): Promise<string> {
      // Use sequential processing to ensure stability and avoid rate limits
      const concurrency = 1;
      const results: { index: number, blob: Blob }[] = [];
      let completed = 0;
      
      // If sequential (concurrency 1), we can just loop directly without Promise.race complexity
      // This is cleaner and allows for delays
      if (concurrency === 1) {
          for (let i = 0; i < chunks.length; i++) {
              try {
                  const lang = this.normalizeLanguage(params.language);
                  const blobUrl = await this.callChatterboxApi(chunks[i], params.voice, {
                    speed: params.speed ?? 1.0,
                    exaggeration: params.exaggeration ?? params.pitch ?? 1.0,
                    temperature: params.temperature ?? 0.7,
                    cfgWeight: params.cfgWeight ?? 0.5,
                    repetitionPenalty: params.repetitionPenalty,
                    minP: params.minP,
                    topP: params.topP,
                    seed: params.seed,
                    audioPromptUrl: params.audioPromptUrl,
                    language: lang.code || lang.label,
                    languageCode: lang.code
                  });
                  
                  const response = await fetch(blobUrl);
                  const blob = await response.blob();
                  URL.revokeObjectURL(blobUrl);
                  
                  results.push({ index: i, blob });
                  completed++;
                  if (onProgress) onProgress(Math.round((completed / chunks.length) * 100));

                  // Add delay between chunks to avoid rate limits
                  if (i < chunks.length - 1) {
                      await new Promise(resolve => setTimeout(resolve, 500));
                  }
              } catch (err) {
                  console.error(`Error processing chunk ${i}:`, err);
                  throw err; // Re-throw to fail the whole process or handle gracefully?
              }
          }
          
          // Re-encode all blobs into a single MP3 to fix duration/playback issues
          // Using lamejs as it's available in the project
          try {
            const finalBlob = await this.mergeAudioBlobs(results.map(r => r.blob));
            const finalUrl = URL.createObjectURL(finalBlob);
            return finalUrl;
          } catch (mergeError) {
            console.error('[AzureTTS] Error merging audio blobs:', mergeError);
            // Fallback to simple concatenation if merge fails
            const blobs = results.map(r => r.blob);
            const finalBlob = new Blob(blobs, { type: 'audio/mpeg' });
            const finalUrl = URL.createObjectURL(finalBlob);
            return finalUrl;
          }
      }

      const pool = new Set<Promise<any>>();
      const promises: Promise<any>[] = [];

      for (let i = 0; i < chunks.length; i++) {
          const p = (async () => {
              const lang = this.normalizeLanguage(params.language);
              const blobUrl = await this.callChatterboxApi(chunks[i], params.voice, {
                speed: params.speed ?? 1.0,
                exaggeration: params.exaggeration ?? params.pitch ?? 1.0,
                temperature: params.temperature ?? 0.7,
                cfgWeight: params.cfgWeight ?? 0.5,
                repetitionPenalty: params.repetitionPenalty,
                minP: params.minP,
                topP: params.topP,
                seed: params.seed,
                audioPromptUrl: params.audioPromptUrl,
                language: lang.code || lang.label,
                languageCode: lang.code
              });
              const response = await fetch(blobUrl);
              const blob = await response.blob();
              URL.revokeObjectURL(blobUrl);
              
              completed++;
              if (onProgress) onProgress(Math.round((completed / chunks.length) * 100));
              
              return { index: i, blob };
          })();

          promises.push(p);
          pool.add(p);
          
          // Clean up from pool when done
          const clean = () => pool.delete(p);
          p.then(clean).catch(clean);

          if (pool.size >= concurrency) {
              await Promise.race(pool);
          }
      }

      // Wait for all remaining
      const finalResults = await Promise.all(promises);
      
      // Sort by index to ensure correct order
      finalResults.sort((a, b) => a.index - b.index);
      
      const blobs = finalResults.map(r => r.blob);
      const finalBlob = new Blob(blobs, { type: 'audio/mpeg' });
      return URL.createObjectURL(finalBlob);
  }

  private async callQwenApi(text: string, voice: string, speed: number = 1.0, pitch: number = 1.0): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post(`${config.apiUrl}/api/qwen-tts`, {
          text,
          voice,
          speed,
          pitch
        }, {
          responseType: 'blob'
        })
      );

      if (response.size === 0) {
        throw new Error('El audio generado está vacío');
      }

      return URL.createObjectURL(response);
    } catch (error: any) {
      if (error?.error instanceof Blob) {
        const textBody = await error.error.text().catch(() => '');
        throw new Error(textBody || 'Error al generar audio con Qwen');
      }
      throw error;
    }
  }

  private async mergeAudioBlobs(blobs: Blob[]): Promise<Blob> {
    if (blobs.length === 0) return new Blob([], { type: 'audio/mpeg' });
    if (blobs.length === 1) return blobs[0];

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffers: AudioBuffer[] = [];
    
    // Decode all blobs
    for (const blob of blobs) {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      buffers.push(audioBuffer);
    }

    // Calculate total length
    const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
    const sampleRate = buffers[0].sampleRate;
    const numberOfChannels = buffers[0].numberOfChannels;

    // Create a new buffer
    const resultBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);

    // Copy data
    let offset = 0;
    for (const buf of buffers) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const resultData = resultBuffer.getChannelData(channel);
        const channelData = buf.getChannelData(channel);
        resultData.set(channelData, offset);
      }
      offset += buf.length;
    }

    // Encode to MP3 using lamejs
    const samplesL = resultBuffer.getChannelData(0);
    const samplesR = numberOfChannels > 1 ? resultBuffer.getChannelData(1) : undefined;
    
    // Create new Mp3Encoder with the correct parameters
    // IMPORTANT: lamejs expects samples as Int16 [-32768, 32767]
    const mp3encoder = new lamejs.Mp3Encoder(numberOfChannels, sampleRate, 128);
    const mp3Data: Int8Array[] = [];
    
    // We need to convert Float32 [-1.0, 1.0] to Int16
    const int16L = new Int16Array(samplesL.length);
    const int16R = samplesR ? new Int16Array(samplesR.length) : undefined;

    for (let i = 0; i < samplesL.length; i++) {
        // Clamp and scale
        let val = Math.max(-1, Math.min(1, samplesL[i]));
        int16L[i] = val < 0 ? val * 0x8000 : val * 0x7FFF;
        
        if (int16R && samplesR) {
            let valR = Math.max(-1, Math.min(1, samplesR[i]));
            int16R[i] = valR < 0 ? valR * 0x8000 : valR * 0x7FFF;
        }
    }

    // Encode in chunks to avoid stack overflow or freezing
    const sampleBlockSize = 1152; 
    for (let i = 0; i < int16L.length; i += sampleBlockSize) {
        const leftChunk = int16L.subarray(i, i + sampleBlockSize);
        const rightChunk = int16R ? int16R.subarray(i, i + sampleBlockSize) : undefined;
        
        // encodeBuffer returns Int8Array
        const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }

        // Yield to main thread every ~50 chunks to keep UI responsive
        if (i % (sampleBlockSize * 50) === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    // Finish encoding
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    await audioContext.close();

    return new Blob(mp3Data as BlobPart[], { type: 'audio/mpeg' });
  }

  private async callChatterboxApi(
    text: string,
    voice: string,
    options: {
      speed?: number;
      exaggeration?: number;
      temperature?: number;
      cfgWeight?: number;
      repetitionPenalty?: number;
      minP?: number;
      topP?: number;
      seed?: number;
      language?: string;
      languageCode?: string;
      audioPromptUrl?: string;
    } = {}
  ): Promise<string> {
    try {
      const speed = options.speed ?? 1.0;
      const exaggeration = options.exaggeration ?? 1.0;
      const temperature = options.temperature ?? 0.7;
      const cfgWeight = options.cfgWeight ?? 0.5;

      const payload = {
        text,
        voice,
        speed,
        exaggeration,
        temperature,
        cfg_weight: cfgWeight,
        cfgWeight,
        language: options.language,
        language_code: options.languageCode,
        languageCode: options.languageCode,
        repetition_penalty: options.repetitionPenalty,
        repetitionPenalty: options.repetitionPenalty,
        min_p: options.minP,
        minP: options.minP,
        top_p: options.topP,
        topP: options.topP,
        seed: options.seed,
        lang: options.languageCode,
        audio_prompt_url: options.audioPromptUrl,
        audioPromptUrl: options.audioPromptUrl,
        audio_url: options.audioPromptUrl,
        audioUrl: options.audioPromptUrl
      };

      const startResp = await firstValueFrom(
        this.http.post(`${config.apiUrl}/api/chatterbox-tts`, payload, {
          observe: 'response',
          responseType: 'blob'
        })
      );

      if (startResp.status === 202) {
        if (!startResp.body) throw new Error('Respuesta inválida: body vacío');
        const textBody = await startResp.body.text();
        const json = JSON.parse(textBody || '{}');
        const requestId = json.id || json.requestId || json.request_id;
        if (!requestId) {
          throw new Error('Respuesta inválida: falta id de job');
        }

        const deadlineMs = Date.now() + 180000;
        while (Date.now() < deadlineMs) {
          const pollResp = await firstValueFrom(
            this.http.get(`${config.apiUrl}/api/chatterbox-tts-job/${encodeURIComponent(requestId)}`, {
              observe: 'response',
              responseType: 'blob'
            })
          );

          if (pollResp.status === 202) {
            await new Promise(r => setTimeout(r, 1200));
            continue;
          }

          if (pollResp.status >= 200 && pollResp.status < 300) {
            if (!pollResp.body) throw new Error('Respuesta inválida: body vacío');
            if (pollResp.body.size === 0) throw new Error('El audio generado está vacío');
            return URL.createObjectURL(pollResp.body);
          }

          const errText = pollResp.body ? await pollResp.body.text().catch(() => '') : '';
          throw new Error(errText || `Error al generar audio (status ${pollResp.status})`);
        }

        throw new Error('Tiempo de espera agotado al generar audio');
      }

      if (!startResp.body || startResp.body.size === 0) {
        throw new Error('El audio generado está vacío');
      }
      return URL.createObjectURL(startResp.body);
    } catch (error: any) {
      if (error.error instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const errorJson = JSON.parse(reader.result as string);
            console.error('Error Chatterbox:', errorJson);
          } catch {
            console.error('Error Chatterbox (texto):', reader.result);
          }
        };
        reader.readAsText(error.error);
      }
      throw error;
    }
  }

  private async callApi(text: string, voice: string, speed: number = 1.0, pitch: number = 1.0): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post(this.apiUrl, {
          text,
          voice,
          speed,
          pitch
        }, {
          responseType: 'blob'
        })
      );

      if (response.size === 0) {
        throw new Error('El audio generado está vacío');
      }

      return URL.createObjectURL(response);
    } catch (error: any) {
        // Intentar leer el mensaje de error si viene como Blob
        if (error.error instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                 const errorJson = JSON.parse(reader.result as string);
                 console.error('🛑 DETALLE DEL ERROR DEL WORKER:', errorJson);
              } catch (e) {
                 console.error('🛑 Contenido del error (texto):', reader.result);
              }
            };
            reader.readAsText(error.error);
          }
          throw error;
    }
  }

  private splitTextIntoChunks(text: string, maxChars: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    
    // Split by sentence delimiters but keep them
    // Match period, exclamation, question mark followed by space or newline
    const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // If a single sentence is too long (rare but possible), hard split it
        if (sentence.length > maxChars) {
            let remaining = sentence;
            while (remaining.length > maxChars) {
                // Find nearest space before limit
                let splitIndex = remaining.lastIndexOf(' ', maxChars);
                if (splitIndex === -1) splitIndex = maxChars; // Force split if no space
                
                chunks.push(remaining.substring(0, splitIndex).trim());
                remaining = remaining.substring(splitIndex).trim();
            }
            currentChunk = remaining;
        } else {
            currentChunk = sentence;
        }
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  getVoices(): any[] {
    return [
      { name: 'es-MX-JorgeNeural', gender: 'Male', label: 'Jorge (México)' },
      { name: 'es-US-AlonsoNeural', gender: 'Male', label: 'Alonso (Latino)' },
      { name: 'es-AR-TomasNeural', gender: 'Male', label: 'Tomás (Argentina)' },
      { name: 'es-CL-LorenzoNeural', gender: 'Male', label: 'Lorenzo (Chile)' },
      { name: 'es-AR-ElenaNeural', gender: 'Female', label: 'Elena (Argentina)' },
      { name: 'es-MX-DaliaNeural', gender: 'Female', label: 'Dalia (México)' },
      { name: 'es-US-PalomaNeural', gender: 'Female', label: 'Paloma (Latino)' },
      { name: 'es-CL-CatalinaNeural', gender: 'Female', label: 'Catalina (Chile)' }
    ];
  }

  async mixVoiceAndMusic(
      voiceUrl: string, 
      musicUrl: string, 
      voiceDelay: number = 0, 
      musicVolume: number = 0.5,
      mode: 'intro' | 'outro' | 'before' | 'during' | 'after' = 'intro',
      options?: { tailSeconds?: number; fadeOutSeconds?: number }
  ): Promise<string> {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Fetch and decode both audio files
      const [voiceBlob, musicBlob] = await Promise.all([
        fetch(voiceUrl).then(r => r.blob()),
        fetch(musicUrl).then(r => r.blob())
      ]);

      const [voiceBuffer, musicBuffer] = await Promise.all([
        voiceBlob.arrayBuffer().then(b => audioContext.decodeAudioData(b)),
        musicBlob.arrayBuffer().then(b => audioContext.decodeAudioData(b))
      ]);

      const sampleRate = voiceBuffer.sampleRate; // Use voice sample rate as base
      const numberOfChannels = Math.max(voiceBuffer.numberOfChannels, musicBuffer.numberOfChannels);

      let totalDuration = 0;
      let voiceStartTime = 0;
      let musicStartTime = 0;
      let musicSegmentDuration = musicBuffer.duration;
      const tailSeconds = Math.max(0, Number(options?.tailSeconds ?? 0.8));
      const fadeOutSeconds = Math.max(0, Number(options?.fadeOutSeconds ?? 0.5));
      const effectiveMode = mode === 'intro' ? 'during' : mode === 'outro' ? 'after' : mode;

      if (effectiveMode === 'before') {
        voiceStartTime = Math.max(0, voiceDelay);
        musicStartTime = 0;
        musicSegmentDuration = Math.min(musicBuffer.duration, voiceStartTime);
        totalDuration = voiceStartTime + voiceBuffer.duration;
      } else if (effectiveMode === 'after') {
        voiceStartTime = 0;
        musicStartTime = Math.max(0, voiceBuffer.duration + voiceDelay);
        musicSegmentDuration = musicBuffer.duration;
        totalDuration = musicStartTime + musicSegmentDuration;
      } else {
        voiceStartTime = Math.max(0, voiceDelay);
        musicStartTime = 0;
        const voiceEndTime = voiceStartTime + voiceBuffer.duration;
        const desiredMusicEnd = voiceEndTime + tailSeconds;
        musicSegmentDuration = Math.min(musicBuffer.duration, desiredMusicEnd);
        totalDuration = Math.max(voiceEndTime, musicSegmentDuration);
      }
      
      const totalLength = Math.ceil(totalDuration * sampleRate);
      const resultBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);

      // Mix Audio
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const resultData = resultBuffer.getChannelData(channel);
        
        // Add Music
        const musicChannelData = musicBuffer.getChannelData(channel < musicBuffer.numberOfChannels ? channel : 0);
        const musicStartSample = Math.floor(musicStartTime * sampleRate);
        const musicSamplesToCopy = Math.min(musicBuffer.length, Math.floor(musicSegmentDuration * sampleRate));
        const fadeSamples = fadeOutSeconds > 0 ? Math.max(1, Math.floor(fadeOutSeconds * sampleRate)) : 0;
        const fadeStart = fadeSamples > 0 ? Math.max(0, musicSamplesToCopy - fadeSamples) : musicSamplesToCopy;

        for (let i = 0; i < musicSamplesToCopy; i++) {
          const outIndex = musicStartSample + i;
          if (outIndex < 0 || outIndex >= totalLength) continue;
          let gain = musicVolume;
          if (fadeSamples > 0 && i >= fadeStart) {
            const t = (i - fadeStart) / fadeSamples;
            gain = gain * Math.max(0, 1 - t);
          }
          resultData[outIndex] += musicChannelData[i] * gain;
        }

        // Add Voice
        const voiceChannelData = voiceBuffer.getChannelData(channel < voiceBuffer.numberOfChannels ? channel : 0);
        const voiceStartSample = Math.floor(voiceStartTime * sampleRate);
        
        for (let i = 0; i < voiceBuffer.length; i++) {
          if (voiceStartSample + i < totalLength) {
             resultData[voiceStartSample + i] += voiceChannelData[i];
          }
        }
      }

      // Encode to MP3 using lamejs (reusing logic from mergeAudioBlobs)
      // We need to duplicate the encoding logic here or refactor. 
      // For simplicity and to avoid large refactors, I'll inline the encoding part but optimized.
      
      // FIX: Use window['lamejs'] to avoid "lamejs is not defined" error if it's not imported as a module
      // This assumes lamejs is loaded globally via scripts in angular.json
      const lame = (window as any).lamejs || lamejs;
      
      const mp3encoder = new lame.Mp3Encoder(numberOfChannels, sampleRate, 128);
      const mp3Data: Int8Array[] = [];
      
      const samplesL = resultBuffer.getChannelData(0);
      const samplesR = numberOfChannels > 1 ? resultBuffer.getChannelData(1) : undefined;
      
      const int16L = new Int16Array(samplesL.length);
      const int16R = samplesR ? new Int16Array(samplesR.length) : undefined;

      // Convert Float32 to Int16
      for (let i = 0; i < samplesL.length; i++) {
        let val = Math.max(-1, Math.min(1, samplesL[i]));
        int16L[i] = val < 0 ? val * 0x8000 : val * 0x7FFF;
        
        if (int16R && samplesR) {
            let valR = Math.max(-1, Math.min(1, samplesR[i]));
            int16R[i] = valR < 0 ? valR * 0x8000 : valR * 0x7FFF;
        }
      }

      const sampleBlockSize = 1152;
      for (let i = 0; i < int16L.length; i += sampleBlockSize) {
        const leftChunk = int16L.subarray(i, i + sampleBlockSize);
        const rightChunk = int16R ? int16R.subarray(i, i + sampleBlockSize) : undefined;
        
        const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);

        // Yield to main thread every ~50 chunks to keep UI responsive
        if (i % (sampleBlockSize * 50) === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) mp3Data.push(mp3buf);

      await audioContext.close();
      
      const finalBlob = new Blob(mp3Data as BlobPart[], { type: 'audio/mpeg' });
      return URL.createObjectURL(finalBlob);

    } catch (error) {
      console.error('Error mixing voice and music:', error);
      throw error;
    }
  }
}

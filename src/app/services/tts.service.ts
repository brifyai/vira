import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { config } from '../core/config';

declare var lamejs: any;

@Injectable({
  providedIn: 'root'
})
export class TtsService {
  constructor(private http: HttpClient) {}

  async generateSpeech(
    params: {
      text: string;
      voice: string;
      speed?: number;
      pitch?: number;
      language?: string;
      temperature?: number;
      exaggeration?: number;
      cfgWeight?: number;
      repetitionPenalty?: number;
      minP?: number;
      topP?: number;
      seed?: number;
      audioPromptUrl?: string;
    },
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const qwenMaxChars = 900;
    const qwenVoice = this.requireQwenVoice(params.voice);

    try {
      if (params.text.length <= qwenMaxChars) {
        if (onProgress) onProgress(100);
        return await this.callQwenApi(params.text, qwenVoice, params.speed, params.pitch);
      }

      const chunks = this.splitTextIntoChunks(params.text, qwenMaxChars);
      const blobs: Blob[] = [];
      let completed = 0;

      for (const chunk of chunks) {
        const blobUrl = await this.callQwenApi(chunk, qwenVoice, params.speed, params.pitch);
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
    } catch (error: any) {
      console.error('Error generating Qwen speech:', error);
      throw error;
    }
  }

  getVoices(): any[] {
    return [];
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

      const [voiceBlob, musicBlob] = await Promise.all([
        fetch(voiceUrl).then(r => r.blob()),
        fetch(musicUrl).then(r => r.blob())
      ]);

      const [voiceBuffer, musicBuffer] = await Promise.all([
        voiceBlob.arrayBuffer().then(b => audioContext.decodeAudioData(b)),
        musicBlob.arrayBuffer().then(b => audioContext.decodeAudioData(b))
      ]);

      const sampleRate = voiceBuffer.sampleRate;
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

      for (let channel = 0; channel < numberOfChannels; channel++) {
        const resultData = resultBuffer.getChannelData(channel);
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

        const voiceChannelData = voiceBuffer.getChannelData(channel < voiceBuffer.numberOfChannels ? channel : 0);
        const voiceStartSample = Math.floor(voiceStartTime * sampleRate);

        for (let i = 0; i < voiceBuffer.length; i++) {
          if (voiceStartSample + i < totalLength) {
            resultData[voiceStartSample + i] += voiceChannelData[i];
          }
        }
      }

      const finalBlob = await this.encodeAudioBufferToMp3(resultBuffer, numberOfChannels, sampleRate);
      await audioContext.close();
      return URL.createObjectURL(finalBlob);
    } catch (error) {
      console.error('Error mixing voice and music:', error);
      throw error;
    }
  }

  private requireQwenVoice(voice?: string): string {
    const normalized = String(voice || '').trim();
    if (!normalized || !normalized.startsWith('qwen:')) {
      throw new Error('La voz seleccionada no es compatible. El sistema ahora admite solo voces Qwen clonadas.');
    }
    return normalized;
  }

  private async callQwenApi(text: string, voice: string, speed: number = 1.0, pitch: number = 1.0): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post(
          `${config.apiUrl}/api/qwen-tts`,
          { text, voice, speed, pitch },
          { responseType: 'blob' }
        )
      );

      if (response.size === 0) {
        throw new Error('El audio generado esta vacio');
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

  private splitTextIntoChunks(text: string, maxChars: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        if (sentence.length > maxChars) {
          let remaining = sentence;
          while (remaining.length > maxChars) {
            let splitIndex = remaining.lastIndexOf(' ', maxChars);
            if (splitIndex === -1) splitIndex = maxChars;
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

  private async mergeAudioBlobs(blobs: Blob[]): Promise<Blob> {
    if (blobs.length === 0) return new Blob([], { type: 'audio/mpeg' });
    if (blobs.length === 1) return blobs[0];

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffers: AudioBuffer[] = [];

    for (const blob of blobs) {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      buffers.push(audioBuffer);
    }

    const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
    const sampleRate = buffers[0].sampleRate;
    const numberOfChannels = buffers[0].numberOfChannels;
    const resultBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);

    let offset = 0;
    for (const buf of buffers) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const resultData = resultBuffer.getChannelData(channel);
        const channelData = buf.getChannelData(channel);
        resultData.set(channelData, offset);
      }
      offset += buf.length;
    }

    const finalBlob = await this.encodeAudioBufferToMp3(resultBuffer, numberOfChannels, sampleRate);
    await audioContext.close();
    return finalBlob;
  }

  private async encodeAudioBufferToMp3(
    buffer: AudioBuffer,
    numberOfChannels: number,
    sampleRate: number
  ): Promise<Blob> {
    const samplesL = buffer.getChannelData(0);
    const samplesR = numberOfChannels > 1 ? buffer.getChannelData(1) : undefined;
    const mp3encoder = new lamejs.Mp3Encoder(numberOfChannels, sampleRate, 128);
    const mp3Data: Int8Array[] = [];
    const int16L = new Int16Array(samplesL.length);
    const int16R = samplesR ? new Int16Array(samplesR.length) : undefined;

    for (let i = 0; i < samplesL.length; i++) {
      const val = Math.max(-1, Math.min(1, samplesL[i]));
      int16L[i] = val < 0 ? val * 0x8000 : val * 0x7fff;

      if (int16R && samplesR) {
        const valR = Math.max(-1, Math.min(1, samplesR[i]));
        int16R[i] = valR < 0 ? valR * 0x8000 : valR * 0x7fff;
      }
    }

    const sampleBlockSize = 1152;
    for (let i = 0; i < int16L.length; i += sampleBlockSize) {
      const leftChunk = int16L.subarray(i, i + sampleBlockSize);
      const rightChunk = int16R ? int16R.subarray(i, i + sampleBlockSize) : undefined;
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
      if (i % (sampleBlockSize * 50) === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) mp3Data.push(mp3buf);

    return new Blob(mp3Data as BlobPart[], { type: 'audio/mpeg' });
  }
}

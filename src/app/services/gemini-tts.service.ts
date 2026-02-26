import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface VoiceParams {
  text: string;
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  style?: 'Natural' | 'Noticiero' | 'Alegre' | 'Triste' | 'Serio' | 'Susurrar';
  speed?: number;
  pitch?: number;
}

@Injectable({
  providedIn: 'root'
})
export class GeminiTtsService {
  private apiUrl = environment.apiUrl;

  constructor() {}

  async generateSpeech(params: VoiceParams): Promise<string> {
    const cleanText = this.stripMarkdown(params.text);
    
    // Check if text is long and needs chunking
    if (cleanText.length > 300) {
      console.log('Texto largo detectado, usando chunking...');
      return this.processLongText(cleanText, params.voiceName, params.speed, params.pitch);
    }

    try {
        const url = `${this.apiUrl}/api/gemini-tts`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: cleanText,
                voice: params.voiceName,
                speed: params.speed,
                pitch: params.pitch,
                style: params.style
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini TTS API Error (${response.status}): ${errorText}`);
        }

        const blob = await response.blob();
        return URL.createObjectURL(blob);

    } catch (error) {
      console.error('Gemini TTS Error:', error);
      throw error;
    }
  }

  private async processLongText(text: string, voiceName: string, speed?: number, pitch?: number): Promise<string> {
    const chunks = this.splitTextIntoChunks(text, 300);
    console.log(`Texto dividido en ${chunks.length} chunks. Procesando con concurrencia...`);

    const concurrency = 3;
    const results: { index: number, blob: Blob }[] = [];
    
    // Simple concurrency implementation
    for (let i = 0; i < chunks.length; i += concurrency) {
        const batch = chunks.slice(i, i + concurrency);
        const batchPromises = batch.map((chunk, batchIndex) => {
            const index = i + batchIndex;
            return (async () => {
                const url = `${this.apiUrl}/api/gemini-tts`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: chunk,
                        voice: voiceName,
                        speed: speed,
                        pitch: pitch
                    })
                });
                
                if (!response.ok) throw new Error(`Chunk ${index} failed`);
                const blob = await response.blob();
                return { index, blob };
            })();
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }

    // Sort by index to ensure correct order
    results.sort((a, b) => a.index - b.index);
    
    // Combine blobs
    const finalBlob = new Blob(results.map(r => r.blob), { type: 'audio/mpeg' });
    return URL.createObjectURL(finalBlob);
  }

  private stripMarkdown(text: string): string {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
      .replace(/\*(.*?)\*/g, '$1')     // Italic
      .replace(/\[(.*?)\]/g, '')       // Brackets (often instructions)
      .replace(/#/g, '')               // Headers
      .trim();
  }

  private splitTextIntoChunks(text: string, maxLength: number): string[] {
    if (!text) return [];
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let currentChunk = '';
    
    // Split by sentences roughly
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxLength) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }
    
    if (currentChunk) chunks.push(currentChunk.trim());
    
    // Safety check for very long sentences without punctuation
    return chunks.flatMap(c => {
        if (c.length > maxLength) {
            // Split by comma or space if absolutely necessary
            return c.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [c];
        }
        return c;
    });
  }
  
  // Helper for old implementation compatibility if needed
  private extractAudioBuffer(response: any): Uint8Array {
      // This is now handled by the backend returning a blob directly
      return new Uint8Array(0); 
  }
  
  private makeApiCall(modelName: string, text: string, voiceName: string, speed?: number) {
      // Placeholder for old implementation
      return Promise.resolve();
  }
  
  private processResponse(response: any): string {
      return '';
  }
}

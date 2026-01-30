import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AzureTtsService {
  private apiUrl = environment.azureWorkerUrl || `${environment.apiUrl}/api/azure-tts`;

  constructor(private http: HttpClient) {}

  async generateSpeech(params: { text: string; voice: string; speed?: number }): Promise<string> {
    const MAX_CHARS = 2400; // Safety margin below 2500

    try {
      if (params.text.length <= MAX_CHARS) {
        return await this.callApi(params.text, params.voice, params.speed);
      }

      // Split text into chunks
      const chunks = this.splitTextIntoChunks(params.text, MAX_CHARS);
      console.log(`Text too long (${params.text.length} chars). Split into ${chunks.length} chunks.`);

      // Generate audio for each chunk
      const blobs: Blob[] = [];
      for (const chunk of chunks) {
        const blobUrl = await this.callApi(chunk, params.voice, params.speed);
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        blobs.push(blob);
        URL.revokeObjectURL(blobUrl); // Clean up intermediate URLs
      }

      // Combine blobs
      const finalBlob = new Blob(blobs, { type: 'audio/mpeg' });
      return URL.createObjectURL(finalBlob);

    } catch (error: any) {
      console.error('Error generating Azure speech:', error);
      throw error;
    }
  }

  private async callApi(text: string, voice: string, speed: number = 1.0): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post(this.apiUrl, {
          text,
          voice,
          speed
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
}

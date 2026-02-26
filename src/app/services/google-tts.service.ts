import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GoogleTtsService {
  // Use environment API URL
  private apiUrl = `${environment.apiUrl}/api/tts`;

  constructor() { }

  async synthesize(text: string): Promise<string> {
    if (!text) return '';

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          voice: {
            languageCode: environment.defaultVoiceSettings.language,
            name: environment.defaultVoiceSettings.voice
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: environment.defaultVoiceSettings.speakingRate,
            pitch: environment.defaultVoiceSettings.pitch
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Error generating audio');
      }

      const data = await response.json();
      return `data:audio/mp3;base64,${data.audioContent}`;
    } catch (error) {
      console.error('TTS Error:', error);
      throw error;
    }
  }
}

import { Injectable } from '@angular/core';
import { config } from '../core/config';

@Injectable({
  providedIn: 'root'
})
export class GoogleTtsService {
  // Use config API URL
  private apiUrl = `${config.apiUrl}/api/tts`;

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
            languageCode: config.defaultVoiceSettings.language,
            name: config.defaultVoiceSettings.voice
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: config.defaultVoiceSettings.speakingRate,
            pitch: config.defaultVoiceSettings.pitch
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

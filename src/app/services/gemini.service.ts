import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private apiUrl = environment.apiUrl;

  constructor() {}

  private async callGeminiApi(action: string, text: string, params: any = {}): Promise<string> {
    if (!text) return '';

    try {
      // Ensure apiUrl doesn't have trailing slash if we add one, but environment.ts says it removes /api
      // environment.apiUrl is like "https://vira-swart.vercel.app"
      // We need to call "https://vira-swart.vercel.app/api/gemini"
      
      const url = `${this.apiUrl}/api/gemini`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, text, ...params })
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Try to parse JSON error if possible
        try {
            const jsonError = JSON.parse(errorText);
            if (jsonError.error) throw new Error(jsonError.error);
        } catch (e) {
            // If not JSON, use text
        }
        throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error('Gemini Service Error:', error);
      throw error;
    }
  }

  async humanizeText(text: string): Promise<string> {
    return this.callGeminiApi('humanize', text);
  }

  async cleanText(text: string): Promise<string> {
    return this.callGeminiApi('clean', text);
  }

  async adjustContentToTime(text: string, targetSeconds: number): Promise<string> {
    return this.callGeminiApi('adjustTime', text, { targetSeconds });
  }

  async adjustToWordCount(text: string, targetWords: number): Promise<string> {
    return this.callGeminiApi('adjustWords', text, { targetWords });
  }

  async humanizeAndAdjustContent(text: string, targetSeconds: number): Promise<string> {
    return this.callGeminiApi('humanizeAndAdjust', text, { targetSeconds });
  }
}

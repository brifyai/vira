import { Injectable } from '@angular/core';
import { config } from '../core/config';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private apiUrl = config.apiUrl;

  constructor() {}

  private async callGeminiApi(
    action: string,
    text: string,
    params: any = {}
  ): Promise<{ text: string; model?: string; usage?: { promptTokens: number; outputTokens: number; totalTokens: number } }> {
    if (!text) return { text: '' };

    try {
      // Ensure apiUrl doesn't have trailing slash if we add one, but config.ts says it removes /api
      // config.apiUrl is like "https://vira-swart.vercel.app"
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
      const usage = data?.usage
        ? {
            promptTokens: Number(data.usage.promptTokens || 0),
            outputTokens: Number(data.usage.outputTokens || 0),
            totalTokens: Number(data.usage.totalTokens || 0)
          }
        : undefined;
      return { text: data.result, model: data.model, usage };
    } catch (error) {
      console.error('Gemini Service Error:', error);
      throw error;
    }
  }

  async humanizeText(text: string): Promise<{ text: string; model?: string; usage?: { promptTokens: number; outputTokens: number; totalTokens: number } }> {
    return this.callGeminiApi('humanize', text);
  }

  async cleanText(text: string): Promise<{ text: string; model?: string; usage?: { promptTokens: number; outputTokens: number; totalTokens: number } }> {
    return this.callGeminiApi('clean', text);
  }

  async adjustContentToTime(text: string, targetSeconds: number): Promise<{ text: string; model?: string; usage?: { promptTokens: number; outputTokens: number; totalTokens: number } }> {
    return this.callGeminiApi('adjustTime', text, { targetSeconds });
  }

  async adjustToWordCount(text: string, targetWords: number): Promise<{ text: string; model?: string; usage?: { promptTokens: number; outputTokens: number; totalTokens: number } }> {
    return this.callGeminiApi('adjustWords', text, { targetWords });
  }

  async humanizeAndAdjustContent(text: string, targetSeconds: number): Promise<{ text: string; model?: string; usage?: { promptTokens: number; outputTokens: number; totalTokens: number } }> {
    return this.callGeminiApi('humanizeAndAdjust', text, { targetSeconds });
  }
}

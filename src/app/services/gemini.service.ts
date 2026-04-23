import { Injectable } from '@angular/core';
import { config } from '../core/config';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private apiUrl = config.apiUrl;
  private lastCallAt = 0;
  private inFlight: Promise<void> = Promise.resolve();

  constructor() {}

  private sleep(ms: number): Promise<void> {
    const t = Number.isFinite(Number(ms)) ? Math.max(0, Number(ms)) : 0;
    return new Promise(resolve => setTimeout(resolve, t));
  }

  private parseRetryAfterMs(value: string | null): number | null {
    if (!value) return null;
    const s = String(value).trim();
    const sec = Number(s);
    if (Number.isFinite(sec)) return Math.max(0, Math.round(sec * 1000));
    const date = Date.parse(s);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    return null;
  }

  private async callGeminiApi(
    action: string,
    text: string,
    params: any = {}
  ): Promise<{ text: string; model?: string; usage?: { promptTokens: number; outputTokens: number; totalTokens: number } }> {
    if (!text) return { text: '' };

    try {
      const url = `${this.apiUrl}/api/gemini`;
      const minIntervalMs = 1200;
      const maxAttempts = 6;

      const runSerialized = async () => {
        const since = Date.now() - this.lastCallAt;
        if (since < minIntervalMs) {
          await this.sleep(minIntervalMs - since);
        }
        this.lastCallAt = Date.now();
      };

      await (this.inFlight = this.inFlight.then(runSerialized, runSerialized));

      let lastErr: any = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action, text, ...params })
        });

        if (!response.ok) {
          const retryAfterMs = this.parseRetryAfterMs(response.headers.get('retry-after'));
          const errorText = await response.text();
          let message = errorText;
          try {
            const jsonError = JSON.parse(errorText);
            if (jsonError?.error) message = String(jsonError.error);
          } catch {}

          const err: any = new Error(`Gemini API Error (${response.status}): ${message}`);
          err.status = response.status;
          err.retryAfterMs = retryAfterMs;

          const retryableByStatus = response.status === 429 || response.status === 503 || response.status === 502 || response.status === 504 || response.status === 500;
          const retryableByBody = /429|too many requests|resource exhausted/i.test(message);
          const retryable = retryableByStatus || retryableByBody;

          lastErr = err;
          if (!retryable || attempt >= maxAttempts) throw err;

          const backoffBase = retryAfterMs !== null ? retryAfterMs : 900 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 350);
          await this.sleep(Math.min(20000, backoffBase + jitter));
          continue;
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
      }

      throw lastErr || new Error('Gemini API Error');
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

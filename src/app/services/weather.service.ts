import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { config } from '../core/config';

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private readonly apiUrl = config.apiUrl;

  constructor(private http: HttpClient) { }

  private normalizeTerm(input: string): string {
    return String(input || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private pickBestGeocodingResult(results: any[], city?: string, region?: string): any | null {
    const list = Array.isArray(results) ? results : [];
    if (list.length === 0) return null;

    const cityNorm = this.normalizeTerm(city || '');
    const regionNorm = this.normalizeTerm(region || '');

    let best: any = list[0];
    let bestScore = -1;

    for (const r of list) {
      const nameNorm = this.normalizeTerm(String(r?.name || ''));
      const admin1Norm = this.normalizeTerm(String(r?.admin1 || ''));

      let score = 0;
      if (cityNorm) {
        if (nameNorm === cityNorm) score += 8;
        else if (nameNorm.startsWith(cityNorm)) score += 6;
        else if (nameNorm.includes(cityNorm)) score += 4;
      }
      if (regionNorm) {
        if (admin1Norm === regionNorm) score += 6;
        else if (admin1Norm.includes(regionNorm) || regionNorm.includes(admin1Norm)) score += 3;
      }
      if (String(r?.country_code || '').toUpperCase() === 'CL') score += 2;

      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
    }

    return best || null;
  }

  async getWeatherForLocation(location: string): Promise<string> {
    try {
      const resp: any = await firstValueFrom(
        this.http.get(`${this.apiUrl}/api/weather-for-location`, {
          params: { location }
        })
      );
      const weatherInfo = String(resp?.weatherInfo || '').trim();
      return weatherInfo || 'clima desconocido';
    } catch (error) {
      console.error('Error fetching weather:', error);
      return 'clima no disponible';
    }
  }

  private getWeatherDescription(code: number): string {
    // WMO Weather interpretation codes (WW)
    const codes: {[key: number]: string} = {
      0: 'cielo despejado',
      1: 'mayormente despejado',
      2: 'parcialmente nublado',
      3: 'nublado',
      45: 'neblina',
      48: 'escarcha',
      51: 'llovizna ligera',
      53: 'llovizna moderada',
      55: 'llovizna densa',
      61: 'lluvia ligera',
      63: 'lluvia moderada',
      65: 'lluvia fuerte',
      71: 'nieve ligera',
      73: 'nieve moderada',
      75: 'nieve fuerte',
      95: 'tormenta',
      96: 'tormenta con granizo ligero',
      99: 'tormenta con granizo fuerte'
    };
    return codes[code] || 'condiciones variables';
  }
}

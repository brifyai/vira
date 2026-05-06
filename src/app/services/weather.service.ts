import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private readonly GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
  private readonly WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

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
      // 1. Get Coordinates with fallback search strategies
      let latitude: number | undefined;
      let longitude: number | undefined;

      // Strategy 1: Full search string
      const searchStrategies = [location];
      let city: string | undefined;
      let region: string | undefined;

      // Strategy 2: If contains comma, try "City Country" (e.g. "Los Ángeles Chile")
      if (location.includes(',')) {
        const parts = location.split(',').map(p => p.trim());
        city = parts[0] || undefined;
        region = parts.length >= 2 ? (parts[1] || undefined) : undefined;
        if (parts.length >= 3) { // Comuna, Region, Country
             searchStrategies.push(`${parts[0]} ${parts[2]}`);
             searchStrategies.push(`${parts[0]} ${parts[1]} ${parts[2]}`);
             searchStrategies.push(`${parts[0]} ${parts[1]}`);
        } else if (parts.length === 2) { // Comuna, Country
             searchStrategies.push(`${parts[0]} ${parts[1]}`);
        }
        // Strategy 3: Just the City (Comuna)
        if (parts.length > 0 && parts[0]) {
            searchStrategies.push(parts[0]);
        }
      }

      // console.log('WeatherService: Searching location with strategies:', searchStrategies);

      for (const term of searchStrategies) {
        if (!term || term.trim() === ',' || term.trim() === '') continue;
        
        try {
            const geoUrl = `${this.GEOCODING_API}?name=${encodeURIComponent(term)}&count=10&language=es&format=json&country_code=CL`;
            // console.log(`WeatherService: Trying geocoding url: ${geoUrl}`);
            const geoData: any = await firstValueFrom(this.http.get(geoUrl));

            if (geoData.results && geoData.results.length > 0) {
                const best = this.pickBestGeocodingResult(geoData.results, city, region) || geoData.results[0];
                latitude = best.latitude;
                longitude = best.longitude;
                // console.log(`WeatherService: Found coordinates for "${term}":`, { latitude, longitude });
                break; // Found coordinates, stop searching
            }
        } catch (e) {
            console.warn(`WeatherService: Error searching for "${term}"`, e);
        }
      }

      if (!latitude || !longitude) {
        console.warn('WeatherService: Could not find coordinates for any search strategy');
        return 'clima desconocido';
      }

      // 2. Get Weather
      const weatherUrl = `${this.WEATHER_API}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
      const weatherData: any = await firstValueFrom(this.http.get(weatherUrl));

      if (!weatherData.current) {
        return 'clima desconocido';
      }

      const temp = Math.round(weatherData.current.temperature_2m);
      const code = weatherData.current.weather_code;
      const condition = this.getWeatherDescription(code);

      return `${temp}°C y ${condition}`;
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

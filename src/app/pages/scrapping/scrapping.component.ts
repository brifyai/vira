import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SupabaseService } from '../../services/supabase.service';
import { config } from '../../core/config';

type ScrapingConfig = {
  enabled: boolean;
  articlesPerSource: number;
  concurrency: number;
  dedupGlobalLimit: number;
};

type AutomationRun = {
  id: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  result?: any;
  error_message?: string | null;
};

@Component({
  selector: 'app-scrapping',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scrapping.component.html',
  styleUrls: ['./scrapping.component.scss']
})
export class ScrappingComponent implements OnInit {
  loading = false;
  running = false;
  saving = false;
  statusError: string | null = null;
  runMessage = 'Iniciando...';
  runPercent = 0;

  scrapingConfig: ScrapingConfig = {
    enabled: true,
    articlesPerSource: 4,
    concurrency: 4,
    dedupGlobalLimit: 5000
  };

  asset: any = null;
  runs: AutomationRun[] = [];

  constructor(
    private supabaseService: SupabaseService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadStatus();
  }

  private async authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const session = await this.supabaseService.getCurrentSession();
    const token = session?.access_token;
    const headers = new Headers(init.headers || {});
    // Si no es un POST con body (como para EventSource), no forzamos Content-Type
    if (init.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${config.apiUrl}${path}`, { ...init, headers });
  }

  async loadStatus(): Promise<void> {
    this.loading = true;
    this.statusError = null;
    this.cdr.detectChanges();

    try {
      const resp = await this.authedFetch('/api/admin/scraping/status', { method: 'GET' });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(text || 'Error al cargar estado de scrapping');
      }
      const data = await resp.json();
      this.asset = data.asset || null;
      this.runs = data.runs || [];
      const cfg = this.asset?.config || {};
      this.scrapingConfig = {
        enabled: cfg.enabled !== false,
        articlesPerSource: Number(cfg.articlesPerSource ?? 4),
        concurrency: Number(cfg.concurrency ?? 4),
        dedupGlobalLimit: Number(cfg.dedupGlobalLimit ?? 5000)
      };
    } catch (e: any) {
      this.statusError = e?.message || 'Error al cargar estado';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async runNow(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.runPercent = 0;
    this.runMessage = 'Iniciando...';
    this.cdr.detectChanges();

    try {
      const session = await this.supabaseService.getCurrentSession();
      const token = session?.access_token;
      
      // Usamos EventSource para recibir el progreso en tiempo real
      const url = `${config.apiUrl}/api/admin/scraping/run?token=${token}`;
      const eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress') {
            this.runPercent = data.percent;
            this.runMessage = data.message;
          } else if (data.type === 'saving') {
            this.runMessage = data.message;
          } else if (data.type === 'complete' || data.success) {
            this.snackBar.open('Scrapping completado con éxito', 'Cerrar', { duration: 3000 });
            eventSource.close();
            this.running = false;
            this.loadStatus();
          } else if (data.type === 'error' || data.error) {
            throw new Error(data.message || data.error || 'Error desconocido');
          }
          this.cdr.detectChanges();
        } catch (e: any) {
          this.snackBar.open(e?.message || 'Error en el proceso', 'Cerrar', { duration: 5000 });
          eventSource.close();
          this.running = false;
          this.cdr.detectChanges();
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
        eventSource.close();
        // No marcamos running=false inmediatamente porque a veces el cierre es al final del stream
        if (this.runPercent < 100 && this.running) {
           this.snackBar.open('Conexión perdida o finalizada', 'Cerrar', { duration: 3000 });
           this.running = false;
           this.loadStatus();
        }
      };

    } catch (e: any) {
      this.snackBar.open(e?.message || 'Error al iniciar scrapping', 'Cerrar', { duration: 5000 });
      this.running = false;
      this.cdr.detectChanges();
    }
  }

  async saveConfig(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.cdr.detectChanges();

    try {
      const payload = {
        enabled: !!this.scrapingConfig.enabled,
        articlesPerSource: Number(this.scrapingConfig.articlesPerSource),
        concurrency: Number(this.scrapingConfig.concurrency),
        dedupGlobalLimit: Number(this.scrapingConfig.dedupGlobalLimit)
      };
      const resp = await this.authedFetch('/api/admin/scraping/config', { method: 'POST', body: JSON.stringify(payload) });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(text || 'Error al guardar configuración');
      }
      const data = await resp.json().catch(() => ({}));
      this.asset = data.asset || this.asset;
      this.snackBar.open('Configuración guardada', 'Cerrar', { duration: 2000, panelClass: ['success-snackbar'] });
      await this.loadStatus();
    } catch (e: any) {
      this.snackBar.open(e?.message || 'Error al guardar configuración', 'Cerrar', { duration: 5000, panelClass: ['error-snackbar'] });
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString('es-CL');
    } catch {
      return String(value);
    }
  }

  runSummary(run: AutomationRun): string {
    const r = run?.result || {};
    const count = typeof r.count === 'number' ? r.count : null;
    const sources = typeof r.sourcesCount === 'number' ? r.sourcesCount : null;
    const parts: string[] = [];
    if (sources !== null) parts.push(`${sources} fuentes`);
    if (count !== null) parts.push(`${count} noticias`);
    return parts.length ? parts.join(' · ') : '-';
  }
}


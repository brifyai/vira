import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
    // Statistics
    stats = {
        totalNews: 0,
        totalBroadcasts: 0,
        activeAutomations: 0,
        recentNews: 0,
        latestNews: 0,
        totalSources: 0
    };

    // Data Lists
    recentNews: any[] = [];
    recentBroadcasts: any[] = [];
    sources: any[] = [];
    automations: any[] = [];
    latestScrapeNews: any[] = [];
    categorySummary: Array<{ category: string; count: number }> = [];
    latestScrapeWindowLabel = '';
    latestScrapeSlot: 9 | 16 | null = null;
    latestScrapeDay = '';

    sourcesPage = 1;
    sourcesPageSize = 8;

    // Loading state
    loading = true;

    constructor(
        private supabaseService: SupabaseService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.loadDashboardData();
    }

    async loadDashboardData() {
        this.loading = true;
        try {
            // Fetch all required data in parallel
            const [
                sourcesData,
                broadcastsData,
                newsData
            ] = await Promise.all([
                this.supabaseService.safeFetch(() => this.supabaseService.getNewsSources(), 3, 15000),
                this.supabaseService.safeFetch(() => this.supabaseService.getNewsBroadcasts({ limit: 5 }), 3, 15000),
                this.supabaseService.safeFetch(() => this.supabaseService.getScrapedNews({ limit: 500 }), 3, 15000)
            ]);

            this.sources = sourcesData || [];
            this.recentBroadcasts = broadcastsData || [];
            this.recentNews = newsData || [];
            this.sourcesPage = 1;
            this.rebuildCategorySummary();
            this.rebuildLatestScrapeNews();

            // Update stats
            this.stats = {
                totalNews: this.recentNews.length,
                totalBroadcasts: broadcastsData ? broadcastsData.length : 0,
                activeAutomations: 0,
                recentNews: this.recentNews.length,
                latestNews: this.latestScrapeNews.length,
                totalSources: this.sources.length
            };
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    get sourcesTotalPages(): number {
        return Math.max(1, Math.ceil(this.sources.length / this.sourcesPageSize));
    }

    get pagedSources(): any[] {
        const start = (this.sourcesPage - 1) * this.sourcesPageSize;
        return this.sources.slice(start, start + this.sourcesPageSize);
    }

    prevSourcesPage() {
        this.sourcesPage = Math.max(1, this.sourcesPage - 1);
    }

    nextSourcesPage() {
        this.sourcesPage = Math.min(this.sourcesTotalPages, this.sourcesPage + 1);
    }

    getStatusClass(status: string): string {
        switch (status) {
            case 'active':
            case 'ready':
                return 'status-success';
            case 'paused':
            case 'draft':
                return 'status-warning';
            case 'generating':
                return 'status-info';
            case 'failed':
                return 'status-danger';
            default:
                return 'status-default';
            }
    }

    getStatusText(status: string): string {
        switch (status) {
            case 'active':
                return 'Activo';
            case 'paused':
                return 'Pausado';
            case 'ready':
                return 'Listo';
            case 'generating':
                return 'Generando';
            case 'failed':
                return 'Fallido';
            case 'draft':
                return 'Borrador';
            default:
                return status;
        }
    }

    formatDate(date: string | Date): string {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return 'Ahora mismo';
        if (minutes < 60) return `Hace ${minutes} min`;
        if (hours < 24) return `Hace ${hours} h`;
        if (days < 7) return `Hace ${days} días`;
        return d.toLocaleDateString('es-ES');
    }

    private getChileDateParts(dateInput: string | Date): { dateKey: string; hour: number } {
        const d = new Date(dateInput);
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            hour12: false
        }).formatToParts(d);

        const year = parts.find(p => p.type === 'year')?.value || '0000';
        const month = parts.find(p => p.type === 'month')?.value || '01';
        const day = parts.find(p => p.type === 'day')?.value || '01';
        const hour = Number(parts.find(p => p.type === 'hour')?.value || '0');
        return { dateKey: `${year}-${month}-${day}`, hour };
    }

    private getScrapeSlotHour(hour: number): 9 | 16 {
        return hour >= 16 ? 16 : 9;
    }

    private rebuildLatestScrapeNews(): void {
        if (!this.recentNews || this.recentNews.length === 0) {
            this.latestScrapeNews = [];
            this.latestScrapeWindowLabel = '';
            this.latestScrapeSlot = null;
            this.latestScrapeDay = '';
            return;
        }

        const sorted = [...this.recentNews].sort((a, b) => {
            const da = new Date(a.scraped_at || a.published_at || a.created_at || 0).getTime();
            const db = new Date(b.scraped_at || b.published_at || b.created_at || 0).getTime();
            return db - da;
        });

        const first = sorted[0];
        const firstDate = first.scraped_at || first.published_at || first.created_at;
        const parts = this.getChileDateParts(firstDate);
        const slot = this.getScrapeSlotHour(parts.hour);

        this.latestScrapeSlot = slot;
        this.latestScrapeDay = parts.dateKey;
        this.latestScrapeWindowLabel = `${parts.dateKey} · ${slot}:00`;

        const filtered = sorted.filter(n => {
            const dateRef = n.scraped_at || n.published_at || n.created_at;
            const p = this.getChileDateParts(dateRef);
            return p.dateKey === parts.dateKey && this.getScrapeSlotHour(p.hour) === slot;
        });

        this.latestScrapeNews = filtered.slice(0, 5);
    }

    private rebuildCategorySummary(): void {
        const counts = new Map<string, number>();
        for (const n of this.recentNews || []) {
            const category = String(n.category || 'general').trim().toLowerCase() || 'general';
            counts.set(category, (counts.get(category) || 0) + 1);
        }

        this.categorySummary = Array.from(counts.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, 'es'))
            .slice(0, 12);
    }
}

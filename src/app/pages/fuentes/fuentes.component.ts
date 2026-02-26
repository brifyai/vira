import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SupabaseService } from '../../services/supabase.service';
import { environment } from '../../../environments/environment';

export interface Source {
    id: string;
    name: string;
    url: string;
    category: string;
    active: boolean;
    lastScraped?: Date;
    createdAt: Date;
    selectorListContainer?: string;
    selectorLink?: string;
    selectorContent?: string;
    selectorIgnore?: string;
}

@Component({
    selector: 'app-fuentes',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './fuentes.component.html',
    styleUrls: ['./fuentes.component.scss']
})
export class FuentesComponent implements OnInit {
    sources: Source[] = [];
    loading = false;
    showCreateModal = false;
    showEditModal = false;
    selectedSource: Source | null = null;
    selectedSourceId: string = 'all';

    formData = {
        name: '',
        url: '',
        category: 'general',
        active: true,
        selectorListContainer: '',
        selectorLink: '',
        selectorContent: '',
        selectorIgnore: ''
    };

    categories = ['general', 'deportes', 'tecnología', 'economía', 'política', 'entretenimiento'];

    constructor(
        private supabaseService: SupabaseService,
        private cdr: ChangeDetectorRef,
        private snackBar: MatSnackBar
    ) { }

    async ngOnInit(): Promise<void> {
        await this.loadSources();
    }

    async loadSources(): Promise<void> {
        console.log('Starting to load sources...');
        this.loading = true;
        this.cdr.detectChanges(); // Force update
        try {
            console.log('Calling supabaseService.getNewsSources()...');
            const data = await this.supabaseService.getNewsSources();
            console.log('Data received:', data);
            // Map database fields to interface fields
            this.sources = (data || []).map(item => ({
                id: item.id,
                name: item.name,
                url: item.url,
                category: item.category,
                active: item.is_active,
                lastScraped: item.last_scraped || null,
                createdAt: item.created_at,
                selectorListContainer: item.selector_list_container,
                selectorLink: item.selector_link,
                selectorContent: item.selector_content,
                selectorIgnore: item.selector_ignore
            }));
            console.log('Sources mapped:', this.sources);
            console.log('Sources length:', this.sources.length);
        } catch (error) {
            console.error('Error loading sources:', error);
            this.sources = [];
        } finally {
            console.log('Loading finished, setting loading to false');
            this.loading = false;
            this.cdr.detectChanges(); // Force update
        }
    }

    openCreateModal(): void {
        this.formData = {
            name: '',
            url: '',
            category: 'general',
            active: true,
            selectorListContainer: '',
            selectorLink: '',
            selectorContent: '',
            selectorIgnore: ''
        };
        this.showCreateModal = true;
    }

    openEditModal(source: Source): void {
        this.selectedSource = source;
        this.formData = {
            name: source.name,
            url: source.url,
            category: source.category,
            active: source.active,
            selectorListContainer: source.selectorListContainer || '',
            selectorLink: source.selectorLink || '',
            selectorContent: source.selectorContent || '',
            selectorIgnore: source.selectorIgnore || ''
        };
        this.showEditModal = true;
    }

    closeModals(): void {
        console.log('Closing modals...');
        this.showCreateModal = false;
        this.showEditModal = false;
        this.selectedSource = null;
        this.cdr.detectChanges();
        console.log('Modals closed, showCreateModal:', this.showCreateModal, 'showEditModal:', this.showEditModal);
    }

    async createSource(): Promise<void> {
        console.log('Creating source...');
        try {
            const newSource = await this.supabaseService.createNewsSource({
                name: this.formData.name,
                url: this.formData.url,
                category: this.formData.category,
                is_active: this.formData.active,
                selector_list_container: this.formData.selectorListContainer,
                selector_link: this.formData.selectorLink,
                selector_content: this.formData.selectorContent,
                selector_ignore: this.formData.selectorIgnore
            });
            console.log('Source created:', newSource);
            console.log('Loading sources...');
            await this.loadSources();
            console.log('Sources loaded, closing modals...');
            this.closeModals();
            console.log('Modals closed, showing snackbar...');
            this.snackBar.open('Fuente creada exitosamente', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top'
            });
            console.log('Snackbar shown');
        } catch (error) {
            console.error('Error creating source:', error);
            this.snackBar.open('Error al crear la fuente', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
                panelClass: ['error-snackbar']
            });
        }
    }

    async updateSource(): Promise<void> {
        if (!this.selectedSource) return;

        try {
            await this.supabaseService.updateNewsSource(this.selectedSource.id, {
                name: this.formData.name,
                url: this.formData.url,
                category: this.formData.category,
                is_active: this.formData.active,
                selector_list_container: this.formData.selectorListContainer,
                selector_link: this.formData.selectorLink,
                selector_content: this.formData.selectorContent,
                selector_ignore: this.formData.selectorIgnore
            });
            console.log('Source updated:', this.selectedSource);
            await this.loadSources();
            this.closeModals();
            this.snackBar.open('Fuente actualizada exitosamente', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top'
            });
        } catch (error) {
            console.error('Error updating source:', error);
            this.snackBar.open('Error al actualizar la fuente', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
                panelClass: ['error-snackbar']
            });
        }
    }

    async deleteSource(source: Source): Promise<void> {
        if (!confirm(`¿Estás seguro de eliminar "${source.name}"?`)) return;

        try {
            await this.supabaseService.deleteNewsSource(source.id);
            console.log('Source deleted:', source);
            await this.loadSources();
            this.snackBar.open('Fuente eliminada exitosamente', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top'
            });
        } catch (error) {
            console.error('Error deleting source:', error);
            this.snackBar.open('Error al eliminar la fuente', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
                panelClass: ['error-snackbar']
            });
        }
    }

    async toggleSourceStatus(source: Source): Promise<void> {
        try {
            await this.supabaseService.updateNewsSource(source.id, {
                is_active: !source.active
            });
            source.active = !source.active;
            console.log('Source status toggled:', source);
            this.snackBar.open(
                `Fuente ${source.active ? 'activada' : 'desactivada'} exitosamente`,
                'Cerrar',
                {
                    duration: 3000,
                    horizontalPosition: 'end',
                    verticalPosition: 'top'
                }
            );
        } catch (error) {
            console.error('Error toggling source status:', error);
            this.snackBar.open('Error al cambiar el estado de la fuente', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
                panelClass: ['error-snackbar']
            });
        }
    }

    getCategoryText(category: string): string {
        const categories: { [key: string]: string } = {
            'general': 'General',
            'deportes': 'Deportes',
            'tecnología': 'Tecnología',
            'economía': 'Economía',
            'política': 'Política',
            'entretenimiento': 'Entretenimiento'
        };
        return categories[category] || category;
    }

    formatDate(date: Date | null | undefined): string {
        if (!date) return 'No disponible';
        return new Date(date).toLocaleString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async scrapeSelectedSources(): Promise<void> {
        if (this.sources.length === 0) {
            this.snackBar.open('No hay fuentes configuradas para scrapear', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
                panelClass: ['error-snackbar']
            });
            return;
        }

        // Determine which sources to scrape
        let sourcesToScrape: string[];
        if (this.selectedSourceId === 'all') {
            // Scrape all active sources
            sourcesToScrape = this.sources.filter(s => s.active).map(s => s.id);
        } else {
            // Scrape only the selected source
            sourcesToScrape = [this.selectedSourceId];
        }

        console.log('Sources to scrape:', sourcesToScrape);

        this.loading = true;
        this.cdr.detectChanges();

        try {
            console.log('Scraping news from selected sources...');

            // Call scraping API endpoint
            const response = await fetch(`${environment.apiUrl}/api/scrape`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sources: sourcesToScrape
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error scraping news:', errorData);
                throw new Error(errorData.error || 'Error al obtener noticias');
            }

            const result = await response.json();
            console.log('Scraping result:', result);

            this.snackBar.open(
                `Noticias obtenidas exitosamente: ${result.count || 0} noticias`,
                'Cerrar',
                {
                    duration: 3000,
                    horizontalPosition: 'end',
                    verticalPosition: 'top'
                }
            );
        } catch (error) {
            console.error('Error scraping sources:', error);
            this.snackBar.open(
                'Error al obtener noticias. Por favor intenta nuevamente.',
                'Cerrar',
                {
                    duration: 3000,
                    horizontalPosition: 'end',
                    verticalPosition: 'top',
                    panelClass: ['error-snackbar']
                }
            );
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    async scrapeAllSources(): Promise<void> {
        if (this.sources.length === 0) {
            this.snackBar.open('No hay fuentes configuradas para scrapear', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
                panelClass: ['error-snackbar']
            });
            return;
        }

        this.loading = true;
        this.cdr.detectChanges();

        try {
            console.log('Scraping news from all sources...');

            // Get only active sources
            const activeSources = this.sources.filter(s => s.active);
            const sourceIds = activeSources.map(s => s.id);

            console.log('Active sources:', sourceIds);

            // Call scraping API endpoint
            const response = await fetch(`${environment.apiUrl}/api/scrape`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sources: sourceIds
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error scraping news:', errorData);
                throw new Error(errorData.error || 'Error al obtener noticias');
            }

            const result = await response.json();
            console.log('Scraping result:', result);

            this.snackBar.open(
                `Noticias obtenidas exitosamente: ${result.count || 0} noticias`,
                'Cerrar',
                {
                    duration: 3000,
                    horizontalPosition: 'end',
                    verticalPosition: 'top'
                }
            );
        } catch (error) {
            console.error('Error scraping sources:', error);
            this.snackBar.open(
                'Error al obtener noticias. Por favor intenta nuevamente.',
                'Cerrar',
                {
                    duration: 3000,
                    horizontalPosition: 'end',
                    verticalPosition: 'top',
                    panelClass: ['error-snackbar']
                }
            );
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }
}

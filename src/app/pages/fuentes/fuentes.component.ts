import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SupabaseService } from '../../services/supabase.service';
import { config } from '../../core/config';
import * as XLSX from 'xlsx';

export interface Source {
    id: string;
    name: string;
    url: string;
    category: string;
    region?: string | null;
    active: boolean;
    radioId: string | null;
    radioName?: string | null;
    lastScraped?: Date;
    createdAt: Date;
    selectorListContainer?: string;
    selectorLink?: string;
    selectorContent?: string;
    selectorIgnore?: string;
}

export interface RadioOption {
    id: string;
    name: string;
}

export interface SourceImportFailure {
    id: string;
    created_at: string;
    import_run_id: string;
    file_name?: string | null;
    url: string;
    name?: string | null;
    radio_id?: string | null;
    region?: string | null;
    stage: 'analysis' | 'save';
    error_code?: string | null;
    error_message?: string | null;
    details?: any;
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
    radios: RadioOption[] = [];
    loading = false;
    showCreateModal = false;
    showEditModal = false;
    selectedSource: Source | null = null;
    selectedSourceId: string = 'all';
    selectedRadioId: string = 'all';
    selectedRegion: string = 'all';
    availableRegions: string[] = [];
    exporting = false;
    importing = false;
    importTotal = 0;
    importProcessed = 0;
    importCreated = 0;
    importFailed = 0;
    importMessage = '';
    importErrors: { name: string; url: string; error: string }[] = [];
    importRunId = '';
    importFileName = '';
    showFailuresModal = false;
    failuresLoading = false;
    failuresError: string | null = null;
    failures: SourceImportFailure[] = [];
    failuresOffset = 0;
    failuresHasMore = false;
    failuresRunIdFilter = '';
    failuresStageFilter: 'all' | 'analysis' | 'save' = 'all';
    failuresSearch = '';

    formData = {
        radioId: '',
        region: '',
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

    get importPercent(): number {
        if (!this.importTotal) return 0;
        return Math.min(100, Math.max(0, Math.round((this.importProcessed / this.importTotal) * 100)));
    }

    async ngOnInit(): Promise<void> {
        await Promise.all([this.loadRadios(), this.loadSources()]);
    }

    private createRunId(prefix: string): string {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    private async mapWithConcurrency<T>(
        items: T[],
        concurrency: number,
        worker: (item: T, index: number) => Promise<void>
    ): Promise<void> {
        const limit = Math.max(1, Math.min(4, Number(concurrency) || 1));
        let index = 0;
        const runners = new Array(limit).fill(null).map(async () => {
            while (index < items.length) {
                const currentIndex = index++;
                await worker(items[currentIndex], currentIndex);
            }
        });
        await Promise.all(runners);
    }

    private async logSourceImportFailure(payload: {
        url: string;
        name: string;
        stage: 'analysis' | 'save';
        errorCode?: string;
        errorMessage: string;
        details?: any;
        region?: string | null;
    }): Promise<void> {
        try {
            const radioId = this.selectedRadioId !== 'all' ? this.selectedRadioId : null;
            await this.supabaseService.createSourceImportFailure({
                import_run_id: this.importRunId || this.createRunId('imp'),
                file_name: this.importFileName || null,
                url: payload.url,
                name: payload.name,
                radio_id: radioId,
                region: payload.region ?? null,
                stage: payload.stage,
                error_code: payload.errorCode || null,
                error_message: payload.errorMessage,
                details: payload.details ?? {}
            });
        } catch {
            return;
        }
    }

    openFailuresModal(): void {
        this.showFailuresModal = true;
        this.failuresRunIdFilter = this.importRunId || this.failuresRunIdFilter || '';
        this.failuresStageFilter = 'all';
        this.failuresSearch = '';
        this.failuresOffset = 0;
        void this.loadFailures(true);
    }

    closeFailuresModal(): void {
        this.showFailuresModal = false;
        this.failuresError = null;
        this.cdr.detectChanges();
    }

    async loadFailures(reset = false): Promise<void> {
        if (this.failuresLoading) return;
        this.failuresLoading = true;
        this.failuresError = null;
        this.cdr.detectChanges();

        try {
            if (reset) {
                this.failuresOffset = 0;
                this.failures = [];
            }

            const pageSize = 200;
            const data = await this.supabaseService.getSourceImportFailures({
                limit: pageSize,
                offset: this.failuresOffset,
                runId: this.failuresRunIdFilter || undefined,
                stage: this.failuresStageFilter,
                search: this.failuresSearch || undefined
            });

            const rows = (data || []) as SourceImportFailure[];
            this.failures = reset ? rows : [...this.failures, ...rows];
            this.failuresOffset = this.failures.length;
            this.failuresHasMore = rows.length === pageSize;
        } catch (e: any) {
            this.failuresError = String(e?.message || 'Error al cargar fallas');
            this.failuresHasMore = false;
        } finally {
            this.failuresLoading = false;
            this.cdr.detectChanges();
        }
    }

    formatFailureDate(value: string): string {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    exportFailuresToExcel(): void {
        if (!this.failures || this.failures.length === 0) {
            this.snackBar.open('No hay fallas para exportar', 'Cerrar', { duration: 3000 });
            return;
        }
        try {
            const exportData = this.failures.map(f => ({
                Fecha: this.formatFailureDate(f.created_at),
                'Import Run': f.import_run_id,
                Archivo: f.file_name || '',
                Etapa: f.stage,
                URL: f.url,
                Nombre: f.name || '',
                Región: f.region || '',
                Código: f.error_code || '',
                Mensaje: f.error_message || '',
            }));
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Fallas');
            const date = new Date().toISOString().split('T')[0];
            XLSX.writeFile(workbook, `fallas_importacion_${date}.xlsx`);
            this.snackBar.open('Fallas exportadas correctamente a Excel', 'Cerrar', { duration: 3500 });
        } catch (e: any) {
            this.snackBar.open(`Error al exportar: ${String(e?.message || 'Error')}`, 'Cerrar', { duration: 4000, panelClass: ['error-snackbar'] });
        }
    }

    async loadRadios(): Promise<void> {
        try {
            const data = await this.supabaseService.getRadios();
            this.radios = (data || []).map((r: any) => ({
                id: r.id,
                name: r.name
            }));
        } catch (error) {
            console.error('Error loading radios:', error);
            this.radios = [];
        }
    }

    async loadSources(): Promise<void> {
        this.loading = true;
        this.cdr.detectChanges();
        try {
            const data = await this.supabaseService.getNewsSources({ 
                radioId: this.selectedRadioId !== 'all' ? this.selectedRadioId : undefined,
                region: this.selectedRegion !== 'all' ? this.selectedRegion : undefined
            });
            
            this.sources = (data || []).map(item => ({
                id: item.id,
                name: item.name,
                url: item.url,
                category: item.category,
                region: item.region,
                active: item.is_active,
                radioId: item.radio_id ?? null,
                radioName: item.radio?.name ?? null,
                lastScraped: item.last_scraped || null,
                createdAt: item.created_at,
                selectorListContainer: item.selector_list_container,
                selectorLink: item.selector_link,
                selectorContent: item.selector_content,
                selectorIgnore: item.selector_ignore
            }));

            // Actualizar lista de regiones disponibles para el filtro
            const regions = new Set<string>();
            this.sources.forEach(s => {
                if (s.region) regions.add(s.region);
            });
            this.availableRegions = Array.from(regions).sort();

        } catch (error) {
            console.error('Error loading sources:', error);
            this.sources = [];
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    openCreateModal(): void {
        this.formData = {
            radioId: this.selectedRadioId !== 'all' ? this.selectedRadioId : '',
            region: this.selectedRegion !== 'all' ? this.selectedRegion : '',
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
            radioId: source.radioId || '',
            region: source.region || '',
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
        // console.log('Closing modals...');
        this.showCreateModal = false;
        this.showEditModal = false;
        this.selectedSource = null;
        this.cdr.detectChanges();
        // console.log('Modals closed, showCreateModal:', this.showCreateModal, 'showEditModal:', this.showEditModal);
    }

    async createSource(): Promise<void> {
        try {
            await this.supabaseService.createNewsSource({
                radio_id: this.formData.radioId || null,
                region: this.formData.region || null,
                name: this.formData.name,
                url: this.formData.url,
                category: this.formData.category,
                is_active: this.formData.active,
                selector_list_container: this.formData.selectorListContainer,
                selector_link: this.formData.selectorLink,
                selector_content: this.formData.selectorContent,
                selector_ignore: this.formData.selectorIgnore
            });
            
            this.closeModals();
            
            this.snackBar.open('Fuente creada exitosamente', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top'
            });

            await this.loadSources();
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
                radio_id: this.formData.radioId || null,
                region: this.formData.region || null,
                name: this.formData.name,
                url: this.formData.url,
                category: this.formData.category,
                is_active: this.formData.active,
                selector_list_container: this.formData.selectorListContainer,
                selector_link: this.formData.selectorLink,
                selector_content: this.formData.selectorContent,
                selector_ignore: this.formData.selectorIgnore
            });
            
            this.closeModals();
            
            this.snackBar.open('Fuente actualizada exitosamente', 'Cerrar', {
                duration: 3000,
                horizontalPosition: 'end',
                verticalPosition: 'top'
            });

            await this.loadSources();
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
            // console.log('Source deleted:', source);
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
            // console.log('Source status toggled:', source);
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

    async onRadioFilterChange(): Promise<void> {
        await this.loadSources();
    }

    async onRegionFilterChange(): Promise<void> {
        await this.loadSources();
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

        // console.log('Sources to scrape:', sourcesToScrape);

        this.loading = true;
        this.cdr.detectChanges();

        try {
            // console.log('Scraping news from selected sources...');

            // Call scraping API endpoint
            // console.log('Sending scrape request to:', `${config.apiUrl}/api/scrape`);
            const response = await fetch(`${config.apiUrl}/api/scrape`, {
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
            // console.log('Scraping result:', result);

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

    exportSources(): void {
        if (this.sources.length === 0) {
            this.snackBar.open('No hay fuentes para exportar', 'Cerrar', { duration: 3000 });
            return;
        }

        this.exporting = true;
        try {
            const exportData = this.sources.map(s => ({
                Nombre: s.name,
                URL: s.url,
                Categoría: s.category,
                Región: s.region || '',
                Activa: s.active ? 'Sí' : 'No',
                'Contenedor Lista': s.selectorListContainer || '',
                'Selector Link': s.selectorLink || '',
                'Selector Contenido': s.selectorContent || '',
                'Selector Ignorar': s.selectorIgnore || ''
            }));

            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Fuentes');

            const date = new Date().toISOString().split('T')[0];
            XLSX.writeFile(workbook, `fuentes_noticias_${date}.xlsx`);
            
            this.snackBar.open('Fuentes exportadas correctamente a Excel', 'Cerrar', { duration: 3000 });
        } catch (error) {
            console.error('Error exporting sources:', error);
            this.snackBar.open('Error al exportar fuentes', 'Cerrar', { duration: 3000, panelClass: ['error-snackbar'] });
        } finally {
            this.exporting = false;
        }
    }

    private parseActiveCell(value: any): boolean | undefined {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') {
            if (value === 1) return true;
            if (value === 0) return false;
        }
        const s = String(value ?? '').trim().toLowerCase();
        if (!s) return undefined;
        if (['si', 'sí', 'true', '1', 'activa', 'activo', 'yes', 'y'].includes(s)) return true;
        if (['no', 'false', '0', 'inactiva', 'inactivo', 'n'].includes(s)) return false;
        return undefined;
    }

    async onImportFileSelected(event: any): Promise<void> {
        const file = event.target.files?.[0];
        if (!file) return;

        this.importing = true;
        this.importTotal = 0;
        this.importProcessed = 0;
        this.importCreated = 0;
        this.importFailed = 0;
        this.importMessage = '';
        this.importErrors = [];
        this.importRunId = this.createRunId('imp');
        this.importFileName = String(file.name || '').trim();
        this.cdr.detectChanges();

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const importedData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];

            if (!Array.isArray(importedData) || importedData.length === 0) {
                throw new Error('El archivo Excel está vacío o tiene un formato incorrecto');
            }

            // Mapeo de columnas de Excel a nuestro objeto (soporta nombres en español e inglés por si acaso)
            const mappedData = importedData.map(row => ({
                name: row.Nombre || row.name || row.Name,
                url: row.URL || row.url,
                category: row.Categoría || row.category || row.Category,
                region: row.Región || row.region || row.Region,
                active: this.parseActiveCell(row.Activa ?? row.active),
                selectorListContainer: row['Contenedor Lista'] || row.selectorListContainer,
                selectorLink: row['Selector Link'] || row.selectorLink,
                selectorContent: row['Selector Contenido'] || row.selectorContent,
                selectorIgnore: row['Selector Ignorar'] || row.selectorIgnore
            }));

            // Obtener URLs actuales para evitar duplicados
            const currentUrls = new Set(this.sources.map(s => s.url.toLowerCase().trim()));
            const invalid: { index: number; reason: string }[] = [];

            type ImportSource = {
                name: string;
                url: string;
                category: string;
                region: string | null;
                active?: boolean;
                selectorListContainer: string;
                selectorLink: string;
                selectorContent: string;
                selectorIgnore: string;
            };

            const toImport = mappedData
                .map((item, index): ImportSource | null => {
                    const name = String(item.name || '').trim();
                    const url = String(item.url || '').trim();
                    const category = String(item.category || '').trim();
                    const region = String(item.region || '').trim();
                    const selectorListContainer = String(item.selectorListContainer || '').trim();
                    const selectorLink = String(item.selectorLink || '').trim();
                    const selectorContent = String(item.selectorContent || '').trim();
                    const selectorIgnore = String(item.selectorIgnore || '').trim();

                    if (!url) {
                        invalid.push({ index, reason: 'URL vacía' });
                        return null;
                    }

                    return {
                        name: name || 'Fuente Importada',
                        url,
                        category: category || 'general',
                        region: region || null,
                        active: item.active,
                        selectorListContainer,
                        selectorLink,
                        selectorContent,
                        selectorIgnore
                    };
                })
                .filter((item): item is ImportSource => item !== null)
                .filter((item) => {
                    const url = item.url.toLowerCase().trim();
                    return url && !currentUrls.has(url);
                });

            if (toImport.length === 0) {
                this.snackBar.open('No hay fuentes nuevas para importar (todas las URLs ya existen)', 'Cerrar', { duration: 4000 });
                return;
            }

            this.importTotal = toImport.length;
            this.importProcessed = 0;
            this.importCreated = 0;
            this.importFailed = 0;
            this.importMessage = 'Iniciando importación...';
            this.cdr.detectChanges();

            await this.mapWithConcurrency(toImport, 2, async (item) => {
                const name = item.name || 'Fuente Importada';
                const selectorListContainer = String(item.selectorListContainer || '').trim();
                const selectorLink = String(item.selectorLink || '').trim();
                const selectorContent = String(item.selectorContent || '').trim();
                const selectorIgnore = String(item.selectorIgnore || '').trim();

                this.importMessage = `Guardando: ${name}`;
                this.cdr.detectChanges();

                try {
                    await this.supabaseService.createNewsSource({
                        radio_id: this.selectedRadioId !== 'all' ? this.selectedRadioId : null,
                        region: item.region || null,
                        name,
                        url: item.url,
                        category: item.category || 'general',
                        is_active: item.active !== undefined ? item.active : true,
                        selector_list_container: selectorListContainer,
                        selector_link: selectorLink,
                        selector_content: selectorContent,
                        selector_ignore: selectorIgnore
                    });
                    this.importCreated++;
                } catch (e: any) {
                    this.importFailed++;
                    this.importErrors.push({
                        name,
                        url: item.url,
                        error: String(e?.message || 'Error al guardar')
                    });
                    await this.logSourceImportFailure({
                        url: item.url,
                        name,
                        stage: 'save',
                        errorCode: 'save_failed',
                        errorMessage: String(e?.message || 'Error al guardar'),
                        region: item.region || null
                    });
                } finally {
                    this.importProcessed++;
                    this.importMessage = `Procesadas ${this.importProcessed} de ${this.importTotal}`;
                    this.cdr.detectChanges();
                    await new Promise(r => setTimeout(r, 0));
                }
            });

            const invalidMsg = invalid.length ? ` · ${invalid.length} filas inválidas` : '';
            const ext = String(file.name || '').toLowerCase().endsWith('.csv') ? 'CSV' : 'Excel';
            const failMsg = this.importFailed ? ` · ${this.importFailed} con error` : '';
            this.snackBar.open(`Se importaron ${this.importCreated} fuentes correctamente desde ${ext}${invalidMsg}${failMsg}`, 'Cerrar', { duration: 5000 });
            await this.loadSources();
        } catch (error: any) {
            console.error('Error importing sources:', error);
            this.snackBar.open(`Error al importar archivo: ${error.message || 'Formato inválido'}`, 'Cerrar', { 
                duration: 5000,
                panelClass: ['error-snackbar']
            });
        } finally {
            this.importing = false;
            event.target.value = ''; // Limpiar input
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
            // console.log('Scraping news from all sources...');

            // Get only active sources
            const activeSources = this.sources.filter(s => s.active);
            const sourceIds = activeSources.map(s => s.id);

            // console.log('Active sources:', sourceIds);

            // Call scraping API endpoint
            // console.log('Sending scrape request to:', `${config.apiUrl}/api/scrape`);
            const response = await fetch(`${config.apiUrl}/api/scrape`, {
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
            // console.log('Scraping result:', result);

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

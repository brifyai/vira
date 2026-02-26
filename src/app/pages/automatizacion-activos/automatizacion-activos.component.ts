import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-automatizacion-activos',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './automatizacion-activos.component.html',
    styleUrls: ['./automatizacion-activos.component.scss']
})
export class AutomatizacionActivosComponent implements OnInit {
    // Automation assets
    automations: any[] = [];

    // Automation runs
    automationRuns: any[] = [];

    // Loading states
    loading = false;
    loadingRuns = false;

    // Filter options
    typeFilter = 'all';
    statusFilter = 'all';

    // Type options
    typeOptions = ['all', 'scraper', 'humanizer', 'tts', 'scheduler', 'monitor'];

    // Status options
    statusOptions = ['all', 'active', 'paused'];

    // Modal states
    showCreateModal = false;
    showEditModal = false;
    showHistoryModal = false;

    // Selected automation
    selectedAutomation: any = null;

    // Form data
    formData = {
        name: '',
        type: 'scraper',
        schedule: '',
        config: '{}',
        isActive: true
    };

    constructor() { }

    ngOnInit(): void {
        this.loadAutomations();
        this.loadAutomationRuns();
    }

    loadAutomations() {
        this.loading = true;

        // Simulate loading automations
        setTimeout(() => {
            this.automations = [
                {
                    id: 1,
                    name: 'Scraper Diario',
                    type: 'scraper',
                    config: {
                        sources: ['elpais.com', 'technews.com', 'deporteshoy.com'],
                        frequency: 'daily',
                        time: '08:00'
                    },
                    isActive: true,
                    schedule: '0 8 * * *',
                    lastRun: new Date(Date.now() - 3600000),
                    nextRun: new Date(Date.now() + 82800000),
                    runCount: 156,
                    successRate: 98.7
                },
                {
                    id: 2,
                    name: 'Humanizador de Noticias',
                    type: 'humanizer',
                    config: {
                        model: 'gemini-pro',
                        language: 'es',
                        tone: 'professional'
                    },
                    isActive: true,
                    schedule: '*/30 * * * *',
                    lastRun: new Date(Date.now() - 7200000),
                    nextRun: new Date(Date.now() + 1080000),
                    runCount: 324,
                    successRate: 99.2
                },
                {
                    id: 3,
                    name: 'Generador TTS',
                    type: 'tts',
                    config: {
                        voice: 'es-ES-Standard-A',
                        speakingRate: 1.0,
                        pitch: 1.0
                    },
                    isActive: true,
                    schedule: '0 */2 * * *',
                    lastRun: new Date(Date.now() - 10800000),
                    nextRun: new Date(Date.now() + 3600000),
                    runCount: 89,
                    successRate: 97.8
                },
                {
                    id: 4,
                    name: 'Programador Noticieros',
                    type: 'scheduler',
                    config: {
                        duration: 30,
                        maxNews: 12,
                        autoPublish: false
                    },
                    isActive: false,
                    schedule: '0 12 * * *',
                    lastRun: new Date(Date.now() - 86400000),
                    nextRun: null,
                    runCount: 45,
                    successRate: 95.5
                },
                {
                    id: 5,
                    name: 'Monitor de Fuentes',
                    type: 'monitor',
                    config: {
                        checkInterval: 300,
                        alertThreshold: 5,
                        notifyChannels: ['email', 'slack']
                    },
                    isActive: true,
                    schedule: '*/5 * * * *',
                    lastRun: new Date(Date.now() - 1800000),
                    nextRun: new Date(Date.now() + 120000),
                    runCount: 1247,
                    successRate: 99.9
                }
            ];

            this.loading = false;
        }, 1000);
    }

    loadAutomationRuns() {
        this.loadingRuns = true;

        // Simulate loading runs
        setTimeout(() => {
            this.automationRuns = [
                {
                    id: 1,
                    automationId: 1,
                    automationName: 'Scraper Diario',
                    status: 'completed',
                    startedAt: new Date(Date.now() - 3600000),
                    completedAt: new Date(Date.now() - 3540000),
                    duration: 60,
                    result: {
                        newsScraped: 42,
                        sourcesProcessed: 3,
                        errors: 0
                    }
                },
                {
                    id: 2,
                    automationId: 2,
                    automationName: 'Humanizador de Noticias',
                    status: 'completed',
                    startedAt: new Date(Date.now() - 7200000),
                    completedAt: new Date(Date.now() - 7140000),
                    duration: 60,
                    result: {
                        newsProcessed: 38,
                        successCount: 38,
                        errors: 0
                    }
                },
                {
                    id: 3,
                    automationId: 3,
                    automationName: 'Generador TTS',
                    status: 'completed',
                    startedAt: new Date(Date.now() - 10800000),
                    completedAt: new Date(Date.now() - 10740000),
                    duration: 60,
                    result: {
                        audioGenerated: 15,
                        totalDuration: 900,
                        errors: 0
                    }
                },
                {
                    id: 4,
                    automationId: 1,
                    automationName: 'Scraper Diario',
                    status: 'failed',
                    startedAt: new Date(Date.now() - 172800000),
                    completedAt: new Date(Date.now() - 171600000),
                    duration: 120,
                    errorMessage: 'Timeout al conectar con el servidor',
                    result: {
                        newsScraped: 0,
                        sourcesProcessed: 1,
                        errors: 1
                    }
                },
                {
                    id: 5,
                    automationId: 5,
                    automationName: 'Monitor de Fuentes',
                    status: 'running',
                    startedAt: new Date(Date.now() - 1800000),
                    completedAt: null,
                    duration: null,
                    result: null
                }
            ];

            this.loadingRuns = false;
        }, 800);
    }

    get filteredAutomations() {
        return this.automations.filter(automation => {
            const typeMatch = this.typeFilter === 'all' || automation.type === this.typeFilter;
            const statusMatch = this.statusFilter === 'all' ||
                (this.statusFilter === 'active' && automation.isActive) ||
                (this.statusFilter === 'paused' && !automation.isActive);

            return typeMatch && statusMatch;
        });
    }

    get filteredAutomationRuns() {
        if (!this.selectedAutomation) {
            return [];
        }
        return this.automationRuns.filter(r => r.automationId === this.selectedAutomation.id);
    }

    getTypeText(type: string): string {
        const types: any = {
            scraper: 'Scraper',
            humanizer: 'Humanizador',
            tts: 'TTS',
            scheduler: 'Programador',
            monitor: 'Monitor'
        };
        return types[type] || type;
    }

    getTypeIcon(type: string): string {
        const icons: any = {
            scraper: 'download',
            humanizer: 'psychology',
            tts: 'volume_up',
            scheduler: 'schedule',
            monitor: 'monitor_heart'
        };
        return icons[type] || 'settings';
    }

    getStatusClass(status: string): string {
        switch (status) {
            case 'active':
            case 'completed':
                return 'status-success';
            case 'paused':
            case 'failed':
                return 'status-danger';
            case 'running':
            case 'generating':
                return 'status-info';
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
            case 'running':
                return 'Ejecutando';
            case 'completed':
                return 'Completado';
            case 'failed':
                return 'Fallido';
            default:
                return status;
        }
    }

    toggleAutomation(automation: any) {
        automation.isActive = !automation.isActive;
        console.log('Toggling automation:', automation);
    }

    runNow(automation: any) {
        console.log('Running automation now:', automation);
        alert(`Ejecutando: ${automation.name}`);
    }

    openCreateModal() {
        this.formData = {
            name: '',
            type: 'scraper',
            schedule: '',
            config: '{}',
            isActive: true
        };
        this.showCreateModal = true;
    }

    openEditModal(automation: any) {
        this.selectedAutomation = automation;
        this.formData = {
            name: automation.name,
            type: automation.type,
            schedule: automation.schedule,
            config: JSON.stringify(automation.config),
            isActive: automation.isActive
        };
        this.showEditModal = true;
    }

    openHistoryModal(automation: any) {
        this.selectedAutomation = automation;
        this.showHistoryModal = true;
    }

    closeModals() {
        this.showCreateModal = false;
        this.showEditModal = false;
        this.showHistoryModal = false;
        this.selectedAutomation = null;
    }

    createAutomation() {
        console.log('Creating automation:', this.formData);
        alert('Automatización creada exitosamente');
        this.closeModals();
    }

    updateAutomation() {
        console.log('Updating automation:', this.formData);
        alert('Automatización actualizada exitosamente');
        this.closeModals();
    }

    deleteAutomation(automation: any) {
        if (confirm(`¿Estás seguro de eliminar "${automation.name}"?`)) {
            console.log('Deleting automation:', automation);
            alert('Automatización eliminada');
        }
    }

    formatDate(date: Date): string {
        return new Date(date).toLocaleString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatDuration(seconds: number): string {
        if (!seconds) return '-';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${seconds}s`;
    }
}

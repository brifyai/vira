import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SupabaseService } from '../../services/supabase.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

export interface Radio {
    id: string;
    name: string;
    region: string;
    comuna: string;
    frequency?: string;
    created_at: string;
}

@Component({
    selector: 'app-radios',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './radios.component.html',
    styleUrls: ['./radios.component.scss']
})
export class RadiosComponent implements OnInit {
    radios: Radio[] = [];
    loading = false;
    showCreateModal = false;
    showEditModal = false;
    selectedRadio: Radio | null = null;

    formData = {
        name: '',
        region: '',
        comuna: '',
        frequency: ''
    };

    regions = [
        'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
        'Valparaíso', 'Metropolitana', 'O\'Higgins', 'Maule', 'Ñuble',
        'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes'
    ];

    constructor(
        private supabaseService: SupabaseService,
        private authService: AuthService,
        private cdr: ChangeDetectorRef,
        private snackBar: MatSnackBar,
        private router: Router
    ) { }

    async ngOnInit(): Promise<void> {
        await this.loadRadios();
    }

    get canManageRadios(): boolean {
        return this.authService.isAdmin();
    }

    async loadRadios(): Promise<void> {
        this.loading = true;
        try {
            // Use safeFetch to retry automatically if connection is unstable or tab was suspended
            const data = await this.supabaseService.safeFetch(
                () => this.supabaseService.getRadios(),
                3, // 3 retries
                6000 // 6s timeout per try
            );
            
            if (data) {
                this.radios = data;
            } else {
                // If it fails after all retries, keep empty list or previous data
                // but stop loading. User requested no error messages.
                console.warn('Could not load radios after retries');
            }
        } catch (error) {
            console.error('Error loading radios:', error);
            // No snackbar as requested
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    openCreateModal(): void {
        this.formData = {
            name: '',
            region: '',
            comuna: '',
            frequency: ''
        };
        this.showCreateModal = true;
    }

    openEditModal(radio: Radio, event: Event): void {
        event.stopPropagation(); // Prevent navigating to details
        this.selectedRadio = radio;
        this.formData = {
            name: radio.name,
            region: radio.region,
            comuna: radio.comuna,
            frequency: radio.frequency || ''
        };
        this.showEditModal = true;
    }

    closeModals(): void {
        this.showCreateModal = false;
        this.showEditModal = false;
        this.selectedRadio = null;
    }

    async createRadio(): Promise<void> {
        if (!this.formData.name || !this.formData.region || !this.formData.comuna) {
            this.showSnackBar('Por favor completa todos los campos requeridos', 'error-snackbar');
            return;
        }

        try {
            await this.supabaseService.createRadio({
                name: this.formData.name,
                region: this.formData.region,
                comuna: this.formData.comuna,
                frequency: this.formData.frequency
            });
            await this.loadRadios();
            this.closeModals();
            this.showSnackBar('Radio creada exitosamente');
        } catch (error) {
            console.error('Error creating radio:', error);
            this.showSnackBar('Error al crear la radio', 'error-snackbar');
        }
    }

    async updateRadio(): Promise<void> {
        if (!this.selectedRadio) return;

        try {
            await this.supabaseService.updateRadio(this.selectedRadio.id, {
                name: this.formData.name,
                region: this.formData.region,
                comuna: this.formData.comuna,
                frequency: this.formData.frequency
            });
            await this.loadRadios();
            this.closeModals();
            this.showSnackBar('Radio actualizada exitosamente');
        } catch (error) {
            console.error('Error updating radio:', error);
            this.showSnackBar('Error al actualizar la radio', 'error-snackbar');
        }
    }

    async deleteRadio(radio: Radio, event: Event): Promise<void> {
        event.stopPropagation();
        if (!confirm(`¿Estás seguro de eliminar "${radio.name}"?`)) return;

        try {
            await this.supabaseService.deleteRadio(radio.id);
            await this.loadRadios();
            this.showSnackBar('Radio eliminada exitosamente');
        } catch (error) {
            console.error('Error deleting radio:', error);
            this.showSnackBar('Error al eliminar la radio', 'error-snackbar');
        }
    }

    navigateToDetails(radio: Radio): void {
        this.router.navigate(['/radios', radio.id]);
    }

    private showSnackBar(message: string, panelClass: string = ''): void {
        this.snackBar.open(message, 'Cerrar', {
            duration: 3000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
            panelClass: panelClass ? [panelClass] : undefined
        });
    }
}

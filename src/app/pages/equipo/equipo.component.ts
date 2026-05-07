import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import Swal from 'sweetalert2';
import { SupabaseService } from '../../services/supabase.service';

@Component({
    selector: 'app-equipo',
    standalone: true,
    imports: [CommonModule, FormsModule, MatSnackBarModule],
    templateUrl: './equipo.component.html',
    styleUrls: ['./equipo.component.scss']
})
export class EquipoComponent implements OnInit {
    loading = true;
    members: any[] = [];

    showCreateModal = false;
    newMember = { email: '', password: '', fullName: '' };

    totals = { broadcasts: 0, cost: 0 };

    constructor(
        private supabaseService: SupabaseService,
        private cdr: ChangeDetectorRef,
        private snackBar: MatSnackBar
    ) { }

    async ngOnInit() {
        await this.loadTeam();
    }

    openCreateModal() {
        this.newMember = { email: '', password: '', fullName: '' };
        this.showCreateModal = true;
    }

    closeCreateModal() {
        this.showCreateModal = false;
    }

    private computeTotals(rows: any[]) {
        const broadcasts = rows.reduce((sum, r) => sum + Number(r?.broadcasts_count || 0), 0);
        const cost = rows.reduce((sum, r) => sum + Number(r?.total_cost || 0), 0);
        this.totals = { broadcasts, cost };
    }

    async loadTeam() {
        this.loading = true;
        try {
            const rows = await this.supabaseService.getTeamMembersWithUsage();
            this.members = rows || [];
            this.computeTotals(this.members);
        } catch (error: any) {
            console.error('Error loading team:', error);
            this.showSnackBar(error?.message || 'Error al cargar el equipo', 'error-snackbar');
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    async createMember() {
        if (!this.newMember.email || !this.newMember.password) {
            this.showSnackBar('Email y contraseña son requeridos', 'error-snackbar');
            return;
        }
        if (String(this.newMember.password).length < 6) {
            this.showSnackBar('La contraseña debe tener mínimo 6 caracteres', 'error-snackbar');
            return;
        }

        try {
            await this.supabaseService.createTeamUser({
                email: this.newMember.email,
                password: this.newMember.password,
                fullName: this.newMember.fullName
            });
            this.showSnackBar('Usuario de equipo creado', 'success-snackbar');
            this.closeCreateModal();
            await this.loadTeam();
        } catch (error: any) {
            console.error('Error creating team user:', error);
            this.showSnackBar(error?.message || 'Error al crear usuario de equipo', 'error-snackbar');
        }
    }

    async deleteMember(member: any) {
        const name = member?.full_name || member?.email || 'este usuario';
        const result = await Swal.fire({
            title: 'Eliminar usuario',
            text: `¿Qué quieres hacer con los noticieros de ${name}?`,
            icon: 'warning',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: 'Transferir al admin',
            denyButtonText: 'Borrar todo',
            cancelButtonText: 'Cancelar',
            reverseButtons: true
        });

        if (result.isDismissed) return;

        const behavior: 'transfer' | 'delete' = result.isConfirmed ? 'transfer' : 'delete';

        const confirm = await Swal.fire({
            title: 'Confirmación final',
            text: behavior === 'transfer'
                ? 'Se transferirán los noticieros al admin y se eliminará la cuenta.'
                : 'Se eliminará la cuenta y se borrarán noticieros + timeline asociados.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Confirmar',
            cancelButtonText: 'Cancelar'
        });

        if (!confirm.isConfirmed) return;

        try {
            await this.supabaseService.deleteTeamUser(member.id, behavior);
            this.showSnackBar('Usuario eliminado', 'success-snackbar');
            await this.loadTeam();
        } catch (error: any) {
            console.error('Error deleting team user:', error);
            this.showSnackBar(error?.message || 'Error al eliminar usuario', 'error-snackbar');
        }
    }

    showSnackBar(message: string, panelClass: string = '') {
        this.snackBar.open(message, 'Cerrar', {
            duration: 3000,
            panelClass: panelClass ? [panelClass] : undefined
        });
    }
}


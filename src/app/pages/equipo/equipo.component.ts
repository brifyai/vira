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
    currentUserName = '';
    currentUserRole = 'admin';
    creatingMember = false;

    showCreateModal = false;
    newMember = { email: '', password: '', fullName: '' };

    totals = { broadcasts: 0, cost: 0 };

    constructor(
        private supabaseService: SupabaseService,
        private cdr: ChangeDetectorRef,
        private snackBar: MatSnackBar
    ) { }

    private getDeleteSwalTheme() {
        return {
            background: '#0f172a',
            color: '#e2e8f0',
            heightAuto: false,
            reverseButtons: true,
            buttonsStyling: false,
            customClass: {
                popup: 'vira-swal-popup',
                title: 'vira-swal-title',
                htmlContainer: 'vira-swal-text',
                actions: 'vira-swal-actions',
                confirmButton: 'vira-swal-confirm',
                denyButton: 'vira-swal-deny',
                cancelButton: 'vira-swal-cancel'
            }
        };
    }

    async ngOnInit() {
        await this.loadCurrentUserContext();
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

        this.creatingMember = true;

        try {
            await this.supabaseService.createTeamUser({
                email: this.newMember.email,
                password: this.newMember.password,
                fullName: this.newMember.fullName
            });

            const mailResult = await this.supabaseService.sendWelcomeEmail({
                recipientEmail: this.newMember.email,
                recipientName: this.newMember.fullName,
                temporaryPassword: this.newMember.password,
                profileType: 'team_user',
                createdByRole: this.currentUserRole,
                createdByName: this.currentUserName
            });

            if (mailResult?.success) {
                this.showSnackBar('Usuario de equipo creado y correo enviado', 'success-snackbar');
            } else {
                this.showSnackBar(
                    'Usuario de equipo creado. El correo no se pudo enviar; revisa la configuración de Gmail.',
                    'error-snackbar'
                );
            }

            this.closeCreateModal();
            await this.loadTeam();
        } catch (error: any) {
            console.error('Error creating team user:', error);
            this.showSnackBar(error?.message || 'Error al crear usuario de equipo', 'error-snackbar');
        } finally {
            this.creatingMember = false;
        }
    }

    async loadCurrentUserContext() {
        const user = await this.supabaseService.getCurrentUser();
        if (!user) return;

        const profile = await this.supabaseService.getUserProfile(user.id);
        this.currentUserRole = profile?.role || 'admin';
        this.currentUserName = profile?.full_name || user.email || '';
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
            ...this.getDeleteSwalTheme()
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
            cancelButtonText: 'Cancelar',
            ...this.getDeleteSwalTheme()
        });

        if (!confirm.isConfirmed) return;

        try {
            const memberId = member?.member_id || member?.id;
            if (!memberId) {
                throw new Error('No se pudo identificar al integrante a eliminar.');
            }

            await this.supabaseService.deleteTeamUser(memberId, behavior);
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

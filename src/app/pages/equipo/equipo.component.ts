import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import Swal from 'sweetalert2';
import { SupabaseService, AudioQuotaSummary } from '../../services/supabase.service';
import { QuotaService } from '../../services/quota.service';

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
    savingQuotaUserId = '';

    showCreateModal = false;
    newMember = { email: '', fullName: '', quotaMinutes: 0 };

    totals = { broadcasts: 0, cost: 0 };
    adminQuotaSummary: AudioQuotaSummary | null = null;
    memberQuotaSummaries: Record<string, AudioQuotaSummary> = {};
    quotaInputs: Record<string, number> = {};

    constructor(
        private supabaseService: SupabaseService,
        private cdr: ChangeDetectorRef,
        private snackBar: MatSnackBar,
        private quotaService: QuotaService
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
        this.newMember = { email: '', fullName: '', quotaMinutes: 0 };
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
            await this.loadTeamQuotaSummaries();
        } catch (error: any) {
            console.error('Error loading team:', error);
            this.showSnackBar(error?.message || 'Error al cargar el equipo', 'error-snackbar');
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    async createMember() {
        const email = String(this.newMember.email || '').trim().toLowerCase();
        const fullName = String(this.newMember.fullName || '').trim();

        if (!email) {
            this.showSnackBar('El email es requerido', 'error-snackbar');
            return;
        }

        this.creatingMember = true;

        try {
            const generatedPassword = this.supabaseService.generateSecurePassword();

            const created = await this.supabaseService.createTeamUser({
                email,
                password: generatedPassword,
                fullName
            });

            if (created?.id) {
                await this.supabaseService.setUserAudioQuota(created.id, Number(this.newMember.quotaMinutes || 0));
            }

            const mailResult = await this.supabaseService.sendWelcomeEmail({
                recipientEmail: email,
                recipientName: fullName,
                profileType: 'team_user',
                createdByRole: this.currentUserRole,
                createdByName: this.currentUserName
            });

            if (mailResult?.success) {
                this.showSnackBar('Usuario de equipo creado y enlace de acceso enviado', 'success-snackbar');
            } else {
                this.showSnackBar(
                    `Usuario de equipo creado, pero el enlace de acceso falló: ${mailResult?.error || 'Error desconocido.'}`,
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
        this.adminQuotaSummary = await this.supabaseService.getAudioQuotaSummary(user.id);
        await this.quotaService.refreshCurrentSummary();
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

    async saveMemberQuota(member: any) {
        const memberId = member?.member_id || member?.id;
        if (!memberId) return;

        this.savingQuotaUserId = memberId;
        try {
            await this.supabaseService.setUserAudioQuota(memberId, this.quotaInputs[memberId] ?? 0);
            await this.loadTeamQuotaSummaries();
            await this.quotaService.refreshCurrentSummary();
            this.showSnackBar('Cuota actualizada correctamente', 'success-snackbar');
        } catch (error: any) {
            console.error('Error updating team quota:', error);
            this.showSnackBar(error?.message || 'Error al actualizar la cuota', 'error-snackbar');
        } finally {
            this.savingQuotaUserId = '';
            this.cdr.detectChanges();
        }
    }

    getMemberQuota(memberId: string): AudioQuotaSummary | null {
        return this.memberQuotaSummaries[memberId] || null;
    }

    isSavingQuota(memberId: string): boolean {
        return this.savingQuotaUserId === memberId;
    }

    private async loadTeamQuotaSummaries() {
        const summaries = await Promise.all((this.members || []).map(async (member: any) => {
            const memberId = member?.member_id || member?.id;
            if (!memberId) return [null, null] as const;

            try {
                const summary = await this.supabaseService.getAudioQuotaSummary(memberId);
                return [memberId, summary] as const;
            } catch (error) {
                console.warn(`Error loading quota for member ${memberId}`, error);
                return [memberId, null] as const;
            }
        }));

        this.memberQuotaSummaries = {};
        this.quotaInputs = {};

        for (const [memberId, summary] of summaries) {
            if (!memberId || !summary) continue;
            this.memberQuotaSummaries[memberId] = summary;
            this.quotaInputs[memberId] = summary.quota_total_minutes;
        }

        const currentUser = await this.supabaseService.getCurrentUser().catch(() => null);
        if (currentUser?.id) {
            this.adminQuotaSummary = await this.supabaseService.getAudioQuotaSummary(currentUser.id).catch(() => this.adminQuotaSummary);
        }
    }
}

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { SupabaseService, AudioQuotaSummary, AudioQuotaAdjustmentEvent } from '../../services/supabase.service';
import { QuotaService } from '../../services/quota.service';

@Component({
    selector: 'app-equipo',
    standalone: true,
    imports: [CommonModule, FormsModule, MatSnackBarModule, MatIconModule],
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
    activeSection: 'team' | 'reviews' = 'team';

    showCreateModal = false;
    newMember = {
        email: '',
        fullName: '',
        quotaMinutes: 0,
        canUploadMusic: true,
        canUseAdBlock: true,
        canDownloadBroadcast: true
    };

    showPermissionsModal = false;
    permissionsMember: any | null = null;
    permissionsForm = {
        canUploadMusic: true,
        canUseAdBlock: true,
        canDownloadBroadcast: true
    };
    savingPermissions = false;

    totals = { broadcasts: 0, usedMinutes: 0, finalExports: 0 };
    adminQuotaSummary: AudioQuotaSummary | null = null;
    memberQuotaSummaries: Record<string, AudioQuotaSummary> = {};
    quotaInputs: Record<string, number> = {};
    memberExportCounts: Record<string, number> = {};
    loadingReviews = false;
    pendingReviews: any[] = [];

    showQuotaHistoryModal = false;
    quotaHistoryMember: any | null = null;
    quotaHistoryEvents: AudioQuotaAdjustmentEvent[] = [];
    loadingQuotaHistory = false;

    constructor(
        private supabaseService: SupabaseService,
        private cdr: ChangeDetectorRef,
        private snackBar: MatSnackBar,
        private quotaService: QuotaService,
        private router: Router
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
        if (this.currentUserRole === 'admin' || this.currentUserRole === 'super_admin') {
            await this.loadPendingReviews();
        }
    }

    openCreateModal() {
        this.newMember = {
            email: '',
            fullName: '',
            quotaMinutes: 0,
            canUploadMusic: true,
            canUseAdBlock: true,
            canDownloadBroadcast: true
        };
        this.showCreateModal = true;
    }

    closeCreateModal() {
        this.showCreateModal = false;
    }

    private getMemberId(member: any): string {
        return member?.member_id || member?.id || '';
    }

    private computeTotals() {
        const broadcasts = this.members.reduce((sum, r) => sum + Number(r?.broadcasts_count || 0), 0);
        const usedMinutes = this.members.reduce((sum, member) => {
            const summary = this.getMemberQuota(this.getMemberId(member));
            return sum + Number(summary?.used_minutes || 0);
        }, 0);
        const finalExports = this.members.reduce((sum, member) => sum + this.getMemberExportCount(this.getMemberId(member)), 0);
        this.totals = { broadcasts, usedMinutes, finalExports };
    }

    async loadTeam() {
        this.loading = true;
        try {
            const rows = await this.supabaseService.getTeamMembersWithUsage();
            const baseMembers = rows || [];
            const memberIds: string[] = Array.from(
                new Set(
                    baseMembers
                        .map((m: any) => this.getMemberId(m))
                        .filter((id: string): id is string => Boolean(id))
                )
            );
            let profiles: any[] = [];
            try {
                profiles = await this.supabaseService.getUserProfilesByIds(memberIds);
            } catch {}
            const profileMap = new Map<string, any>();
            for (const p of profiles || []) {
                if (p?.id) profileMap.set(String(p.id), p);
            }
            this.members = baseMembers.map((m: any) => {
                const id = this.getMemberId(m);
                const p = profileMap.get(String(id)) || null;
                return {
                    ...m,
                    can_upload_music: p?.can_upload_music ?? true,
                    can_use_ad_block: p?.can_use_ad_block ?? true,
                    can_download_broadcast: p?.can_download_broadcast ?? true
                };
            });
            await Promise.all([
                this.loadTeamQuotaSummaries(),
                this.loadTeamGeneratedHistory()
            ]);
            this.computeTotals();
        } catch (error: any) {
            console.error('Error loading team:', error);
            this.showSnackBar(error?.message || 'Error al cargar el equipo', 'error-snackbar');
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    async loadPendingReviews() {
        this.loadingReviews = true;
        try {
            const broadcasts = await this.supabaseService.getPendingReviewBroadcasts();
            const broadcastIds = Array.from(new Set((broadcasts || []).map((b: any) => String(b?.id || '')).filter(Boolean)));
            const latestAudioRows = await this.supabaseService.getLatestGeneratedBroadcastsForBroadcastIds(broadcastIds).catch(() => []);
            const audioMap = new Map<string, any>();
            for (const row of latestAudioRows || []) {
                const bid = String((row as any)?.broadcast_id || '').trim();
                if (!bid) continue;
                audioMap.set(bid, row);
            }
            const ids = Array.from(new Set((broadcasts || []).map((b: any) => String(b?.created_by || '')).filter(Boolean)));
            let profiles: any[] = [];
            try {
                profiles = await this.supabaseService.getUserProfilesByIds(ids);
            } catch {}
            const map = new Map<string, any>();
            for (const p of profiles || []) {
                if (p?.id) map.set(String(p.id), p);
            }
            this.pendingReviews = (broadcasts || []).map((b: any) => {
                const p = map.get(String(b?.created_by || '')) || null;
                const audio = audioMap.get(String(b?.id || '').trim()) || null;
                return {
                    ...b,
                    created_by_name: (p?.full_name && String(p.full_name).trim()) || (p?.email && String(p.email).trim()) || 'Usuario',
                    final_audio_url: audio?.audio_url || null
                };
            });
        } catch (error: any) {
            console.error('Error loading pending reviews:', error);
            this.showSnackBar(error?.message || 'Error al cargar revisiones', 'error-snackbar');
            this.pendingReviews = [];
        } finally {
            this.loadingReviews = false;
            this.cdr.detectChanges();
        }
    }

    async approveReview(review: any) {
        if (!review?.id) return;
        try {
            const current = await this.supabaseService.getCurrentUser().catch(() => null);
            await this.supabaseService.updateNewsBroadcast(review.id, {
                status: 'ready',
                reviewed_by: current?.id || null,
                reviewed_at: new Date().toISOString()
            });
            this.showSnackBar('Noticiero aprobado', 'success-snackbar');
            await this.loadPendingReviews();
        } catch (error: any) {
            console.error('Error approving review:', error);
            this.showSnackBar(error?.message || 'Error al aprobar', 'error-snackbar');
        }
    }

    openReviewTimeline(review: any) {
        if (!review?.id) return;
        this.router.navigate(['/timeline-noticiario', review.id]);
    }

    async rejectReview(review: any) {
        if (!review?.id) return;
        try {
            const current = await this.supabaseService.getCurrentUser().catch(() => null);
            await this.supabaseService.updateNewsBroadcast(review.id, {
                status: 'rejected',
                reviewed_by: current?.id || null,
                reviewed_at: new Date().toISOString()
            });
            this.showSnackBar('Noticiero rechazado', 'success-snackbar');
            await this.loadPendingReviews();
        } catch (error: any) {
            console.error('Error rejecting review:', error);
            this.showSnackBar(error?.message || 'Error al rechazar', 'error-snackbar');
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
                await this.supabaseService.setTeamUserPermissions({
                    userId: created.id,
                    canUploadMusic: !!this.newMember.canUploadMusic,
                    canUseAdBlock: !!this.newMember.canUseAdBlock,
                    canDownloadBroadcast: !!this.newMember.canDownloadBroadcast
                });
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

    openPermissionsModal(member: any) {
        if (!member) return;
        if (member.is_admin) return;
        this.permissionsMember = member;
        this.permissionsForm = {
            canUploadMusic: member?.can_upload_music ?? true,
            canUseAdBlock: member?.can_use_ad_block ?? true,
            canDownloadBroadcast: member?.can_download_broadcast ?? true
        };
        this.showPermissionsModal = true;
    }

    closePermissionsModal() {
        this.showPermissionsModal = false;
        this.permissionsMember = null;
    }

    async savePermissions() {
        if (!this.permissionsMember) return;
        const memberId = this.getMemberId(this.permissionsMember);
        if (!memberId) return;

        this.savingPermissions = true;
        try {
            await this.supabaseService.setTeamUserPermissions({
                userId: memberId,
                canUploadMusic: !!this.permissionsForm.canUploadMusic,
                canUseAdBlock: !!this.permissionsForm.canUseAdBlock,
                canDownloadBroadcast: !!this.permissionsForm.canDownloadBroadcast
            });
            this.showSnackBar('Permisos actualizados', 'success-snackbar');
            this.closePermissionsModal();
            await this.loadTeam();
        } catch (error: any) {
            console.error('Error saving permissions:', error);
            this.showSnackBar(error?.message || 'Error al guardar permisos', 'error-snackbar');
        } finally {
            this.savingPermissions = false;
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
        const memberId = this.getMemberId(member);
        if (!memberId) return;

        this.savingQuotaUserId = memberId;
        try {
            const delta = Math.round(Number(this.quotaInputs[memberId] ?? 0));
            if (!isFinite(delta) || delta === 0) {
                this.showSnackBar('Ingresa un ajuste de minutos (ej: +25)', 'error-snackbar');
                return;
            }

            await this.supabaseService.adjustUserAudioQuota(memberId, delta);
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

    async openQuotaHistory(member: any) {
        const memberId = this.getMemberId(member);
        if (!memberId) return;

        this.quotaHistoryMember = member;
        this.quotaHistoryEvents = [];
        this.loadingQuotaHistory = true;
        this.showQuotaHistoryModal = true;

        try {
            this.quotaHistoryEvents = await this.supabaseService.getAudioQuotaAdjustmentEvents({ userId: memberId, limit: 60 });
        } catch (error: any) {
            console.error('Error loading quota history:', error);
            this.showSnackBar(error?.message || 'Error al cargar historial', 'error-snackbar');
            this.quotaHistoryEvents = [];
        } finally {
            this.loadingQuotaHistory = false;
            this.cdr.detectChanges();
        }
    }

    closeQuotaHistoryModal() {
        this.showQuotaHistoryModal = false;
        this.quotaHistoryMember = null;
        this.quotaHistoryEvents = [];
        this.loadingQuotaHistory = false;
    }

    getMemberQuota(memberId: string): AudioQuotaSummary | null {
        return this.memberQuotaSummaries[memberId] || null;
    }

    getMemberExportCount(memberId: string): number {
        return Number(this.memberExportCounts[memberId] || 0);
    }

    isSavingQuota(memberId: string): boolean {
        return this.savingQuotaUserId === memberId;
    }

    private async loadTeamQuotaSummaries() {
        const summaries = await Promise.all((this.members || []).map(async (member: any) => {
            const memberId = this.getMemberId(member);
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
            this.quotaInputs[memberId] = 0;
        }

        const currentUser = await this.supabaseService.getCurrentUser().catch(() => null);
        if (currentUser?.id) {
            this.adminQuotaSummary = await this.supabaseService.getAudioQuotaSummary(currentUser.id).catch(() => this.adminQuotaSummary);
        }

        this.computeTotals();
    }

    private async loadTeamGeneratedHistory() {
        const generated = await this.supabaseService.getGeneratedBroadcasts({ limit: 500 });
        const counts: Record<string, number> = {};

        for (const item of generated || []) {
            const chargedUserId = String(item?.charged_user_id || '').trim();
            if (!chargedUserId) continue;
            counts[chargedUserId] = (counts[chargedUserId] || 0) + 1;
        }

        this.memberExportCounts = counts;
        this.computeTotals();
    }
}

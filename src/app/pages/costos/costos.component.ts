import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SupabaseService } from '../../services/supabase.service';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-costos',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './costos.component.html',
    styleUrls: ['./costos.component.scss']
})
export class CostosComponent implements OnInit {
    loading = false;
    loadingRates = false;
    loadingBroadcasts = false;
    savingRate = false;
    currentUserId = '';
    currentUserRole: 'super_admin' | 'admin' | 'user' = 'user';

    users: any[] = [];
    rates: any[] = [];
    events: any[] = [];
    broadcasts: any[] = [];

    selectedUserId = 'all';
    selectedAction = 'all';
    fromDate = '';
    toDate = '';

    constructor(
        private supabaseService: SupabaseService,
        private authService: AuthService,
        private snackBar: MatSnackBar,
        private cdr: ChangeDetectorRef
    ) {}

    async ngOnInit(): Promise<void> {
        await this.loadContext();
        await this.loadUsers();

        const tasks: Promise<void>[] = [this.loadEvents(), this.loadBroadcasts()];
        if (this.canManageRates) tasks.push(this.loadRates());
        await Promise.all(tasks);
    }

    get availableActions(): string[] {
        const fromRates = this.rates.map(r => String(r.action || '').trim()).filter(Boolean);
        const fromEvents = this.events.map(e => String(e.action || '').trim()).filter(Boolean);
        return Array.from(new Set([...fromRates, ...fromEvents])).sort((a, b) => a.localeCompare(b, 'es'));
    }

    get totalCostByCurrency(): Array<{ currency: string; total: number }> {
        const map = new Map<string, number>();
        for (const e of this.events) {
            const currency = String(e.currency || 'USD');
            const total = Number(e.total_cost || 0);
            map.set(currency, (map.get(currency) || 0) + total);
        }
        return Array.from(map.entries())
            .map(([currency, total]) => ({ currency, total }))
            .sort((a, b) => a.currency.localeCompare(b.currency, 'es'));
    }

    get canViewCosts(): boolean {
        return this.currentUserRole === 'super_admin';
    }

    get canManageRates(): boolean {
        return this.currentUserRole === 'super_admin';
    }

    get isAdminView(): boolean {
        return this.currentUserRole === 'admin';
    }

    get activitySummary(): any[] {
        const summary = new Map<string, any>();

        for (const user of this.users) {
            summary.set(user.id, {
                userId: user.id,
                user,
                eventCount: 0,
                broadcastCount: 0,
                totalCost: 0
            });
        }

        for (const event of this.events) {
            const userId = event.user_id;
            if (!summary.has(userId)) {
                summary.set(userId, {
                    userId,
                    user: event.user || null,
                    eventCount: 0,
                    broadcastCount: 0,
                    totalCost: 0
                });
            }

            const row = summary.get(userId);
            row.eventCount += 1;
            row.totalCost += Number(event.total_cost || 0);
        }

        for (const broadcast of this.broadcasts) {
            const userId = broadcast.created_by;
            if (!summary.has(userId)) {
                summary.set(userId, {
                    userId,
                    user: broadcast.creator || null,
                    eventCount: 0,
                    broadcastCount: 0,
                    totalCost: 0
                });
            }

            const row = summary.get(userId);
            row.broadcastCount += 1;
        }

        return Array.from(summary.values())
            .filter(row => !!row.user)
            .sort((a, b) => {
                if (this.canViewCosts) {
                    const costDiff = Number(b.totalCost || 0) - Number(a.totalCost || 0);
                    if (costDiff !== 0) return costDiff;
                }
                return Number(b.broadcastCount || 0) - Number(a.broadcastCount || 0);
            });
    }

    get adminTeamMonitoring(): any[] {
        if (this.currentUserRole !== 'super_admin') return [];

        const userById = new Map<string, any>();
        for (const user of this.users) {
            userById.set(user.id, user);
        }

        const broadcastCountByUser = new Map<string, number>();
        for (const broadcast of this.broadcasts) {
            const userId = String(broadcast.created_by || '');
            if (!userId) continue;
            broadcastCountByUser.set(userId, (broadcastCountByUser.get(userId) || 0) + 1);
        }

        const costByUser = new Map<string, number>();
        for (const event of this.events) {
            const userId = String(event.user_id || '');
            if (!userId) continue;
            costByUser.set(userId, (costByUser.get(userId) || 0) + Number(event.total_cost || 0));
        }

        const admins = this.users
            .filter(u => u?.role === 'admin')
            .map(admin => {
                const members = this.users
                    .filter(u => u?.manager_id === admin.id)
                    .map(member => ({
                        user: member,
                        broadcastCount: broadcastCountByUser.get(member.id) || 0,
                        totalCost: costByUser.get(member.id) || 0
                    }))
                    .sort((a, b) => Number(b.broadcastCount || 0) - Number(a.broadcastCount || 0));

                const adminBroadcastCount = broadcastCountByUser.get(admin.id) || 0;
                const adminCost = costByUser.get(admin.id) || 0;
                const membersBroadcastCount = members.reduce((sum, item) => sum + Number(item.broadcastCount || 0), 0);
                const membersCost = members.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);

                return {
                    admin,
                    members,
                    adminBroadcastCount,
                    adminCost,
                    membersBroadcastCount,
                    membersCost,
                    totalBroadcastCount: adminBroadcastCount + membersBroadcastCount,
                    totalCost: adminCost + membersCost
                };
            })
            .sort((a, b) => {
                const totalDiff = Number(b.totalBroadcastCount || 0) - Number(a.totalBroadcastCount || 0);
                if (totalDiff !== 0) return totalDiff;
                return Number(b.totalCost || 0) - Number(a.totalCost || 0);
            });

        return admins;
    }

    get teamBroadcastRows(): any[] {
        if (this.currentUserRole === 'admin') {
            return this.broadcasts.filter(b => b?.creator?.manager_id === this.currentUserId);
        }
        return this.broadcasts;
    }

    get teamBroadcastCount(): number {
        return this.teamBroadcastRows.length;
    }

    get ownBroadcastCount(): number {
        return this.broadcasts.filter(b => b?.created_by === this.currentUserId).length;
    }

    async loadContext(): Promise<void> {
        try {
            const currentUser = this.authService.getCurrentUser();
            if (currentUser?.id) {
                this.currentUserId = currentUser.id;
                this.currentUserRole = (currentUser.role as any) || 'user';
            }

            if (!this.currentUserId || this.currentUserRole === 'user') {
                const authUser = await this.supabaseService.getCurrentUser();
                if (authUser?.id) {
                    this.currentUserId = authUser.id;
                    const profile = await this.supabaseService.getUserProfile(authUser.id);
                    this.currentUserRole = (profile?.role as any) || 'user';
                }
            }
        } catch (error) {
            console.error('Error loading costs context:', error);
        } finally {
            this.cdr.detectChanges();
        }
    }

    async loadUsers(): Promise<void> {
        try {
            const data = await this.supabaseService.getUsers();
            this.users = data || [];
        } catch (error) {
            console.error('Error loading users:', error);
            this.users = [];
        } finally {
            this.cdr.detectChanges();
        }
    }

    async loadRates(): Promise<void> {
        if (!this.canManageRates) {
            this.rates = [];
            return;
        }
        this.loadingRates = true;
        this.cdr.detectChanges();
        try {
            const data = await this.supabaseService.getCostRates();
            this.rates = (data || [])
                .filter((r: any) => r?.action !== 'humanize' && r?.action !== 'broadcast_create')
                .map((r: any) => ({ ...r }));
        } catch (error) {
            console.error('Error loading rates:', error);
            this.rates = [];
            this.snackBar.open('Error al cargar tarifas de costos', 'Cerrar', { duration: 3000 });
        } finally {
            this.loadingRates = false;
            this.cdr.detectChanges();
        }
    }

    async loadEvents(): Promise<void> {
        this.loading = true;
        this.cdr.detectChanges();
        try {
            const fromIso = this.fromDate ? new Date(`${this.fromDate}T00:00:00`).toISOString() : undefined;
            const toIso = this.toDate ? new Date(`${this.toDate}T23:59:59`).toISOString() : undefined;

            const data = await this.supabaseService.getCostEvents({
                limit: 500,
                userId: this.selectedUserId,
                action: this.selectedAction,
                from: fromIso,
                to: toIso
            });
            this.events = data || [];
        } catch (error) {
            console.error('Error loading cost events:', error);
            this.events = [];
            this.snackBar.open('Error al cargar actividad de costos', 'Cerrar', { duration: 3000 });
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    async loadBroadcasts(): Promise<void> {
        this.loadingBroadcasts = true;
        this.cdr.detectChanges();
        try {
            const fromIso = this.fromDate ? new Date(`${this.fromDate}T00:00:00`).toISOString() : undefined;
            const toIso = this.toDate ? new Date(`${this.toDate}T23:59:59`).toISOString() : undefined;

            const data = await this.supabaseService.getBroadcastsForCosts({
                limit: 500,
                creatorId: this.selectedUserId,
                from: fromIso,
                to: toIso
            });

            this.broadcasts = data || [];
        } catch (error) {
            console.error('Error loading broadcasts:', error);
            this.broadcasts = [];
            this.snackBar.open('Error al cargar noticieros', 'Cerrar', { duration: 3000 });
        } finally {
            this.loadingBroadcasts = false;
            this.cdr.detectChanges();
        }
    }

    async refreshAll(): Promise<void> {
        const tasks: Promise<void>[] = [this.loadEvents(), this.loadBroadcasts()];
        if (this.canManageRates) tasks.push(this.loadRates());
        await Promise.all(tasks);
    }

    async saveRate(rate: any): Promise<void> {
        if (!rate?.action) return;
        this.savingRate = true;
        this.cdr.detectChanges();
        try {
            const updated = await this.supabaseService.upsertCostRate({
                action: String(rate.action).trim(),
                module: rate.module,
                unit_name: rate.unit_name,
                unit_cost: Number(rate.unit_cost || 0),
                currency: rate.currency,
                is_active: !!rate.is_active
            });

            const idx = this.rates.findIndex(r => r.action === updated.action);
            if (idx >= 0) this.rates[idx] = updated;
            else this.rates.unshift(updated);

            this.snackBar.open('Tarifa guardada', 'Cerrar', { duration: 2500 });
        } catch (error) {
            console.error('Error saving rate:', error);
            this.snackBar.open('Error al guardar tarifa', 'Cerrar', { duration: 3000 });
        } finally {
            this.savingRate = false;
            this.cdr.detectChanges();
        }
    }

    formatDate(date: string): string {
        try {
            const d = new Date(date);
            return d.toLocaleString('es-CL', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch {
            return date;
        }
    }

    displayUser(user: any): string {
        const name = String(user?.full_name || '').trim();
        const email = String(user?.email || '').trim();
        if (name && email) return `${name} (${email})`;
        return name || email || 'Usuario';
    }

    displayResponsible(user: any): string {
        if (!user?.manager_id) return 'Cuenta propia';
        const manager = this.users.find(u => u.id === user.manager_id);
        return manager ? this.displayUser(manager) : 'Equipo';
    }

    displayRole(user: any): string {
        const role = String(user?.role || '').trim();
        if (role === 'super_admin') return 'Super Admin';
        if (role === 'admin') return 'Admin';
        if (role === 'user') return 'Usuario';
        return role || 'Usuario';
    }
}

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SupabaseService } from '../../services/supabase.service';

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
    savingRate = false;

    users: any[] = [];
    rates: any[] = [];
    events: any[] = [];

    selectedUserId = 'all';
    selectedAction = 'all';
    fromDate = '';
    toDate = '';

    constructor(
        private supabaseService: SupabaseService,
        private snackBar: MatSnackBar,
        private cdr: ChangeDetectorRef
    ) {}

    async ngOnInit(): Promise<void> {
        await Promise.all([this.loadUsers(), this.loadRates()]);
        await this.loadEvents();
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
        this.loadingRates = true;
        this.cdr.detectChanges();
        try {
            const data = await this.supabaseService.getCostRates();
            this.rates = (data || []).map((r: any) => ({ ...r }));
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
}


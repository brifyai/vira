import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService, User } from './services/auth.service';
import { QuotaService } from './services/quota.service';
import { AudioQuotaSummary } from './services/supabase.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
    title = 'VIRA';
    currentRoute = '';
    isMenuOpen = false;
    isUserMenuOpen = false;
    currentUser: User | null = null;
    currentQuotaSummary: AudioQuotaSummary | null = null;

    // Menu items
    menuItems = [
        { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
        { path: '/crear-noticiario', label: 'Crear Noticiario', icon: 'add_circle' },
        { path: '/timeline-noticiario', label: 'Timeline Noticiario', icon: 'timeline' },
        { path: '/mis-noticieros', label: 'Mis Noticieros', icon: 'folder_special' }
    ];

    constructor(
        private router: Router,
        private authService: AuthService,
        private quotaService: QuotaService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.router.events.subscribe(() => {
            this.currentRoute = this.router.url;
        });

        // Subscribe to current user
        this.authService.currentUser$.subscribe((user: User | null) => {
            this.currentUser = user;
            this.cdr.detectChanges();
        });

        this.quotaService.currentSummary$.subscribe(summary => {
            this.currentQuotaSummary = summary;
            this.cdr.detectChanges();
        });
    }

    get user() {
        return this.currentUser;
    }

    get isLoggedIn(): boolean {
        return this.authService.isLoggedIn();
    }

    get isAdmin(): boolean {
        return this.authService.isAdmin();
    }

    get quotaSummary(): AudioQuotaSummary | null {
        return this.currentQuotaSummary;
    }

    get shouldShowQuotaIndicator(): boolean {
        return !!this.currentQuotaSummary;
    }

    get quotaIndicatorText(): string {
        return this.quotaIndicatorTextLines.join(' · ');
    }

    get quotaIndicatorHint(): string {
        if (!this.currentQuotaSummary) return '';
        if (this.currentQuotaSummary.unlimited) return 'Super Admin sin límite de minutos';

        if (this.currentQuotaSummary.role === 'admin') {
            const teamRemaining = Math.max(0, (this.currentQuotaSummary.team_assigned_minutes || 0) - (this.currentQuotaSummary.team_used_minutes || 0));
            return `Plan ${this.currentQuotaSummary.quota_total_minutes} min · Team ${this.currentQuotaSummary.team_assigned_minutes}/${teamRemaining} · Disponible para repartir ${this.currentQuotaSummary.available_to_assign_minutes} · Admin ${this.currentQuotaSummary.personal_quota_minutes}/${this.currentQuotaSummary.remaining_minutes}`;
        }

        return `Cuota total ${this.currentQuotaSummary.quota_total_minutes} min · Restantes ${this.currentQuotaSummary.remaining_minutes} min`;
    }

    get isAdminQuotaCompact(): boolean {
        return !!this.currentQuotaSummary && !this.currentQuotaSummary.unlimited && this.currentQuotaSummary.role === 'admin';
    }

    get quotaIndicatorTextLines(): string[] {
        const s = this.currentQuotaSummary;
        if (!s) return [];
        if (s.unlimited) return ['Ilimitado'];

        if (s.role === 'admin') {
            const teamRemaining = Math.max(0, (s.team_assigned_minutes || 0) - (s.team_used_minutes || 0));
            const plan = `Plan: ${s.quota_total_minutes} min`;
            const team = `Team: ${s.team_assigned_minutes}/${teamRemaining}`;
            const admin = `Admin: ${s.personal_quota_minutes}/${s.remaining_minutes}`;
            return [plan, `${team} · ${admin}`];
        }

        return [`${s.quota_total_minutes}/${s.remaining_minutes} min`];
    }

    get visibleMenuItems() {
        const items = [...this.menuItems];
        const role = String(this.currentUser?.role || '').trim();

        if (role === 'super_admin') {
            items.push({ path: '/fuentes', label: 'Fuentes', icon: 'source' });
            items.push({ path: '/scrapping', label: 'Scrapping', icon: 'scrape' });
            items.push({ path: '/costos', label: 'Costos', icon: 'costs' });
            items.push({ path: '/usuarios', label: 'Usuarios', icon: 'people' });
            items.push({ path: '/recursos', label: 'Recursos', icon: 'voice' });
            return items;
        }

        if (role === 'admin') {
            items.push({ path: '/equipo', label: 'Equipo', icon: 'people' });
            items.push({ path: '/recursos', label: 'Recursos', icon: 'voice' });
            items.push({ path: '/costos', label: 'Actividad', icon: 'costs' });
        }

        return items;
    }

    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
    }

    toggleUserMenu() {
        this.isUserMenuOpen = !this.isUserMenuOpen;
    }

    closeUserMenu() {
        this.isUserMenuOpen = false;
    }

    navigateTo(path: string) {
        this.router.navigate([path]);
        this.isMenuOpen = false;
        this.isUserMenuOpen = false;
    }

    navigateToProfile() {
        this.navigateTo('/perfil');
    }

    async logout() {
        try {
            this.closeUserMenu();
            await this.authService.logout();
        } catch (error) {
            console.error('Error during logout:', error);
        } finally {
            this.router.navigate(['/login']);
        }
    }
}

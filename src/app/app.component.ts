import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService, User } from './services/auth.service';

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

    // Menu items
    menuItems = [
        { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
        { path: '/crear-noticiario', label: 'Crear Noticiario', icon: 'add_circle' },
        { path: '/timeline-noticiario', label: 'Timeline Noticiario', icon: 'timeline' },
        { path: '/mis-noticieros', label: 'Mis Noticieros', icon: 'folder_special' }
    ];

    constructor(
        private router: Router,
        private authService: AuthService
    ) { }

    ngOnInit(): void {
        this.router.events.subscribe(() => {
            this.currentRoute = this.router.url;
        });

        // Subscribe to current user
        this.authService.currentUser$.subscribe((user: User | null) => {
            this.currentUser = user;
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

    get visibleMenuItems() {
        const items = [...this.menuItems];
        
        // Fuentes: Only Super Admin
        if (this.authService.isSuperAdmin()) {
            items.push({ path: '/fuentes', label: 'Fuentes', icon: 'source' });
            items.push({ path: '/scrapping', label: 'Scrapping', icon: 'scrape' });
            items.push({ path: '/costos', label: 'Costos', icon: 'costs' });
            items.push({ path: '/usuarios', label: 'Usuarios', icon: 'people' });
            items.push({ path: '/recursos', label: 'Recursos', icon: 'voice' });
            return items;
        }

        if (this.authService.hasRole('admin')) {
            items.push({ path: '/equipo', label: 'Equipo', icon: 'people' });
            items.push({ path: '/recursos', label: 'Recursos', icon: 'voice' });
            items.push({ path: '/costos', label: 'Costos', icon: 'costs' });
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

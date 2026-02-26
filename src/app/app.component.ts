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
    currentUser: User | null = null;

    // Menu items
    menuItems = [
        { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
        { path: '/crear-noticiario', label: 'Crear Noticiario', icon: 'add_circle' },
        { path: '/ultimo-minuto', label: 'Último Minuto', icon: 'flash_on' },
        { path: '/timeline-noticiario', label: 'Timeline Noticiario', icon: 'timeline' },
        { path: '/mis-noticieros', label: 'Mis Noticieros', icon: 'folder_special' },
        { path: '/radios', label: 'Radios', icon: 'radio' }
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
        }

        // Usuarios: Admin and Super Admin
        if (this.authService.isAdmin()) {
             // Assuming 'users' icon is not in the template yet, I'll use 'dashboard' or need to add SVG for it.
             // I'll add a generic 'users' label and handle the icon in template or reuse one.
             // For now, I'll reuse 'settings_suggest' logic or just add it.
             // Wait, the template loops through items and checks `item.icon`.
             // I need to add 'people' or 'group' icon support in template.
             items.push({ path: '/usuarios', label: 'Usuarios', icon: 'people' });
            items.push({ path: '/recursos', label: 'Recursos', icon: 'voice' });
        }

        return items;
    }

    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
    }

    navigateTo(path: string) {
        this.router.navigate([path]);
        this.isMenuOpen = false;
    }

    async logout() {
        try {
            await this.authService.logout();
        } catch (error) {
            console.error('Error during logout:', error);
        } finally {
            this.router.navigate(['/login']);
        }
    }
}

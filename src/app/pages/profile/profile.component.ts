import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { AuthService, User } from '../../services/auth.service';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
    user: User | null = null;
    profile: any = null;
    currentPasswordPlaceholder = 'Tu sesión actual permite cambiar la contraseña directamente.';
    newPassword = '';
    confirmPassword = '';
    loading = true;
    savingPassword = false;
    successMessage = '';
    errorMessage = '';

    constructor(
        private authService: AuthService,
        private supabaseService: SupabaseService,
        private cdr: ChangeDetectorRef
    ) {}

    async ngOnInit(): Promise<void> {
        this.user = this.authService.getCurrentUser();
        this.profile = this.buildFallbackProfile(this.user);
        this.loading = false;
        this.cdr.detectChanges();

        if (!this.user?.id) {
            return;
        }

        try {
            const profile = await Promise.race([
                this.supabaseService.getUserProfile(this.user.id),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
            ]);

            if (profile) {
                this.profile = profile;
            }
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    async changePassword(): Promise<void> {
        if (this.savingPassword) return;

        this.errorMessage = '';
        this.successMessage = '';

        if (!this.newPassword || !this.confirmPassword) {
            this.errorMessage = 'Completa ambos campos de contraseña.';
            return;
        }

        if (this.newPassword.length < 8) {
            this.errorMessage = 'La nueva contraseña debe tener al menos 8 caracteres.';
            return;
        }

        if (this.newPassword !== this.confirmPassword) {
            this.errorMessage = 'Las contraseñas no coinciden.';
            return;
        }

        this.savingPassword = true;

        try {
            await this.supabaseService.updateCurrentUserPassword(this.newPassword);
            this.newPassword = '';
            this.confirmPassword = '';
            this.successMessage = 'Contraseña actualizada correctamente.';
        } catch (error: any) {
            this.errorMessage = error?.message || 'No se pudo actualizar la contraseña.';
        } finally {
            this.savingPassword = false;
        }
    }

    private buildFallbackProfile(user: User | null) {
        if (!user) return null;

        return {
            full_name: user.name || 'Sin nombre',
            email: user.email || '',
            role: user.role || 'user'
        };
    }
}

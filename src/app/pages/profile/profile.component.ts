import { Component, OnInit } from '@angular/core';
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
        private supabaseService: SupabaseService
    ) {}

    async ngOnInit(): Promise<void> {
        this.user = this.authService.getCurrentUser();

        if (this.user?.id) {
            this.profile = await this.supabaseService.getUserProfile(this.user.id);
        }

        this.loading = false;
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
}

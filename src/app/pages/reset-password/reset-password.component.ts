import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
    selector: 'app-reset-password',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './reset-password.component.html',
    styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit {
    token = '';
    newPassword = '';
    confirmPassword = '';
    loading = false;
    successMessage = '';
    errorMessage = '';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private supabaseService: SupabaseService
    ) { }

    ngOnInit(): void {
        this.token = String(this.route.snapshot.queryParamMap.get('token') || '').trim();
        if (!this.token) {
            this.errorMessage = 'El enlace de recuperacion no es valido o esta incompleto.';
        }
    }

    async onSubmit(): Promise<void> {
        if (this.loading) return;

        this.errorMessage = '';
        this.successMessage = '';

        if (!this.token) {
            this.errorMessage = 'El enlace de recuperacion no es valido o ha expirado.';
            return;
        }

        if (!this.newPassword || !this.confirmPassword) {
            this.errorMessage = 'Debes completar ambos campos de contrasena.';
            return;
        }

        if (this.newPassword.length < 8) {
            this.errorMessage = 'La nueva contrasena debe tener al menos 8 caracteres.';
            return;
        }

        if (this.newPassword !== this.confirmPassword) {
            this.errorMessage = 'Las contrasenas no coinciden.';
            return;
        }

        this.loading = true;

        try {
            const result = await this.supabaseService.resetPassword(this.token, this.newPassword);
            this.successMessage = result?.message || 'Contrasena actualizada correctamente.';
            this.newPassword = '';
            this.confirmPassword = '';

            setTimeout(() => {
                this.router.navigate(['/login']);
            }, 1800);
        } catch (error: any) {
            this.errorMessage = error?.message || 'No se pudo restablecer la contrasena.';
        } finally {
            this.loading = false;
        }
    }

    navigateToLogin(): void {
        this.router.navigate(['/login']);
    }
}

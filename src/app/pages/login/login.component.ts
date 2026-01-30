import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent {
    email = '';
    password = '';
    loading = false;
    errorMessage = '';

    constructor(
        private authService: AuthService,
        private router: Router
    ) { }

    onSubmit(): void {
        this.loading = true;
        this.errorMessage = '';
        console.log('LoginComponent: Submitting login form...');

        this.authService.login(this.email, this.password).subscribe({
            next: (user: User) => {
                console.log('LoginComponent: Login successful, navigating to dashboard...', user);
                this.router.navigate(['/dashboard']).then(success => {
                    console.log('LoginComponent: Navigation result:', success);
                    if (!success) {
                        console.error('LoginComponent: Navigation failed!');
                        this.errorMessage = 'Error al navegar al dashboard';
                    }
                });
            },
            error: (error) => {
                console.error('LoginComponent: Login error:', error);
                this.errorMessage = error.message || 'Error al iniciar sesión';
                this.loading = false;
            },
            complete: () => {
                console.log('LoginComponent: Login observable completed');
                this.loading = false;
            }
        });
    }

    fillDemoAdmin(): void {
        this.email = 'admin@vira.com';
        this.password = 'admin123';
    }

    fillDemoUser(): void {
        this.email = 'user@vira.com';
        this.password = 'user123';
    }
}

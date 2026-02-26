import { Component, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnDestroy {
    email = '';
    password = '';
    loading = false;
    errorMessage = '';
    private authSubscription: Subscription;

    constructor(
        private authService: AuthService,
        private router: Router,
        private ngZone: NgZone,
        private cdr: ChangeDetectorRef
    ) { 
        // Redirect if already logged in
        if (this.authService.isLoggedIn()) {
            this.router.navigate(['/dashboard']);
        }

        // Listen for auth changes to auto-redirect if session is restored
        this.authSubscription = this.authService.currentUser$.subscribe(user => {
            if (user && !this.loading) { // Only redirect if not currently logging in manually (handled in onSubmit)
                // console.log('LoginComponent: User authenticated via subscription, redirecting to dashboard');
                this.ngZone.run(() => {
                    this.router.navigate(['/dashboard']).then(success => {
                        if (!success) console.warn('LoginComponent: Auto-redirect failed');
                    });
                });
            }
        });
    }

    ngOnDestroy() {
        if (this.authSubscription) {
            this.authSubscription.unsubscribe();
        }
    }

    onSubmit(): void {
        if (this.loading) return;
        
        this.loading = true;
        this.errorMessage = '';
        // console.log('LoginComponent: Submitting login form...');

        this.authService.login(this.email, this.password).subscribe({
            next: async (user: User) => {
                // console.log('LoginComponent: Login successful');
                // Explicit navigation for manual login
                this.ngZone.run(async () => {
                    try {
                        // console.log('LoginComponent: Attempting navigation to /dashboard');
                        const success = await this.router.navigate(['/dashboard']);
                        // console.log('LoginComponent: Navigation result:', success);
                        
                        if (!success) {
                            // Retry with replaceUrl if standard navigation fails
                            // console.log('LoginComponent: Retrying navigation with replaceUrl');
                            const retrySuccess = await this.router.navigate(['/dashboard'], { replaceUrl: true });
                            // console.log('LoginComponent: Retry navigation result:', retrySuccess);
                            
                            if (!retrySuccess) {
                                this.errorMessage = 'No se pudo redirigir al dashboard. Por favor recarga la página.';
                            }
                        }
                    } catch (err) {
                        console.error('LoginComponent: Navigation error:', err);
                        this.errorMessage = 'Error de navegación: ' + (err as any).message;
                    }
                });
            },
            error: (error) => {
                console.error('LoginComponent: Login error:', error);
                this.ngZone.run(() => {
                    this.errorMessage = error.message || 'Error al iniciar sesión';
                    this.loading = false;
                    this.cdr.detectChanges();
                });
            },
            complete: () => {
                // console.log('LoginComponent: Login observable completed');
                this.ngZone.run(() => {
                    this.loading = false;
                    this.cdr.detectChanges();
                });
            }
        });
    }
}

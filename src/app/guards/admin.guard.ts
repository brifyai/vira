import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isLoggedIn()) {
        router.navigate(['/login']);
        return false;
    }

    if (authService.isAdmin()) {
        return true;
    }

    // Redirect to dashboard if not admin
    router.navigate(['/dashboard']);
    return false;
};

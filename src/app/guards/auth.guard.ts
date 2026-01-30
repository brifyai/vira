import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.waitForAuth().pipe(
        map(() => {
            if (authService.isLoggedIn()) {
                return true;
            }
            router.navigate(['/login']);
            return false;
        })
    );
};

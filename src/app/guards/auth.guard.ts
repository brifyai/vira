import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // console.log('AuthGuard: Checking access for', state.url);

    return authService.waitForAuth().pipe(
        map(() => {
            const loggedIn = authService.isLoggedIn();
            // console.log('AuthGuard: Auth ready. User logged in?', loggedIn);
            
            if (loggedIn) {
                return true;
            }
            
            console.warn('AuthGuard: User not logged in, redirecting to login');
            router.navigate(['/login']);
            return false;
        })
    );
};

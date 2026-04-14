import { Injectable, inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

export const roleGuard: CanActivateFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const router = inject(Router);
  const supabaseService = inject(SupabaseService);

  try {
    const user = await supabaseService.getCurrentUser();
    if (!user) {
      router.navigate(['/login']);
      return false;
    }

    // Get user profile to check role
    const profile = await supabaseService.getUserProfile(user.id);
    const userRole = profile?.role || 'user'; // Default to user if not found

    const expectedRoles = route.data['roles'] as Array<string>;

    if (expectedRoles && expectedRoles.length > 0) {
      if (expectedRoles.includes(userRole)) {
        return true;
      } else {
        // Redirect to unauthorized or home if role doesn't match
        console.warn(`User role ${userRole} not authorized for path ${state.url}. Expected: ${expectedRoles.join(', ')}`);
        router.navigate(['/dashboard']); 
        return false;
      }
    }

    return true; // No specific roles required
  } catch (error) {
    console.error('Role guard error:', error);
    router.navigate(['/login']);
    return false;
  }
};

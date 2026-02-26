import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { map, switchMap, tap, filter, take } from 'rxjs/operators';

export interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    avatar?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private currentUserSubject = new BehaviorSubject<User | null>(null);
    public currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();
    private authInitialized = new BehaviorSubject<boolean>(false);

    constructor(private supabaseService: SupabaseService) {
        this.initializeAuth();
    }

    private async initializeAuth() {
        try {
            const { data: { session } } = await this.supabaseService.getClient().auth.getSession();
            if (session?.user) {
                // Set basic user immediately to prevent app blocking or redirect to login
                const initialUser: User = {
                    id: session.user.id,
                    email: session.user.email || '',
                    name: session.user.email || 'User',
                    role: 'user',
                    avatar: `https://ui-avatars.com/api/?name=${session.user.email}&background=random`
                };
                this.currentUserSubject.next(initialUser);

                // Update profile with timeout to prevent app hanging
                try {
                    await Promise.race([
                        this.updateCurrentUser(session.user.id, session.user.email),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout initializing profile')), 5000))
                    ]);
                } catch (e) {
                    console.warn('Auth initialization profile update timed out or failed', e);
                }
            }
        } catch (error) {
            console.error('Error initializing auth:', error);
        } finally {
            this.authInitialized.next(true);
        }

        this.supabaseService.getClient().auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                // For SIGNED_IN event, we might want to update profile too
                // Check if we already have a user (to avoid double update if login flow handled it)
                if (!this.currentUserSubject.value || this.currentUserSubject.value.id !== session.user.id) {
                     await this.updateCurrentUser(session.user.id, session.user.email);
                }
            } else if (event === 'SIGNED_OUT') {
                this.currentUserSubject.next(null);
            }
        });
    }

    waitForAuth(): Observable<boolean> {
        return this.authInitialized.pipe(
            filter(initialized => initialized),
            take(1),
            map(() => true)
        );
    }

    private async updateCurrentUser(userId: string, email?: string) {
        try {
            const profile = await this.supabaseService.getUserProfile(userId);
            const user: User = {
                id: userId,
                email: email || '',
                name: profile?.full_name || email || 'User',
                role: profile?.role || 'user',
                avatar: profile?.avatar_url || `https://ui-avatars.com/api/?name=${email}&background=random`
            };
            this.currentUserSubject.next(user);
        } catch (error) {
            console.error('Error fetching user profile', error);
            // Fallback if profile fails (e.g. RLS blocks it before role is set?)
            const user: User = {
                id: userId,
                email: email || '',
                name: email || 'User',
                role: 'user', // Default
                avatar: `https://ui-avatars.com/api/?name=${email}&background=random`
            };
            this.currentUserSubject.next(user);
        }
    }

    login(email: string, password: string): Observable<User> {
        // console.log('AuthService: Login attempt for', email);
        
        // Create a timeout promise that rejects after 15 seconds
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('La conexión ha tardado demasiado. Por favor verifica tu internet e intenta nuevamente.')), 15000)
        );

        // Login promise
        const loginPromise = this.supabaseService.getClient().auth.signInWithPassword({ email, password });

        // Use Promise.race to enforce timeout
        return from(Promise.race([loginPromise, timeoutPromise]) as Promise<any>).pipe(
            tap(response => {
                if (response && response.error) {
                    console.error('AuthService: Login error', response.error);
                }
            }),
            switchMap(async (response: any) => {
                const { data, error } = response;
                
                if (error) throw error;
                if (!data?.user) throw new Error('No se recibió información del usuario');
                
                // console.log('AuthService: Login successful, emitting initial user immediately...');
                
                // FORCE AUTH INITIALIZED: We have a valid session now, so we are initialized.
                // This unblocks AuthGuard if initializeAuth() was somehow stuck.
                this.authInitialized.next(true);

                // 1. Create and emit initial user immediately to unblock UI
                const initialUser: User = {
                    id: data.user.id,
                    email: data.user.email || '',
                    name: data.user.email || 'User',
                    role: 'user', // Default role, will be updated later
                    avatar: `https://ui-avatars.com/api/?name=${data.user.email}&background=random`
                };
                
                this.currentUserSubject.next(initialUser);

                // 2. Update profile in background (fire and forget)
                // This ensures we don't block the login flow waiting for the profile
                this.updateCurrentUser(data.user.id, data.user.email).catch(err => {
                    console.warn('AuthService: Background profile update failed:', err);
                });
                
                return initialUser;
            })
        );
    }

    async logout(): Promise<void> {
        try {
            await this.supabaseService.getClient().auth.signOut();
        } catch (error) {
            console.error('Error signing out from Supabase:', error);
        } finally {
            this.currentUserSubject.next(null);
        }
    }

    getCurrentUser(): User | null {
        return this.currentUserSubject.value;
    }

    isLoggedIn(): boolean {
        return this.currentUserSubject.value !== null;
    }

    isAdmin(): boolean {
        const role = this.currentUserSubject.value?.role;
        return role === 'admin' || role === 'super_admin';
    }
    
    isSuperAdmin(): boolean {
        return this.currentUserSubject.value?.role === 'super_admin';
    }

    hasRole(role: string): boolean {
        return this.currentUserSubject.value?.role === role;
    }
}

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
                await this.updateCurrentUser(session.user.id, session.user.email);
            }
        } catch (error) {
            console.error('Error initializing auth:', error);
        } finally {
            this.authInitialized.next(true);
        }

        this.supabaseService.getClient().auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                await this.updateCurrentUser(session.user.id, session.user.email);
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
        console.log('AuthService: Login attempt for', email);
        return from(this.supabaseService.getClient().auth.signInWithPassword({ email, password })).pipe(
            tap(response => console.log('AuthService: Supabase signIn response', { 
                hasUser: !!response.data.user, 
                hasError: !!response.error,
                error: response.error 
            })),
            switchMap(async ({ data, error }) => {
                if (error) {
                    console.error('AuthService: Login failed', error);
                    throw error;
                }
                if (!data.user) {
                    console.error('AuthService: No user returned from Supabase');
                    throw new Error('No user returned');
                }
                
                console.log('AuthService: Login successful, updating user profile for', data.user.id);
                try {
                    await this.updateCurrentUser(data.user.id, data.user.email);
                    console.log('AuthService: User profile updated');
                } catch (updateError) {
                    console.error('AuthService: Error updating user profile', updateError);
                    // Continue even if profile update fails, we have the auth user
                }
                
                const currentUser = this.currentUserSubject.value;
                if (!currentUser) {
                    console.warn('AuthService: Current user is null after update, forcing fallback');
                    // Force a fallback if somehow updateCurrentUser didn't set it
                    const fallbackUser: User = {
                        id: data.user.id,
                        email: data.user.email || '',
                        name: data.user.email || 'User',
                        role: 'user',
                        avatar: `https://ui-avatars.com/api/?name=${data.user.email}&background=random`
                    };
                    this.currentUserSubject.next(fallbackUser);
                    return fallbackUser;
                }
                
                return currentUser;
            })
        );
    }

    async logout(): Promise<void> {
        await this.supabaseService.getClient().auth.signOut();
        this.currentUserSubject.next(null);
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

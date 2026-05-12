import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService, AudioQuotaSummary } from './supabase.service';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class QuotaService {
    private readonly currentSummarySubject = new BehaviorSubject<AudioQuotaSummary | null>(null);
    readonly currentSummary$: Observable<AudioQuotaSummary | null> = this.currentSummarySubject.asObservable();

    constructor(
        private supabaseService: SupabaseService,
        private authService: AuthService
    ) {
        this.authService.currentUser$.subscribe(user => {
            if (!user?.id) {
                this.currentSummarySubject.next(null);
                return;
            }

            this.refreshCurrentSummary().catch(error => {
                console.warn('Error refreshing quota summary after auth change:', error);
            });
        });
    }

    get currentSummary(): AudioQuotaSummary | null {
        return this.currentSummarySubject.value;
    }

    setCurrentSummary(summary: AudioQuotaSummary | null): void {
        this.currentSummarySubject.next(summary);
    }

    async refreshCurrentSummary(): Promise<AudioQuotaSummary | null> {
        const currentUser = this.authService.getCurrentUser();
        const authUser = currentUser?.id ? null : await this.supabaseService.getCurrentUser().catch(() => null);
        const userId = currentUser?.id || authUser?.id;

        if (!userId) {
            this.currentSummarySubject.next(null);
            return null;
        }

        const summary = await this.supabaseService.getAudioQuotaSummary(userId);
        this.currentSummarySubject.next(summary);
        return summary;
    }
}

import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';

@Component({
    selector: 'app-welcome',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './welcome.component.html',
    styleUrls: ['./welcome.component.scss']
})
export class WelcomeComponent implements OnInit {
    private authService = inject(AuthService);
    private router = inject(Router);
    private supabaseService = inject(SupabaseService);

    sourcesCount = 0;
    sourcesCountLoaded = false;
    readonly audioExampleSrc = './ejemplo/Ejemplo.wav';
    audioError = false;

    get sourcesCountHuman(): string {
        return this.sourcesCountLoaded ? String(this.sourcesCount) : '...';
    }

    ngOnInit(): void {
        this.authService.waitForAuth().subscribe(() => {
            if (this.authService.isLoggedIn()) {
                this.router.navigate(['/dashboard']);
            }
        });

        this.loadSourcesCount();
    }

    private async loadSourcesCount(): Promise<void> {
        try {
            const rpcCount = await this.supabaseService.safeFetch<number | null>(
                async () => {
                    const { data, error } = await this.supabaseService.getClient().rpc('get_news_sources_count');
                    if (error) throw error;
                    return typeof data === 'number' ? data : null;
                },
                1,
                6000
            );

            if (typeof rpcCount === 'number') {
                this.sourcesCount = rpcCount;
                return;
            }

            const count = await this.supabaseService.safeFetch<number | null>(
                async () => {
                    const { count, error } = await this.supabaseService
                        .getClient()
                        .from('news_sources')
                        .select('*', { count: 'exact', head: true })
                        .eq('is_active', true);

                    if (error) throw error;
                    return count ?? null;
                },
                1,
                6000
            );

            if (typeof count === 'number') {
                this.sourcesCount = count;
                return;
            }

            const sources = await this.supabaseService.safeFetch(
                () => this.supabaseService.getNewsSources(),
                0,
                6000
            );
            this.sourcesCount = sources ? sources.filter(s => s?.is_active !== false).length : 0;
        } finally {
            this.sourcesCountLoaded = true;
        }
    }
}

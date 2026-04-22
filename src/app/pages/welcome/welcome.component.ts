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
    readonly audioExampleSrc = 'ejemplo/Ejemplo.wav';

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
        const count = await this.supabaseService.safeFetch<number | null>(
            async () => {
                const { count, error } = await this.supabaseService
                    .getClient()
                    .from('news_sources')
                    .select('*', { count: 'exact', head: true });

                if (error) throw error;
                return count ?? null;
            },
            1,
            8000
        );

        if (typeof count === 'number') {
            this.sourcesCount = count;
            this.sourcesCountLoaded = true;
            return;
        }

        const sources = await this.supabaseService.safeFetch(() => this.supabaseService.getNewsSources(), 1, 8000);
        this.sourcesCount = sources ? sources.length : 0;
        this.sourcesCountLoaded = true;
    }
}

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../../services/supabase.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-radio-details',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './radio-details.component.html',
  styleUrls: ['./radio-details.component.scss']
})
export class RadioDetailsComponent implements OnInit {
  radio: any = null;
  broadcasts: any[] = [];
  loading = true;
  loadingBroadcasts = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit(): Promise<void> {
    const radioId = this.route.snapshot.paramMap.get('id');
    if (radioId) {
      await this.loadRadioDetails(radioId);
      await this.loadBroadcasts(radioId);
    } else {
      this.router.navigate(['/radios']);
    }
  }

  async loadRadioDetails(id: string): Promise<void> {
    try {
      this.radio = await this.supabaseService.getRadioById(id);
    } catch (error) {
      console.error('Error loading radio details:', error);
      this.showSnackBar('Error al cargar los detalles de la radio', 'error-snackbar');
      this.router.navigate(['/radios']);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async loadBroadcasts(radioId: string): Promise<void> {
    this.loadingBroadcasts = true;
    try {
      this.broadcasts = await this.supabaseService.getNewsBroadcasts({
        radioId: radioId,
        limit: 50 // Load reasonable amount
      }) || [];
    } catch (error) {
      console.error('Error loading broadcasts:', error);
      this.showSnackBar('Error al cargar los noticieros', 'error-snackbar');
    } finally {
      this.loadingBroadcasts = false;
      this.cdr.detectChanges();
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'draft': 'Borrador',
      'published': 'Publicado',
      'archived': 'Archivado'
    };
    return labels[status] || status;
  }

  private showSnackBar(message: string, panelClass: string = ''): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: panelClass ? [panelClass] : undefined
    });
  }
}

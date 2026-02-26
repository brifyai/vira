import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { SupabaseService } from '../../services/supabase.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-mis-noticieros',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatMenuModule, MatButtonModule],
  templateUrl: './mis-noticieros.component.html',
  styleUrls: ['./mis-noticieros.component.scss']
})
export class MisNoticierosComponent implements OnInit {
  broadcasts: any[] = [];
  loading = false;

  constructor(
    private supabaseService: SupabaseService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadBroadcasts();
  }

  async loadBroadcasts() {
    this.loading = true;
    try {
      // Load news broadcasts (projects)
      const newsBroadcasts = await this.supabaseService.getNewsBroadcasts();
      
      // Fetch generated audio for each broadcast
      this.broadcasts = await Promise.all(newsBroadcasts.map(async (b: any) => {
        const generated = await this.supabaseService.getGeneratedBroadcasts({ broadcastId: b.id, limit: 1 });
        return {
          ...b,
          audio_url: generated && generated.length > 0 ? generated[0].audio_url : null,
          generated_id: generated && generated.length > 0 ? generated[0].id : null
        };
      }));
    } catch (error) {
      console.error('Error loading broadcasts:', error);
      this.snackBar.open('Error al cargar mis noticieros', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  formatDuration(seconds: number): string {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString();
  }

  async deleteBroadcast(id: string) {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: "Se eliminará el noticiero y todos sus archivos asociados.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
      await this.supabaseService.deleteNewsBroadcast(id);
      this.broadcasts = this.broadcasts.filter(b => b.id !== id);
      Swal.fire('Eliminado!', 'El noticiero ha sido eliminado.', 'success');
    } catch (error) {
      console.error('Error deleting broadcast:', error);
      Swal.fire('Error', 'No se pudo eliminar el noticiero', 'error');
    }
  }
}

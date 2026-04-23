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
  private deletingIds = new Set<string>();

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
      const newsBroadcasts = await this.supabaseService.safeFetch(
        () => this.supabaseService.getNewsBroadcasts(),
        3, // 3 retries
        15000 // 15s timeout
      ) || [];
      
      // Fetch generated audio for each broadcast
      this.broadcasts = await Promise.all(newsBroadcasts.map(async (b: any) => {
        const generated = await this.supabaseService.getGeneratedBroadcasts({ broadcastId: b.id, limit: 1 });
        return {
          ...b,
          audio_url: generated && generated.length > 0 ? generated[0].audio_url : null,
          generated_id: generated && generated.length > 0 ? generated[0].id : null,
          generated_duration_seconds: generated && generated.length > 0 ? Number(generated[0].duration_seconds || 0) : 0
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
    if (!id || this.deletingIds.has(id)) return;

    const scrollY = window.scrollY;

    const result = await Swal.fire({
      title: '¿Eliminar?',
      text: 'Esta acción no se puede revertir. Se eliminará el noticiero y su timeline.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#8833ff',
      cancelButtonColor: '#2a2d44',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      background: '#141628',
      color: '#e8e8ff',
      heightAuto: false,
      returnFocus: false,
      focusConfirm: false
    }).finally(() => {
      window.scrollTo({ top: scrollY });
    });

    if (!result.isConfirmed) return;

    this.deletingIds.add(id);
    this.cdr.detectChanges();

    Swal.fire({
      title: 'Eliminando...',
      text: 'Por favor espera mientras se elimina el noticiero y su timeline.',
      allowOutsideClick: false,
      background: '#141628',
      color: '#e8e8ff',
      heightAuto: false,
      returnFocus: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      await this.supabaseService.deleteNewsBroadcast(id);
      this.broadcasts = this.broadcasts.filter(b => b.id !== id);
      this.cdr.detectChanges();
      await Swal.fire({
        title: 'Eliminado',
        text: 'El noticiero fue eliminado correctamente.',
        icon: 'success',
        confirmButtonColor: '#8833ff',
        background: '#141628',
        color: '#e8e8ff',
        heightAuto: false,
        returnFocus: false,
        focusConfirm: false
      });
      await this.loadBroadcasts();
    } catch (error) {
      console.error('Error deleting broadcast:', error);
      await Swal.fire({
        title: 'Error',
        text: 'No se pudo eliminar el noticiero. Intenta nuevamente.',
        icon: 'error',
        confirmButtonColor: '#8833ff',
        background: '#141628',
        color: '#e8e8ff',
        heightAuto: false,
        returnFocus: false,
        focusConfirm: false
      });
    }
    finally {
      this.deletingIds.delete(id);
      this.cdr.detectChanges();
    }
  }
}

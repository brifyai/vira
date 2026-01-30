import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-mis-noticieros',
  standalone: true,
  imports: [CommonModule],
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
      this.broadcasts = await this.supabaseService.getGeneratedBroadcasts();
      console.log('Broadcasts loaded:', this.broadcasts);
    } catch (error) {
      console.error('Error loading broadcasts:', error);
      this.snackBar.open('Error al cargar mis noticieros', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  async deleteBroadcast(id: string) {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: "No podrás revertir esto",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
      await this.supabaseService.deleteGeneratedBroadcast(id);
      this.broadcasts = this.broadcasts.filter(b => b.id !== id);
      Swal.fire('Eliminado!', 'El noticiero ha sido eliminado.', 'success');
    } catch (error) {
      console.error('Error deleting broadcast:', error);
      Swal.fire('Error', 'No se pudo eliminar el noticiero', 'error');
    }
  }
}

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, AudioQuotaSummary } from '../../services/supabase.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { QuotaService } from '../../services/quota.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSnackBarModule],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
  users: any[] = [];
  loading = true;
  currentUserRole: string = 'user';
  currentUserName = '';
  creatingUser = false;

  // Modal states
  showCreateUserModal = false;
  quotaInputs: Record<string, number> = {};
  quotaSummaries: Record<string, AudioQuotaSummary> = {};
  savingQuotaUserId = '';
  
  newUser = {
    email: '',
    fullName: '',
    role: 'user',
    quotaMinutes: 0
  };

  constructor(
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private quotaService: QuotaService
  ) {}

  async ngOnInit() {
    await this.checkUserRole();
    await this.loadData();
  }
  
  openCreateUserModal() {
    if (this.currentUserRole !== 'super_admin') return;
    this.newUser = { email: '', fullName: '', role: 'user', quotaMinutes: 0 };
    this.showCreateUserModal = true;
  }

  closeCreateUserModal() {
    this.showCreateUserModal = false;
  }

  async createUser() {
    if (this.currentUserRole !== 'super_admin') return;
    const email = String(this.newUser.email || '').trim().toLowerCase();
    const fullName = String(this.newUser.fullName || '').trim();

    if (!email) {
      this.showSnackBar('El email es requerido', 'error-snackbar');
      return;
    }

    this.creatingUser = true;

    try {
      const generatedPassword = this.supabaseService.generateSecurePassword();

      const createdUser = await this.supabaseService.createUser({
        email,
        password: generatedPassword,
        role: this.newUser.role,
        fullName
      });

      if (createdUser?.id && this.newUser.role !== 'super_admin') {
        await this.supabaseService.setUserAudioQuota(createdUser.id, Number(this.newUser.quotaMinutes || 0));
      }

      const mailResult = await this.supabaseService.sendWelcomeEmail({
        recipientEmail: email,
        recipientName: fullName,
        profileType: this.newUser.role === 'admin' ? 'admin' : 'user',
        createdByRole: this.currentUserRole,
        createdByName: this.currentUserName
      });

      if (mailResult?.success) {
        this.showSnackBar('Usuario creado y enlace de acceso enviado', 'success-snackbar');
      } else {
        this.showSnackBar(
          `Usuario creado, pero el enlace de acceso falló: ${mailResult?.error || 'Error desconocido.'}`,
          'error-snackbar'
        );
      }

      this.closeCreateUserModal();
      await this.loadData();
    } catch (error: any) {
      console.error('Error creating user:', error);
      this.showSnackBar(error.message || 'Error al crear usuario', 'error-snackbar');
    } finally {
      this.creatingUser = false;
    }
  }

  async checkUserRole() {
    const user = await this.supabaseService.getCurrentUser();
    if (user) {
      const profile = await this.supabaseService.getUserProfile(user.id);
      this.currentUserRole = profile?.role || 'user';
      this.currentUserName = profile?.full_name || user.email || '';
    }
  }

  async loadData() {
    this.loading = true;
    try {
      this.users = await this.supabaseService.getUsers() || [];
      await this.loadQuotaSummaries();
    } catch (error) {
      console.error('Error loading data:', error);
      this.showSnackBar('Error al cargar datos', 'error-snackbar');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async updateUserRole(user: any, newRole: string) {
    if (this.currentUserRole !== 'super_admin') return;
    if (user?.role === 'super_admin') {
      this.showSnackBar('El rol Super Admin no se puede editar desde esta vista', 'error-snackbar');
      return;
    }
    if (user.role === newRole) return;
    
    try {
      await this.supabaseService.updateUserRole(user.id, newRole);
      user.role = newRole;
      this.showSnackBar('Rol actualizado correctamente', 'success-snackbar');
    } catch (error) {
      console.error('Error updating role:', error);
      this.showSnackBar('Error al actualizar rol', 'error-snackbar');
      // Revert change in UI if needed, but since we bind to model, tricky.
      // Better reload data
      await this.loadData();
    }
  }

  async saveQuota(user: any) {
    if (!user?.id || this.currentUserRole !== 'super_admin') return;

    this.savingQuotaUserId = user.id;
    try {
      await this.supabaseService.setUserAudioQuota(user.id, this.quotaInputs[user.id] ?? 0);
      await this.loadQuotaSummaries();
      await this.quotaService.refreshCurrentSummary();
      this.showSnackBar('Cuota actualizada correctamente', 'success-snackbar');
    } catch (error: any) {
      console.error('Error updating quota:', error);
      this.showSnackBar(error?.message || 'Error al actualizar la cuota', 'error-snackbar');
    } finally {
      this.savingQuotaUserId = '';
      this.cdr.detectChanges();
    }
  }

  getQuotaSummary(userId: string): AudioQuotaSummary | null {
    return this.quotaSummaries[userId] || null;
  }

  isSavingQuota(userId: string): boolean {
    return this.savingQuotaUserId === userId;
  }

  canEditRole(user: any): boolean {
    return this.currentUserRole === 'super_admin' && user?.role !== 'super_admin';
  }

  private async loadQuotaSummaries() {
    const entries = await Promise.all((this.users || []).map(async (user: any) => {
      try {
        const summary = await this.supabaseService.getAudioQuotaSummary(user.id);
        return [user.id, summary] as const;
      } catch (error) {
        console.warn(`Error loading quota summary for ${user?.id}`, error);
        return [user.id, null] as const;
      }
    }));

    this.quotaSummaries = {};
    this.quotaInputs = {};

    for (const [userId, summary] of entries) {
      if (!summary) continue;
      this.quotaSummaries[userId] = summary;
      this.quotaInputs[userId] = summary.quota_total_minutes;
    }
  }

  showSnackBar(message: string, panelClass: string = '') {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: panelClass ? [panelClass] : undefined
    });
  }
}

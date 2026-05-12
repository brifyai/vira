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
  radios: any[] = [];
  loading = true;
  currentUserRole: string = 'user';
  currentUserName = '';
  creatingUser = false;

  // Modal states
  showRadioModal = false;
  showCreateUserModal = false;
  selectedUser: any = null;
  userRadios: any[] = []; // Radios assigned to selected user
  availableRadios: any[] = []; // Radios NOT assigned to selected user
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
      this.radios = await this.supabaseService.getRadios() || [];
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

  async openRadioModal(user: any) {
    this.selectedUser = user;
    this.showRadioModal = true;
    await this.loadUserRadios(user.id);
  }

  closeRadioModal() {
    this.showRadioModal = false;
    this.selectedUser = null;
    this.userRadios = [];
    this.availableRadios = [];
  }

  async loadUserRadios(userId: string) {
    try {
      const assignments = await this.supabaseService.getUserRadios(userId) || [];
      // Handle case where assignment.radio might be null if radio was deleted but assignment wasn't cascade deleted properly?
      // But FK has ON DELETE CASCADE so should be fine.
      this.userRadios = assignments.map((a: any) => a.radio).filter((r: any) => r);
      
      // Filter available radios
      const assignedIds = new Set(this.userRadios.map(r => r.id));
      this.availableRadios = this.radios.filter(r => !assignedIds.has(r.id));
      
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error loading user radios:', error);
      this.showSnackBar('Error al cargar radios del usuario', 'error-snackbar');
    }
  }

  async assignRadio(radio: any) {
    if (!this.selectedUser) return;
    try {
      await this.supabaseService.assignRadioToUser(this.selectedUser.id, radio.id);
      await this.loadUserRadios(this.selectedUser.id);
      this.showSnackBar('Radio asignada', 'success-snackbar');
    } catch (error) {
      console.error('Error assigning radio:', error);
      this.showSnackBar('Error al asignar radio', 'error-snackbar');
    }
  }

  async removeRadio(radio: any) {
    if (!this.selectedUser) return;
    try {
      await this.supabaseService.removeRadioFromUser(this.selectedUser.id, radio.id);
      await this.loadUserRadios(this.selectedUser.id);
      this.showSnackBar('Radio removida', 'success-snackbar');
    } catch (error) {
      console.error('Error removing radio:', error);
      this.showSnackBar('Error al remover radio', 'error-snackbar');
    }
  }

  showSnackBar(message: string, panelClass: string = '') {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: panelClass ? [panelClass] : undefined
    });
  }
}

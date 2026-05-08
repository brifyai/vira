import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

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
  
  newUser = {
    email: '',
    fullName: '',
    role: 'user'
  };

  constructor(
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit() {
    await this.checkUserRole();
    await this.loadData();
  }
  
  openCreateUserModal() {
    if (this.currentUserRole !== 'super_admin') return;
    this.newUser = { email: '', fullName: '', role: 'user' };
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

      await this.supabaseService.createUser({
        email,
        password: generatedPassword,
        role: this.newUser.role,
        fullName
      });

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

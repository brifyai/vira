import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: '/login',
        pathMatch: 'full'
    },
    {
        path: 'login',
        loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
    },
    {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
        canActivate: [authGuard]
    },
    {
        path: 'crear-noticiario',
        loadComponent: () => import('./pages/crear-noticiario/crear-noticiario.component').then(m => m.CrearNoticiarioComponent),
        canActivate: [authGuard]
    },
    {
        path: 'ultimo-minuto',
        loadComponent: () => import('./pages/ultimo-minuto/ultimo-minuto.component').then(m => m.UltimoMinutoComponent),
        canActivate: [authGuard]
    },
    {
        path: 'timeline-noticiario',
        loadComponent: () => import('./pages/timeline-noticiario/timeline-noticiario.component').then(m => m.TimelineNoticiarioComponent),
        canActivate: [authGuard]
    },
    {
        path: 'timeline-noticiario/:id',
        loadComponent: () => import('./pages/timeline-noticiario/timeline-noticiario.component').then(m => m.TimelineNoticiarioComponent),
        canActivate: [authGuard]
    },
    {
        path: 'mis-noticieros',
        loadComponent: () => import('./pages/mis-noticieros/mis-noticieros.component').then(m => m.MisNoticierosComponent),
        canActivate: [authGuard]
    },
    {
        path: 'automatizacion-activos',
        loadComponent: () => import('./pages/automatizacion-activos/automatizacion-activos.component').then(m => m.AutomatizacionActivosComponent),
        canActivate: [authGuard]
    },
    {
        path: 'fuentes',
        loadComponent: () => import('./pages/fuentes/fuentes.component').then(m => m.FuentesComponent),
        canActivate: [authGuard, roleGuard],
        data: { roles: ['super_admin'] }
    },
    {
        path: 'recursos',
        loadComponent: () => import('./pages/recursos/recursos.component').then(m => m.RecursosComponent),
        canActivate: [authGuard, roleGuard],
        data: { roles: ['admin', 'super_admin'] }
    },
    {
        path: 'radios',
        loadComponent: () => import('./pages/radios/radios.component').then(m => m.RadiosComponent),
        canActivate: [authGuard]
    },
    {
        path: 'radios/:id',
        loadComponent: () => import('./pages/radios/radio-details/radio-details.component').then(m => m.RadioDetailsComponent),
        canActivate: [authGuard]
    },
    {
        path: 'usuarios',
        loadComponent: () => import('./pages/users/users.component').then(m => m.UsersComponent),
        canActivate: [authGuard, roleGuard],
        data: { roles: ['admin', 'super_admin'] }
    }
];

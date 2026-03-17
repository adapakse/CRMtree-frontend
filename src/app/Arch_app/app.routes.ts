import { Routes } from '@angular/router';
import { authGuard, adminGuard, crmGuard } from './core/auth/guards';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./pages/login/callback.component').then(m => m.CallbackComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'documents',
        loadComponent: () => import('./pages/documents/list/documents-list.component').then(m => m.DocumentsListComponent),
      },
      {
        path: 'workflow',
        loadComponent: () => import('./pages/workflow/workflow.component').then(m => m.WorkflowComponent),
      },
      {
        path: 'groups',
        loadComponent: () => import('./pages/groups/groups.component').then(m => m.GroupsComponent),
      },
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/users/users.component').then(m => m.UsersComponent),
      },
      {
        path: 'logs',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/logs/logs.component').then(m => m.LogsComponent),
      },
      {
        path: 'admin/settings',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/settings/settings.component').then(m => m.SettingsComponent),
      },

      // ── CRM ──────────────────────────────────────────────────────────────
      {
        path: 'crm/leads',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/leads/crm-leads-list.component').then(m => m.CrmLeadsListComponent),
      },
      {
        path: 'crm/leads/:id',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/leads/crm-lead-detail.component').then(m => m.CrmLeadDetailComponent),
      },
      {
        path: 'crm/reports',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/reports/crm-reports.component').then(m => m.CrmReportsComponent),
      },
      {
        path: 'crm/import',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/import/crm-import.component').then(m => m.CrmImportComponent),
      },
      {
        path: 'crm/partners',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/partners/crm-partner-detail.component').then(m => m.CrmPartnerDetailComponent),
      },
      // ─────────────────────────────────────────────────────────────────────
    ],
  },
  { path: '**', redirectTo: '/dashboard' },
];

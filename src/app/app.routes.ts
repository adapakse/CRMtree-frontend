import { Routes } from '@angular/router';
import { authGuard, adminGuard, crmGuard, adminOrSalesManagerGuard, superAdminGuard } from './core/auth/guards';

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
    path: 'change-password',
    loadComponent: () => import('./pages/login/change-password.component').then(m => m.ChangePasswordComponent),
  },
  {
    path: 'crm/gmail/callback',
    loadComponent: () => import('./pages/crm/gmail-callback/gmail-callback.component').then(m => m.GmailCallbackComponent),
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
        path: 'my-settings',
        loadComponent: () => import('./pages/my-settings/my-settings.component').then(m => m.MySettingsComponent),
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
        canActivate: [adminOrSalesManagerGuard],
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
      {
        path: 'admin/data',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/data-management/data-management.component').then(m => m.DataManagementComponent),
      },
      {
        path: 'admin/tenants',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./pages/admin/tenants/tenants.component').then(m => m.TenantsComponent),
      },

      // ── CRM ──────────────────────────────────────────────────────────────
      {
        path: 'crm/dashboard',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/sales-dashboard/crm-sales-dashboard.component').then(m => m.CrmSalesDashboardComponent),
      },
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
        path: 'crm/reports/leads',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/reports/crm-reports-leads.component').then(m => m.CrmReportsLeadsComponent),
      },
      {
        path: 'crm/reports/partners',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/reports/crm-reports-partners.component').then(m => m.CrmReportsPartnersComponent),
      },
      {
        path: 'crm/calendar',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/calendar/crm-calendar.component').then(m => m.CrmCalendarComponent),
      },
      {
        path: 'crm/import',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/crm/import/crm-import.component').then(m => m.CrmImportComponent),
      },
      {
        path: 'crm/partners',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/partners/crm-partners-list.component').then(m => m.CrmPartnersListComponent),
      },
      {
        path: 'crm/partners/:id',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/partners/crm-partner-detail.component').then(m => m.CrmPartnerDetailComponent),
      },
      {
        path: 'crm/partner-groups',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/groups/crm-groups.component').then(m => m.CrmGroupsComponent),
      },
      {
        path: 'crm/onboarding',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/onboarding/crm-onboarding.component').then(m => m.CrmOnboardingComponent),
      },
      // ─────────────────────────────────────────────────────────────────────
    ],
  },
  { path: '**', redirectTo: '/dashboard' },
];

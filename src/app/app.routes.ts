import { Routes } from '@angular/router';
import { authGuard, adminGuard, crmGuard, adminOrSalesManagerGuard, superAdminGuard, publicRootGuard } from './core/auth/guards';

export const routes: Routes = [
  // ── Public, SSR-rendered marketing surface (Faza 0 — SEO fundament) ──────
  {
    path: '',
    loadComponent: () => import('./layout/public-layout/public-layout.component').then(m => m.PublicLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [publicRootGuard],
        loadComponent: () => import('./pages/public/home/home.component').then(m => m.HomeComponent),
      },
      {
        path: 'blog',
        loadComponent: () => import('./pages/public/blog/blog-list.component').then(m => m.BlogListComponent),
      },
      {
        path: 'blog/:slug',
        loadComponent: () => import('./pages/public/blog/blog-detail.component').then(m => m.BlogDetailComponent),
      },
      {
        path: 'polityka-prywatnosci',
        loadComponent: () => import('./pages/public/legal/privacy-policy.component').then(m => m.PrivacyPolicyComponent),
      },
      {
        path: 'regulamin',
        loadComponent: () => import('./pages/public/legal/terms.component').then(m => m.TermsComponent),
      },
    ],
  },
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
    path: 'crm/outlook/callback',
    loadComponent: () => import('./pages/crm/outlook-callback/outlook-callback.component').then(m => m.OutlookCallbackComponent),
  },
  {
    path: 'crm/zoho/callback',
    loadComponent: () => import('./pages/crm/zoho-callback/zoho-callback.component').then(m => m.ZohoCallbackComponent),
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
      {
        path: 'admin/billing',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./pages/admin/billing/billing.component').then(m => m.BillingComponent),
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
        path: 'crm/partners/analytics',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/reports/crm-partners-analytics.component').then(m => m.CrmPartnersAnalyticsComponent),
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
      {
        path: 'crm/seo',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/crm/seo/crm-seo.component').then(m => m.CrmSeoComponent),
      },
      {
        path: 'admin/prospects',
        canActivate: [crmGuard],
        loadComponent: () => import('./pages/admin/prospects/admin-prospects.component').then(m => m.AdminProspectsComponent),
      },
      {
        path: 'crm/prospects-dashboard',
        canActivate: [adminOrSalesManagerGuard],
        loadComponent: () => import('./pages/crm/dashboard/crm-prospects-dashboard.component').then(m => m.CrmProspectsDashboardComponent),
      },
      // ─────────────────────────────────────────────────────────────────────
    ],
  },
  { path: '**', redirectTo: '/dashboard' },
];

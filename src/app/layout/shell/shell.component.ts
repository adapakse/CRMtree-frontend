import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { WorkflowService } from '../../core/services/api.services';
import { initials } from '../../core/services/helpers';
import { PbxService } from '../../core/services/pbx.service';
import { SoftphoneOverlayComponent } from '../../shared/components/softphone/softphone-overlay.component';

@Component({
  selector: 'wt-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, SoftphoneOverlayComponent, TranslocoDirective],
  providers: [provideTranslocoScope('shell')],
  template: `
    <div class="app-wrap" *transloco="let t; prefix: 'shell'">

      <!-- SIDEBAR -->
      <nav id="sidebar" [class.collapsed]="collapsed">

        <div class="s-head">
          <button class="s-mark-btn" type="button" [disabled]="!collapsed" (click)="toggleSidebar()" [attr.title]="collapsed ? t('sidebar.expand') : null">
            <img class="s-mark" src="assets/crmtree-tree-black.png" alt="">
            <span class="s-mark-expand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="9" y1="4" x2="9" y2="20"/></svg></span>
          </button>
          <img class="s-logo-full" src="assets/crmtree-logo-reverse.png" alt="CRMtree">
          <button class="toggle-btn" type="button" (click)="toggleSidebar()" [attr.title]="t('sidebar.collapse')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="9" y1="4" x2="9" y2="20"/></svg></button>
        </div>

        <!-- Scrollable nav content -->
        <div class="s-scroll">

          @if (!isExternalUser()) {
          <div class="s-sec">
            <div class="s-lbl">{{ t('sections.documents') }}</div>

            <a class="nav-item" routerLink="/dashboard" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span class="nav-label">{{ t('nav.dashboard') }}</span>
              <span class="nav-tip">{{ t('nav.dashboard') }}</span>
            </a>

            @if (auth.hasFeature('documents')) {
              <a class="nav-item" routerLink="/documents" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
                <span class="nav-label">{{ t('nav.documents') }} @if (docBadge() > 0) { <span class="nbadge">{{ docBadge() }}</span> }</span>
                <span class="nav-tip">{{ t('nav.documents') }} @if (docBadge() > 0) { <span class="nbadge">{{ docBadge() }}</span> }</span>
              </a>
              <a class="nav-item" routerLink="/workflow" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
                <span class="nav-label">{{ t('nav.workflow') }} @if (taskBadge() > 0) { <span class="nbadge">{{ taskBadge() }}</span> }</span>
                <span class="nav-tip">{{ t('nav.workflow') }} @if (taskBadge() > 0) { <span class="nbadge">{{ taskBadge() }}</span> }</span>
              </a>
            }

            <a class="nav-item" routerLink="/groups" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span class="nav-label">{{ t('nav.groupsAndRoles') }}</span>
              <span class="nav-tip">{{ t('nav.groupsAndRoles') }}</span>
            </a>
          </div>
          }

          @if (auth.hasFeature('projects')) {
            @if (!isExternalUser()) { <div class="nav-sep"></div> }
            <div class="s-sec">
              <div class="s-lbl">{{ t('sections.projects') }}</div>
              <a class="nav-item" routerLink="/projects" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="13" y2="9"/><line x1="10" y1="13" x2="17" y2="13"/><line x1="7" y1="17" x2="12" y2="17"/></svg>
                <span class="nav-label">{{ t('nav.projects') }}</span>
                <span class="nav-tip">{{ t('nav.projects') }}</span>
              </a>
            </div>
          }

          @if (hasCrmAccess()) {
            <div class="nav-sep"></div>
            <div class="s-sec">
              <div class="s-lbl">{{ t('sections.crm') }}</div>

              <a class="nav-item" routerLink="/crm/dashboard" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span class="nav-label">{{ t('nav.dashboard') }}</span>
                <span class="nav-tip">{{ t('nav.dashboard') }}</span>
              </a>

              @if (auth.hasFeature('leads')) {
                <a class="nav-item" routerLink="/crm/leads" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <span class="nav-label">{{ t('nav.leads') }}</span>
                  <span class="nav-tip">{{ t('nav.leads') }}</span>
                </a>
                <a class="nav-item" routerLink="/crm/calendar" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span class="nav-label">{{ t('nav.activityCalendar') }}</span>
                  <span class="nav-tip">{{ t('nav.activityCalendar') }}</span>
                </a>
              }

              @if (auth.hasFeature('sales_reports')) {
                <a class="nav-item" routerLink="/crm/reports/leads" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  <span class="nav-label">{{ t('nav.salesReports') }}</span>
                  <span class="nav-tip">{{ t('nav.salesReports') }}</span>
                </a>
              }

              @if (auth.hasFeature('prospects')) {
                <a class="nav-item" routerLink="/admin/prospects" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>
                  <span class="nav-label">{{ t('nav.prospects') }}</span>
                  <span class="nav-tip">{{ t('nav.prospects') }}</span>
                </a>

                @if (isSalesManager() || auth.isAdmin()) {
                  <a class="nav-item" routerLink="/crm/prospects-dashboard" routerLinkActive="active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><circle cx="18" cy="8" r="2"/><circle cx="12" cy="2" r="2"/><circle cx="6" cy="12" r="2"/></svg>
                    <span class="nav-label">{{ t('nav.prospectsDashboard') }}</span>
                    <span class="nav-tip">{{ t('nav.prospectsDashboard') }}</span>
                  </a>
                }
              }

              @if (auth.hasFeature('call_analysis')) {
                <a class="nav-item" routerLink="/admin/call-analysis" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <span class="nav-label">{{ t('nav.callAnalysis') }}</span>
                  <span class="nav-tip">{{ t('nav.callAnalysis') }}</span>
                </a>
              }
            </div>

            @if (auth.hasFeature('partner_registry') || auth.hasFeature('onboarding') || auth.hasFeature('performance')) {
              <div class="nav-sep"></div>
              <div class="s-sec">
                <div class="s-lbl">{{ t('sections.partners') }}</div>

                @if (auth.hasFeature('onboarding')) {
                  <a class="nav-item" routerLink="/crm/onboarding" routerLinkActive="active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    <span class="nav-label">{{ t('nav.onboarding') }}</span>
                    <span class="nav-tip">{{ t('nav.onboarding') }}</span>
                  </a>
                }

                @if (auth.hasFeature('seo_bot')) {
                  <a class="nav-item" routerLink="/crm/seo" routerLinkActive="active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    <span class="nav-label">{{ t('nav.seoBot') }}</span>
                    <span class="nav-tip">{{ t('nav.seoBot') }}</span>
                  </a>
                }

                @if (auth.hasFeature('partner_registry')) {
                  <a class="nav-item" routerLink="/crm/partners" [class.active]="partnersRegistryActive()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span class="nav-label">{{ t('nav.partnerRegistry') }}</span>
                    <span class="nav-tip">{{ t('nav.partnerRegistry') }}</span>
                  </a>
                  <a class="nav-item" routerLink="/crm/partner-groups" routerLinkActive="active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
                    <span class="nav-label">{{ t('nav.partnerGroups') }}</span>
                    <span class="nav-tip">{{ t('nav.partnerGroups') }}</span>
                  </a>
                }

                @if (auth.hasFeature('performance')) {
                  <a class="nav-item" routerLink="/crm/reports/partners" routerLinkActive="active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    <span class="nav-label">{{ t('nav.performance') }}</span>
                    <span class="nav-tip">{{ t('nav.performance') }}</span>
                  </a>
                }

                @if (auth.hasFeature('dwh_integration') && (isSalesManager() || auth.isAdmin())) {
                  <a class="nav-item" routerLink="/crm/partners/analytics" routerLinkActive="active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    <span class="nav-label">{{ t('nav.partnerAnalytics') }}</span>
                    <span class="nav-tip">{{ t('nav.analyticsDashboardTip') }}</span>
                  </a>
                }

                @if (isSalesManager() && !auth.isAdmin()) {
                  <a class="nav-item" routerLink="/users" routerLinkActive="active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 1 3 3v1a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M4 22v-1a7 7 0 0 1 14 0v1"/><line x1="16" y1="11" x2="22" y2="11"/><line x1="19" y1="8" x2="19" y2="14"/></svg>
                    <span class="nav-label">{{ t('nav.budgets') }}</span>
                    <span class="nav-tip">{{ t('nav.salesBudgetsTip') }}</span>
                  </a>
                }
              </div>
            }

          }

          @if (auth.isSuperAdmin()) {
            <div class="nav-sep"></div>
            <div class="s-sec">
              <div class="s-lbl">{{ t('sections.superAdmin') }}</div>
              <a class="nav-item" routerLink="/admin/tenants" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
                <span class="nav-label">{{ t('nav.tenants') }}</span>
                <span class="nav-tip">{{ t('nav.tenantsTip') }}</span>
              </a>
              <a class="nav-item" routerLink="/admin/billing" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                <span class="nav-label">{{ t('nav.billing') }}</span>
                <span class="nav-tip">{{ t('nav.billingTip') }}</span>
              </a>
            </div>
          }

          @if (auth.isAdmin()) {
            <div class="nav-sep"></div>
            <div class="s-sec">
              <div class="s-lbl">{{ t('sections.administration') }}</div>

              <a class="nav-item" routerLink="/crm/import" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span class="nav-label">{{ t('nav.csvImport') }}</span>
                <span class="nav-tip">{{ t('nav.csvImport') }}</span>
              </a>

              <a class="nav-item" routerLink="/users" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span class="nav-label">{{ t('nav.users') }}</span>
                <span class="nav-tip">{{ t('nav.users') }}</span>
              </a>

              <a class="nav-item" routerLink="/logs" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  <span class="nav-label">{{ t('nav.auditLogs') }}</span>
                  <span class="nav-tip">{{ t('nav.auditLogs') }}</span>
                </a>

                @if (auth.hasFeature('pbx')) {
                  <a class="nav-item" routerLink="/admin/pbx" routerLinkActive="active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.07 11.5 19.79 19.79 0 0 1 1 2.18 2 2 0 0 1 3 0h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 7.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 14h1a2 2 0 0 1 2 1.92z"/></svg>
                    <span class="nav-label">{{ t('nav.pbxNumbers') }}</span>
                    <span class="nav-tip">{{ t('nav.pbxNumbers') }}</span>
                  </a>
                }

                <a class="nav-item" routerLink="/admin/settings" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  <span class="nav-label">{{ t('nav.appSettings') }}</span>
                  <span class="nav-tip">{{ t('nav.appSettings') }}</span>
                </a>

                <a class="nav-item" routerLink="/admin/data" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                  <span class="nav-label">{{ t('nav.dataManagement') }}</span>
                  <span class="nav-tip">{{ t('nav.dataManagement') }}</span>
                </a>
            </div>
          }

        </div><!-- /s-scroll -->

        <!-- User card at bottom -->
        <div class="s-bottom">
          <a class="nav-item" routerLink="/my-settings" routerLinkActive="active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span class="nav-label">{{ t('nav.mySettings') }}</span>
            <span class="nav-tip">{{ t('nav.mySettings') }}</span>
          </a>
          <div class="u-card" (click)="auth.logout()" [attr.title]="t('user.logout')">
            <span class="u-avatar">{{ initials(auth.user()?.display_name ?? '') }}</span>
            <div class="u-info">
              <div class="u-name">{{ auth.user()?.display_name }}</div>
              <div class="u-role">{{ t(auth.isAdmin() ? 'user.admin' : 'user.user') }} · {{ t('user.logout') }}</div>
            </div>
          </div>
        </div>

      </nav>

      <!-- MAIN AREA -->
      <main id="main">
        <router-outlet />
      </main>
    </div>
    <app-softphone-overlay *ngIf="auth.hasFeature('pbx')" />
  `,
  styles: [`
    /* ── Layout ─────────────────────────────────────────────────────── */
    .app-wrap { display: flex; height: calc(100vh - var(--test-banner-height, 0px)); overflow: hidden;
      /* Neutral grey a step darker than the content panel, so the panel sits in front. */
      background: #EEEEF0; }

    /* ── Sidebar: lies directly on the white frame; the grey content panel sits beside it ── */
    #sidebar {
      width: 248px;
      background: transparent;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      /* overflow MUST be visible so tooltips can escape the sidebar */
      overflow: visible;
      transition: width .22s cubic-bezier(.4,0,.2,1);
      position: relative;
      z-index: 3;
    }
    #sidebar.collapsed { width: 68px; }

    /* ── Header: app mark, name, collapse button ─────────────────────── */
    .s-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 12px 10px 14px;
      flex-shrink: 0;
    }
    .s-mark { width: 36px; height: 36px; flex-shrink: 0; object-fit: contain; transition: opacity .12s; }
    /* Expanded: the full black logo; collapsed: only its tree (the mark button). */
    .s-logo-full { height: 52px; width: auto; margin-right: auto; object-fit: contain; }
    .s-mark-btn { display: none; }
    #sidebar.collapsed .s-mark-btn { display: flex; }
    #sidebar.collapsed .s-head { justify-content: center; padding: 14px 0 10px; }
    #sidebar.collapsed .s-logo-full,
    #sidebar.collapsed .toggle-btn { display: none; }

    /* Collapsed: hovering the app mark turns it into the expand button, in the same spot. */
    .s-mark-btn { position: relative; padding: 0; border: none; background: none; border-radius: 10px; flex-shrink: 0; cursor: pointer; }
    .s-mark-expand {
      position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
      border-radius: 10px; background: rgba(24,24,27,.08); color: #18181B;
    }
    .s-mark-expand svg { width: 18px; height: 18px; }
    #sidebar.collapsed .s-mark-btn:hover .s-mark { opacity: 0; }
    #sidebar.collapsed .s-mark-btn:hover .s-mark-expand { display: flex; }

    .toggle-btn {
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      color: #7B8494;
      flex-shrink: 0;
      transition: background .15s, color .15s;
    }
    .toggle-btn:hover { background: rgba(24,24,27,.06); color: #18181B; }
    .toggle-btn svg { width: 18px; height: 18px; }

    /* ── Scrollable nav area ─────────────────────────────────────────── */
    /* This is the ONLY element that scrolls.
       overflow-x: visible lets tooltips escape horizontally. */
    .s-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: visible;
      padding-bottom: 8px;
    }
    .s-scroll::-webkit-scrollbar { width: 3px; }
    .s-scroll::-webkit-scrollbar-track { background: transparent; }
    .s-scroll::-webkit-scrollbar-thumb { background: rgba(24,24,27,.12); border-radius: 2px; }

    /* ── Sections & separators ───────────────────────────────────────── */
    .s-sec { padding: 0 10px; }
    .s-lbl {
      font-size: 12px; font-weight: 500;
      color: #7B8494;
      padding: 16px 12px 6px;
      white-space: nowrap;
      max-height: 40px; overflow: hidden;
      transition: max-height .2s, opacity .15s, padding .2s;
    }
    #sidebar.collapsed .s-lbl { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; }

    .nav-sep { height: 0; margin: 0; }
    #sidebar.collapsed .nav-sep { height: 1px; background: rgba(24,24,27,.08); margin: 8px 16px; }

    /* ── Nav items ───────────────────────────────────────────────────── */
    .nav-item {
      position: relative;          /* tooltip anchored here */
      display: flex;
      align-items: center;
      gap: 12px;
      height: 38px;
      padding: 0 12px;
      border-radius: 10px;
      cursor: pointer;
      color: #3F4654;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      margin-bottom: 2px;
      user-select: none;
      white-space: nowrap;
      transition: background .12s, color .12s, padding .22s;
    }
    .nav-item svg { width: 18px; height: 18px; flex-shrink: 0; color: #7B8494; stroke-width: 1.8; transition: color .12s; }
    .nav-item:hover { background: rgba(24,24,27,.04); color: #18181B; }
    .nav-item:hover svg { color: #3F4654; }
    /* Active item: a white pill with a soft shadow; the icon in brand green. */
    .nav-item.active { background: rgba(255,255,255,.9); color: #18181B; box-shadow: 0 0 0 1px rgba(24,24,27,.05), 0 1px 3px rgba(16,24,40,.07); }
    .nav-item.active svg { color: var(--orange); }

    /* No browser focus box after a click; a soft green ring only for keyboard focus. */
    .nav-item:focus { outline: none; }
    .nav-item:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(59,170,93,.45); }

    /* Collapsed: center the icon */
    #sidebar.collapsed .nav-item { padding: 0; justify-content: center; gap: 0; }

    /* ── Label (visible text) ────────────────────────────────────────── */
    .nav-label {
      flex: 1;
      overflow: hidden;
      transition: opacity .12s;
      display: flex; align-items: center; gap: 6px;
    }
    #sidebar.collapsed .nav-label { opacity: 0; flex: 0; width: 0; overflow: hidden; }

    /* ── Badge ───────────────────────────────────────────────────────── */
    .nbadge {
      margin-left: auto;
      background: var(--orange); color: #FFFFFF;
      font-size: 11px; font-weight: 600;
      padding: 1px 7px; border-radius: 10px;
    }
    .nav-item.active .nbadge { background: var(--orange); color: #FFFFFF; }

    /* ── Tooltip (collapsed only) ────────────────────────────────────── */
    .nav-tip {
      position: absolute;
      left: calc(100% + 14px);
      top: 50%;
      transform: translateY(-50%);
      background: #18181B;
      color: #FFFFFF;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 10px;
      border-radius: 8px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 9999;
      box-shadow: 0 6px 16px rgba(0,0,0,.18);
      display: none;
      align-items: center;
      gap: 6px;
    }
    #sidebar.collapsed .nav-item:hover .nav-tip { display: flex; }

    /* ── Bottom: My settings under a divider, then the profile card (a click logs out) ── */
    .s-bottom {
      border-top: 1px solid rgba(24,24,27,.07);
      padding: 8px 10px 10px;
      flex-shrink: 0;
    }
    .u-card {
      display: flex; align-items: center; gap: 10px;
      padding: 8px; border-radius: 12px; cursor: pointer;
      overflow: hidden; white-space: nowrap;
      transition: background .15s;
    }
    .u-card:hover { background: rgba(24,24,27,.05); }
    .u-avatar {
      width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--orange-pale); color: var(--orange-dark);
      font-size: 13px; font-weight: 600;
    }
    .u-info { flex: 1; min-width: 0; overflow: hidden; transition: opacity .15s, width .22s; }
    .u-name  { font-size: 14px; font-weight: 500; color: #18181B; overflow: hidden; text-overflow: ellipsis; }
    .u-role  { font-size: 12px; color: #7B8494; overflow: hidden; text-overflow: ellipsis; }
    #sidebar.collapsed .u-card { gap: 0; justify-content: center; padding: 8px 0; }
    #sidebar.collapsed .u-info { display: none; }

    /* ── Main area ───────────────────────────────────────────────────── */
    #main {
      background: var(--page-bg); flex: 1; display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; min-width: 0;
      margin: 0;
      border-radius: 28px 0 0 28px;
      border-left: 1px solid rgba(24,24,27,.08);
      box-shadow: 0 1px 3px rgba(16,24,40,.06);
    }
  `],
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  readonly initials = initials;
  private pbx = inject(PbxService);

  isSalesManager = computed(() => (this.auth.user() as any)?.crm_role === 'sales_manager');
  private wf     = inject(WorkflowService);
  private router = inject(Router);

  taskBadge = signal(0);
  docBadge  = signal(0);
  collapsed = false;

  currentUrl = signal(this.router.url);
  // /crm/partners/analytics has its own nav item — exclude it so both links
  // don't light up together, but keep the registry link active for
  // /crm/partners/:id (partner detail), which plain routerLinkActive
  // exact-matching would otherwise miss.
  partnersRegistryActive = computed(() => {
    const url = this.currentUrl();
    return (url === '/crm/partners' || url.startsWith('/crm/partners/'))
      && !url.startsWith('/crm/partners/analytics');
  });

  isExternalUser = computed(() => this.auth.user()?.is_external === true);

  hasCrmAccess = computed(() => {
    const user = this.auth.user() as any;
    const hasRole = !!(user?.is_admin || user?.crm_role === 'salesperson' || user?.crm_role === 'sales_manager');
    return hasRole && (
      this.auth.hasFeature('leads') ||
      this.auth.hasFeature('partner_registry') ||
      this.auth.hasFeature('sales_reports') ||
      this.auth.hasFeature('onboarding') ||
      this.auth.hasFeature('performance') ||
      this.auth.hasFeature('prospects')
    );
  });

  ngOnInit(): void {
    this.collapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    this.refreshTaskBadge();
    if (this.auth.hasFeature('pbx')) void this.pbx.autoConnect();
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe(() => {
      this.refreshTaskBadge();
      this.currentUrl.set(this.router.url);
    });
  }

  toggleSidebar(): void {
    this.collapsed = !this.collapsed;
    localStorage.setItem('sidebar_collapsed', String(this.collapsed));
  }

  private refreshTaskBadge(): void {
    this.wf.getMyTasks().subscribe({
      next: tasks => this.taskBadge.set(Array.isArray(tasks) ? tasks.length : 0),
      error: () => this.taskBadge.set(0),
    });
  }
}

import { Component, inject, signal, computed, linkedSignal, OnInit } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { WorkflowService } from '../../core/services/api.services';
import { initials } from '../../core/services/helpers';
import { PbxService } from '../../core/services/pbx.service';
import { SoftphoneOverlayComponent } from '../../shared/components/softphone/softphone-overlay.component';
import { NavSection, SidebarLayout, loadSidebarLayout, orderItems, saveSidebarLayout } from './sidebar-layout';

@Component({
  selector: 'wt-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, CdkDropList, CdkDrag, SoftphoneOverlayComponent, TranslocoDirective],
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
          <button class="toggle-btn" type="button" [class.on]="isEditingNav()" (click)="toggleNavEditing()" [attr.title]="t(isEditingNav() ? 'sidebar.doneEditing' : 'sidebar.editMenu')">
            @if (isEditingNav()) {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            } @else {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            }
          </button>
          <button class="toggle-btn" type="button" (click)="toggleSidebar()" [attr.title]="t('sidebar.collapse')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="9" y1="4" x2="9" y2="20"/></svg></button>
        </div>

        <div class="s-scroll" [class.editing]="isEditingNav()">

          @for (section of navSections(); track section.id; let isFirst = $first) {
            @if (!isFirst) { <div class="nav-sep"></div> }
            <div class="s-sec">
              <div class="s-lbl">{{ t(section.labelKey) }}</div>
              <div class="s-items" cdkDropList cdkDropListLockAxis="y" [cdkDropListDisabled]="!isEditingNav()"
                   (cdkDropListDropped)="onNavDrop(section, $event)">
                @for (item of section.items; track item.id) {
                  @if (isEditingNav()) {
                    <div class="nav-item nav-edit" cdkDrag cdkDragPreviewContainer="parent" [class.is-hidden]="isNavItemHidden(item.id)">
                      <span class="nav-grip"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>
                      <ng-container *ngTemplateOutlet="navIcon; context: { $implicit: item.id }" />
                      <span class="nav-label">{{ t(item.labelKey) }}</span>
                      <button class="nav-eye" type="button" (click)="toggleNavItem(item.id)"
                              [attr.title]="t(isNavItemHidden(item.id) ? 'sidebar.showItem' : 'sidebar.hideItem')">
                        @if (isNavItemHidden(item.id)) {
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        } @else {
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        }
                      </button>
                    </div>
                  } @else if (item.isActive) {
                    <a class="nav-item" [routerLink]="item.route" [class.active]="item.isActive()">
                      <ng-container *ngTemplateOutlet="navIcon; context: { $implicit: item.id }" />
                      <span class="nav-label">{{ t(item.labelKey) }}</span>
                      <span class="nav-tip">{{ t(item.tipKey ?? item.labelKey) }}</span>
                    </a>
                  } @else {
                    <a class="nav-item" [routerLink]="item.route" routerLinkActive="active">
                      <ng-container *ngTemplateOutlet="navIcon; context: { $implicit: item.id }" />
                      <span class="nav-label">{{ t(item.labelKey) }} @if ((item.badge?.() ?? 0) > 0) { <span class="nbadge">{{ item.badge!() }}</span> }</span>
                      <span class="nav-tip">{{ t(item.tipKey ?? item.labelKey) }} @if ((item.badge?.() ?? 0) > 0) { <span class="nbadge">{{ item.badge!() }}</span> }</span>
                    </a>
                  }
                }
              </div>
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

    <ng-template #navIcon let-id>
      @switch (id) {
        @case ('dashboard') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }
        @case ('documents') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg> }
        @case ('workflow') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg> }
        @case ('groups') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
        @case ('projects') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="13" y2="9"/><line x1="10" y1="13" x2="17" y2="13"/><line x1="7" y1="17" x2="12" y2="17"/></svg> }
        @case ('crmDashboard') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }
        @case ('leads') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
        @case ('calendar') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
        @case ('salesReports') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
        @case ('prospects') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg> }
        @case ('prospectsDashboard') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><circle cx="18" cy="8" r="2"/><circle cx="12" cy="2" r="2"/><circle cx="6" cy="12" r="2"/></svg> }
        @case ('callAnalysis') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> }
        @case ('onboarding') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> }
        @case ('seoBot') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> }
        @case ('partnerRegistry') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
        @case ('partnerGroups') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg> }
        @case ('performance') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }
        @case ('partnerAnalytics') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
        @case ('budgets') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 1 3 3v1a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M4 22v-1a7 7 0 0 1 14 0v1"/><line x1="16" y1="11" x2="22" y2="11"/><line x1="19" y1="8" x2="19" y2="14"/></svg> }
        @case ('tenants') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> }
        @case ('billing') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> }
        @case ('csvImport') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
        @case ('users') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
        @case ('auditLogs') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> }
        @case ('pbxNumbers') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.07 11.5 19.79 19.79 0 0 1 1 2.18 2 2 0 0 1 3 0h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 7.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 14h1a2 2 0 0 1 2 1.92z"/></svg> }
        @case ('appSettings') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
        @case ('dataManagement') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> }
      }
    </ng-template>
  `,
  styles: [`
    /* ── Layout ─────────────────────────────────────────────────────── */
    .app-wrap { display: flex; height: calc(100vh - var(--test-banner-height, 0px)); overflow: hidden;
      /* Neutral grey a step darker than the content panel, so the panel sits in front. */
      background: var(--frame-bg); }

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
    /* The logo files are black; in the dark theme they turn white. */
    :host-context([data-theme="dark"]) .s-logo-full,
    :host-context([data-theme="dark"]) .s-mark { filter: invert(1); }
    .s-mark-btn { display: none; }
    #sidebar.collapsed .s-mark-btn { display: flex; }
    #sidebar.collapsed .s-head { justify-content: center; padding: 14px 0 10px; }
    #sidebar.collapsed .s-logo-full,
    #sidebar.collapsed .toggle-btn { display: none; }

    /* Collapsed: hovering the app mark turns it into the expand button, in the same spot. */
    .s-mark-btn { position: relative; padding: 0; border: none; background: none; border-radius: 10px; flex-shrink: 0; cursor: pointer; }
    .s-mark-expand {
      position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
      border-radius: 10px; background: var(--hover-overlay); color: var(--ink-strong);
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
      color: var(--nav-muted);
      flex-shrink: 0;
      transition: background .15s, color .15s;
    }
    .toggle-btn:hover { background: var(--hover-overlay); color: var(--ink-strong); }
    .toggle-btn.on, .toggle-btn.on:hover { background: var(--orange-pale); color: var(--orange-dark); }
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
      color: var(--nav-muted);
      padding: 16px 12px 6px;
      white-space: nowrap;
      max-height: 40px; overflow: hidden;
      transition: max-height .2s, opacity .15s, padding .2s;
    }
    #sidebar.collapsed .s-lbl { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; }

    .nav-sep { height: 0; margin: 0; }
    #sidebar.collapsed .nav-sep { height: 1px; background: var(--hover-overlay); margin: 8px 16px; }

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
      color: var(--nav-text);
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      margin-bottom: 2px;
      user-select: none;
      white-space: nowrap;
      transition: background .12s, color .12s, padding .22s;
    }
    .nav-item svg { width: 18px; height: 18px; flex-shrink: 0; color: var(--nav-muted); stroke-width: 1.8; transition: color .12s; }
    .nav-item:hover { background: var(--hover-overlay); color: var(--ink-strong); }
    .nav-item:hover svg { color: var(--nav-text); }
    /* Active item: a white pill with a soft shadow; the icon in brand green. */
    .nav-item.active { background: var(--nav-active-bg); color: var(--ink-strong); box-shadow: var(--nav-active-shadow); }
    .nav-item.active svg { color: var(--orange-text); }

    /* No browser focus box after a click; a soft green ring only for keyboard focus. */
    .nav-item:focus { outline: none; }
    .nav-item:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(59,170,93,.45); }

    /* Collapsed: center the icon */
    #sidebar.collapsed .nav-item { padding: 0; justify-content: center; gap: 0; }

    /* ── Edit mode: drag to reorder inside a section, the eye hides an item ── */
    .s-items { min-height: 4px; }
    .nav-edit { cursor: grab; }
    .nav-edit .nav-grip { display: flex; margin: 0 -6px; color: #A1A8B3; }
    .nav-edit .nav-grip svg { width: 14px; height: 14px; color: inherit; }
    .nav-edit .nav-eye {
      width: 26px; height: 26px; flex-shrink: 0; margin-right: -6px;
      display: flex; align-items: center; justify-content: center;
      border: none; background: none; border-radius: 7px; cursor: pointer; color: var(--nav-muted);
    }
    .nav-edit .nav-eye:hover { background: var(--hover-overlay); color: var(--ink-strong); }
    .nav-edit .nav-eye svg { width: 16px; height: 16px; color: inherit; }
    .nav-edit.is-hidden .nav-label, .nav-edit.is-hidden > svg { opacity: .4; }
    .nav-edit.cdk-drag-preview { background: var(--surface); cursor: grabbing; box-shadow: 0 8px 20px rgba(16,24,40,.14), 0 0 0 1px rgba(24,24,27,.05); }
    .nav-edit.cdk-drag-placeholder { opacity: .3; }
    .nav-edit.cdk-drag-animating,
    .s-items.cdk-drop-list-dragging .nav-edit:not(.cdk-drag-placeholder) { transition: transform .2s cubic-bezier(0,0,.2,1); }

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
      background: var(--orange-strong); color: #FFFFFF;
      font-size: 11px; font-weight: 600;
      padding: 1px 7px; border-radius: 10px;
    }
    .nav-item.active .nbadge { background: var(--orange-strong); color: #FFFFFF; }

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
      border-top: 1px solid var(--divider);
      padding: 8px 10px 10px;
      flex-shrink: 0;
    }
    .u-card {
      display: flex; align-items: center; gap: 10px;
      padding: 8px; border-radius: 12px; cursor: pointer;
      overflow: hidden; white-space: nowrap;
      transition: background .15s;
    }
    .u-card:hover { background: var(--hover-overlay); }
    .u-avatar {
      width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--orange-pale); color: var(--orange-dark);
      font-size: 13px; font-weight: 600;
    }
    .u-info { flex: 1; min-width: 0; overflow: hidden; transition: opacity .15s, width .22s; }
    .u-name  { font-size: 14px; font-weight: 500; color: var(--ink-strong); overflow: hidden; text-overflow: ellipsis; }
    .u-role  { font-size: 12px; color: var(--nav-muted); overflow: hidden; text-overflow: ellipsis; }
    #sidebar.collapsed .u-card { gap: 0; justify-content: center; padding: 8px 0; }
    #sidebar.collapsed .u-info { display: none; }

    /* ── Main area ───────────────────────────────────────────────────── */
    #main {
      background: var(--page-bg); flex: 1; display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; min-width: 0;
      margin: 0;
      border-radius: 28px 0 0 28px;
      border-left: 1px solid var(--divider);
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

  private readonly navSectionDefinitions: NavSection[] = [
    { id: 'documents', labelKey: 'sections.documents', isVisible: () => !this.isExternalUser(), items: [
      { id: 'dashboard', route: '/dashboard', labelKey: 'nav.dashboard', isVisible: () => true },
      { id: 'documents', route: '/documents', labelKey: 'nav.documents', isVisible: () => this.auth.hasFeature('documents'), badge: () => this.docBadge() },
      { id: 'workflow', route: '/workflow', labelKey: 'nav.workflow', isVisible: () => this.auth.hasFeature('documents'), badge: () => this.taskBadge() },
      { id: 'groups', route: '/groups', labelKey: 'nav.groupsAndRoles', isVisible: () => true },
    ] },
    { id: 'projects', labelKey: 'sections.projects', isVisible: () => this.auth.hasFeature('projects'), items: [
      { id: 'projects', route: '/projects', labelKey: 'nav.projects', isVisible: () => true },
    ] },
    { id: 'crm', labelKey: 'sections.crm', isVisible: () => this.hasCrmAccess(), items: [
      { id: 'crmDashboard', route: '/crm/dashboard', labelKey: 'nav.dashboard', isVisible: () => true },
      { id: 'leads', route: '/crm/leads', labelKey: 'nav.leads', isVisible: () => this.auth.hasFeature('leads') },
      { id: 'calendar', route: '/crm/calendar', labelKey: 'nav.activityCalendar', isVisible: () => this.auth.hasFeature('leads') },
      { id: 'salesReports', route: '/crm/reports/leads', labelKey: 'nav.salesReports', isVisible: () => this.auth.hasFeature('sales_reports') },
      { id: 'prospects', route: '/admin/prospects', labelKey: 'nav.prospects', isVisible: () => this.auth.hasFeature('prospects') },
      { id: 'prospectsDashboard', route: '/crm/prospects-dashboard', labelKey: 'nav.prospectsDashboard',
        isVisible: () => this.auth.hasFeature('prospects') && (this.isSalesManager() || this.auth.isAdmin()) },
      { id: 'callAnalysis', route: '/admin/call-analysis', labelKey: 'nav.callAnalysis', isVisible: () => this.auth.hasFeature('call_analysis') },
    ] },
    { id: 'partners', labelKey: 'sections.partners',
      isVisible: () => this.hasCrmAccess() && (this.auth.hasFeature('partner_registry') || this.auth.hasFeature('onboarding') || this.auth.hasFeature('performance')),
      items: [
        { id: 'onboarding', route: '/crm/onboarding', labelKey: 'nav.onboarding', isVisible: () => this.auth.hasFeature('onboarding') },
        { id: 'seoBot', route: '/crm/seo', labelKey: 'nav.seoBot', isVisible: () => this.auth.hasFeature('seo_bot') },
        { id: 'partnerRegistry', route: '/crm/partners', labelKey: 'nav.partnerRegistry', isVisible: () => this.auth.hasFeature('partner_registry'),
          isActive: () => this.partnersRegistryActive() },
        { id: 'partnerGroups', route: '/crm/partner-groups', labelKey: 'nav.partnerGroups', isVisible: () => this.auth.hasFeature('partner_registry') },
        { id: 'performance', route: '/crm/reports/partners', labelKey: 'nav.performance', isVisible: () => this.auth.hasFeature('performance') },
        { id: 'partnerAnalytics', route: '/crm/partners/analytics', labelKey: 'nav.partnerAnalytics', tipKey: 'nav.analyticsDashboardTip',
          isVisible: () => this.auth.hasFeature('dwh_integration') && (this.isSalesManager() || this.auth.isAdmin()) },
        { id: 'budgets', route: '/users', labelKey: 'nav.budgets', tipKey: 'nav.salesBudgetsTip',
          isVisible: () => this.isSalesManager() && !this.auth.isAdmin() },
      ] },
    { id: 'superAdmin', labelKey: 'sections.superAdmin', isVisible: () => this.auth.isSuperAdmin(), items: [
      { id: 'tenants', route: '/admin/tenants', labelKey: 'nav.tenants', tipKey: 'nav.tenantsTip', isVisible: () => true },
      { id: 'billing', route: '/admin/billing', labelKey: 'nav.billing', tipKey: 'nav.billingTip', isVisible: () => true },
    ] },
    { id: 'administration', labelKey: 'sections.administration', isVisible: () => this.auth.isAdmin(), items: [
      { id: 'csvImport', route: '/crm/import', labelKey: 'nav.csvImport', isVisible: () => true },
      { id: 'users', route: '/users', labelKey: 'nav.users', isVisible: () => true },
      { id: 'auditLogs', route: '/logs', labelKey: 'nav.auditLogs', isVisible: () => true },
      { id: 'pbxNumbers', route: '/admin/pbx', labelKey: 'nav.pbxNumbers', isVisible: () => this.auth.hasFeature('pbx') },
      { id: 'appSettings', route: '/admin/settings', labelKey: 'nav.appSettings', isVisible: () => true },
      { id: 'dataManagement', route: '/admin/data', labelKey: 'nav.dataManagement', isVisible: () => true },
    ] },
  ];

  isEditingNav = signal(false);
  // Kept per user in this browser: there is no user-preferences API yet.
  private navLayout = linkedSignal<SidebarLayout>(() => loadSidebarLayout(this.auth.user()?.id));

  navSections = computed(() => {
    const layout = this.navLayout();
    const isEditing = this.isEditingNav();
    const hidden = new Set(layout.hidden);
    return this.navSectionDefinitions
      .filter(section => section.isVisible())
      .map(section => ({
        ...section,
        items: orderItems(section.items.filter(item => item.isVisible()), layout.order[section.id])
          .filter(item => isEditing || !hidden.has(item.id)),
      }))
      .filter(section => section.items.length > 0);
  });

  isNavItemHidden(itemId: string): boolean {
    return this.navLayout().hidden.includes(itemId);
  }

  toggleNavEditing(): void {
    this.isEditingNav.update(isEditing => !isEditing);
  }

  toggleNavItem(itemId: string): void {
    const layout = this.navLayout();
    const hidden = layout.hidden.includes(itemId)
      ? layout.hidden.filter(id => id !== itemId)
      : [...layout.hidden, itemId];
    this.storeNavLayout({ ...layout, hidden });
  }

  onNavDrop(section: NavSection, event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    const layout = this.navLayout();
    const ids = section.items.map(item => item.id);
    moveItemInArray(ids, event.previousIndex, event.currentIndex);
    // Items this user can't see right now (feature off, other role) keep their saved place after the visible ones.
    const unseen = (layout.order[section.id] ?? []).filter(id => !ids.includes(id));
    this.storeNavLayout({ ...layout, order: { ...layout.order, [section.id]: [...ids, ...unseen] } });
  }

  private storeNavLayout(layout: SidebarLayout): void {
    this.navLayout.set(layout);
    saveSidebarLayout(this.auth.user()?.id, layout);
  }

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
    if (this.collapsed) this.isEditingNav.set(false);
    localStorage.setItem('sidebar_collapsed', String(this.collapsed));
  }

  private refreshTaskBadge(): void {
    this.wf.getMyTasks().subscribe({
      next: tasks => this.taskBadge.set(Array.isArray(tasks) ? tasks.length : 0),
      error: () => this.taskBadge.set(0),
    });
  }
}

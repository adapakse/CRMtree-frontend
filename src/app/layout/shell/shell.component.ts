import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { WorkflowService } from '../../core/services/api.services';
import { AvatarComponent } from '../../shared/components/badges.components';
import { initials } from '../../core/services/helpers';

@Component({
  selector: 'wt-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, AvatarComponent],
  template: `
    <div class="app-wrap">

      <!-- SIDEBAR -->
      <nav id="sidebar" [class.collapsed]="collapsed">

        <!-- Logo -->
        <div class="s-logo">
          <img class="s-logo-img" src="assets/crmtree-logo.png" alt="CRMtree">
        </div>

        <!-- Toggle button — always visible -->
        <button class="toggle-btn" (click)="toggleSidebar()" [attr.title]="collapsed ? 'Rozwiń menu' : 'Zwiń menu'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline [attr.points]="collapsed ? '9,18 15,12 9,6' : '15,18 9,12 15,6'"/>
          </svg>
        </button>

        <!-- Scrollable nav content -->
        <div class="s-scroll">

          <div class="s-sec">
            <div class="s-lbl">Dokumenty</div>

            <a class="nav-item" routerLink="/dashboard" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span class="nav-label">Dashboard</span>
              <span class="nav-tip">Dashboard</span>
            </a>

            <a class="nav-item" routerLink="/documents" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
              <span class="nav-label">Documents @if (docBadge() > 0) { <span class="nbadge">{{ docBadge() }}</span> }</span>
              <span class="nav-tip">Documents @if (docBadge() > 0) { <span class="nbadge">{{ docBadge() }}</span> }</span>
            </a>

            <a class="nav-item" routerLink="/workflow" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
              <span class="nav-label">Workflow @if (taskBadge() > 0) { <span class="nbadge">{{ taskBadge() }}</span> }</span>
              <span class="nav-tip">Workflow @if (taskBadge() > 0) { <span class="nbadge">{{ taskBadge() }}</span> }</span>
            </a>

            <a class="nav-item" routerLink="/groups" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span class="nav-label">Groups &amp; Roles</span>
              <span class="nav-tip">Groups &amp; Roles</span>
            </a>
          </div>

          @if (hasCrmAccess()) {
            <div class="nav-sep"></div>
            <div class="s-sec">
              <div class="s-lbl">CRM</div>

              <a class="nav-item" routerLink="/crm/dashboard" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span class="nav-label">Dashboard</span>
                <span class="nav-tip">Dashboard</span>
              </a>

              <a class="nav-item" routerLink="/crm/leads" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span class="nav-label">Leady</span>
                <span class="nav-tip">Leady</span>
              </a>

              <a class="nav-item" routerLink="/crm/calendar" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span class="nav-label">Kalendarz działań</span>
                <span class="nav-tip">Kalendarz działań</span>
              </a>

              <a class="nav-item" routerLink="/crm/reports/leads" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span class="nav-label">Raporty sprzedaży</span>
                <span class="nav-tip">Raporty sprzedaży</span>
              </a>
            </div>

            <div class="nav-sep"></div>
            <div class="s-sec">
              <div class="s-lbl">Partnerzy</div>

              <a class="nav-item" routerLink="/crm/onboarding" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                <span class="nav-label">Onboarding</span>
                <span class="nav-tip">Onboarding</span>
              </a>

              <a class="nav-item" routerLink="/crm/partners" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span class="nav-label">Rejestr Partnerów</span>
                <span class="nav-tip">Rejestr Partnerów</span>
              </a>

              <a class="nav-item" routerLink="/crm/partner-groups" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
                <span class="nav-label">Grupy partnerów</span>
                <span class="nav-tip">Grupy partnerów</span>
              </a>

              <a class="nav-item" routerLink="/crm/reports/partners" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span class="nav-label">Performance</span>
                <span class="nav-tip">Performance</span>
              </a>

              @if (isSalesManager() && !auth.isAdmin()) {
                <a class="nav-item" routerLink="/users" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 1 3 3v1a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M4 22v-1a7 7 0 0 1 14 0v1"/><line x1="16" y1="11" x2="22" y2="11"/><line x1="19" y1="8" x2="19" y2="14"/></svg>
                  <span class="nav-label">Budżety</span>
                  <span class="nav-tip">Budżety handlowców</span>
                </a>
              }
            </div>

          }

          @if (auth.isAdmin()) {
            <div class="nav-sep"></div>
            <div class="s-sec">
              <div class="s-lbl">Administracja</div>

              <a class="nav-item" routerLink="/crm/import" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span class="nav-label">Import CSV</span>
                <span class="nav-tip">Import CSV</span>
              </a>

              <a class="nav-item" routerLink="/users" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span class="nav-label">Users</span>
                <span class="nav-tip">Users</span>
              </a>

              <a class="nav-item" routerLink="/logs" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  <span class="nav-label">Audit Logs</span>
                  <span class="nav-tip">Audit Logs</span>
                </a>

                <a class="nav-item" routerLink="/admin/settings" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  <span class="nav-label">App Settings</span>
                  <span class="nav-tip">App Settings</span>
                </a>

                <a class="nav-item" routerLink="/admin/data" routerLinkActive="active">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                  <span class="nav-label">Zarządzanie danymi</span>
                  <span class="nav-tip">Zarządzanie danymi</span>
                </a>
            </div>
          }

        </div><!-- /s-scroll -->

        <!-- User card at bottom -->
        <div class="s-bottom">
          <a class="nav-item settings-item" routerLink="/my-settings" routerLinkActive="active" style="margin-bottom:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span class="nav-label">Moje ustawienia</span>
            <span class="nav-tip">Moje ustawienia</span>
          </a>
          <div class="u-card" (click)="auth.logout()">
            <wt-avatar [name]="auth.user()?.display_name ?? ''" [size]="32" />
            <div class="u-info">
              <div class="u-name">{{ auth.user()?.display_name }}</div>
              <div class="u-role">{{ auth.isAdmin() ? 'Administrator' : 'User' }} · Sign out</div>
            </div>
          </div>
        </div>

      </nav>

      <!-- MAIN AREA -->
      <main id="main">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    /* ── Layout ─────────────────────────────────────────────────────── */
    .app-wrap { display: flex; height: 100vh; overflow: hidden; }

    /* ── Sidebar shell ───────────────────────────────────────────────── */
    #sidebar {
      width: 256px;
      background: #292A2D;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      /* overflow MUST be visible so tooltips can escape the 56 px boundary */
      overflow: visible;
      transition: width .22s cubic-bezier(.4,0,.2,1);
      /* shadow to separate from content */
      box-shadow: 1px 0 0 0 rgba(255,255,255,.06);
    }
    #sidebar.collapsed { width: 56px; }

    /* ── Logo ────────────────────────────────────────────────────────── */
    .s-logo {
      height: 89px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 12px;
      border-bottom: 1px solid rgba(255,255,255,.07);
      flex-shrink: 0;
      overflow: hidden;
    }
    .s-logo-img {
      height: 74px;
      width: auto;
      object-fit: contain;
      transition: height .22s, width .22s;
    }
    /* collapsed: show just the tree crop (upper-center of image) */
    #sidebar.collapsed .s-logo { padding: 0 8px; }
    #sidebar.collapsed .s-logo-img {
      height: 55px;
      width: 55px;
      object-fit: cover;
      object-position: 50% 38%;
    }

    /* ── Toggle button ───────────────────────────────────────────────── */
    .toggle-btn {
      width: 100%;
      padding: 5px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,.07);
      cursor: pointer;
      color: var(--gray-500);
      flex-shrink: 0;
      transition: background .15s, color .15s;
    }
    .toggle-btn:hover { background: rgba(255,255,255,.05); color: var(--gray-200); }
    .toggle-btn svg { width: 15px; height: 15px; }

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
    .s-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

    /* ── Sections & separators ───────────────────────────────────────── */
    .s-sec { padding: 4px 8px; margin-top: 2px; }
    .s-lbl {
      font-size: 10px; font-weight: 600; letter-spacing: .8px;
      text-transform: uppercase; color: var(--gray-500);
      padding: 6px 6px 3px;
      white-space: nowrap;
      max-height: 28px; overflow: hidden;
      transition: max-height .2s, opacity .15s, padding .2s;
    }
    #sidebar.collapsed .s-lbl { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; }

    .nav-sep {
      height: 1px; background: rgba(255,255,255,.07);
      margin: 3px 8px;
      transition: margin .2s, opacity .15s;
    }
    #sidebar.collapsed .nav-sep { margin: 2px 8px; opacity: 0.3; }

    /* ── Nav items ───────────────────────────────────────────────────── */
    .nav-item {
      position: relative;          /* tooltip anchored here */
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 8px;
      border-radius: 8px;
      cursor: pointer;
      color: var(--gray-400);
      font-size: 13.5px;
      font-weight: 400;
      text-decoration: none;
      margin-bottom: 1px;
      user-select: none;
      white-space: nowrap;
      transition: background .12s, color .12s, padding .22s, justify-content .22s;
    }
    .nav-item:hover { background: rgba(255,255,255,.07); color: var(--gray-200); }
    .nav-item.active { background: rgba(59,170,93,.16); color: var(--orange-light); font-weight: 500; }
    .nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }

    /* Collapsed: center the icon */
    #sidebar.collapsed .nav-item { padding: 8px 0; justify-content: center; gap: 0; }

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
      background: var(--orange); color: white;
      font-size: 10px; font-weight: 700;
      padding: 1px 6px; border-radius: 10px;
    }

    /* ── Tooltip ─────────────────────────────────────────────────────── */
    /* Hidden by default. Shown only when sidebar is collapsed + item hovered. */
    .nav-tip {
      /* Absolutely positioned, escapes the sidebar because overflow:visible */
      position: absolute;
      left: calc(100% + 10px);
      top: 50%;
      transform: translateY(-50%);
      /* Styling */
      background: #1e293b;
      color: #f1f5f9;
      font-size: 12.5px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 7px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 9999;
      box-shadow: 0 6px 20px rgba(0,0,0,.5);
      border: 1px solid rgba(255,255,255,.13);
      /* Arrow */
      display: none;
    }
    /* Arrow pointing left */
    .nav-tip::before {
      content: '';
      position: absolute;
      right: 100%; top: 50%;
      transform: translateY(-50%);
      border: 6px solid transparent;
      border-right-color: rgba(255,255,255,.13);
    }
    .nav-tip::after {
      content: '';
      position: absolute;
      right: calc(100% - 1px); top: 50%;
      transform: translateY(-50%);
      border: 6px solid transparent;
      border-right-color: #1e293b;
    }
    /* Show on hover when collapsed */
    #sidebar.collapsed .nav-item:hover .nav-tip { display: block; }

    /* ── User card ───────────────────────────────────────────────────── */
    .s-bottom {
      border-top: 1px solid rgba(255,255,255,.07);
      padding: 10px 8px;
      flex-shrink: 0;
    }
    .u-card {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 6px; border-radius: 8px; cursor: pointer;
      overflow: hidden; white-space: nowrap;
      transition: background .15s;
    }
    .u-card:hover { background: rgba(255,255,255,.06); }
    .u-info { overflow: hidden; transition: opacity .15s, width .22s; }
    .u-name  { font-size: 13px; font-weight: 500; color: var(--gray-200); }
    .u-role  { font-size: 11px; color: var(--gray-500); }
    #sidebar.collapsed .u-info { opacity: 0; width: 0; }
    #sidebar.collapsed .u-card { gap: 0; justify-content: center; }

    /* ── Main area ───────────────────────────────────────────────────── */
    #main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
  `],
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);

  isSalesManager = computed(() => (this.auth.user() as any)?.crm_role === 'sales_manager');
  private wf     = inject(WorkflowService);
  private router = inject(Router);

  taskBadge = signal(0);
  docBadge  = signal(0);
  collapsed = false;

  hasCrmAccess = computed(() => {
    const user = this.auth.user() as any;
    return !!(user?.is_admin || user?.crm_role === 'salesperson' || user?.crm_role === 'sales_manager');
  });

  ngOnInit(): void {
    this.collapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    this.refreshTaskBadge();
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe(() => this.refreshTaskBadge());
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

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
      <nav id="sidebar">
        <div class="s-logo">
          <div class="s-logo-icon">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          </div>
          <span class="s-logo-text">worktrips<span>.doc</span></span>
        </div>

        <div class="s-sec">
          <div class="s-lbl">Main</div>

          <div class="nav-item" routerLink="/dashboard" routerLinkActive="active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Dashboard
          </div>

          <div class="nav-item" routerLink="/documents" routerLinkActive="active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
            Documents
            @if (docBadge() > 0) { <span class="nbadge">{{ docBadge() }}</span> }
          </div>

          <div class="nav-item" routerLink="/workflow" routerLinkActive="active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
            Workflow
            @if (taskBadge() > 0) { <span class="nbadge">{{ taskBadge() }}</span> }
          </div>

          <div class="nav-item" routerLink="/groups" routerLinkActive="active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Groups & Roles
          </div>
        </div>

        @if (hasCrmAccess()) {
          <div class="s-sec">
            <div class="s-lbl">CRM</div>
            <div class="nav-item" routerLink="/crm/dashboard" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              Dashboard CRM
            </div>
            <div class="nav-item" routerLink="/crm/leads" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Leady
            </div>
            <div class="nav-item" routerLink="/crm/partners" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Partnerzy
            </div>
            <div class="nav-item" routerLink="/crm/groups" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20z"/></svg>
              Grupy partnerskie
            </div>
            <div class="nav-item" routerLink="/crm/transactions" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              Transakcje
            </div>
            <div class="nav-item" routerLink="/crm/import" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import CSV
            </div>
          </div>
        }

        @if (auth.isAdmin()) {
          <div class="s-sec">
            <div class="s-lbl">Admin</div>
            <div class="nav-item" routerLink="/users" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Users
            </div>
            <div class="nav-item" routerLink="/logs" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Audit Logs
            </div>
            <div class="nav-item" routerLink="/admin/settings" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              App Settings
            </div>
          </div>
        }

        <div class="s-bottom">
          <div class="u-card" (click)="auth.logout()">
            <wt-avatar [name]="auth.user()?.display_name ?? ''" [size]="32" />
            <div>
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
    .app-wrap { display: flex; height: 100vh; }
    #sidebar { width: 256px; background: var(--gray-900); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; }
    .s-logo { padding: 18px 20px 14px; border-bottom: 1px solid rgba(255,255,255,.07); display: flex; align-items: center; gap: 10px; }
    .s-logo-icon { width: 32px; height: 32px; background: var(--orange); border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .s-logo-icon svg { width: 18px; height: 18px; fill: white; }
    .s-logo-text { font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700; color: white; }
    .s-logo-text span { color: var(--orange); }
    .s-sec { padding: 6px 12px; margin-top: 4px; }
    .s-lbl { font-size: 10px; font-weight: 600; letter-spacing: .8px; text-transform: uppercase; color: var(--gray-500); padding: 6px 8px 4px; }
    .nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; color: var(--gray-400); font-size: 13.5px; font-weight: 400; transition: all .15s; margin-bottom: 1px; user-select: none; }
    .nav-item:hover { background: rgba(255,255,255,.06); color: var(--gray-200); }
    .nav-item.active { background: rgba(242,101,34,.15); color: var(--orange-light); font-weight: 500; }
    .nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }
    .nbadge { margin-left: auto; background: var(--orange); color: white; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; }
    .s-bottom { margin-top: auto; border-top: 1px solid rgba(255,255,255,.07); padding: 12px; }
    .u-card { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
    .u-card:hover { background: rgba(255,255,255,.06); }
    .u-name { font-size: 13px; font-weight: 500; color: var(--gray-200); }
    .u-role { font-size: 11px; color: var(--gray-500); }
    #main { flex: 1; min-height: 0; overflow-y: auto; }
  `],
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  private wf     = inject(WorkflowService);
  private router = inject(Router);

  taskBadge = signal(0);
  hasCrmAccess = computed(() => { const u = this.auth.user(); return !!(u?.is_admin || u?.crm_role === 'salesperson' || u?.crm_role === 'sales_manager'); });
  docBadge  = signal(0);

  ngOnInit(): void {
    this.refreshTaskBadge();

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe(() => this.refreshTaskBadge());
  }

  private refreshTaskBadge(): void {
    this.wf.getMyTasks().subscribe({
      next: tasks => {
        const list = Array.isArray(tasks) ? tasks : [];
        this.taskBadge.set(list.length);
      },
      error: () => this.taskBadge.set(0),
    });
  }
}

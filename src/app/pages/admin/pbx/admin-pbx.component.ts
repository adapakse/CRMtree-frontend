// src/app/pages/admin/pbx/admin-pbx.component.ts
import {
  Component, inject, signal, computed, OnInit, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';

const API = `${environment.apiUrl}/admin/pbx`;

interface PbxUserRow {
  id: string;
  display_name: string;
  email: string;
  crm_role: string | null;
  is_active: boolean;
  has_pat: boolean;
  direct_phone: string | null;
  creds_updated_at: string | null;
}

@Component({
  selector: 'wt-admin-pbx',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoDirective],
  providers: [provideTranslocoScope('admin')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<ng-container *transloco="let t; prefix: 'admin'">
    <div class="ap-page">
      <div class="ap-header">
        <h1 class="ap-title">{{ t('pbx.title') }}</h1>
        <p class="ap-sub">{{ t('pbx.subtitle') }}</p>
      </div>

      @if (isLoading()) {
        <div class="ap-loading">{{ t('pbx.loading') }}</div>
      } @else if (loadError()) {
        <div class="ap-error">{{ t('pbx.loadError') }}</div>
      } @else {
        <div class="ap-toolbar">
          <input class="ap-search" type="text" [placeholder]="t('pbx.searchPlaceholder')"
                 [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
        </div>

        <table class="ap-table">
          <thead>
            <tr>
              <th>{{ t('pbx.columns.user') }}</th>
              <th>{{ t('pbx.columns.crmRole') }}</th>
              <th>{{ t('pbx.columns.directPhone') }}</th>
              <th>{{ t('pbx.columns.status') }}</th>
              <th>{{ t('pbx.columns.updatedAt') }}</th>
              <th class="ap-th-count">{{ t('pbx.userCount', { count: filteredUsers().length }) }}</th>
            </tr>
          </thead>
          <tbody>
            @for (u of filteredUsers(); track u.id) {
              <tr [class.ap-row-inactive]="!u.is_active">
                <td>
                  <div class="ap-uname">{{ u.display_name }}</div>
                  <div class="ap-uemail">{{ u.email }}</div>
                </td>
                <td>
                  @if (u.crm_role) {
                    <span class="ap-role">{{ crmRoleLabel(u.crm_role) }}</span>
                  } @else {
                    <span class="ap-none">—</span>
                  }
                </td>
                <td>
                  @if (u.direct_phone) {
                    <span class="ap-phone">{{ u.direct_phone }}</span>
                  } @else {
                    <span class="ap-none">{{ u.has_pat ? t('pbx.noPhoneInPbx') : '—' }}</span>
                  }
                </td>
                <td>
                  @if (u.has_pat) {
                    <span class="ap-badge ap-badge-ok">{{ t('pbx.status.configured') }}</span>
                  } @else {
                    <span class="ap-badge ap-badge-warn">{{ t('pbx.status.noToken') }}</span>
                  }
                </td>
                <td>
                  @if (u.creds_updated_at) {
                    <span class="ap-date">{{ u.creds_updated_at | date:'dd.MM.yyyy HH:mm' }}</span>
                  } @else {
                    <span class="ap-none">—</span>
                  }
                </td>
                <td class="ap-actions">
                  <div class="ap-actions-row">
                    <button class="ap-btn ap-btn-edit" (click)="openEdit(u)">
                      {{ u.has_pat ? t('pbx.actions.changeToken') : t('pbx.actions.setToken') }}
                    </button>
                    @if (u.has_pat) {
                      <button class="ap-btn ap-btn-del" (click)="confirmDelete(u)">{{ t('pbx.actions.delete') }}</button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (editUser()) {
        <div class="ap-overlay" (click)="closeEdit()">
          <div class="ap-modal" (click)="$event.stopPropagation()">
            <div class="ap-modal-header">
              <div>
                <div class="ap-modal-title">{{ t('pbx.modal.title', { name: editUser()!.display_name }) }}</div>
                <div class="ap-modal-sub">{{ editUser()!.email }}</div>
              </div>
              <button class="ap-close" (click)="closeEdit()">✕</button>
            </div>

            <div class="ap-modal-body">
              <div class="ap-hint">
                <strong>{{ t('pbx.modal.hintTitle') }}</strong><br>
                {{ t('pbx.modal.hintBody') }}
              </div>

              <div class="ap-field">
                <label>{{ t('pbx.modal.patLabel') }}</label>
                <div class="ap-input-row">
                  <input [type]="isTokenVisible ? 'text' : 'password'" [(ngModel)]="patToken"
                         [placeholder]="t('pbx.modal.patPlaceholder')" autocomplete="off" />
                  <button class="ap-eye" type="button" (click)="isTokenVisible = !isTokenVisible">
                    {{ isTokenVisible ? t('pbx.actions.hide') : t('pbx.actions.show') }}
                  </button>
                </div>
                <div class="ap-field-hint">{{ t('pbx.modal.patHint') }}</div>
              </div>
            </div>

            <div class="ap-modal-footer">
              <button class="ap-btn ap-btn-cancel" (click)="closeEdit()">{{ t('pbx.actions.cancel') }}</button>
              <button class="ap-btn ap-btn-save" [disabled]="isSaving() || !patToken.trim()"
                      (click)="saveToken()">
                {{ isSaving() ? t('pbx.actions.saving') : t('pbx.actions.save') }}
              </button>
            </div>
          </div>
        </div>
      }

      @if (deleteUser()) {
        <div class="ap-overlay" (click)="cancelDelete()">
          <div class="ap-modal ap-modal-sm" (click)="$event.stopPropagation()">
            <div class="ap-modal-header">
              <div class="ap-modal-title">{{ t('pbx.deleteModal.title') }}</div>
              <button class="ap-close" (click)="cancelDelete()">✕</button>
            </div>
            <div class="ap-modal-body">
              <p>{{ t('pbx.deleteModal.body', { name: deleteUser()!.display_name }) }}</p>
            </div>
            <div class="ap-modal-footer">
              <button class="ap-btn ap-btn-cancel" (click)="cancelDelete()">{{ t('pbx.actions.cancel') }}</button>
              <button class="ap-btn ap-btn-del" [disabled]="isSaving()" (click)="deleteToken()">
                {{ isSaving() ? t('pbx.actions.deleting') : t('pbx.actions.delete') }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
</ng-container>
  `,
  styles: [`
    :host { display: block; height: 100%; overflow-y: auto; }
    .ap-page { padding: 28px 32px; max-width: 1000px; }

    .ap-header { margin-bottom: 24px; }
    .ap-title  { font-size: 22px; font-weight: 700; color: var(--text, #18181B); margin: 0 0 4px; }
    .ap-sub    { font-size: 13px; color: var(--text-muted, #71717A); margin: 0; max-width: 620px; }

    .ap-loading { padding: 48px; text-align: center; color: var(--text-muted, #71717A); }
    .ap-error   { padding: 16px; background: #fee2e2; border-radius: 8px; color: #b91c1c; }

    .ap-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .ap-search  { padding: 8px 12px; border: 1px solid var(--border, #E4E4E7); border-radius: 8px;
                  font-size: 13px; background: var(--bg-input, #fff); color: var(--text, #18181B);
                  width: 260px; outline: none; }
    .ap-search:focus { border-color: var(--orange, #3BAA5D); }
    .ap-table th.ap-th-count { text-align: right; text-transform: none;
                               font-size: 12px; font-weight: 500; letter-spacing: normal;
                               white-space: nowrap; }

    .ap-table   { width: 100%; border-collapse: collapse; font-size: 13px; }
    .ap-table th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600;
                   text-transform: uppercase; letter-spacing: 0.05em;
                   color: var(--text-muted, #71717A); border-bottom: 2px solid var(--border, #E4E4E7); }
    .ap-table td { padding: 10px 12px; border-bottom: 1px solid var(--border, #E4E4E7); vertical-align: middle; }
    .ap-table tr:hover td { background: var(--bg-hover, #FAFAFA); }
    .ap-row-inactive td { opacity: 0.5; }

    .ap-uname  { font-weight: 600; color: var(--text, #18181B); }
    .ap-uemail { font-size: 11px; color: var(--text-muted, #71717A); margin-top: 2px; }
    .ap-role   { font-size: 11px; background: var(--bg-muted, #F4F4F5);
                 padding: 2px 8px; border-radius: 10px; color: var(--text, #18181B); }
    .ap-phone  { font-weight: 600; color: var(--orange, #3BAA5D); font-family: monospace; }
    .ap-none   { color: var(--text-muted, #71717A); }
    .ap-date   { font-size: 12px; color: var(--text-muted, #71717A); }

    .ap-badge      { font-size: 11px; padding: 3px 9px; border-radius: 10px; font-weight: 600; }
    .ap-badge-ok   { background: #dcfce7; color: #166534; }
    .ap-badge-warn { background: #fef3c7; color: #92400e; }

    .ap-actions     { white-space: nowrap; text-align: right; }
    .ap-actions-row { display: flex; gap: 6px; justify-content: flex-end; }
    .ap-btn     { padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600;
                  cursor: pointer; border: none; transition: background .15s; }
    .ap-btn:disabled { opacity: .5; cursor: not-allowed; }
    .ap-btn-edit   { background: var(--orange, #3BAA5D); color: #fff; }
    .ap-btn-edit:hover { background: var(--orange-dark, #2F8F4D); }
    .ap-btn-del    { background: #fee2e2; color: #b91c1c; }
    .ap-btn-del:hover { background: #fecaca; }
    .ap-btn-cancel { background: var(--bg-muted, #F4F4F5); color: var(--text, #18181B); }
    .ap-btn-save   { background: var(--orange, #3BAA5D); color: #fff; }
    .ap-btn-save:hover:not(:disabled) { background: var(--orange-dark, #2F8F4D); }

    .ap-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 1000;
                  display: flex; align-items: center; justify-content: center; }
    .ap-modal   { background: var(--bg-card, #fff); border-radius: 12px; width: 480px;
                  max-width: calc(100vw - 32px); box-shadow: 0 20px 60px rgba(0,0,0,.25);
                  display: flex; flex-direction: column; }
    .ap-modal-sm { width: 400px; }

    .ap-modal-header { display: flex; align-items: flex-start; justify-content: space-between;
                       padding: 20px 24px 16px; border-bottom: 1px solid var(--border, #E4E4E7); }
    .ap-modal-title  { font-weight: 700; font-size: 16px; color: var(--text, #18181B); }
    .ap-modal-sub    { font-size: 12px; color: var(--text-muted, #71717A); margin-top: 2px; }
    .ap-close        { background: none; border: none; font-size: 18px; cursor: pointer;
                       color: var(--text-muted, #71717A); padding: 0 4px; line-height: 1; }

    .ap-modal-body   { padding: 20px 24px; }
    .ap-modal-footer { padding: 16px 24px; border-top: 1px solid var(--border, #E4E4E7);
                       display: flex; justify-content: flex-end; gap: 8px; }

    .ap-hint { background: var(--orange-pale, #E6F4EA); border-left: 3px solid var(--orange, #3BAA5D);
               padding: 10px 14px; font-size: 12px; color: var(--text, #18181B);
               border-radius: 4px; margin-bottom: 20px; line-height: 1.6; }

    .ap-field       { display: flex; flex-direction: column; gap: 6px; }
    .ap-field label { font-size: 12px; font-weight: 600; color: var(--text, #18181B); }
    .ap-input-row   { display: flex; gap: 8px; align-items: center; }
    .ap-input-row input { flex: 1; padding: 9px 12px; border: 1px solid var(--border, #E4E4E7);
                          border-radius: 6px; font-size: 13px; background: var(--bg-input, #fff);
                          color: var(--text, #18181B); outline: none; font-family: monospace; }
    .ap-input-row input:focus { border-color: var(--orange, #3BAA5D); }
    .ap-field-hint  { font-size: 11px; color: var(--text-muted, #71717A); line-height: 1.5; }
    .ap-eye         { background: none; border: 1px solid var(--border, #E4E4E7); border-radius: 6px;
                      font-size: 11px; font-weight: 600; color: var(--text-muted, #71717A);
                      cursor: pointer; padding: 6px 10px; white-space: nowrap; }

    @media (prefers-color-scheme: dark) {
      .ap-table tr:hover td { background: rgba(255,255,255,.04); }
      .ap-modal            { background: #1e2535; }
      .ap-modal-title      { color: #f1f5f9; }
      .ap-modal-sub        { color: #94a3b8; }
      .ap-close            { color: #94a3b8; }
      .ap-hint             { background: rgba(59,170,93,.14); color: #e2e8f0; }
      .ap-field label      { color: #e2e8f0; }
      .ap-field-hint       { color: #94a3b8; }
      .ap-btn-cancel       { color: #e2e8f0; }
      .ap-badge-ok   { background: rgba(22,163,74,.2);   color: #86efac; }
      .ap-badge-warn { background: rgba(234,179,8,.15);  color: #fde68a; }
      .ap-btn-del    { background: rgba(239,68,68,.15);  color: #fca5a5; }
    }
    :root[data-theme="dark"] .ap-table tr:hover td { background: rgba(255,255,255,.04); }
    :root[data-theme="dark"] .ap-modal            { background: #1e2535; }
    :root[data-theme="dark"] .ap-modal-title      { color: #f1f5f9; }
    :root[data-theme="dark"] .ap-modal-sub        { color: #94a3b8; }
    :root[data-theme="dark"] .ap-close            { color: #94a3b8; }
    :root[data-theme="dark"] .ap-hint             { background: rgba(59,170,93,.14); color: #e2e8f0; }
    :root[data-theme="dark"] .ap-field label      { color: #e2e8f0; }
    :root[data-theme="dark"] .ap-field-hint       { color: #94a3b8; }
    :root[data-theme="dark"] .ap-btn-cancel       { color: #e2e8f0; }
    :root[data-theme="dark"] .ap-badge-ok   { background: rgba(22,163,74,.2);   color: #86efac; }
    :root[data-theme="dark"] .ap-badge-warn { background: rgba(234,179,8,.15);  color: #fde68a; }
    :root[data-theme="dark"] .ap-btn-del    { background: rgba(239,68,68,.15);  color: #fca5a5; }
  `],
})
export class AdminPbxComponent implements OnInit {
  private http      = inject(HttpClient);
  private toast     = inject(ToastService);
  private transloco = inject(TranslocoService);

  users      = signal<PbxUserRow[]>([]);
  isLoading  = signal(true);
  loadError  = signal(false);
  isSaving   = signal(false);
  editUser   = signal<PbxUserRow | null>(null);
  deleteUser = signal<PbxUserRow | null>(null);

  searchQuery     = signal('');
  patToken        = '';
  isTokenVisible  = false;

  filteredUsers = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.users();
    return this.users().filter(u =>
      u.display_name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query)
    );
  });

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.isLoading.set(true);
    this.loadError.set(false);
    this.http.get<PbxUserRow[]>(`${API}/credentials`).subscribe({
      next:  rows => { this.users.set(rows); this.isLoading.set(false); },
      error: ()   => { this.loadError.set(true); this.isLoading.set(false); },
    });
  }

  openEdit(user: PbxUserRow): void {
    this.patToken       = '';
    this.isTokenVisible = false;
    this.editUser.set(user);
  }

  closeEdit(): void { this.editUser.set(null); }

  saveToken(): void {
    const user = this.editUser();
    if (!user || !this.patToken.trim()) return;
    this.isSaving.set(true);

    this.http.put<{ ok: boolean; direct_phone: string | null }>(
      `${API}/credentials/${user.id}`,
      { pat_token: this.patToken.trim() }
    ).subscribe({
      next: res => {
        this.isSaving.set(false);
        this.closeEdit();
        this.toast.success(res.direct_phone
          ? this.transloco.translate('admin.pbx.toast.savedWithPhone', { phone: res.direct_phone })
          : this.transloco.translate('admin.pbx.toast.saved'));
        this.load();
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error(err.error?.error ?? this.transloco.translate('admin.pbx.toast.saveError'));
      },
    });
  }

  confirmDelete(user: PbxUserRow): void { this.deleteUser.set(user); }
  cancelDelete(): void { this.deleteUser.set(null); }

  deleteToken(): void {
    const user = this.deleteUser();
    if (!user) return;
    this.isSaving.set(true);
    this.http.delete(`${API}/credentials/${user.id}`).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.deleteUser.set(null);
        this.toast.success(this.transloco.translate('admin.pbx.toast.deleted'));
        this.load();
      },
      error: () => {
        this.isSaving.set(false);
        this.toast.error(this.transloco.translate('admin.pbx.toast.deleteError'));
      },
    });
  }

  crmRoleLabel(role: string): string {
    if (role === 'sales_manager') return this.transloco.translate('admin.pbx.roles.salesManager');
    if (role === 'salesperson')   return this.transloco.translate('admin.pbx.roles.salesperson');
    return role;
  }
}

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
import { localizedApiErrorMessage } from '../../../core/services/api-error.util';

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
      </div>
      <div class="ap-body">
      <p class="ap-sub">{{ t('pbx.subtitle') }}</p>

      @if (isLoading()) {
        <div class="ap-loading">{{ t('pbx.loading') }}</div>
      } @else if (loadError()) {
        <div class="ap-error">{{ t('pbx.loadError') }}</div>
      } @else {
        <div class="ap-toolbar">
          <input class="ap-search" type="search" name="pbx-user-filter" autocomplete="off"
                 data-1p-ignore data-lpignore="true" [placeholder]="t('pbx.searchPlaceholder')"
                 [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
        </div>

        <div class="ap-card">
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
                    <button class="btn btn-p btn-sm" (click)="openEdit(u)">
                      {{ u.has_pat ? t('pbx.actions.changeToken') : t('pbx.actions.setToken') }}
                    </button>
                    @if (u.has_pat) {
                      <button class="btn btn-d btn-sm" (click)="confirmDelete(u)">{{ t('pbx.actions.delete') }}</button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
        </div>
      }
      </div>

      @if (editUser()) {
        <div class="ap-overlay" (click)="closeEdit()">
          <div class="ap-modal" role="dialog" aria-modal="true" aria-labelledby="pbx-modal-title" (click)="$event.stopPropagation()">
            <div class="ap-modal-header">
              <div>
                <div class="ap-modal-title" id="pbx-modal-title">{{ t('pbx.modal.title', { name: editUser()!.display_name }) }}</div>
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
                <label for="pbx-pat-token">{{ t('pbx.modal.patLabel') }}</label>
                <div class="ap-input-row">
                  <!-- A password field makes browsers autofill the user filter as a
                       login and the PAT as a saved password. Mask a text field instead. -->
                  <input id="pbx-pat-token" name="pbx-pat-token" type="text" class="fi" [(ngModel)]="patToken"
                         [class.ap-token-masked]="!isTokenVisible"
                         [placeholder]="t('pbx.modal.patPlaceholder')" autocomplete="new-password"
                         autocapitalize="off" autocorrect="off" spellcheck="false"
                         data-1p-ignore data-lpignore="true" />
                  <button class="btn btn-g ap-eye" type="button" (click)="isTokenVisible = !isTokenVisible">
                    {{ isTokenVisible ? t('pbx.actions.hide') : t('pbx.actions.show') }}
                  </button>
                </div>
                <div class="ap-field-hint">{{ t('pbx.modal.patHint') }}</div>
              </div>
            </div>

            <div class="ap-modal-footer">
              <button class="btn btn-g" (click)="closeEdit()">{{ t('pbx.actions.cancel') }}</button>
              <button class="btn btn-p" [disabled]="isSaving() || !patToken.trim()"
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
              <button class="btn btn-g" (click)="cancelDelete()">{{ t('pbx.actions.cancel') }}</button>
              <button class="btn btn-d" [disabled]="isSaving()" (click)="deleteToken()">
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
    .ap-page { padding: 0; }

    .ap-header { height: 60px; padding: 0 24px; display: flex; align-items: center; gap: 12px;
                 background: var(--surface); border-bottom: 1px solid var(--gray-200); }
    .ap-title  { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 700; color: var(--text, var(--ink-strong)); margin: 0; }
    .ap-body   { padding: 20px 24px 24px; max-width: 1000px; }
    .ap-sub    { font-size: 12px; color: var(--text-muted, var(--gray-500)); margin: 0 0 16px; max-width: 620px; }

    .ap-loading { padding: 48px; text-align: center; color: var(--text-muted, var(--gray-500)); }
    .ap-error   { padding: 16px; background: color-mix(in srgb, #fee2e2 var(--tint-mix), var(--surface)); border-radius: 12px; color: oklch(from #b91c1c max(l, var(--text-min-l)) c h); }

    .ap-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 16px;
                  padding: 12px 18px; background: var(--surface); border-radius: 14px; box-shadow: var(--shadow-sm); }
    .ap-card    { background: var(--surface); border-radius: 12px; box-shadow: var(--shadow-sm); overflow: hidden; }
    .ap-table th.ap-th-count { text-align: right; text-transform: none;
                               font-size: 12px; font-weight: 500; letter-spacing: normal;
                               white-space: nowrap; }

    .ap-table   { width: 100%; border-collapse: collapse; font-size: 14px; }
    .ap-table th { padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600;
                   text-transform: uppercase; letter-spacing: 0.05em;
                   color: var(--text-muted, var(--gray-500)); background: var(--gray-50); border-bottom: 1px solid var(--gray-200); }
    .ap-table th:first-child, .ap-table td:first-child { padding-left: 16px; }
    .ap-table th:last-child, .ap-table td:last-child { padding-right: 16px; }
    .ap-table td { padding: 12px; border-bottom: 1px solid var(--gray-100); vertical-align: middle; }
    .ap-table tbody tr:last-child td { border-bottom: none; }
    .ap-table tr:hover td { background: var(--bg-hover, var(--gray-50)); }
    .ap-row-inactive td { opacity: 0.5; }

    .ap-uname  { font-weight: 600; color: var(--text, var(--ink-strong)); }
    .ap-uemail { font-size: 12px; color: var(--text-muted, var(--gray-500)); margin-top: 2px; }
    .ap-role   { font-size: 12px; background: var(--bg-muted, var(--gray-100));
                 padding: 2px 8px; border-radius: 10px; color: var(--text, var(--ink-strong)); }
    .ap-phone  { font-weight: 600; color: var(--orange, oklch(from #3baa5d max(l, var(--text-min-l)) c h)); font-family: monospace; }
    .ap-none   { color: var(--text-muted, var(--gray-500)); }
    .ap-date   { font-size: 12px; color: var(--text-muted, var(--gray-500)); }

    .ap-badge      { font-size: 12px; padding: 4px 8px; border-radius: 10px; font-weight: 600; }
    .ap-badge-ok   { background: color-mix(in srgb, #dcfce7 var(--tint-mix), var(--surface)); color: oklch(from #166534 max(l, var(--text-min-l)) c h); }
    .ap-badge-warn { background: color-mix(in srgb, #fef3c7 var(--tint-mix), var(--surface)); color: oklch(from #92400e max(l, var(--text-min-l)) c h); }

    .ap-actions     { white-space: nowrap; text-align: right; }
    .ap-actions-row { display: flex; gap: 8px; justify-content: flex-end; }

    .ap-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 1000;
                  display: flex; align-items: center; justify-content: center; }
    .ap-modal   { background: var(--bg-card, var(--surface)); border-radius: 16px; width: 480px;
                  max-width: calc(100vw - 32px); box-shadow: 0 12px 39px rgba(0,0,0,0.163);
                  display: flex; flex-direction: column; }
    .ap-modal-sm { width: 400px; }

    .ap-modal-header { display: flex; align-items: flex-start; justify-content: space-between;
                       padding: 20px 24px 16px; border-bottom: 1px solid var(--border, var(--gray-200)); }
    .ap-modal-title  { font-weight: 700; font-size: 16px; color: var(--text, var(--ink-strong)); }
    .ap-modal-sub    { font-size: 12px; color: var(--text-muted, var(--gray-500)); margin-top: 2px; }
    .ap-close        { background: none; border: none; font-size: 18px; cursor: pointer;
                       color: var(--text-muted, var(--gray-500)); padding: 0 4px; line-height: 1; }

    .ap-modal-body   { padding: 20px 24px; }
    .ap-modal-footer { padding: 16px 24px; border-top: 1px solid var(--border, var(--gray-200));
                       display: flex; justify-content: flex-end; gap: 8px; }

    .ap-hint { background: var(--orange-pale, var(--gray-200)); border-left: 3px solid var(--orange, #3BAA5D);
               padding: 10px 14px; font-size: 12px; color: var(--text, var(--ink-strong));
               border-radius: 10px; margin-bottom: 20px; line-height: 1.6; }

    .ap-field       { display: flex; flex-direction: column; gap: 6px; }
    .ap-field label { font-size: 12px; font-weight: 600; color: var(--text, var(--ink-strong)); }
    .ap-input-row   { display: flex; gap: 8px; align-items: center; }
    .ap-input-row input { flex: 1; min-width: 0; }
    .ap-token-masked { -webkit-text-security: disc; }
    .ap-field-hint  { font-size: 12px; color: var(--text-muted, var(--gray-500)); line-height: 1.5; }
    .ap-eye         { flex-shrink: 0; }

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

  private load(silent = false): void {
    if (!silent) this.isLoading.set(true);
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

  closeEdit(): void {
    this.editUser.set(null);
    this.patToken = '';
    this.isTokenVisible = false;
  }

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
        this.load(true);
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error(localizedApiErrorMessage(err.error?.error, this.transloco) ?? this.transloco.translate('admin.pbx.toast.saveError'));
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
        this.load(true);
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

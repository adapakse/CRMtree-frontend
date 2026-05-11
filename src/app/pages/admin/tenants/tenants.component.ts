import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Tenant, TenantFeature, CrmFeature } from '../../../core/models/models';
import { environment } from '../../../../environments/environment';

const API = environment.apiUrl;

const FEATURE_LABELS: Record<CrmFeature, string> = {
  documents:       'Dokumenty',
  leads:           'Leady',
  sales_reports:   'Raporty sprzedaży',
  onboarding:      'Onboarding',
  partner_registry:'Rejestr Partnerów',
  dwh_integration: 'DWH Integration',
  performance:     'Performance',
};

const ALL_FEATURES: CrmFeature[] = [
  'documents', 'leads', 'sales_reports', 'onboarding',
  'partner_registry', 'dwh_integration', 'performance',
];

interface CreateForm {
  name: string;
  slug: string;
  email_domain: string;
  dwh_schema_prefix: string;
}

@Component({
  selector: 'app-tenants',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Zarządzanie tenantami</h1>
          <p class="page-sub">{{ tenants().length }} tenant{{ tenants().length !== 1 ? 'y' : '' }}</p>
        </div>
        <button class="btn-primary" (click)="openCreate()">+ Nowy tenant</button>
      </div>

      <!-- Table -->
      @if (loading()) {
        <div class="loading">Ładowanie...</div>
      } @else if (tenants().length === 0) {
        <div class="empty">Brak tenantów.</div>
      } @else {
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Slug</th>
                <th>Domena</th>
                <th>Status</th>
                <th>Użytkownicy</th>
                <th>Moduły</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (t of tenants(); track t.id) {
                <tr [class.expanded]="expandedId() === t.id">
                  <td class="td-name">
                    <span class="tenant-name">{{ t.name }}</span>
                  </td>
                  <td><code class="slug">{{ t.slug }}</code></td>
                  <td class="td-muted">{{ t.email_domain || '—' }}</td>
                  <td>
                    <span class="badge" [class.badge-active]="t.is_active" [class.badge-inactive]="!t.is_active">
                      {{ t.is_active ? 'Aktywny' : 'Nieaktywny' }}
                    </span>
                  </td>
                  <td class="td-muted">{{ t.user_count ?? 0 }} / {{ t.total_users ?? 0 }}</td>
                  <td>
                    <div class="feat-pills">
                      @for (f of enabledFeatures(t); track f) {
                        <span class="pill">{{ featureLabel(f) }}</span>
                      }
                      @if (enabledFeatures(t).length === 0) {
                        <span class="td-muted">brak</span>
                      }
                    </div>
                  </td>
                  <td class="td-actions">
                    <button class="btn-icon" (click)="toggleExpand(t.id)" [title]="expandedId() === t.id ? 'Zwiń' : 'Edytuj'">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" [style.transform]="expandedId() === t.id ? 'rotate(180deg)' : ''">
                        <polyline points="6,9 12,15 18,9"/>
                      </svg>
                    </button>
                    <button class="btn-icon btn-imp" (click)="impersonate(t)" title="Impersonuj admina">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                        <polyline points="10,17 15,12 10,7"/>
                        <line x1="15" y1="12" x2="3" y2="12"/>
                      </svg>
                    </button>
                  </td>
                </tr>

                <!-- Expanded edit row -->
                @if (expandedId() === t.id) {
                  <tr class="edit-row">
                    <td colspan="7">
                      <div class="edit-panel">
                        <div class="edit-grid">
                          <div class="field">
                            <label>Nazwa</label>
                            <input [(ngModel)]="editDraft.name" placeholder="Nazwa tenanta">
                          </div>
                          <div class="field">
                            <label>Domena email</label>
                            <input [(ngModel)]="editDraft.email_domain" placeholder="acmecorp.com">
                          </div>
                          <div class="field">
                            <label>DWH prefix</label>
                            <input [(ngModel)]="editDraft.dwh_schema_prefix" placeholder="acme">
                          </div>
                          <div class="field field-check">
                            <label class="check-label">
                              <input type="checkbox" [(ngModel)]="editDraft.is_active">
                              Aktywny
                            </label>
                          </div>
                        </div>

                        <div class="feat-section">
                          <div class="feat-title">Moduły</div>
                          <div class="feat-grid">
                            @for (f of ALL_FEATURES; track f) {
                              <label class="feat-toggle" [class.on]="editDraft.features[f]">
                                <input type="checkbox" [(ngModel)]="editDraft.features[f]">
                                <span>{{ featureLabel(f) }}</span>
                              </label>
                            }
                          </div>
                        </div>

                        <div class="edit-actions">
                          <button class="btn-secondary" (click)="cancelEdit()">Anuluj</button>
                          <button class="btn-primary" [disabled]="saving()" (click)="saveEdit(t.id)">
                            {{ saving() ? 'Zapisuję...' : 'Zapisz' }}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Create modal -->
    @if (showCreate()) {
      <div class="modal-backdrop" (click)="closeCreate()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Nowy tenant</h2>
            <button class="btn-icon" (click)="closeCreate()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label>Nazwa <span class="req">*</span></label>
              <input [(ngModel)]="createForm.name" placeholder="CRMtree Silver" (input)="autoSlug()">
            </div>
            <div class="field">
              <label>Slug <span class="req">*</span></label>
              <input [(ngModel)]="createForm.slug" placeholder="crmtree-silver">
              <div class="hint">Tylko [a-z0-9-], min 2 znaki</div>
            </div>
            <div class="field">
              <label>Domena email</label>
              <input [(ngModel)]="createForm.email_domain" placeholder="acmecorp.com">
            </div>
            <div class="field">
              <label>DWH prefix</label>
              <input [(ngModel)]="createForm.dwh_schema_prefix" placeholder="crmtree_silver">
              <div class="hint">Tylko [a-z0-9_], musi zaczynać się literą</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="closeCreate()">Anuluj</button>
            <button class="btn-primary" [disabled]="saving() || !createForm.name || !createForm.slug" (click)="submitCreate()">
              {{ saving() ? 'Tworzę...' : 'Utwórz tenant' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Impersonate confirm modal -->
    @if (impersonateTarget()) {
      <div class="modal-backdrop" (click)="cancelImpersonate()">
        <div class="modal modal-sm" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Impersonacja</h2>
            <button class="btn-icon" (click)="cancelImpersonate()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <p>Zaloguj się jako admin tenanta <strong>{{ impersonateTarget()!.name }}</strong>?</p>
            <p class="hint">Otrzymasz nowy token dostępu (15 min). Twoja bieżąca sesja nie zostanie zakończona.</p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="cancelImpersonate()">Anuluj</button>
            <button class="btn-danger" [disabled]="saving()" (click)="confirmImpersonate()">
              {{ saving() ? 'Ładowanie...' : 'Impersonuj' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 1400px; }

    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 24px;
    }
    .page-title { font-size: 22px; font-weight: 600; color: var(--gray-900); margin: 0 0 2px; }
    .page-sub { font-size: 13px; color: var(--gray-500); margin: 0; }

    .loading, .empty { color: var(--gray-500); font-size: 14px; padding: 24px 0; text-align: center; }

    .table-wrap { overflow-x: auto; }
    .data-table {
      width: 100%; border-collapse: collapse;
      font-size: 13.5px; background: white;
      border: 1px solid var(--gray-200); border-radius: 8px; overflow: hidden;
    }
    .data-table th {
      background: var(--gray-50); padding: 10px 14px;
      text-align: left; font-weight: 600; font-size: 12px;
      text-transform: uppercase; letter-spacing: .4px; color: var(--gray-500);
      border-bottom: 1px solid var(--gray-200);
    }
    .data-table td { padding: 12px 14px; border-bottom: 1px solid var(--gray-100); vertical-align: middle; }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table tr.expanded td { background: var(--orange-pale); }
    .data-table tr.edit-row td { padding: 0; border-bottom: 1px solid var(--gray-200); }

    .tenant-name { font-weight: 500; color: var(--gray-900); }
    .slug { background: var(--gray-100); padding: 2px 7px; border-radius: 4px; font-size: 12px; color: var(--gray-700); }
    .td-muted { color: var(--gray-500); }
    .td-actions { display: flex; gap: 4px; justify-content: flex-end; white-space: nowrap; }

    .badge {
      display: inline-block; padding: 2px 10px; border-radius: 99px;
      font-size: 12px; font-weight: 500;
    }
    .badge-active   { background: #dcfce7; color: #16a34a; }
    .badge-inactive { background: var(--gray-100); color: var(--gray-500); }

    .feat-pills { display: flex; flex-wrap: wrap; gap: 4px; }
    .pill {
      background: var(--orange-pale); color: var(--orange-dark);
      font-size: 11px; padding: 2px 8px; border-radius: 99px; white-space: nowrap;
    }

    .btn-icon {
      width: 30px; height: 30px; border-radius: 6px; border: none;
      background: none; cursor: pointer; color: var(--gray-500);
      display: flex; align-items: center; justify-content: center;
      transition: background .12s, color .12s;
    }
    .btn-icon:hover { background: var(--gray-100); color: var(--gray-700); }
    .btn-icon svg { width: 15px; height: 15px; transition: transform .2s; }
    .btn-icon.btn-imp:hover { background: #eff6ff; color: #2563eb; }

    /* Edit panel */
    .edit-panel { padding: 16px 20px 20px; background: var(--orange-pale); }
    .edit-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px 16px; margin-bottom: 16px;
    }
    .field label { display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 4px; }
    .field input[type=text], .field input:not([type=checkbox]) {
      width: 100%; padding: 7px 10px; border: 1px solid var(--gray-300);
      border-radius: 6px; font-size: 13px; background: white;
      box-sizing: border-box;
    }
    .field input:focus { outline: none; border-color: var(--orange); box-shadow: 0 0 0 2px rgba(59,170,93,.15); }
    .field-check { display: flex; align-items: flex-end; padding-bottom: 4px; }
    .check-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--gray-700); cursor: pointer; }
    .check-label input { width: 15px; height: 15px; cursor: pointer; }

    .feat-section { margin-bottom: 16px; }
    .feat-title { font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .4px; }
    .feat-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .feat-toggle {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 99px; cursor: pointer;
      border: 1.5px solid var(--gray-300); background: white;
      font-size: 12.5px; color: var(--gray-600);
      transition: border-color .12s, background .12s, color .12s;
      user-select: none;
    }
    .feat-toggle input { display: none; }
    .feat-toggle.on { border-color: var(--orange); background: var(--orange-pale); color: var(--orange-dark); font-weight: 500; }
    .feat-toggle:hover { border-color: var(--orange); }

    .edit-actions { display: flex; gap: 8px; justify-content: flex-end; }

    /* Buttons */
    .btn-primary {
      padding: 8px 18px; background: var(--orange); color: white;
      border: none; border-radius: 7px; font-size: 13.5px; font-weight: 500;
      cursor: pointer; transition: background .12s;
    }
    .btn-primary:hover:not(:disabled) { background: var(--orange-dark); }
    .btn-primary:disabled { opacity: .55; cursor: not-allowed; }
    .btn-secondary {
      padding: 8px 18px; background: white; color: var(--gray-700);
      border: 1px solid var(--gray-300); border-radius: 7px; font-size: 13.5px;
      cursor: pointer; transition: background .12s;
    }
    .btn-secondary:hover { background: var(--gray-50); }
    .btn-danger {
      padding: 8px 18px; background: #dc2626; color: white;
      border: none; border-radius: 7px; font-size: 13.5px; font-weight: 500;
      cursor: pointer;
    }
    .btn-danger:hover:not(:disabled) { background: #b91c1c; }
    .btn-danger:disabled { opacity: .55; cursor: not-allowed; }

    /* Modal */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal {
      background: white; border-radius: 12px; width: 480px; max-width: 95vw;
      box-shadow: 0 20px 60px rgba(0,0,0,.25);
    }
    .modal-sm { width: 360px; }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 22px 14px; border-bottom: 1px solid var(--gray-200);
    }
    .modal-header h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .modal-body { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
    .modal-body p { margin: 0; font-size: 14px; color: var(--gray-700); }
    .modal-footer {
      display: flex; gap: 8px; justify-content: flex-end;
      padding: 14px 22px 18px; border-top: 1px solid var(--gray-200);
    }
    .hint { font-size: 11.5px; color: var(--gray-400); margin-top: 3px; }
    .req { color: #dc2626; }
  `],
})
export class TenantsComponent implements OnInit {
  private http  = inject(HttpClient);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  readonly ALL_FEATURES = ALL_FEATURES;

  tenants  = signal<Tenant[]>([]);
  loading  = signal(true);
  saving   = signal(false);
  expandedId = signal<string | null>(null);

  showCreate      = signal(false);
  impersonateTarget = signal<Tenant | null>(null);

  createForm: CreateForm = { name: '', slug: '', email_domain: '', dwh_schema_prefix: '' };

  editDraft: {
    name: string;
    email_domain: string;
    dwh_schema_prefix: string;
    is_active: boolean;
    features: Record<CrmFeature, boolean>;
  } = this.emptyDraft();

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.http.get<Tenant[]>(`${API}/admin/tenants`).subscribe({
      next: ts => { this.tenants.set(ts); this.loading.set(false); },
      error: () => { this.toast.error('Nie udało się pobrać tenantów'); this.loading.set(false); },
    });
  }

  enabledFeatures(t: Tenant): CrmFeature[] {
    return (t.features ?? []).filter(f => f.is_enabled).map(f => f.feature);
  }

  featureLabel(f: CrmFeature): string {
    return FEATURE_LABELS[f] ?? f;
  }

  toggleExpand(id: string): void {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
      return;
    }
    const t = this.tenants().find(x => x.id === id)!;
    const featMap = Object.fromEntries(ALL_FEATURES.map(f => [f, false])) as Record<CrmFeature, boolean>;
    for (const tf of t.features ?? []) featMap[tf.feature] = tf.is_enabled;
    this.editDraft = {
      name:              t.name,
      email_domain:      t.email_domain ?? '',
      dwh_schema_prefix: t.dwh_schema_prefix ?? '',
      is_active:         t.is_active,
      features:          featMap,
    };
    this.expandedId.set(id);
  }

  cancelEdit(): void {
    this.expandedId.set(null);
  }

  saveEdit(id: string): void {
    this.saving.set(true);
    const meta = {
      name:              this.editDraft.name || undefined,
      email_domain:      this.editDraft.email_domain || null,
      dwh_schema_prefix: this.editDraft.dwh_schema_prefix || null,
      is_active:         this.editDraft.is_active,
    };
    this.http.patch<Tenant>(`${API}/admin/tenants/${id}`, meta).subscribe({
      next: updated => {
        this.http.put<TenantFeature[]>(`${API}/admin/tenants/${id}/features`, { features: this.editDraft.features }).subscribe({
          next: features => {
            this.tenants.update(ts => ts.map(t => t.id === id ? { ...updated, features, user_count: t.user_count, total_users: t.total_users } : t));
            this.saving.set(false);
            this.expandedId.set(null);
            this.toast.success('Tenant zaktualizowany');
          },
          error: () => { this.saving.set(false); this.toast.error('Błąd zapisu feature flags'); },
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error ?? 'Błąd zapisu tenanta');
      },
    });
  }

  // ── Create ────────────────────────────────────────────────────
  openCreate(): void {
    this.createForm = { name: '', slug: '', email_domain: '', dwh_schema_prefix: '' };
    this.showCreate.set(true);
  }

  closeCreate(): void {
    this.showCreate.set(false);
  }

  autoSlug(): void {
    if (!this.createForm.name) { this.createForm.slug = ''; return; }
    this.createForm.slug = this.createForm.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  submitCreate(): void {
    this.saving.set(true);
    const payload: any = { name: this.createForm.name, slug: this.createForm.slug };
    if (this.createForm.email_domain)      payload.email_domain      = this.createForm.email_domain;
    if (this.createForm.dwh_schema_prefix) payload.dwh_schema_prefix = this.createForm.dwh_schema_prefix;

    this.http.post<Tenant>(`${API}/admin/tenants`, payload).subscribe({
      next: tenant => {
        this.tenants.update(ts => [{ ...tenant, user_count: 0, total_users: 0, features: ALL_FEATURES.map(f => ({ feature: f, is_enabled: false })) }, ...ts]);
        this.saving.set(false);
        this.showCreate.set(false);
        this.toast.success(`Tenant "${tenant.name}" utworzony`);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.errors?.[0]?.msg ?? err?.error?.error ?? 'Błąd tworzenia tenanta';
        this.toast.error(msg);
      },
    });
  }

  // ── Impersonate ────────────────────────────────────────────────
  impersonate(t: Tenant): void {
    this.impersonateTarget.set(t);
  }

  cancelImpersonate(): void {
    this.impersonateTarget.set(null);
  }

  confirmImpersonate(): void {
    const t = this.impersonateTarget()!;
    this.saving.set(true);
    this.http.post<{ access_token: string; impersonated_user: any }>(`${API}/admin/tenants/${t.id}/impersonate`, {}).subscribe({
      next: ({ access_token, impersonated_user }) => {
        sessionStorage.setItem('wt_impersonation', JSON.stringify({ token: access_token, tenant: t.name, user: impersonated_user.email }));
        this.saving.set(false);
        this.impersonateTarget.set(null);
        this.toast.success(`Token dla ${impersonated_user.email} skopiowany do sessionStorage['wt_impersonation']`);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error ?? 'Błąd impersonacji');
      },
    });
  }

  private emptyDraft() {
    return {
      name: '', email_domain: '', dwh_schema_prefix: '', is_active: true,
      features: Object.fromEntries(ALL_FEATURES.map(f => [f, false])) as Record<CrmFeature, boolean>,
    };
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Tenant, TenantFeature, CrmFeature } from '../../../core/models/models';
import { environment } from '../../../../environments/environment';

const API = environment.apiUrl;

const FEATURE_LABELS: Record<CrmFeature, string> = {
  documents:        'Dokumenty',
  leads:            'Leady',
  sales_reports:    'Raporty sprzedaży',
  onboarding:       'Onboarding',
  partner_registry: 'Rejestr Partnerów',
  dwh_integration:  'DWH Integration',
  performance:      'Performance',
};

const ALL_FEATURES: CrmFeature[] = [
  'documents', 'leads', 'sales_reports', 'onboarding',
  'partner_registry', 'dwh_integration', 'performance',
];

interface TenantUser {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  is_active: boolean;
  crm_role?: string | null;
  last_login_at?: string | null;
}

type EditTab = 'settings' | 'features' | 'users';

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
        <div class="state-msg">Ładowanie...</div>
      } @else if (tenants().length === 0) {
        <div class="state-msg">Brak tenantów.</div>
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
                  <td><span class="tenant-name">{{ t.name }}</span></td>
                  <td><code class="slug">{{ t.slug }}</code></td>
                  <td class="td-muted">{{ t.email_domain || '—' }}</td>
                  <td>
                    <span class="badge" [class.badge-on]="t.is_active" [class.badge-off]="!t.is_active">
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
                    <button class="btn-icon" (click)="toggleExpand(t)" title="Edytuj / Użytkownicy">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                           [style.transform]="expandedId() === t.id ? 'rotate(180deg)' : 'rotate(0)'">
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

                <!-- Expanded panel -->
                @if (expandedId() === t.id) {
                  <tr class="edit-row">
                    <td colspan="7">
                      <div class="edit-panel">

                        <!-- Tabs -->
                        <div class="tabs">
                          <button class="tab" [class.active]="editTab() === 'settings'" (click)="editTab.set('settings')">Ustawienia</button>
                          <button class="tab" [class.active]="editTab() === 'features'"  (click)="editTab.set('features')">Moduły</button>
                          <button class="tab" [class.active]="editTab() === 'users'"     (click)="openUsersTab(t.id)">
                            Użytkownicy
                            @if (tenantUsers().length > 0) { <span class="tab-badge">{{ tenantUsers().length }}</span> }
                          </button>
                        </div>

                        <!-- Tab: Settings -->
                        @if (editTab() === 'settings') {
                          <div class="tab-body">
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
                            <div class="panel-footer">
                              <button class="btn-secondary" (click)="cancelEdit()">Anuluj</button>
                              <button class="btn-primary" [disabled]="saving()" (click)="saveSettings(t.id)">
                                {{ saving() ? 'Zapisuję...' : 'Zapisz' }}
                              </button>
                            </div>
                          </div>
                        }

                        <!-- Tab: Features -->
                        @if (editTab() === 'features') {
                          <div class="tab-body">
                            <div class="feat-grid">
                              @for (f of ALL_FEATURES; track f) {
                                <label class="feat-toggle" [class.on]="editDraft.features[f]">
                                  <input type="checkbox" [(ngModel)]="editDraft.features[f]">
                                  <span>{{ featureLabel(f) }}</span>
                                </label>
                              }
                            </div>
                            <div class="panel-footer">
                              <button class="btn-secondary" (click)="cancelEdit()">Anuluj</button>
                              <button class="btn-primary" [disabled]="saving()" (click)="saveFeatures(t.id)">
                                {{ saving() ? 'Zapisuję...' : 'Zapisz moduły' }}
                              </button>
                            </div>
                          </div>
                        }

                        <!-- Tab: Users -->
                        @if (editTab() === 'users') {
                          <div class="tab-body">
                            @if (usersLoading()) {
                              <div class="state-msg">Ładowanie użytkowników...</div>
                            } @else if (tenantUsers().length === 0) {
                              <div class="empty-users">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                  <circle cx="12" cy="7" r="4"/>
                                </svg>
                                <p>Brak użytkowników w tym tenancie.</p>
                                <p class="hint">Utwórz pierwszego admina, żeby móc się zalogować.</p>
                              </div>
                            } @else {
                              <table class="users-table">
                                <thead>
                                  <tr>
                                    <th>Email</th>
                                    <th>Nazwa</th>
                                    <th>Rola</th>
                                    <th>Status</th>
                                    <th>Ostatnie logowanie</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  @for (u of tenantUsers(); track u.id) {
                                    <tr>
                                      <td>{{ u.email }}</td>
                                      <td>{{ u.display_name }}</td>
                                      <td>
                                        @if (u.is_admin) { <span class="badge badge-admin">Admin</span> }
                                        @else if (u.crm_role) { <span class="td-muted">{{ u.crm_role }}</span> }
                                        @else { <span class="td-muted">—</span> }
                                      </td>
                                      <td>
                                        <span class="badge" [class.badge-on]="u.is_active" [class.badge-off]="!u.is_active">
                                          {{ u.is_active ? 'Aktywny' : 'Nieaktywny' }}
                                        </span>
                                      </td>
                                      <td class="td-muted">{{ u.last_login_at ? (u.last_login_at | date:'dd.MM.yyyy HH:mm') : '—' }}</td>
                                    </tr>
                                  }
                                </tbody>
                              </table>
                            }
                            <div class="panel-footer">
                              <button class="btn-secondary" (click)="cancelEdit()">Zamknij</button>
                              <button class="btn-primary" (click)="openAddUser(t.id)">+ Dodaj użytkownika</button>
                            </div>
                          </div>
                        }

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

    <!-- Create tenant modal -->
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
              <div class="hint">Tylko [a-z0-9-], min 2 znaki. Niezmienialny po utworzeniu.</div>
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

    <!-- Add user modal -->
    @if (showAddUser()) {
      <div class="modal-backdrop" (click)="closeAddUser()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Dodaj użytkownika</h2>
            <button class="btn-icon" (click)="closeAddUser()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label>Email <span class="req">*</span></label>
              <input type="email" [(ngModel)]="addUserForm.email" placeholder="jan.kowalski@firma.com">
            </div>
            <div class="field">
              <label>Imię <span class="req">*</span></label>
              <input [(ngModel)]="addUserForm.first_name" placeholder="Jan">
            </div>
            <div class="field">
              <label>Nazwisko <span class="req">*</span></label>
              <input [(ngModel)]="addUserForm.last_name" placeholder="Kowalski">
            </div>
            <div class="field field-check">
              <label class="check-label">
                <input type="checkbox" [(ngModel)]="addUserForm.is_admin">
                Administrator tenanta
              </label>
            </div>
            <div class="info-box">
              Zostanie wygenerowane jednorazowe hasło tymczasowe. Użytkownik będzie musiał je zmienić przy pierwszym logowaniu.
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="closeAddUser()">Anuluj</button>
            <button class="btn-primary"
                    [disabled]="saving() || !addUserForm.email || !addUserForm.first_name || !addUserForm.last_name"
                    (click)="submitAddUser()">
              {{ saving() ? 'Tworzę...' : 'Utwórz użytkownika' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Temp password modal -->
    @if (tempPassword()) {
      <div class="modal-backdrop">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Użytkownik utworzony</h2>
          </div>
          <div class="modal-body">
            <p>Użytkownik <strong>{{ tempUserEmail() }}</strong> został dodany.</p>
            <p>Jednorazowe hasło tymczasowe (wyświetlane tylko raz):</p>
            <div class="temp-pass-box">{{ tempPassword() }}</div>
            <div class="info-box">Skopiuj hasło teraz — nie będzie dostępne po zamknięciu tego okna.</div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="copyTempPassword()">Kopiuj</button>
            <button class="btn-primary" (click)="closeTempPassword()">Zamknij</button>
          </div>
        </div>
      </div>
    }

    <!-- Impersonate confirm -->
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
            <p class="hint">Otrzymasz nowy token dostępu (ważny 15 min). Twoja sesja nie zostanie zakończona.</p>
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
    .page-sub   { font-size: 13px; color: var(--gray-500); margin: 0; }

    .state-msg { color: var(--gray-500); font-size: 14px; padding: 24px 0; text-align: center; }

    /* Table */
    .table-wrap { overflow-x: auto; }
    .data-table {
      width: 100%; border-collapse: collapse; font-size: 13.5px;
      background: white; border: 1px solid var(--gray-200); border-radius: 8px; overflow: hidden;
    }
    .data-table th {
      background: var(--gray-50); padding: 10px 14px; text-align: left;
      font-weight: 600; font-size: 11.5px; text-transform: uppercase; letter-spacing: .4px;
      color: var(--gray-500); border-bottom: 1px solid var(--gray-200);
    }
    .data-table td { padding: 12px 14px; border-bottom: 1px solid var(--gray-100); vertical-align: middle; }
    .data-table tr:last-child > td { border-bottom: none; }
    .data-table tr.expanded > td { background: var(--orange-pale); }
    .data-table tr.edit-row > td { padding: 0; border-bottom: 2px solid var(--orange); }

    .tenant-name { font-weight: 500; color: var(--gray-900); }
    .slug { background: var(--gray-100); padding: 2px 7px; border-radius: 4px; font-size: 12px; color: var(--gray-700); }
    .td-muted { color: var(--gray-500); font-size: 13px; }
    .td-actions { display: flex; gap: 4px; justify-content: flex-end; }

    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 500; }
    .badge-on    { background: #dcfce7; color: #16a34a; }
    .badge-off   { background: var(--gray-100); color: var(--gray-500); }
    .badge-admin { background: #eff6ff; color: #2563eb; }

    .feat-pills { display: flex; flex-wrap: wrap; gap: 4px; }
    .pill { background: var(--orange-pale); color: var(--orange-dark); font-size: 11px; padding: 2px 8px; border-radius: 99px; }

    .btn-icon {
      width: 30px; height: 30px; border-radius: 6px; border: none; background: none;
      cursor: pointer; color: var(--gray-500);
      display: flex; align-items: center; justify-content: center; transition: background .12s, color .12s;
    }
    .btn-icon:hover { background: var(--gray-100); color: var(--gray-700); }
    .btn-icon svg { width: 15px; height: 15px; transition: transform .2s; }
    .btn-icon.btn-imp:hover { background: #eff6ff; color: #2563eb; }

    /* Edit panel */
    .edit-panel { background: var(--orange-pale); }

    .tabs { display: flex; border-bottom: 1px solid var(--gray-200); padding: 0 20px; background: white; }
    .tab {
      padding: 10px 16px; font-size: 13.5px; font-weight: 500; color: var(--gray-500);
      background: none; border: none; border-bottom: 2px solid transparent;
      cursor: pointer; margin-bottom: -1px; transition: color .12s, border-color .12s;
      display: flex; align-items: center; gap: 6px;
    }
    .tab:hover { color: var(--gray-700); }
    .tab.active { color: var(--orange); border-bottom-color: var(--orange); }
    .tab-badge { background: var(--orange); color: white; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; }

    .tab-body { padding: 16px 20px 20px; }

    .edit-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px 16px; margin-bottom: 16px;
    }
    .field label { display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 4px; }
    .field input:not([type=checkbox]) {
      width: 100%; padding: 7px 10px; border: 1px solid var(--gray-300);
      border-radius: 6px; font-size: 13px; background: white; box-sizing: border-box;
    }
    .field input:focus { outline: none; border-color: var(--orange); box-shadow: 0 0 0 2px rgba(59,170,93,.15); }
    .field-check { display: flex; align-items: flex-end; padding-bottom: 2px; }
    .check-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--gray-700); cursor: pointer; }

    .feat-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .feat-toggle {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 99px; cursor: pointer;
      border: 1.5px solid var(--gray-300); background: white;
      font-size: 12.5px; color: var(--gray-600); user-select: none;
      transition: border-color .12s, background .12s, color .12s;
    }
    .feat-toggle input { display: none; }
    .feat-toggle.on { border-color: var(--orange); background: var(--orange-pale); color: var(--orange-dark); font-weight: 500; }
    .feat-toggle:hover { border-color: var(--orange); }

    .panel-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }

    /* Users tab */
    .empty-users { text-align: center; padding: 24px 0; color: var(--gray-500); }
    .empty-users svg { width: 36px; height: 36px; margin-bottom: 8px; }
    .empty-users p { margin: 4px 0; font-size: 14px; }
    .users-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }
    .users-table th {
      text-align: left; padding: 7px 10px; font-size: 11.5px; font-weight: 600;
      color: var(--gray-500); text-transform: uppercase; letter-spacing: .4px;
      border-bottom: 1px solid var(--gray-200);
    }
    .users-table td { padding: 9px 10px; border-bottom: 1px solid var(--gray-100); }
    .users-table tr:last-child td { border-bottom: none; }

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
      border: none; border-radius: 7px; font-size: 13.5px; font-weight: 500; cursor: pointer;
    }
    .btn-danger:hover:not(:disabled) { background: #b91c1c; }
    .btn-danger:disabled { opacity: .55; cursor: not-allowed; }

    /* Modal */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal { background: white; border-radius: 12px; width: 480px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
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
    .req  { color: #dc2626; }
    .info-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #1e40af; }
    .temp-pass-box {
      font-family: monospace; font-size: 20px; font-weight: 700; letter-spacing: 2px;
      background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 8px;
      padding: 12px 16px; text-align: center; color: var(--gray-900);
    }
  `],
})
export class TenantsComponent implements OnInit {
  private http  = inject(HttpClient);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  readonly ALL_FEATURES = ALL_FEATURES;

  tenants      = signal<Tenant[]>([]);
  loading      = signal(true);
  saving       = signal(false);
  expandedId   = signal<string | null>(null);
  editTab      = signal<EditTab>('settings');

  tenantUsers  = signal<TenantUser[]>([]);
  usersLoading = signal(false);

  showCreate        = signal(false);
  showAddUser       = signal(false);
  addUserTenantId   = signal<string | null>(null);
  impersonateTarget = signal<Tenant | null>(null);

  tempPassword  = signal<string | null>(null);
  tempUserEmail = signal<string>('');

  createForm = { name: '', slug: '', email_domain: '', dwh_schema_prefix: '' };
  addUserForm = { email: '', first_name: '', last_name: '', is_admin: true };

  editDraft: {
    name: string; email_domain: string; dwh_schema_prefix: string; is_active: boolean;
    features: Record<CrmFeature, boolean>;
  } = this.emptyDraft();

  ngOnInit(): void { this.load(); }

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
  featureLabel(f: CrmFeature): string { return FEATURE_LABELS[f] ?? f; }

  // ── Expand / edit ────────────────────────────────────────────
  toggleExpand(t: Tenant): void {
    if (this.expandedId() === t.id) { this.expandedId.set(null); return; }
    const featMap = Object.fromEntries(ALL_FEATURES.map(f => [f, false])) as Record<CrmFeature, boolean>;
    for (const tf of t.features ?? []) featMap[tf.feature] = tf.is_enabled;
    this.editDraft = {
      name: t.name, email_domain: t.email_domain ?? '', dwh_schema_prefix: t.dwh_schema_prefix ?? '',
      is_active: t.is_active, features: featMap,
    };
    this.editTab.set('settings');
    this.tenantUsers.set([]);
    this.expandedId.set(t.id);
  }

  cancelEdit(): void { this.expandedId.set(null); }

  saveSettings(id: string): void {
    this.saving.set(true);
    const body = {
      name:              this.editDraft.name || undefined,
      email_domain:      this.editDraft.email_domain || null,
      dwh_schema_prefix: this.editDraft.dwh_schema_prefix || null,
      is_active:         this.editDraft.is_active,
    };
    this.http.patch<Tenant>(`${API}/admin/tenants/${id}`, body).subscribe({
      next: updated => {
        this.tenants.update(ts => ts.map(t => t.id === id ? { ...t, ...updated } : t));
        this.saving.set(false);
        this.toast.success('Ustawienia zapisane');
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd zapisu'); },
    });
  }

  saveFeatures(id: string): void {
    this.saving.set(true);
    this.http.put<TenantFeature[]>(`${API}/admin/tenants/${id}/features`, { features: this.editDraft.features }).subscribe({
      next: features => {
        this.tenants.update(ts => ts.map(t => t.id === id ? { ...t, features } : t));
        this.saving.set(false);
        this.toast.success('Moduły zapisane');
      },
      error: () => { this.saving.set(false); this.toast.error('Błąd zapisu modułów'); },
    });
  }

  // ── Users tab ────────────────────────────────────────────────
  openUsersTab(id: string): void {
    this.editTab.set('users');
    this.usersLoading.set(true);
    this.http.get<TenantUser[]>(`${API}/admin/tenants/${id}/users`).subscribe({
      next: users => { this.tenantUsers.set(users); this.usersLoading.set(false); },
      error: () => { this.toast.error('Błąd ładowania użytkowników'); this.usersLoading.set(false); },
    });
  }

  openAddUser(tenantId: string): void {
    this.addUserForm = { email: '', first_name: '', last_name: '', is_admin: true };
    this.addUserTenantId.set(tenantId);
    this.showAddUser.set(true);
  }

  closeAddUser(): void { this.showAddUser.set(false); }

  submitAddUser(): void {
    const tenantId = this.addUserTenantId()!;
    this.saving.set(true);
    this.http.post<any>(`${API}/admin/tenants/${tenantId}/users`, this.addUserForm).subscribe({
      next: result => {
        this.saving.set(false);
        this.showAddUser.set(false);
        this.tenantUsers.update(us => [...us, result]);
        this.tenants.update(ts => ts.map(t => t.id === tenantId
          ? { ...t, total_users: (t.total_users ?? 0) + 1, user_count: (t.user_count ?? 0) + 1 }
          : t
        ));
        this.tempPassword.set(result.temp_password);
        this.tempUserEmail.set(result.email);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.error ?? 'Błąd tworzenia użytkownika');
      },
    });
  }

  copyTempPassword(): void {
    navigator.clipboard.writeText(this.tempPassword()!);
    this.toast.success('Hasło skopiowane');
  }

  closeTempPassword(): void { this.tempPassword.set(null); }

  // ── Create tenant ────────────────────────────────────────────
  openCreate(): void {
    this.createForm = { name: '', slug: '', email_domain: '', dwh_schema_prefix: '' };
    this.showCreate.set(true);
  }
  closeCreate(): void { this.showCreate.set(false); }

  autoSlug(): void {
    this.createForm.slug = this.createForm.name
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  submitCreate(): void {
    this.saving.set(true);
    const payload: any = { name: this.createForm.name, slug: this.createForm.slug };
    if (this.createForm.email_domain)      payload.email_domain      = this.createForm.email_domain;
    if (this.createForm.dwh_schema_prefix) payload.dwh_schema_prefix = this.createForm.dwh_schema_prefix;
    this.http.post<Tenant>(`${API}/admin/tenants`, payload).subscribe({
      next: tenant => {
        this.tenants.update(ts => [{
          ...tenant, user_count: 0, total_users: 0,
          features: ALL_FEATURES.map(f => ({ feature: f, is_enabled: false })),
        }, ...ts]);
        this.saving.set(false);
        this.showCreate.set(false);
        this.toast.success(`Tenant "${tenant.name}" utworzony`);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.errors?.[0]?.msg ?? err?.error?.error ?? 'Błąd tworzenia tenanta');
      },
    });
  }

  // ── Impersonate ──────────────────────────────────────────────
  impersonate(t: Tenant): void { this.impersonateTarget.set(t); }
  cancelImpersonate(): void    { this.impersonateTarget.set(null); }

  confirmImpersonate(): void {
    const t = this.impersonateTarget()!;
    this.saving.set(true);
    this.http.post<{ access_token: string; impersonated_user: any }>(`${API}/admin/tenants/${t.id}/impersonate`, {}).subscribe({
      next: ({ access_token, impersonated_user }) => {
        sessionStorage.setItem('wt_impersonation', JSON.stringify({ token: access_token, tenant: t.name, user: impersonated_user.email }));
        this.saving.set(false);
        this.impersonateTarget.set(null);
        this.toast.success(`Token dla ${impersonated_user.email} zapisany w sessionStorage['wt_impersonation']`);
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd impersonacji'); },
    });
  }

  private emptyDraft() {
    return {
      name: '', email_domain: '', dwh_schema_prefix: '', is_active: true,
      features: Object.fromEntries(ALL_FEATURES.map(f => [f, false])) as Record<CrmFeature, boolean>,
    };
  }
}

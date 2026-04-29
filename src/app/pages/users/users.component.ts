import { Component, inject, signal, computed, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, GroupService } from '../../core/services/api.services';
import { ToastService } from '../../core/services/toast.service';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { User, GroupProfile } from '../../core/models/models';
import { AvatarComponent, GroupPillComponent } from '../../shared/components/badges.components';
import { CrmApiService, SalesBudget } from '../../core/services/crm-api.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'wt-users',
  standalone: true,
  imports: [CommonModule, FormsModule, AvatarComponent, GroupPillComponent],
  template: `
    <div id="topbar">
      <span class="page-title">User Management</span>
      <span class="tsp"></span>
      <div class="srch-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input class="srch" type="search" placeholder="Search users…"
               [(ngModel)]="search" (ngModelChange)="onSearch()">
      </div>
      @if (isAdmin()) {
        <button class="btn btn-p" style="margin-left:8px" (click)="openNew()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New User
        </button>
      }
    </div>

    <div id="content">
      <div style="margin-bottom:16px;display:flex;gap:10px;align-items:center">
        <select class="sel" [(ngModel)]="filterGroup" (ngModelChange)="load()">
          <option value="">All Groups</option>
          @for (g of groups(); track g.id) { <option [value]="g.id">{{ g.display_name }}</option> }
        </select>
        <select class="sel" [(ngModel)]="filterActive" (ngModelChange)="load()">
          <option value="">All Users</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <span style="font-size:12.5px;color:var(--gray-400)">{{ total() }} users</span>
      </div>

      <div class="tw">
        <div class="thead" style="grid-template-columns:40px 1fr 200px 1fr 110px 120px 80px">
          <div class="th"></div>
          <div class="th">User</div>
          <div class="th">Email</div>
          <div class="th">Groups &amp; Roles</div>
          <div class="th">CRM Role</div>
          <div class="th">Last Login</div>
          <div class="th">Status</div>
        </div>

        @if (loading()) {
          <div class="loading-overlay"><div class="spinner"></div></div>
        }

        @for (user of users(); track user.id) {
          <div class="tr" style="grid-template-columns:40px 1fr 200px 1fr 110px 120px 80px" (click)="openUser(user)">
            <div class="td"><wt-avatar [name]="user.display_name" [size]="28" /></div>
            <div class="td">
              <div style="font-weight:500;color:var(--gray-900)">{{ user.display_name }}</div>
              @if (user.is_admin) { <span style="font-size:10px;background:var(--orange-pale);color:var(--orange-dark);padding:1px 6px;border-radius:4px;font-weight:600">ADMIN</span> }
            </div>
            <div class="td" style="font-size:12px;color:var(--gray-500)">{{ user.email }}</div>
            <div class="td">
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                @for (role of rolesPreview(user); track role.role_id) {
                  <span class="pill" [class]="groupCls(role.group_name)" style="font-size:10px">
                    {{ role.group_display ?? role.group_name }}
                    <span style="opacity:.7">{{ role.access_level }}</span>
                  </span>
                }
                @if (rolesOverflow(user) > 0) {
                  <span style="font-size:11px;color:var(--gray-400)">+{{ rolesOverflow(user) }}</span>
                }
              </div>
            </div>
            <div class="td">
              @if (user.crm_role === 'sales_manager') {
                <span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 7px;border-radius:4px;font-weight:600;white-space:nowrap">Manager</span>
              } @else if (user.crm_role === 'salesperson') {
                <span style="font-size:10px;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:4px;font-weight:600;white-space:nowrap">Handlowiec</span>
              } @else {
                <span style="font-size:11px;color:var(--gray-300)">—</span>
              }
            </div>
            <div class="td" style="font-size:12px;color:var(--gray-400)">
              {{ user.last_login_at ? (user.last_login_at | date:'dd.MM.yy HH:mm') : 'Never' }}
            </div>
            <div class="td">
              <span class="badge" [class]="user.is_active ? 's-signed' : 's-rejected'">
                <span class="bdot"></span>{{ user.is_active ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>
        }
        @empty {
          @if (!loading()) {
            <div class="empty-state"><div class="empty-icon">&#128100;</div><div class="empty-title">No users found</div></div>
          }
        }
      </div>

      @if (totalPages() > 1) {
        <div style="display:flex;align-items:center;gap:8px;margin-top:16px;justify-content:flex-end">
          <button class="btn btn-g btn-sm" [disabled]="page() === 1" (click)="setPage(page()-1)">Prev</button>
          <span style="font-size:12.5px;color:var(--gray-500)">Page {{ page() }} of {{ totalPages() }}</span>
          <button class="btn btn-g btn-sm" [disabled]="page() === totalPages()" (click)="setPage(page()+1)">Next</button>
        </div>
      }
    </div>

    <!-- New User Modal -->
    @if (isAdmin() && showNew()) {
      <div class="mol" (click)="showNew.set(false)">
        <div class="mo" (click)="$event.stopPropagation()">
          <div class="moh">
            <div class="moico" style="background:var(--orange-pale)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div>
              <div class="mot">Add New User</div>
              <div class="mos">Create a new user account manually</div>
            </div>
            <div class="mox" (click)="showNew.set(false)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
          </div>

          <div style="padding:24px">
            <div class="fgrid">
              <div class="fg">
                <label class="fl">First Name <span style="color:var(--orange)">*</span></label>
                <input class="fi" [(ngModel)]="newFirst" placeholder="Anna" [class.fi-err]="submitted && !newFirst">
                @if (submitted && !newFirst) { <span class="ferr">Required</span> }
              </div>
              <div class="fg">
                <label class="fl">Last Name <span style="color:var(--orange)">*</span></label>
                <input class="fi" [(ngModel)]="newLast" placeholder="Kowalska" [class.fi-err]="submitted && !newLast">
                @if (submitted && !newLast) { <span class="ferr">Required</span> }
              </div>
              <div class="fg" style="grid-column:1/-1">
                <label class="fl">Email Address <span style="color:var(--orange)">*</span></label>
                <input class="fi" type="email" [(ngModel)]="newEmail" placeholder="anna.kowalska@worktrips.com" [class.fi-err]="submitted && !newEmail">
                @if (submitted && !newEmail) { <span class="ferr">Required</span> }
              </div>
              <div class="fg">
                <label class="fl">Status</label>
                <select class="fsel" [(ngModel)]="newActive">
                  <option [ngValue]="true">Active</option>
                  <option [ngValue]="false">Inactive</option>
                </select>
              </div>
              <div class="fg">
                <label class="fl">Role</label>
                <select class="fsel" [(ngModel)]="newAdmin">
                  <option [ngValue]="false">Regular User</option>
                  <option [ngValue]="true">Administrator</option>
                </select>
              </div>
              <div class="fg" style="grid-column:1/-1">
                <label class="fl">Rola CRM</label>
                <select class="fsel" [(ngModel)]="newCrmRole">
                  <option value="">Brak roli CRM</option>
                  <option value="salesperson">Handlowiec (salesperson)</option>
                  <option value="sales_manager">Manager sprzedaży (sales_manager)</option>
                </select>
              </div>
              <div class="fg" style="grid-column:1/-1">
                <label class="fl">Assign to Group (optional)</label>
                <select class="fsel" [(ngModel)]="newGroup">
                  <option value="">No group</option>
                  @for (g of groups(); track g.id) { <option [value]="g.id">{{ g.display_name }}</option> }
                </select>
              </div>
              @if (newGroup) {
                <div class="fg">
                  <label class="fl">Access Level</label>
                  <select class="fsel" [(ngModel)]="newGroupAccess">
                    <option value="read">Read</option>
                    <option value="full">Full</option>
                  </select>
                </div>
              }
            </div>
            <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:12px 14px;margin-top:12px;font-size:12px;color:var(--gray-500);line-height:1.6">
              <strong style="color:var(--gray-700)">Note:</strong> The user will be able to log in via SAML SSO using this email address. Authentication is handled entirely by Google Workspace.
            </div>
          </div>

          <div style="padding:16px 24px;border-top:1px solid var(--gray-200);display:flex;gap:10px;justify-content:flex-end;background:var(--gray-50)">
            <button class="btn btn-g" (click)="showNew.set(false)">Cancel</button>
            <button class="btn btn-p" [disabled]="saving()" (click)="createUser()">Create User</button>
          </div>
        </div>
      </div>
    }

    <!-- Edit User Panel -->
    @if (selected()) {
      <div class="overlay" (click)="selected.set(null)">
        <div class="panel" (click)="$event.stopPropagation()">
          <div class="ph">
            <wt-avatar [name]="selected()!.display_name" [size]="40" />
            <div>
              <div class="pt">{{ selected()!.display_name }}</div>
              <div class="ps">{{ selected()!.email }}</div>
            </div>
            <div class="pc" (click)="selected.set(null)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
          </div>

          <div class="pb">
            @if (isAdmin()) {
              <div class="sec-title">Account Settings</div>
              <div class="fgrid">
                <div class="fg">
                  <label class="fl">First Name</label>
                  <input class="fi" [(ngModel)]="editFirst">
                </div>
                <div class="fg">
                  <label class="fl">Last Name</label>
                  <input class="fi" [(ngModel)]="editLast">
                </div>

                <!-- ★ Email edit -->
                <div class="fg" style="grid-column:1/-1">
                  <label class="fl">Email Address</label>
                  <input class="fi" type="email" [(ngModel)]="editEmail"
                         [class.fi-err]="!!emailError"
                         (ngModelChange)="emailError = ''">
                  @if (emailError) {
                    <span class="ferr">{{ emailError }}</span>
                  }
                  <span style="font-size:11px;color:var(--gray-400);margin-top:2px;line-height:1.5">
                    Zmiana e-maila wpływa na logowanie SAML — upewnij się, że adres odpowiada kontu Google Workspace.
                  </span>
                </div>

                <div class="fg">
                  <label class="fl">Status</label>
                  <select class="fsel" [(ngModel)]="editActive">
                    <option [ngValue]="true">Active</option>
                    <option [ngValue]="false">Inactive</option>
                  </select>
                </div>
                <div class="fg">
                  <label class="fl">Admin Role</label>
                  <select class="fsel" [(ngModel)]="editAdmin">
                    <option [ngValue]="false">Regular User</option>
                    <option [ngValue]="true">Administrator</option>
                  </select>
                </div>
                <div class="fg" style="grid-column:1/-1">
                  <label class="fl">Rola CRM</label>
                  <select class="fsel" [(ngModel)]="editCrmRole">
                    <option value="">Brak roli CRM</option>
                    <option value="salesperson">Handlowiec (salesperson)</option>
                    <option value="sales_manager">Manager sprzedaży (sales_manager)</option>
                  </select>
                </div>
              </div>
              <button class="btn btn-p" style="margin-top:4px" (click)="saveUser()">Save Changes</button>
            }

            <!-- ── Planowane Budżety Sprzedażowe ──────────────────────────────────── -->
            @if (isSalesManager() && selected()!.crm_role === 'salesperson') {
              <div class="sec-title" style="margin-top:24px">💼 Planowane Budżety Sprzedażowe</div>

              <div style="display:flex;gap:10px;margin-bottom:14px;align-items:flex-end">
                <div class="fg" style="flex:1">
                  <label class="fl">Rok</label>
                  <select class="fsel" [(ngModel)]="budgetYear" (ngModelChange)="loadBudgets()">
                    @for (y of budgetYears; track y) { <option [value]="y">{{ y }}</option> }
                  </select>
                </div>
                <div class="fg" style="flex:1">
                  <label class="fl">Typ okresu</label>
                  <select class="fsel" [(ngModel)]="budgetPeriodType" (ngModelChange)="onBudgetPeriodTypeChange()">
                    <option value="month">Miesięczny</option>
                    <option value="quarter">Kwartalny</option>
                  </select>
                </div>
              </div>

              @if (budgetsLoading) {
                <div style="text-align:center;padding:16px;color:var(--gray-400);font-size:12px">Ładowanie…</div>
              } @else {

              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px"
                   [style.grid-template-columns]="budgetPeriodType === 'quarter' ? 'repeat(2,1fr)' : 'repeat(3,1fr)'">
                @for (p of budgetPeriods(); track p.num) {
                  <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:8px">
                    <div style="font-size:10px;font-weight:700;color:var(--gray-500);text-transform:uppercase;margin-bottom:4px">{{ p.label }}</div>
                    <div style="display:flex;gap:4px;align-items:center">
                      <input type="number" min="0" step="1000"
                             class="fi" style="width:100%;box-sizing:border-box;font-size:12px;padding:5px 8px;text-align:right"
                             [value]="getBudgetAmount(p.num)"
                             (change)="onBudgetAmountChange(p.num, $event)">
                    </div>
                  </div>
                }
              </div>

              <!-- Waluta + Suma roczna -->
              <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
                <div class="fg" style="width:100px">
                  <label class="fl">Waluta</label>
                  <select class="fsel" [(ngModel)]="budgetCurrency" style="font-size:12px;padding:5px 8px">
                    <option value="PLN">PLN</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="CHF">CHF</option>
                  </select>
                </div>
                <div style="flex:1;background:var(--orange-pale);border:1px solid var(--orange-muted);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">
                  <span style="font-size:12px;font-weight:700;color:var(--orange-dark)">Suma roczna</span>
                  <span style="font-family:'Sora',sans-serif;font-size:15px;font-weight:700;color:var(--orange)">{{ budgetAnnualTotal | number:'1.0-0' }} {{ budgetCurrency }}</span>
                </div>
              </div>

              @if (budgetDirty) {
                <div style="display:flex;gap:8px">
                  <button class="btn btn-p btn-sm" style="flex:1" [disabled]="budgetSaving" (click)="saveBudgets()">
                    {{ budgetSaving ? 'Zapisywanie…' : '💾 Zapisz budżet' }}
                  </button>
                  <button class="btn btn-g btn-sm" (click)="loadBudgets()">Anuluj</button>
                </div>
              }

              } <!-- /if not loading -->
            }
            <!-- ───────────────────────────────────────────────────────────────────────── -->

            @if (isAdmin()) {
              <div class="sec-title" style="margin-top:24px">Group Roles ({{ (selected()!.roles ?? []).length }})</div>
              @for (role of selected()!.roles ?? []; track role.role_id) {
                <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-100)">
                  <wt-group-pill [name]="role.group_display ?? role.group_name" />
                  <span class="badge" [class]="role.access_level === 'full' ? 's-signed' : 's-new'">{{ role.access_level }}</span>
                  <span style="flex:1"></span>
                  <button class="btn btn-d btn-sm" (click)="removeRole(role.role_id)">Remove</button>
                </div>
              }

              <div class="sec-title" style="margin-top:20px">Assign New Role</div>
              <div style="display:flex;gap:8px;align-items:flex-end">
                <div class="fg" style="flex:1">
                  <label class="fl">Group</label>
                  <select class="fsel" [(ngModel)]="newRoleGroup">
                    <option value="">Select group...</option>
                    @for (g of groups(); track g.id) { <option [value]="g.id">{{ g.display_name }}</option> }
                  </select>
                </div>
                <div class="fg" style="width:120px">
                  <label class="fl">Access</label>
                  <select class="fsel" [(ngModel)]="newRoleAccess">
                    <option value="read">Read</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                <button class="btn btn-p" [disabled]="!newRoleGroup" (click)="assignRole()">Assign</button>
              </div>
            }
          </div>

          <div class="pf">
            <button class="btn btn-g" (click)="selected.set(null)">Close</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    #topbar { height:60px;background:white;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:12px;padding:0 24px;flex-shrink:0; }
    .page-title { font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:var(--gray-900); }
    .tsp { flex:1; }
    .srch-wrap { position:relative;display:flex;align-items:center; }
    .srch-wrap svg { position:absolute;left:10px;width:15px;height:15px;color:var(--gray-400);pointer-events:none; }
    .srch { background:var(--gray-100);border:1px solid var(--gray-200);border-radius:8px;padding:7px 14px 7px 34px;font-size:13px;width:260px;outline:none;font-family:inherit; }
    .srch:focus { border-color:var(--orange);background:white; }
    #content { flex:1;overflow-y:auto;padding:24px; }
    .thead { display:grid;background:var(--gray-50);border-bottom:1px solid var(--gray-200);padding:0 16px; }
    .th { padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);display:flex;align-items:center; }
    .tr { display:grid;padding:0 16px;border-bottom:1px solid var(--gray-100);cursor:pointer;transition:background .1s;align-items:center; }
    .tr:hover { background:var(--gray-50); }
    .td { padding:11px 8px;font-size:13px;color:var(--gray-700);overflow:hidden; }
    .overlay { position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:100;backdrop-filter:blur(2px);display:flex;align-items:flex-start;justify-content:flex-end; }
    .panel { width:580px;height:100vh;background:white;box-shadow:var(--shadow-lg);overflow-y:auto;display:flex;flex-direction:column;animation:slideIn .2s ease; }
    .ph { padding:20px 24px;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:12px;background:white;position:sticky;top:0;z-index:1; }
    .pt { font-family:'Sora',sans-serif;font-size:16px;font-weight:700;color:var(--gray-900); }
    .ps { font-size:12px;color:var(--gray-500);margin-top:2px; }
    .pc { margin-left:auto;cursor:pointer;color:var(--gray-400);padding:4px;border-radius:6px; }
    .pc:hover { background:var(--gray-100); }
    .pb { padding:24px;flex:1; }
    .pf { padding:16px 24px;border-top:1px solid var(--gray-200);display:flex;gap:10px;justify-content:flex-end;background:var(--gray-50);position:sticky;bottom:0; }
    .mol { position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px); }
    .mo { background:white;border-radius:14px;width:540px;max-width:95vw;box-shadow:var(--shadow-lg);overflow:hidden; }
    .moh { padding:20px 24px 16px;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:12px; }
    .moico { width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
    .mot { font-family:'Sora',sans-serif;font-size:15px;font-weight:700;color:var(--gray-900); }
    .mos { font-size:12px;color:var(--gray-500);margin-top:2px; }
    .mox { margin-left:auto;cursor:pointer;color:var(--gray-400);padding:4px;border-radius:6px; }
    .mox:hover { background:var(--gray-100); }
    .fgrid { display:grid;grid-template-columns:1fr 1fr;gap:14px; }
    .fg { display:flex;flex-direction:column;gap:4px; }
    .fl { font-size:12px;font-weight:600;color:var(--gray-600); }
    .fi { border:1px solid var(--gray-200);border-radius:8px;padding:8px 12px;font-size:13px;font-family:inherit;outline:none;transition:border .15s; }
    .fi:focus { border-color:var(--orange); }
    .fi-err { border-color:#ef4444 !important; }
    .fsel { border:1px solid var(--gray-200);border-radius:8px;padding:8px 12px;font-size:13px;font-family:inherit;outline:none;background:white; }
    .ferr { font-size:11px;color:#ef4444; }
    .sec-title { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--gray-500);margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--gray-100); }
  `],
})
export class UsersComponent implements OnInit {
  private userSvc     = inject(UserService);
  private groupSvc    = inject(GroupService);
  private toast       = inject(ToastService);
  private appSettings = inject(AppSettingsService);
  private crmApi      = inject(CrmApiService);
  private auth        = inject(AuthService);
  private cdr         = inject(ChangeDetectorRef);
  private zone        = inject(NgZone);

  isSalesManager = computed(() => {
    const u = this.auth.user();
    return !!(u?.is_admin || (u as any)?.crm_role === 'sales_manager');
  });

  isAdmin = computed(() => !!this.auth.user()?.is_admin);

  users      = signal<User[]>([]);
  groups     = signal<GroupProfile[]>([]);
  loading    = signal(true);
  saving     = signal(false);
  total      = signal(0);
  page       = signal(1);
  totalPages = signal(1);
  selected   = signal<User | null>(null);
  showNew    = signal(false);

  search       = '';
  filterGroup  = '';
  filterActive = '';

  editFirst  = '';
  editLast   = '';
  editEmail  = '';        // ★ nowe pole
  editActive = true;
  editAdmin  = false;
  editCrmRole: string = '';   // ★ rola CRM
  emailError = '';        // ★ walidacja inline

  newRoleGroup  = '';
  newRoleAccess: 'read' | 'full' = 'read';

  newFirst       = '';
  newLast        = '';
  newEmail       = '';
  newActive      = true;
  newAdmin       = false;
  newCrmRole     = '';           // ★ rola CRM dla nowego usera
  newGroup       = '';
  newGroupAccess: 'read' | 'full' = 'read';
  submitted      = false;

  // ── Planowane Budżety ──────────────────────────────────────────
  budgetYear        = new Date().getFullYear();
  budgetYears       = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);
  budgetPeriodType: 'month' | 'quarter' = 'month';
  budgetCurrency    = 'PLN';
  budgetsLoading    = false;
  budgetSaving      = false;
  budgetDirty       = false;
  private _budgetData: SalesBudget[]    = [];
  private _budgetDraft: Record<number, number> = {};

  budgetPeriods() {
    if (this.budgetPeriodType === 'month') {
      const lbl = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
      return Array.from({ length: 12 }, (_, i) => ({ num: i + 1, label: lbl[i] }));
    }
    return [
      { num: 1, label: 'Q1 (I–III)' },
      { num: 2, label: 'Q2 (IV–VI)' },
      { num: 3, label: 'Q3 (VII–IX)' },
      { num: 4, label: 'Q4 (X–XII)' },
    ];
  }

  get budgetAnnualTotal(): number {
    return Object.values(this._budgetDraft).reduce((s, v) => s + (v || 0), 0);
  }

  getBudgetAmount(num: number): number { return this._budgetDraft[num] ?? 0; }

  onBudgetAmountChange(num: number, ev: Event): void {
    this._budgetDraft[num] = parseFloat((ev.target as HTMLInputElement).value) || 0;
    this.budgetDirty = true;
    this.cdr.markForCheck();
  }

  loadBudgets(): void {
    const u = this.selected(); if (!u) return;
    this.budgetsLoading = true; this.budgetDirty = false; this._budgetDraft = {};
    this.cdr.markForCheck();
    this.crmApi.getSalesBudgets({ user_id: u.id, year: this.budgetYear }).subscribe({
      next: bs => this.zone.run(() => {
        this._budgetData = bs;
        if (bs[0]?.period_type) this.budgetPeriodType = bs[0].period_type;
        if (bs[0]?.currency)    this.budgetCurrency   = bs[0].currency;
        this._budgetDraft = {};
        for (const b of bs) this._budgetDraft[b.period_number] = Number(b.amount);
        this.budgetsLoading = false;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.budgetsLoading = false; this.cdr.markForCheck(); }),
    });
  }

  onBudgetPeriodTypeChange(): void {
    if (this._budgetData.length && this._budgetData[0].period_type !== this.budgetPeriodType) {
      if (!confirm(`Zmiana typu okresu usunie istniejące budżety na rok ${this.budgetYear}. Kontynuować?`)) {
        this.budgetPeriodType = this._budgetData[0].period_type; return;
      }
      const u = this.selected();
      if (u) this.crmApi.deleteSalesBudgetsByUser(u.id, this.budgetYear).subscribe({
        next: () => { this._budgetData = []; this._budgetDraft = {}; this.budgetDirty = false; },
        error: () => this.toast.error('Błąd usuwania budżetów'),
      });
    } else { this._budgetDraft = {}; this.budgetDirty = false; }
  }

  saveBudgets(): void {
    const u = this.selected(); if (!u) return;
    this.budgetSaving = true;
    const entries = Object.entries(this._budgetDraft).map(([k, v]) => ({ num: +k, amt: v || 0 }));
    if (!entries.length) { this.budgetSaving = false; this.budgetDirty = false; return; }
    let pending = entries.length;
    for (const e of entries) {
      this.crmApi.upsertSalesBudget({
        user_id: u.id, year: this.budgetYear,
        period_type: this.budgetPeriodType, period_number: e.num,
        amount: e.amt, currency: this.budgetCurrency,
      }).subscribe({
        next: () => { if (--pending === 0) { this.budgetSaving = false; this.budgetDirty = false; this.loadBudgets(); this.toast.success('Budżet zapisany'); } },
        error: (err) => { this.budgetSaving = false; this.toast.error(err?.error?.error ?? 'Błąd zapisu'); },
      });
    }
  }

  private timer: ReturnType<typeof setTimeout> | null = null;

  rolesPreview(user: User): any[] {
    return (user.roles ?? []).slice(0, this.appSettings.get('roles_preview_count'));
  }

  rolesOverflow(user: User): number {
    return Math.max(0, (user.roles ?? []).length - this.appSettings.get('roles_preview_count'));
  }

  ngOnInit(): void {
    this.groupSvc.list().subscribe(g => this.groups.set(g));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const limit = this.appSettings.get('default_page_size');
    const params: Record<string, string | number> = { page: this.page(), limit };
    if (this.search)              params['search']    = this.search;
    if (this.filterGroup)         params['group_id']  = this.filterGroup;
    if (this.filterActive !== '') params['is_active'] = this.filterActive;

    this.userSvc.list(params).subscribe(res => {
      this.users.set(res.data);
      this.total.set(res.total);
      this.totalPages.set(res.pages);
      this.loading.set(false);
    });
  }

  onSearch(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.page.set(1); this.load(); }, 350);
  }

  setPage(p: number): void { this.page.set(p); this.load(); }

  groupCls(name: string): string {
    const map: Record<string, string> = {
      Management:'g-management', Zarzad:'g-zarzad', Sales:'g-sales', Sprzedaz:'g-sprzedaz',
      Marketing:'g-marketing', HR:'g-hr', Accounting:'g-accounting', Operations:'g-operations',
    };
    return map[name] ?? 'g-operations';
  }

  openNew(): void {
    this.newFirst = ''; this.newLast = ''; this.newEmail = '';
    this.newActive = true; this.newAdmin = false; this.newCrmRole = '';
    this.newGroup = ''; this.newGroupAccess = 'read';
    this.submitted = false;
    this.showNew.set(true);
  }

  createUser(): void {
    this.submitted = true;
    if (!this.newFirst || !this.newLast || !this.newEmail) return;
    this.saving.set(true);
    this.userSvc.create({
      first_name: this.newFirst,
      last_name:  this.newLast,
      email:      this.newEmail,
      is_active:  this.newActive,
      is_admin:   this.newAdmin,
      crm_role:   this.newCrmRole || null,
    } as any).subscribe({
      next: (user) => {
        if (this.newGroup) {
          this.userSvc.assignRole(user.id, this.newGroup, this.newGroupAccess).subscribe();
        }
        this.users.update(list => [user, ...list]);
        this.total.update(n => n + 1);
        this.showNew.set(false);
        this.saving.set(false);
        this.toast.success('User ' + user.display_name + ' created');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error ?? 'Failed to create user');
      },
    });
  }

  openUser(user: User): void {
    this.userSvc.get(user.id).subscribe(u => {
      this.selected.set(u);
      this.editFirst   = u.first_name;
      this.editLast    = u.last_name;
      this.editEmail   = u.email;
      this.editActive  = u.is_active;
      this.editAdmin   = u.is_admin;
      this.editCrmRole = (u as any).crm_role ?? '';
      this.emailError    = '';
      this.newRoleGroup  = '';
      this.newRoleAccess = 'read';
      // Załaduj budżety jeśli Sales Manager otwiera handlowca
      if (this.isSalesManager() && (u as any).crm_role === 'salesperson') {
        this._budgetDraft = {}; this.budgetDirty = false;
        this.loadBudgets();
      }
    });
  }

  saveUser(): void {
    const u = this.selected();
    if (!u) return;

    // Walidacja email
    if (!this.editEmail || !this.editEmail.includes('@')) {
      this.emailError = 'Wprowadź prawidłowy adres e-mail';
      return;
    }
    this.emailError = '';

    this.userSvc.update(u.id, {
      first_name: this.editFirst,
      last_name:  this.editLast,
      email:      this.editEmail,
      is_active:  this.editActive,
      is_admin:   this.editAdmin,
      crm_role:   this.editCrmRole || null,
    } as any).subscribe({
      next: updated => {
        this.selected.set({ ...u, ...updated });
        this.users.update(list => list.map(x => x.id === u.id ? { ...x, ...updated, crm_role: (updated as any).crm_role } : x));
        this.toast.success('User updated');
      },
      error: err => {
        const msg: string = err?.error?.error ?? '';
        // Backend zwraca błąd unique constraint jeśli email zajęty
        if (msg.toLowerCase().includes('email') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
          this.emailError = 'Ten adres e-mail jest już zajęty';
        } else {
          this.toast.error(msg || 'Failed to update user');
        }
      },
    });
  }

  assignRole(): void {
    const u = this.selected();
    if (!u || !this.newRoleGroup) return;
    this.userSvc.assignRole(u.id, this.newRoleGroup, this.newRoleAccess).subscribe(role => {
      const group = this.groups().find(g => g.id === this.newRoleGroup);
      const newRole = { ...role, group_name: group?.name ?? '', group_display: group?.display_name ?? '' };
      this.selected.update(s => s ? { ...s, roles: [...(s.roles ?? []), newRole] } : s);
      this.newRoleGroup = '';
      this.toast.success('Role assigned');
    });
  }

  removeRole(roleId: string): void {
    const u = this.selected();
    if (!u) return;
    this.userSvc.removeRole(u.id, roleId).subscribe(() => {
      this.selected.update(s => s ? { ...s, roles: (s.roles ?? []).filter(r => r.role_id !== roleId) } : s);
      this.toast.success('Role removed');
    });
  }
}

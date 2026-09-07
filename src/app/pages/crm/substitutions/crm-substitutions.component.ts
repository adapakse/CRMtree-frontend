import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import {
  SubstitutionsService, Absence, AbsenceReason, CrmUserOption, CrmGroupOption,
} from '../../../core/services/substitutions.service';

interface AbsenceForm {
  absent_user_id: string;
  substitute_user_id: string;
  starts_on: string;
  ends_on: string;
  reason: AbsenceReason;
  note: string;
}

interface FieldErrors {
  substitute?: string;
  dateFrom?: string;
  dateTo?: string;
  range?: string;
}

type ListState = 'loading' | 'error' | 'ready';

const REASON_LABEL: Record<AbsenceReason, string> = {
  vacation:   'Urlop',
  sick_leave: 'Zwolnienie lekarskie (L4)',
  other:      'Inna nieobecność',
};

@Component({
  selector: 'wt-crm-substitutions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="card">
  <h2 class="card-title">🔄 Zastępstwo podczas nieobecności</h2>
  <p class="card-hint">
    Wskaż okres nieobecności i osobę, która Cię wtedy zastąpi.
    Na ten czas zastępca zyska pełny dostęp do Twoich leadów i partnerów —
    z tymi samymi uprawnieniami, które masz Ty.
  </p>

  <div class="form-grid">
      <label>
        <span>Osoba nieobecna</span>
        <select *ngIf="canManageForOthers(); else absentSelf"
                [(ngModel)]="form.absent_user_id" (ngModelChange)="onAbsentChange()">
          <option [value]="myId()">{{ myName() }}</option>
          <option *ngFor="let u of selectableAbsentUsers()" [value]="u.id">{{ u.display_name }}</option>
        </select>
        <ng-template #absentSelf>
          <input type="text" [value]="myName()" disabled>
        </ng-template>
      </label>

      <label>
        <span>Powód</span>
        <select [(ngModel)]="form.reason">
          <option value="vacation">Urlop</option>
          <option value="sick_leave">Zwolnienie lekarskie (L4)</option>
          <option value="other">Inna nieobecność</option>
        </select>
      </label>

      <label>
        <span>Data od</span>
        <input type="date" [(ngModel)]="form.starts_on"
               [class.invalid]="submitted() && !!errors().dateFrom">
        <span class="field-err" *ngIf="submitted() && errors().dateFrom">{{ errors().dateFrom }}</span>
      </label>

      <label>
        <span>Data do</span>
        <input type="date" [(ngModel)]="form.ends_on" [attr.min]="form.starts_on || null"
               [class.invalid]="(submitted() || !!form.ends_on) && !!errors().dateTo">
        <span class="field-err" *ngIf="(submitted() || !!form.ends_on) && errors().dateTo">{{ errors().dateTo }}</span>
      </label>

      <label>
        <span>Zastępca</span>
        <select [(ngModel)]="form.substitute_user_id"
                [class.invalid]="(submitted() && !!errors().substitute) || substituteAbsentConflict()">
          <option value="">— wybierz —</option>
          <option *ngFor="let u of substituteOptions()" [value]="u.id">{{ u.display_name }}</option>
        </select>
        <span class="field-err" *ngIf="substituteAbsentConflict()">
          Ta osoba jest nieobecna w wybranym terminie — wybierz innego zastępcę.
        </span>
        <span class="field-err"
              *ngIf="submitted() && errors().substitute && !substituteAbsentConflict()">
          {{ errors().substitute }}
        </span>
      </label>

      <label class="span-2">
        <span>Notatka (opcjonalnie)</span>
        <textarea rows="2" maxlength="2000" [(ngModel)]="form.note"
                  placeholder="np. pilne sprawy kierować do…"></textarea>
      </label>
    </div>

    <div class="form-actions">
      <button class="btn btn-p" (click)="submit()" [disabled]="saving()">
        {{ saving() ? 'Zapisywanie…' : 'Zapisz zastępstwo' }}
      </button>
      <span *ngIf="rangeConflict()" class="msg-error">{{ errors().range }}</span>
      <span *ngIf="submitted() && hasErrors() && !saving() && !rangeConflict()" class="msg-error">
        Popraw zaznaczone pola i spróbuj ponownie.
      </span>
      <span *ngIf="formError()" class="msg-error">{{ formError() }}</span>
      <span *ngIf="okMsg()" class="msg-ok">{{ okMsg() }}</span>
    </div>

  <div class="subs-section">
    <h3 class="sub-title">Nieobecności {{ canManageForOthers() ? '(moje i zespołu)' : '(moje)' }}</h3>

    <ng-container [ngSwitch]="listState()">
      <div *ngSwitchCase="'loading'" class="state">Ładowanie…</div>

      <div *ngSwitchCase="'error'" class="state state-error">
        <span>Nie udało się pobrać danych.</span>
        <button class="btn btn-g btn-sm" (click)="reload()">Spróbuj ponownie</button>
      </div>

      <ng-container *ngSwitchCase="'ready'">
        <div *ngIf="cancelError()" class="msg-error block">{{ cancelError() }}</div>

        <div *ngIf="ownCurrentAbsences().length === 0" class="state muted">
          Brak trwających ani nadchodzących nieobecności.
        </div>

        <div *ngIf="ownCurrentAbsences().length" class="table-wrap">
          <table class="subs-table">
            <thead>
              <tr>
                <th>Osoba nieobecna</th>
                <th class="period">Okres</th>
                <th>Zastępca</th>
                <th>Powód</th>
                <th>Status</th>
                <th class="col-action">Akcja</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of ownCurrentAbsences()">
                <td class="strong">{{ a.absent_user_name }}</td>
                <td class="nowrap period">{{ fmtDate(a.starts_on) }} – {{ fmtDate(a.ends_on) }}</td>
                <td>{{ a.substitute_user_name }}</td>
                <td>{{ reasonLabel(a.reason) }}</td>
                <td><span class="badge" [class]="statusClass(a)">{{ statusLabel(a) }}</span></td>
                <td class="col-action">
                  <button *ngIf="canCancel(a); else noAction" type="button" class="btn btn-g btn-sm"
                          (click)="cancel(a)" [disabled]="cancellingId() === a.id">
                    {{ cancellingId() === a.id ? 'Odwoływanie…' : 'Odwołaj' }}
                  </button>
                  <ng-template #noAction><span class="dash">—</span></ng-template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="ownHistoryAbsences().length" class="history">
          <button type="button" class="history-toggle"
                  (click)="toggleHistory()"
                  [attr.aria-expanded]="historyOpen()">
            {{ historyOpen() ? '▾' : '▸' }} Historia ({{ ownHistoryAbsences().length }})
          </button>

          <ng-container *ngIf="historyOpen()">
            <div class="table-wrap">
              <table class="subs-table">
                <thead>
                  <tr>
                    <th>Osoba nieobecna</th>
                    <th class="period">Okres</th>
                    <th>Zastępca</th>
                    <th>Powód</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let a of historyPageRows()">
                    <td class="strong">{{ a.absent_user_name }}</td>
                    <td class="nowrap period">{{ fmtDate(a.starts_on) }} – {{ fmtDate(a.ends_on) }}</td>
                    <td>{{ a.substitute_user_name }}</td>
                    <td>{{ reasonLabel(a.reason) }}</td>
                    <td><span class="badge" [class]="statusClass(a)">{{ statusLabel(a) }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div *ngIf="historyTotalPages() > 1" class="pager">
              <button type="button" class="pager-btn" aria-label="Poprzednia strona"
                      [disabled]="historyPageClamped() === 1"
                      (click)="historyGoto(historyPageClamped() - 1)">‹</button>
              <button type="button" class="pager-num" *ngFor="let p of historyPagesArray()"
                      [class.active]="p === historyPageClamped()"
                      (click)="historyGoto(p)">{{ p }}</button>
              <button type="button" class="pager-btn" aria-label="Następna strona"
                      [disabled]="historyPageClamped() === historyTotalPages()"
                      (click)="historyGoto(historyPageClamped() + 1)">›</button>
            </div>
          </ng-container>
        </div>
      </ng-container>
    </ng-container>
  </div>

  <div class="subs-section">
    <h3 class="sub-title">Osoby, które zastępuję</h3>

    <ng-container [ngSwitch]="listState()">
      <div *ngSwitchCase="'loading'" class="state">Ładowanie…</div>

      <div *ngSwitchCase="'error'" class="state state-error">
        <span>Nie udało się pobrać danych.</span>
        <button class="btn btn-g btn-sm" (click)="reload()">Spróbuj ponownie</button>
      </div>

      <ng-container *ngSwitchCase="'ready'">
        <div *ngIf="coveringAbsences().length === 0" class="state muted">
          Aktualnie nikogo nie zastępujesz.
        </div>

        <div *ngIf="coveringAbsences().length" class="table-wrap">
          <table class="subs-table">
            <thead>
              <tr>
                <th>Osoba nieobecna</th>
                <th>Okres</th>
                <th>Powód</th>
                <th>Status</th>
                <th class="col-note">Notatka</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of coveringAbsences()">
                <td class="strong">{{ a.absent_user_name }}</td>
                <td class="nowrap">{{ fmtDate(a.starts_on) }} – {{ fmtDate(a.ends_on) }}</td>
                <td>{{ reasonLabel(a.reason) }}</td>
                <td><span class="badge" [class]="statusClass(a)">{{ statusLabel(a) }}</span></td>
                <td class="col-note">
                  <ng-container *ngIf="a.note; else noNote">
                    <span class="note-text">{{ (isNoteExpanded(a.id) || !isLongNote(a.note)) ? a.note : (a.note | slice:0:90) + '…' }}</span>
                    <button *ngIf="isLongNote(a.note)" type="button" class="note-toggle" (click)="toggleNote(a.id)">
                      {{ isNoteExpanded(a.id) ? 'zwiń' : 'rozwiń' }}
                    </button>
                  </ng-container>
                  <ng-template #noNote><span class="dash">—</span></ng-template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>
    </ng-container>
  </div>

</div>
  `,
  styles: [`
    :host { display:block; }

    .card { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:24px; }
    .card-title { font-family:'Sora',sans-serif; font-size:15px; font-weight:700; color:#18181b; margin:0 0 6px; }
    .card-hint { font-size:12.5px; color:#6b7280; margin:0 0 18px; line-height:1.5; }

    .subs-section { margin-top:24px; padding-top:20px; border-top:1px solid #eef0f2; }
    .sub-title { font-family:'Sora',sans-serif; font-size:13px; font-weight:700; color:#18181b; margin:0 0 10px; }

    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .form-grid .span-2 { grid-column:1 / -1; }
    .form-grid label { display:flex; flex-direction:column; gap:5px; font-size:11px; font-weight:600;
      color:#374151; text-transform:uppercase; letter-spacing:.4px; }
    .form-grid input, .form-grid select, .form-grid textarea {
      font:inherit; text-transform:none; letter-spacing:0; font-weight:400; font-size:13px;
      padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; color:#111827; outline:none; box-sizing:border-box; }
    .form-grid input:focus, .form-grid select:focus, .form-grid textarea:focus { border-color:#3BAA5D; }
    /* salesperson: „Osoba nieobecna" to on sam — pole tylko do odczytu, lekko wyszarzone */
    .form-grid input:disabled { background:#f3f4f6; color:#6b7280; cursor:not-allowed; }
    .form-grid .invalid { border-color:#dc2626; }
    .field-err { font-size:11px; font-weight:400; text-transform:none; letter-spacing:0; color:#dc2626; }

    .form-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:16px; }
    .msg-error { font-size:12px; color:#dc2626; }
    .msg-error.block { display:block; margin-bottom:10px; }
    .msg-ok { font-size:12px; color:#16a34a; font-weight:600; }

    .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:8px;
      font-size:13px; font-weight:600; cursor:pointer; border:none; }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .btn-p { background:#3BAA5D; color:white; }
    .btn-p:hover:not(:disabled) { background:#2F8F4D; }
    .btn-g { background:white; border:1px solid #d1d5db; color:#374151; }
    .btn-sm { padding:6px 12px; font-size:12px; }

    .state { font-size:13px; color:#374151; padding:8px 0; }
    .state.muted { color:#9ca3af; font-style:italic; }
    .state-error { display:flex; align-items:center; gap:12px; color:#b91c1c; }

    .table-wrap { overflow-x:auto; margin-top:4px; }
    .subs-table { width:100%; border-collapse:collapse; font-size:13px; }
    .subs-table th { text-align:left; font-size:10.5px; font-weight:700; color:#6b7280;
      text-transform:uppercase; letter-spacing:.4px; padding:8px 12px;
      border-bottom:1px solid #e5e7eb; white-space:nowrap; }
    .subs-table td { padding:10px 12px; border-bottom:1px solid #f3f4f6; color:#374151; vertical-align:top; }
    .subs-table tbody tr:last-child td { border-bottom:none; }
    .subs-table tbody tr:hover td { background:#fafafa; }
    .subs-table .strong { font-weight:700; color:#18181b; }
    .subs-table .nowrap { white-space:nowrap; }
    .subs-table th.period, .subs-table td.period { min-width:200px; }
    .subs-table th.col-action, .subs-table td.col-action { text-align:right; white-space:nowrap; }
    .subs-table .col-note { max-width:320px; }
    .subs-table .dash { color:#9ca3af; }
    .note-text { white-space:pre-wrap; }
    .note-toggle { margin-left:6px; background:none; border:none; padding:0; cursor:pointer;
      color:#3BAA5D; font-size:12px; font-weight:600; }

    .history { margin-top:14px; }
    .history-toggle { background:none; border:none; padding:4px 0; cursor:pointer;
      font-size:12px; font-weight:700; color:#6b7280; letter-spacing:.3px; }
    .history-toggle:hover { color:#374151; }

    .pager { display:flex; align-items:center; gap:4px; margin-top:10px; }
    .pager-btn, .pager-num {
      min-width:26px; height:26px; padding:0 6px; border:1px solid #e5e7eb; border-radius:6px;
      background:white; color:#374151; font-size:12px; font-weight:600; cursor:pointer; }
    .pager-btn:disabled { opacity:.4; cursor:not-allowed; }
    .pager-num.active { background:#3BAA5D; color:white; border-color:#3BAA5D; }
    .pager-btn:hover:not(:disabled), .pager-num:hover:not(.active) { background:#f9fafb; }

    .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; white-space:nowrap; }
    .badge.upcoming  { background:#EFF6FF; color:#1D4ED8; }
    .badge.active    { background:#F0FDF4; color:#15803D; }
    .badge.ended     { background:#F4F4F5; color:#71717A; }
    .badge.cancelled { background:#FFF1F2; color:#BE123C; }

    @media (max-width: 640px) {
      .form-grid { grid-template-columns:1fr; }
    }
  `],
})
export class CrmSubstitutionsComponent implements OnInit {
  private svc  = inject(SubstitutionsService);
  private auth = inject(AuthService);

  loading      = signal(true);
  loadError    = signal(false);
  saving       = signal(false);
  submitted    = signal(false);
  formError    = signal('');
  okMsg        = signal('');
  cancellingId = signal<string | null>(null);
  cancelError  = signal('');

  absences = signal<Absence[]>([]);
  users    = signal<CrmUserOption[]>([]);
  groups   = signal<CrmGroupOption[]>([]);
  expandedNotes = signal<Set<string>>(new Set());

  private readonly NOTE_TRUNCATE = 90;

  form: AbsenceForm = this.blankForm();

  myId = computed(() => this.auth.currentUser?.id ?? '');
  myName = computed(() => {
    const u = this.auth.currentUser as any;
    return u?.display_name || u?.email || 'Ja';
  });

  // Mirrors the backend CRM roles — no separate permission system on the frontend.
  isAdmin   = computed(() => this.auth.isAdmin());
  isManager = computed(() => !this.auth.isAdmin() && this.auth.currentUser?.crm_role === 'sales_manager');
  canManageForOthers = computed(() => this.isAdmin() || this.isManager());

  otherUsers = computed(() => this.users().filter(u => u.id !== this.myId()));

  // Active CRM user IDs from the manager's group(s) (union). Empty for other roles.
  private myGroupUserIds = computed(() => {
    const me = this.myId();
    const ids = new Set<string>();
    for (const g of this.groups()) {
      if (g.user_ids.includes(me)) g.user_ids.forEach(id => ids.add(id));
    }
    return ids;
  });

  // People selectable as "absent" (besides "me" — that is a separate, first option):
  //  admin   → every active CRM user in the company,
  //  manager → active CRM users from their group.
  selectableAbsentUsers = computed(() => {
    const base = this.otherUsers();
    if (this.isAdmin()) return base;
    if (this.isManager()) return base.filter(u => this.myGroupUserIds().has(u.id));
    return [];
  });

  ownAbsences = computed(() => this.absences().filter(a => a.substitute_user_id !== this.myId()));
  coveringAbsences = computed(() => this.absences().filter(a => a.substitute_user_id === this.myId()));

  // The main table only shows "Trwa" / "Nadchodzące" entries; ended and cancelled
  // go into the collapsible "Historia" (same already-fetched data — no new endpoint).
  private isHistoryAbsence(a: Absence): boolean {
    const cls = this.statusClass(a);
    return cls === 'ended' || cls === 'cancelled';
  }
  ownCurrentAbsences = computed(() => this.ownAbsences().filter(a => !this.isHistoryAbsence(a)));
  ownHistoryAbsences = computed(() => this.ownAbsences().filter(a => this.isHistoryAbsence(a)));

  // History — a single, collapsed-by-default section with pagination (5/page, newest first).
  historyOpen = signal(false);
  historyPage = signal(1);
  private readonly HISTORY_PAGE_SIZE = 5;

  private ownHistorySorted = computed(() =>
    [...this.ownHistoryAbsences()].sort((a, b) =>
      b.starts_on.localeCompare(a.starts_on) || b.created_at.localeCompare(a.created_at)));

  historyTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.ownHistorySorted().length / this.HISTORY_PAGE_SIZE)));

  historyPageClamped = computed(() =>
    Math.min(Math.max(1, this.historyPage()), this.historyTotalPages()));

  historyPageRows = computed(() => {
    const start = (this.historyPageClamped() - 1) * this.HISTORY_PAGE_SIZE;
    return this.ownHistorySorted().slice(start, start + this.HISTORY_PAGE_SIZE);
  });

  historyPagesArray = computed(() =>
    Array.from({ length: this.historyTotalPages() }, (_, i) => i + 1));

  toggleHistory(): void {
    const opening = !this.historyOpen();
    this.historyOpen.set(opening);
    if (opening) this.historyPage.set(1);
  }

  historyGoto(p: number): void {
    this.historyPage.set(Math.min(Math.max(1, p), this.historyTotalPages()));
  }

  listState(): ListState {
    if (this.loading()) return 'loading';
    if (this.loadError()) return 'error';
    return 'ready';
  }

  // Substitute: active CRM users, excluding the absent person and anyone who is
  // themselves absent in an overlapping window (when both dates are set).
  substituteOptions(): CrmUserOption[] {
    const absentId = this.form.absent_user_id || this.myId();
    const from = this.form.starts_on;
    const to = this.form.ends_on;
    return this.users().filter(u => {
      if (u.id === absentId) return false;
      if (from && to && this.isUserAbsentInRange(u.id, from, to)) return false;
      return true;
    });
  }

  private isUserAbsentInRange(userId: string, from: string, to: string): boolean {
    return this.absences().some(a =>
      a.absent_user_id === userId &&
      !a.cancelled_at &&
      a.starts_on <= to &&
      a.ends_on >= from);
  }

  // "Today" computed like the backend (routes/crm-substitutions.js) — UTC date.
  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // The chosen substitute is themselves absent in an overlapping window.
  // Catches "person first, then dates" (or dates changed after picking).
  substituteAbsentConflict(): boolean {
    const id = this.form.substitute_user_id;
    const { starts_on: from, ends_on: to } = this.form;
    return !!id && !!from && !!to && this.isUserAbsentInRange(id, from, to);
  }

  // Pre-check: the absent person already has an absence in an overlapping window.
  // The backend (409) stays the source of truth — this is only an earlier signal
  // from the already-fetched this.absences() list (no extra API call).
  rangeConflict(): boolean {
    const { starts_on: from, ends_on: to } = this.form;
    const absentId = this.form.absent_user_id || this.myId();
    return !!from && !!to && this.isUserAbsentInRange(absentId, from, to);
  }

  errors(): FieldErrors {
    const e: FieldErrors = {};
    const absentId = this.form.absent_user_id || this.myId();

    if (!this.form.substitute_user_id) {
      e.substitute = 'Wybierz zastępcę.';
    } else if (this.form.substitute_user_id === absentId) {
      e.substitute = 'Zastępca nie może być tą samą osobą co osoba nieobecna.';
    } else if (this.substituteAbsentConflict()) {
      e.substitute = 'Ta osoba jest nieobecna w wybranym terminie.';
    }

    if (!this.form.starts_on) e.dateFrom = 'Podaj datę od.';

    if (!this.form.ends_on) {
      e.dateTo = 'Podaj datę do.';
    } else if (this.form.starts_on && this.form.ends_on < this.form.starts_on) {
      e.dateTo = 'Data do nie może być wcześniejsza niż data od.';
    } else if (this.form.ends_on < this.todayIso()) {
      e.dateTo = 'Okno nieobecności nie może w całości leżeć w przeszłości.';
    }

    if (this.rangeConflict()) {
      e.range = 'Osoba nieobecna ma już zarejestrowaną nieobecność w nakładającym się terminie.';
    }

    return e;
  }

  hasErrors(): boolean {
    return Object.keys(this.errors()).length > 0;
  }

  ngOnInit(): void {
    this.form.absent_user_id = this.myId();
    this.svc.crmUsers().subscribe({ next: u => this.users.set(u), error: () => {} });
    if (this.isManager()) {
      this.svc.crmGroups().subscribe({ next: g => this.groups.set(g), error: () => {} });
    }
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.svc.list().subscribe({
      // A valid response (including an empty list) → "ready" + empty state.
      next: a => { this.absences.set(Array.isArray(a) ? a : []); this.loading.set(false); },
      // Only an actual request failure → "error" + "Spróbuj ponownie".
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  onAbsentChange(): void {
    // after changing the absent person the previously picked substitute may be invalid
    this.form.substitute_user_id = '';
  }

  // Whether the current user may cancel this entry (mirror of the backend canManageAbsenceFor):
  //   - the absent person → yes, admin → yes, manager → only a member of their group.
  //   - being a substitute alone does NOT grant the right to cancel.
  //   The backend is the source of truth — this only controls button visibility.
  canCancel(a: Absence): boolean {
    if (a.cancelled_at) return false;
    if (a.absent_user_id === this.myId()) return true;
    if (this.isAdmin()) return true;
    if (this.isManager()) return this.myGroupUserIds().has(a.absent_user_id);
    return false;
  }

  cancel(a: Absence): void {
    if (this.cancellingId()) return;
    if (!confirm('Odwołać tę nieobecność? Zastępca straci dostęp wynikający z tego zastępstwa.')) return;
    this.cancellingId.set(a.id);
    this.cancelError.set('');
    this.svc.cancel(a.id).subscribe({
      next: () => {
        this.cancellingId.set(null);
        this.reload(); // state from the backend — do not fake the cancel locally
      },
      error: err => {
        this.cancellingId.set(null);
        this.cancelError.set(err.error?.error ?? 'Nie udało się odwołać nieobecności.');
      },
    });
  }

  submit(): void {
    this.submitted.set(true);
    this.formError.set('');
    this.okMsg.set('');
    if (this.hasErrors()) return;

    this.saving.set(true);
    const absentId = this.form.absent_user_id || this.myId();
    this.svc.create({
      substitute_user_id: this.form.substitute_user_id,
      absent_user_id: absentId === this.myId() ? undefined : absentId,
      starts_on: this.form.starts_on,
      ends_on: this.form.ends_on,
      reason: this.form.reason,
      note: this.form.note.trim() || null,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.submitted.set(false);
        this.okMsg.set('Zastępstwo zapisane — zastępca dostał powiadomienie.');
        this.form = this.blankForm();
        this.form.absent_user_id = this.myId();
        this.reload();
        setTimeout(() => this.okMsg.set(''), 4000);
      },
      error: err => {
        this.saving.set(false);
        this.formError.set(err.error?.error ?? 'Nie udało się zapisać zastępstwa.');
      },
    });
  }

  reasonLabel(r: AbsenceReason): string { return REASON_LABEL[r] ?? r; }

  // Date 'YYYY-MM-DD' → 'DD.MM.YYYY'
  fmtDate(s: string): string {
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return d && m && y ? `${d}.${m}.${y}` : s;
  }

  isLongNote(note: string | null): boolean {
    return !!note && note.length > this.NOTE_TRUNCATE;
  }

  isNoteExpanded(id: string): boolean {
    return this.expandedNotes().has(id);
  }

  toggleNote(id: string): void {
    const s = new Set(this.expandedNotes());
    s.has(id) ? s.delete(id) : s.add(id);
    this.expandedNotes.set(s);
  }

  statusLabel(a: Absence): string {
    if (a.cancelled_at) return 'Odwołane';
    const today = new Date().toISOString().slice(0, 10);
    if (a.ends_on < today) return 'Zakończone';
    if (a.starts_on > today) return 'Nadchodzące';
    return 'Trwa';
  }

  statusClass(a: Absence): string {
    if (a.cancelled_at) return 'cancelled';
    const today = new Date().toISOString().slice(0, 10);
    if (a.ends_on < today) return 'ended';
    if (a.starts_on > today) return 'upcoming';
    return 'active';
  }

  private blankForm(): AbsenceForm {
    return {
      absent_user_id: '',
      substitute_user_id: '',
      starts_on: '',
      ends_on: '',
      reason: 'vacation',
      note: '',
    };
  }
}

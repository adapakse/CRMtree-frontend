import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../../core/services/toast.service';
import { KsefAdminConfig, KsefApiService, KsefCompany, KsefDocumentGroup } from '../../../core/services/ksef-api.service';
import { ProjectFinanceFormatService } from '../../../core/services/project-finance-format.service';
import { PROJECTS_SHARED_STYLES } from '../../projects/projects-shared.styles';
import { ProjectKsefCompanyFormComponent, describeKsefAdminError } from './project-ksef-company-form.component';

const MIN_SYNC_DAYS = 1;
const MAX_SYNC_DAYS = 365;

/**
 * "KSeF" block of the project settings: which KSeF environment the server
 * uses, how far back the first sync of a company reaches, the Documents access
 * group that invoice documents go to, and the companies (NIP + token) whose
 * cost invoices are downloaded.
 */
@Component({
  selector: 'wt-project-ksef-settings',
  standalone: true,
  imports: [FormsModule, TranslocoDirective, TranslocoPipe, ProjectKsefCompanyFormComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div class="head">
        <div class="sec-title">{{ t('ksef.settings.title') }}</div>
        @if (config()?.environment; as environment) {
          <span class="environment" [class.test]="environment === 'test'">{{ t('ksef.settings.environments.' + environment) }}</span>
        }
      </div>
      <p class="hint">{{ t('ksef.settings.hint') }}</p>

      @if (config(); as loaded) {
        @if (!loaded.is_configured) {
          <div class="notice">{{ t('ksef.settings.notConfigured') }}</div>
        } @else if (loaded.environment === 'test') {
          <div class="notice">{{ t('ksef.settings.testEnvironmentNote') }}</div>
        }

        <div class="sync-days">
          <label class="fl" for="ksef-initial-sync-days">{{ t('ksef.settings.initialSyncDays') }}</label>
          <input id="ksef-initial-sync-days" class="fi days" type="number" [min]="minSyncDays" [max]="maxSyncDays" step="1"
                 [(ngModel)]="initialSyncDays">
          <button class="btn btn-g btn-sm" [disabled]="!canSaveSyncDays(loaded)" (click)="saveSyncDays()">{{ 'actions.save' | transloco }}</button>
        </div>
        <p class="hint">{{ t('ksef.settings.initialSyncDaysHint', { min: minSyncDays, max: maxSyncDays }) }}</p>

        <div class="sync-days">
          <label class="fl" for="ksef-invoice-documents-group">{{ t('ksef.settings.invoiceDocumentsGroup') }}</label>
          <select id="ksef-invoice-documents-group" class="fsel group" [(ngModel)]="invoiceDocumentsGroupId">
            <option [ngValue]="null">{{ t('ksef.settings.noInvoiceDocumentsGroup') }}</option>
            @for (group of groupOptions(); track group.id) {
              <option [ngValue]="group.id">{{ group.display_name ?? group.name }}</option>
            }
          </select>
          <button class="btn btn-g btn-sm" [disabled]="invoiceDocumentsGroupId === (loaded.invoice_documents_group?.id ?? null)"
                  (click)="saveInvoiceDocumentsGroup()">{{ 'actions.save' | transloco }}</button>
        </div>
        <p class="hint">{{ t('ksef.settings.invoiceDocumentsGroupHint') }}</p>

        @if (loaded.companies.length === 0) {
          <p class="hint">{{ t('ksef.settings.noCompanies') }}</p>
        } @else {
          <div class="tw">
            <table class="grid">
              <thead>
                <tr>
                  <th>{{ t('ksef.settings.columns.name') }}</th>
                  <th>{{ t('ksef.nip') }}</th>
                  <th>{{ t('ksef.settings.columns.token') }}</th>
                  <th>{{ t('ksef.settings.columns.status') }}</th>
                  <th>{{ t('ksef.settings.columns.lastSynced') }}</th>
                  <th>{{ t('ksef.settings.columns.lastAttempt') }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (company of loaded.companies; track company.id) {
                  <tr>
                    <td>{{ company.name ?? '—' }}</td>
                    <td class="mono">{{ company.nip }}</td>
                    <td class="mono">••••{{ company.token_hint }}</td>
                    <td>
                      <span class="pill status" [class]="company.status">{{ t('ksef.settings.statuses.' + company.status) }}</span>
                      @if (company.status !== 'active' && company.last_error) { <span class="last-error">{{ company.last_error }}</span> }
                    </td>
                    <td class="nowrap">{{ format.dateTime(company.last_synced_at) }}</td>
                    <td class="nowrap">{{ format.dateTime(company.last_attempt_at) }}</td>
                    <td class="actions">
                      <button class="link" [disabled]="syncingCompanyId() !== null || !loaded.is_configured" (click)="sync(company)">
                        {{ syncingCompanyId() === company.id ? t('ksef.sync.running') : t('ksef.sync.now') }}
                      </button>
                      <button class="link" (click)="openForm(company)">{{ t('ksef.settings.edit') }}</button>
                      <button class="link danger" (click)="remove(company)">{{ t('ksef.settings.remove') }}</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        <div>
          <button class="btn btn-p btn-sm" [disabled]="!loaded.is_configured" (click)="openForm(null)">+ {{ t('ksef.settings.addCompany') }}</button>
        </div>
      } @else {
        <p class="hint">{{ hasLoadFailed() ? t('ksef.settings.loadFailed') : ('states.loading' | transloco) }}</p>
      }

      @if (isFormOpen()) {
        <wt-project-ksef-company-form [company]="editedCompany()" (closed)="isFormOpen.set(false)" (saved)="onCompanySaved()" />
      }
    </ng-container>
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    :host { display:flex; flex-direction:column; gap:10px; height:auto; }
    .head { display:flex; align-items:center; gap:10px; }
    .head .sec-title { margin:0; }
    .environment { padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; background:var(--orange-pale); color:var(--orange-dark); }
    .environment.test { background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; }
    .hint { margin:0; font-size:12.5px; color:var(--gray-500); line-height:1.6; }
    .notice { padding:10px 12px; border-radius:9px; font-size:12.5px; line-height:1.5; background:#FFFBEB; border:1px solid #FDE68A; color:#92400E; }
    .sync-days { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .sync-days .fl { margin:0; }
    .days { width:90px; }
    .group { width:auto; min-width:220px; max-width:100%; }
    .nowrap { white-space:nowrap; }
    .status { background:var(--orange-pale); color:var(--orange-dark); white-space:nowrap; }
    .status.invalid, .status.error { background:#FEE2E2; color:#B91C1C; }
    .last-error { display:block; margin-top:3px; font-size:11.5px; color:#B91C1C; overflow-wrap:anywhere; max-width:320px; }
    .actions { text-align:right; white-space:nowrap; }
    .link { border:none; background:none; padding:0; margin-left:10px; font-size:12.5px; cursor:pointer; font-family:inherit; color:var(--accent-blue, #3B82F6); }
    .link.danger { color:#B91C1C; }
    .link:disabled { opacity:.5; cursor:not-allowed; }
  `],
})
export class ProjectKsefSettingsComponent implements OnInit {
  private readonly api = inject(KsefApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(ProjectFinanceFormatService);

  readonly minSyncDays = MIN_SYNC_DAYS;
  readonly maxSyncDays = MAX_SYNC_DAYS;

  readonly config = signal<KsefAdminConfig | null>(null);
  readonly hasLoadFailed = signal(false);
  readonly isFormOpen = signal(false);
  readonly editedCompany = signal<KsefCompany | null>(null);
  readonly syncingCompanyId = signal<string | null>(null);
  initialSyncDays: number | null = null;
  invoiceDocumentsGroupId: string | null = null;

  private readonly activeGroups = signal<KsefDocumentGroup[]>([]);
  // The chosen group stays in the list even when the group list could not be loaded.
  readonly groupOptions = computed(() => {
    const chosen = this.config()?.invoice_documents_group;
    const groups = this.activeGroups();
    return chosen && !groups.some(group => group.id === chosen.id) ? [...groups, chosen] : groups;
  });

  ngOnInit(): void {
    this.load();
    // Without the list the select still shows the chosen group and "none".
    this.api.listDocumentGroups().subscribe({
      next: groups => this.activeGroups.set(groups.filter(group => group.is_active)),
      error: () => this.activeGroups.set([]),
    });
  }

  canSaveSyncDays(config: KsefAdminConfig): boolean {
    const days = Number(this.initialSyncDays);
    return Number.isInteger(days) && days >= MIN_SYNC_DAYS && days <= MAX_SYNC_DAYS && days !== config.initial_sync_days;
  }

  saveSyncDays(): void {
    this.api.setInitialSyncDays(Number(this.initialSyncDays)).subscribe({
      next: config => {
        this.applyConfig(config);
        this.toast.success(this.transloco.translate('projects.ksef.settings.saved'));
      },
      error: err => this.toast.error(describeKsefAdminError(err, this.transloco, 'projects.ksef.settings.saveFailed')),
    });
  }

  saveInvoiceDocumentsGroup(): void {
    this.api.setInvoiceDocumentsGroup(this.invoiceDocumentsGroupId).subscribe({
      next: config => {
        this.applyConfig(config);
        this.toast.success(this.transloco.translate('projects.ksef.settings.saved'));
      },
      error: err => this.toast.error(describeKsefAdminError(err, this.transloco, 'projects.ksef.settings.saveFailed')),
    });
  }

  openForm(company: KsefCompany | null): void {
    this.editedCompany.set(company);
    this.isFormOpen.set(true);
  }

  onCompanySaved(): void {
    this.isFormOpen.set(false);
    this.load();
  }

  remove(company: KsefCompany): void {
    const label = company.name ? `${company.name} (${company.nip})` : company.nip;
    if (!confirm(this.transloco.translate('projects.ksef.settings.removeConfirm', { company: label }))) return;
    this.api.deleteCompany(company.id).subscribe({
      next: () => this.load(),
      error: err => this.toast.error(describeKsefAdminError(err, this.transloco, 'projects.ksef.settings.removeFailed')),
    });
  }

  sync(company: KsefCompany): void {
    this.syncingCompanyId.set(company.id);
    this.api.syncAndWait(company.id).subscribe({
      next: ({ state, isFinished }) => {
        this.syncingCompanyId.set(null);
        const hasFailed = state.companies.find(synced => synced.id === company.id)?.status !== 'active';
        if (!isFinished) this.toast.info(this.transloco.translate('projects.ksef.sync.stillRunning'));
        else if (hasFailed) this.toast.error(this.transloco.translate('projects.ksef.settings.syncFailed'));
        else this.toast.success(this.transloco.translate('projects.ksef.sync.finished'));
        this.load();
      },
      error: err => {
        this.syncingCompanyId.set(null);
        this.toast.error(describeKsefAdminError(err, this.transloco, 'projects.ksef.sync.startFailed'));
      },
    });
  }

  private load(): void {
    this.api.getAdminConfig().subscribe({
      next: config => this.applyConfig(config),
      error: () => this.hasLoadFailed.set(true),
    });
  }

  private applyConfig(config: KsefAdminConfig): void {
    this.config.set(config);
    this.hasLoadFailed.set(false);
    this.initialSyncDays = config.initial_sync_days;
    this.invoiceDocumentsGroupId = config.invoice_documents_group?.id ?? null;
  }
}

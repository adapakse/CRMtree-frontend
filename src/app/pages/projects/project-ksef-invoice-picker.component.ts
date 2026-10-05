import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../core/services/toast.service';
import {
  KsefApiService, KsefInvoiceDetail, KsefInvoicePage, KsefInvoiceRow, KsefSyncState,
} from '../../core/services/ksef-api.service';
import { ProjectCostItem } from '../../core/services/project-finance-api.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectCostCategory, ProjectTask } from '../../core/services/projects-api.service';
import { ProjectKsefLinkFormComponent } from './project-ksef-link-form.component';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { PROJECT_FINANCE_STYLES } from './project-finance.styles';
import { PROJECT_KSEF_STYLES } from './project-ksef.styles';

const DEFAULT_PERIOD_DAYS = 30;
const PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

type ListError = 'forbidden' | 'failed';

interface InvoiceFilters {
  date_from: string;
  date_to: string;
  seller: string;
  invoice_number: string;
  net_min: number | null;
  net_max: number | null;
}

/**
 * "Add invoice from KSeF": a list of downloaded invoices with filters, then a
 * confirmation step (`wt-project-ksef-link-form`). With `attachTo` the chosen
 * invoice is attached to that existing cost item instead of creating a new one.
 */
@Component({
  selector: 'wt-project-ksef-invoice-picker',
  standalone: true,
  imports: [FormsModule, TranslocoDirective, TranslocoPipe, ProjectKsefLinkFormComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mol" *transloco="let t; prefix: 'projects'">
      <div class="mo">
        <div class="moh">
          <div class="mot">{{ t(attachTo() ? 'ksef.picker.attachTitle' : 'ksef.picker.title') }}</div>
          <button class="mox" (click)="closed.emit()">✕</button>
        </div>

        @if (selectedInvoice(); as invoice) {
          <wt-project-ksef-link-form
            [invoice]="invoice" [projectId]="projectId()" [projectKey]="projectKey()" [projectCurrency]="projectCurrency()"
            [categories]="categories()" [tasks]="tasks()" [taskId]="taskId()" [isTaskLocked]="isTaskLocked()"
            [attachTo]="attachTo()" (back)="selectedInvoice.set(null)" (saved)="saved.emit($event)" />
        } @else {
          <div class="mob">
            @if (syncState(); as state) {
              @if (!state.is_configured) {
                <div class="notice">{{ t('ksef.picker.notConfigured') }}</div>
              } @else if (state.companies.length === 0) {
                <div class="notice">{{ t('ksef.picker.noCompanies') }}</div>
              }
            }

            <div class="filters">
              <div class="fg">
                <label class="fl">{{ t('ksef.picker.filters.dateFrom') }}</label>
                <input class="fi" type="date" [(ngModel)]="filters.date_from">
              </div>
              <div class="fg">
                <label class="fl">{{ t('ksef.picker.filters.dateTo') }}</label>
                <input class="fi" type="date" [(ngModel)]="filters.date_to">
              </div>
              <div class="fg wide">
                <label class="fl">{{ t('ksef.picker.filters.seller') }}</label>
                <input class="fi" [(ngModel)]="filters.seller" (keyup.enter)="search()">
              </div>
              <div class="fg">
                <label class="fl">{{ t('ksef.picker.filters.invoiceNumber') }}</label>
                <input class="fi" [(ngModel)]="filters.invoice_number" (keyup.enter)="search()">
              </div>
              <div class="fg">
                <label class="fl">{{ t('ksef.picker.filters.netMin') }}</label>
                <input class="fi" type="number" step="0.01" [(ngModel)]="filters.net_min" (keyup.enter)="search()">
              </div>
              <div class="fg">
                <label class="fl">{{ t('ksef.picker.filters.netMax') }}</label>
                <input class="fi" type="number" step="0.01" [(ngModel)]="filters.net_max" (keyup.enter)="search()">
              </div>
              <button class="btn btn-p" [disabled]="isLoading()" (click)="search()">{{ t('ksef.picker.search') }}</button>
            </div>

            <div class="sync-bar">
              <span class="hint">
                {{ t('ksef.picker.lastSync', { time: format.dateTime(lastSyncedAt()) }) }}
                {{ t('ksef.picker.syncHint') }}
              </span>
              <button class="btn btn-g btn-sm" [disabled]="!canSync() || isSyncing()" (click)="sync()">
                {{ isSyncing() ? t('ksef.sync.running') : t('ksef.sync.now') }}
              </button>
            </div>

            @if (listError(); as error) {
              <div class="notice error">{{ t(error === 'forbidden' ? 'ksef.errors.forbidden' : 'ksef.picker.loadFailed') }}</div>
            } @else if (page(); as loaded) {
              @if (loaded.items.length === 0) {
                <p class="hint empty">{{ t('ksef.picker.empty') }}</p>
              } @else {
                <div class="tw">
                  <table class="grid">
                    <thead>
                      <tr>
                        <th>{{ t('ksef.list.columns.issueDate') }}</th>
                        <th>{{ t('ksef.list.columns.number') }}</th>
                        <th>{{ t('ksef.list.columns.seller') }}</th>
                        <th class="amount">{{ t('ksef.list.columns.net') }}</th>
                        <th class="amount">{{ t('ksef.list.columns.gross') }}</th>
                        <th>{{ t('ksef.list.columns.currency') }}</th>
                        <th>{{ t('ksef.list.columns.paymentDueDate') }}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of loaded.items; track row.id) {
                        <tr [class.linked]="row.links_count > 0">
                          <td class="nowrap">{{ format.date(row.issue_date) }}</td>
                          <td class="number">
                            {{ row.invoice_number ?? row.ksef_number }}
                            @if (row.links_count > 0) {
                              <span class="pill linked-pill">{{ t('ksef.picker.linkedCount', { count: row.links_count }) }}</span>
                            }
                          </td>
                          <td>{{ row.seller_name ?? '—' }} <span class="secondary">{{ t('ksef.nip') }} {{ row.seller_nip ?? '—' }}</span></td>
                          <td class="amount">{{ format.plainAmount(row.net_amount) }}</td>
                          <td class="amount">{{ format.plainAmount(row.gross_amount) }}</td>
                          <td>{{ row.currency }}</td>
                          <td class="nowrap">{{ format.date(row.payment_due_date) }}</td>
                          <td class="row-action">
                            <button class="btn btn-g btn-sm" [disabled]="openingInvoiceId() !== null" (click)="select(row)">
                              {{ openingInvoiceId() === row.id ? ('states.loading' | transloco) : t('ksef.picker.select') }}
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <div class="pager">
                  <span class="hint">{{ t('ksef.picker.pageInfo', { page: loaded.page, pages: pageCount(), total: loaded.total }) }}</span>
                  <button class="btn btn-g btn-sm" [disabled]="loaded.page <= 1 || isLoading()" (click)="goToPage(loaded.page - 1)">{{ t('ksef.picker.previousPage') }}</button>
                  <button class="btn btn-g btn-sm" [disabled]="loaded.page >= pageCount() || isLoading()" (click)="goToPage(loaded.page + 1)">{{ t('ksef.picker.nextPage') }}</button>
                </div>
              }
            } @else {
              <div class="empty-state">{{ 'states.loading' | transloco }}</div>
            }
          </div>
          <div class="mof">
            <button class="btn btn-g" (click)="closed.emit()">{{ 'actions.cancel' | transloco }}</button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [PROJECTS_SHARED_STYLES, PROJECT_FINANCE_STYLES, PROJECT_KSEF_STYLES, `
    .mo { width:1080px; max-height:92vh; display:flex; flex-direction:column; }
    .mob { overflow-y:auto; }
    .filters { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)) auto; gap:10px 12px; align-items:end; }
    .filters .wide { grid-column:span 2; }
    .sync-bar, .pager { display:flex; align-items:center; gap:10px; }
    .sync-bar .hint, .pager .hint { flex:1; }
    .empty { padding:18px 0; text-align:center; }
    .number { overflow-wrap:anywhere; }
    .linked-pill { display:inline-block; margin-left:4px; background:#FEF3C7; color:#92400E; white-space:nowrap; }
    tr.linked td { background:#FFFBEB; }
    @media (max-width: 900px) { .filters { grid-template-columns:1fr 1fr; } }
  `],
})
export class ProjectKsefInvoicePickerComponent implements OnInit {
  private readonly api = inject(KsefApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(ProjectFinanceFormatService);

  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  readonly projectCurrency = input.required<string>();
  readonly categories = input.required<ProjectCostCategory[]>();
  readonly tasks = input<ProjectTask[]>([]);
  /** Task of the new cost item when the picker is opened from a task. */
  readonly taskId = input<string | null>(null);
  readonly isTaskLocked = input(false);
  /** An existing cost item to attach the chosen invoice to; null creates a new cost item. */
  readonly attachTo = input<ProjectCostItem | null>(null);

  readonly closed = output<void>();
  readonly saved = output<ProjectCostItem>();

  readonly page = signal<KsefInvoicePage | null>(null);
  readonly listError = signal<ListError | null>(null);
  readonly isLoading = signal(false);
  readonly syncState = signal<KsefSyncState | null>(null);
  readonly isSyncing = signal(false);
  readonly openingInvoiceId = signal<string | null>(null);
  readonly selectedInvoice = signal<KsefInvoiceDetail | null>(null);

  readonly pageCount = computed(() => {
    const loaded = this.page();
    return loaded ? Math.max(1, Math.ceil(loaded.total / loaded.page_size)) : 1;
  });
  readonly canSync = computed(() => {
    const state = this.syncState();
    return state !== null && state.is_configured && state.companies.length > 0;
  });
  // With several companies the oldest sync tells how fresh the whole list is.
  readonly lastSyncedAt = computed(() => {
    const times = (this.syncState()?.companies ?? []).map(company => company.last_synced_at);
    if (times.length === 0 || times.some(time => time === null)) return null;
    return (times as string[]).reduce((oldest, time) => (time < oldest ? time : oldest));
  });

  filters: InvoiceFilters = {
    date_from: toDateInputValue(new Date(Date.now() - DEFAULT_PERIOD_DAYS * DAY_MS)),
    date_to: toDateInputValue(new Date()),
    seller: '', invoice_number: '', net_min: null, net_max: null,
  };

  ngOnInit(): void {
    this.loadSyncState();
    this.loadPage(1);
  }

  search(): void {
    this.loadPage(1);
  }

  goToPage(pageNumber: number): void {
    this.loadPage(pageNumber);
  }

  select(row: KsefInvoiceRow): void {
    this.openingInvoiceId.set(row.id);
    this.api.getInvoice(row.id).subscribe({
      next: invoice => {
        this.openingInvoiceId.set(null);
        this.selectedInvoice.set(invoice);
      },
      error: err => {
        this.openingInvoiceId.set(null);
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.ksef.detail.loadFailed'));
      },
    });
  }

  sync(): void {
    this.isSyncing.set(true);
    this.api.syncAndWait(null).subscribe({
      next: ({ state, isFinished }) => {
        this.isSyncing.set(false);
        this.syncState.set(state);
        const hasFailedCompany = state.companies.some(company => company.status !== 'active');
        if (!isFinished) this.toast.info(this.transloco.translate('projects.ksef.sync.stillRunning'));
        else if (hasFailedCompany) this.toast.error(this.transloco.translate('projects.ksef.sync.failedForCompany'));
        else this.toast.success(this.transloco.translate('projects.ksef.sync.finished'));
        this.loadPage(1);
      },
      error: err => {
        this.isSyncing.set(false);
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.ksef.sync.startFailed'));
      },
    });
  }

  private loadSyncState(): void {
    // A failure here is not reported on its own: the invoice list fails for the same reason and says why.
    this.api.getSyncState().subscribe({ next: state => this.syncState.set(state), error: () => this.syncState.set(null) });
  }

  private loadPage(pageNumber: number): void {
    this.isLoading.set(true);
    this.api.listInvoices({
      date_from: this.filters.date_from || undefined,
      date_to: this.filters.date_to || undefined,
      seller: this.filters.seller.trim() || undefined,
      invoice_number: this.filters.invoice_number.trim() || undefined,
      net_min: this.filters.net_min ?? undefined,
      net_max: this.filters.net_max ?? undefined,
      page: pageNumber,
      page_size: PAGE_SIZE,
    }).subscribe({
      next: page => {
        this.isLoading.set(false);
        this.listError.set(null);
        this.page.set(page);
      },
      error: err => {
        this.isLoading.set(false);
        this.listError.set(err?.status === 403 ? 'forbidden' : 'failed');
      },
    });
  }
}

// The date input works on the user's calendar day, not on the UTC day.
function toDateInputValue(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

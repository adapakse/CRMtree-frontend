import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../core/services/toast.service';
import { KsefInvoiceDetail } from '../../core/services/ksef-api.service';
import {
  ProjectCostItem, ProjectCostItemPayload, ProjectCostStatus, ProjectFinanceApiService,
} from '../../core/services/project-finance-api.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectCostCategory, ProjectTask } from '../../core/services/projects-api.service';
import { ProjectKsefLinksTableComponent } from './project-ksef-links-table.component';
import { buildTaskRows } from './project-task-tree.util';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { PROJECT_FINANCE_STYLES } from './project-finance.styles';
import { PROJECT_KSEF_STYLES, taskLabel } from './project-ksef.styles';

const COST_STATUSES: ProjectCostStatus[] = ['incurred', 'planned'];
// A <select> option cannot be indented with CSS, so the tree depth is drawn with non-breaking spaces.
const OPTION_INDENT = '   ';

/**
 * Confirmation step of the KSeF invoice picker: the chosen invoice, a warning
 * when it is already linked elsewhere, and either the fields of the new cost
 * item or — when attaching to an existing item — a plain confirmation.
 * Linking is never blocked by existing links.
 */
@Component({
  selector: 'wt-project-ksef-link-form',
  standalone: true,
  imports: [FormsModule, TranslocoDirective, ProjectKsefLinksTableComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div class="mob">
        <dl class="facts summary">
          <div class="fact"><dt>{{ t('ksef.list.columns.number') }}</dt><dd>{{ invoice().invoice_number ?? invoice().ksef_number }}</dd></div>
          <div class="fact">
            <dt>{{ t('ksef.list.columns.seller') }}</dt>
            <dd>{{ invoice().seller_name ?? '—' }} <span class="secondary">{{ t('ksef.nip') }} {{ invoice().seller_nip ?? '—' }}</span></dd>
          </div>
          <div class="fact"><dt>{{ t('ksef.list.columns.issueDate') }}</dt><dd>{{ format.date(invoice().issue_date) }}</dd></div>
          <div class="fact"><dt>{{ t('ksef.list.columns.net') }}</dt><dd>{{ format.money(invoice().net_amount, invoice().currency) }}</dd></div>
          <div class="fact"><dt>{{ t('ksef.list.columns.gross') }}</dt><dd>{{ format.money(invoice().gross_amount, invoice().currency) }}</dd></div>
          <div class="fact"><dt>{{ t('ksef.list.columns.paymentDueDate') }}</dt><dd>{{ format.date(invoice().payment_due_date) }}</dd></div>
        </dl>

        @if (invoice().links.length > 0) {
          <div class="notice error" role="alert">
            <div class="notice-title">{{ t('ksef.link.alreadyLinkedTitle') }}</div>
            <wt-project-ksef-links-table class="links" [links]="invoice().links" />
            @if (invoice().is_over_allocated) { <div>{{ t('ksef.otherLinks.overAllocated') }}</div> }
            <div>{{ t('ksef.link.alreadyLinkedHint') }}</div>
          </div>
        }

        @if (attachTo(); as cost) {
          <p class="attach-note">{{ t('ksef.link.attachNote', { item: costLabel(cost) }) }}</p>
        } @else {
          <div class="fgrid">
            <div class="fg">
              <label class="fl">{{ t('finance.costForm.category') }} <span class="req">*</span></label>
              <select class="fsel" [ngModel]="categoryId()" (ngModelChange)="categoryId.set($event)">
                <option [ngValue]="null">{{ t('finance.costForm.selectCategory') }}</option>
                @for (category of activeCategories(); track category.id) {
                  <option [ngValue]="category.id">{{ category.name }}</option>
                }
              </select>
            </div>
            <div class="fg">
              <label class="fl">{{ t('finance.costForm.status') }}</label>
              <select class="fsel" [(ngModel)]="status">
                @for (option of statuses; track option) {
                  <option [ngValue]="option">{{ t('finance.costStatuses.' + option) }}</option>
                }
              </select>
            </div>
            <div class="fg">
              <label class="fl">{{ t('finance.costForm.task') }}</label>
              <select class="fsel" [(ngModel)]="selectedTaskId" [disabled]="isTaskLocked()">
                <option [ngValue]="null">{{ t('finance.costForm.noTask') }}</option>
                @for (option of taskOptions(); track option.id) {
                  <option [ngValue]="option.id">{{ option.label }}</option>
                }
              </select>
            </div>
            <div class="fg">
              <label class="fl">
                {{ t('ksef.link.amountIn', { currency: projectCurrency() }) }}
                @if (isAmountRequired()) { <span class="req">*</span> }
              </label>
              <input class="fi" type="number" min="0.01" step="0.01" [ngModel]="amount()" (ngModelChange)="amount.set($event)">
            </div>
          </div>
          <p class="hint">
            @if (isForeignCurrency()) {
              {{ t('ksef.link.amountHintForeign', {
                net: format.money(invoice().net_amount, invoice().currency),
                invoiceCurrency: invoice().currency,
                projectCurrency: projectCurrency()
              }) }}
            } @else {
              {{ t('ksef.link.amountHint') }}
            }
          </p>
          <div class="fg">
            <label class="fl">{{ t('finance.costForm.description') }}</label>
            <textarea class="fta" rows="2" [(ngModel)]="description" maxlength="2000"></textarea>
          </div>
        }
      </div>
      <div class="mof">
        <button class="btn btn-g" [disabled]="isSaving()" (click)="back.emit()">{{ t('ksef.link.back') }}</button>
        <button class="btn btn-p" [disabled]="!isValid() || isSaving()" (click)="save()">
          {{ isSaving() ? t('finance.saving') : t('ksef.link.confirm') }}
        </button>
      </div>
    </ng-container>
  `,
  styles: [PROJECTS_SHARED_STYLES, PROJECT_FINANCE_STYLES, PROJECT_KSEF_STYLES, `
    :host { display:flex; flex-direction:column; flex:1; min-height:0; height:auto; }
    .mob { overflow-y:auto; }
    .summary { padding:12px 14px; border:1px solid var(--gray-200); border-radius:9px; background:var(--gray-50); }
    .notice { display:flex; flex-direction:column; gap:8px; }
    .attach-note { margin:0; font-size:13px; color:var(--gray-800); line-height:1.5; }
  `],
})
export class ProjectKsefLinkFormComponent implements OnInit {
  private readonly api = inject(ProjectFinanceApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(ProjectFinanceFormatService);

  readonly invoice = input.required<KsefInvoiceDetail>();
  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  readonly projectCurrency = input.required<string>();
  readonly categories = input.required<ProjectCostCategory[]>();
  readonly tasks = input<ProjectTask[]>([]);
  /** Task preselected for the new cost item. */
  readonly taskId = input<string | null>(null);
  readonly isTaskLocked = input(false);
  /** An existing cost item to attach the invoice to; null creates a new cost item. */
  readonly attachTo = input<ProjectCostItem | null>(null);

  readonly back = output<void>();
  readonly saved = output<ProjectCostItem>();

  readonly statuses = COST_STATUSES;
  readonly isSaving = signal(false);
  readonly categoryId = signal<string | null>(null);
  /** Assigned amount in the project currency; empty lets the API take the whole net amount. */
  readonly amount = signal<number | null>(null);
  status: ProjectCostStatus = 'incurred';
  selectedTaskId: string | null = null;
  description = '';

  readonly activeCategories = computed(() => this.categories().filter(category => category.is_active));
  readonly isForeignCurrency = computed(() => this.invoice().currency !== this.projectCurrency());
  // Without a positive net amount the API has nothing to fall back on.
  readonly isAmountRequired = computed(() => !((this.invoice().net_amount ?? 0) > 0));
  readonly taskOptions = computed(() => buildTaskRows(this.tasks()).map(row => ({
    id: row.task.id,
    label: `${OPTION_INDENT.repeat(row.depth)}${taskLabel(this.projectKey(), row.task.task_number, row.task.name)}`,
  })));
  readonly isValid = computed(() => {
    if (this.attachTo()) return true;
    const amount = this.amount();
    const isAmountEmpty = amount === null || String(amount) === '';
    const isAmountValid = isAmountEmpty ? !this.isAmountRequired() : Number(amount) > 0;
    return this.categoryId() !== null && isAmountValid;
  });

  ngOnInit(): void {
    this.selectedTaskId = this.taskId();
    const netAmount = this.invoice().net_amount;
    // In another currency the field stays empty so that the API converts the net amount itself.
    if (!this.isForeignCurrency() && netAmount !== null && netAmount > 0) this.amount.set(netAmount);
  }

  costLabel(cost: ProjectCostItem): string {
    return [this.format.date(cost.date), cost.category_name, this.format.money(cost.amount, this.projectCurrency())].join(', ');
  }

  save(): void {
    const cost = this.attachTo();
    const invoiceId = this.invoice().id;
    const request = cost
      ? this.api.updateCost(this.projectId(), cost.id, { ksef_invoice_id: invoiceId })
      : this.api.createCost(this.projectId(), this.buildPayload(invoiceId));

    this.isSaving.set(true);
    request.subscribe({
      next: savedItem => {
        this.isSaving.set(false);
        this.toast.success(this.savedMessage(savedItem, cost !== null));
        this.saved.emit(savedItem);
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error(this.errorMessage(err));
      },
    });
  }

  private buildPayload(invoiceId: string): ProjectCostItemPayload {
    const amount = this.amount();
    const hasAmount = amount !== null && String(amount) !== '';
    return {
      ksef_invoice_id: invoiceId,
      category_id: this.categoryId() ?? undefined,
      status: this.status,
      task_id: this.selectedTaskId,
      description: this.description.trim() || null,
      ...(hasAmount ? { amount: Number(amount) } : {}),
    };
  }

  private savedMessage(item: ProjectCostItem, isAttached: boolean): string {
    if (isAttached || item.exchange_rate === null) return this.transloco.translate('projects.ksef.link.saved');
    return this.transloco.translate('projects.ksef.link.savedWithRate', {
      amount: this.format.money(item.amount, this.projectCurrency()),
      rate: this.format.exchangeRate(item.exchange_rate),
      date: this.format.date(item.exchange_rate_date),
    });
  }

  private errorMessage(err: { status?: number; error?: { error?: string } }): string {
    if (err?.status === 403) return this.transloco.translate('projects.ksef.link.errors.forbidden');
    if (err?.status === 422) {
      return this.transloco.translate('projects.ksef.link.errors.noExchangeRate', { currency: this.projectCurrency() });
    }
    if (err?.status === 409) return this.transloco.translate('projects.ksef.link.errors.projectClosed');
    return err?.error?.error ?? this.transloco.translate('projects.ksef.link.errors.failed');
  }
}

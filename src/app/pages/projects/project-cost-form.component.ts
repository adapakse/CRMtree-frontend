import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../core/services/toast.service';
import {
  ProjectCostItem, ProjectCostItemPayload, ProjectCostStatus, ProjectFinanceApiService,
} from '../../core/services/project-finance-api.service';
import { PROJECT_CURRENCIES, ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectCostCategory, ProjectTask } from '../../core/services/projects-api.service';
import { buildTaskRows } from './project-task-tree.util';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { PROJECT_FINANCE_STYLES } from './project-finance.styles';

const COST_STATUSES: ProjectCostStatus[] = ['incurred', 'planned'];
// A <select> option cannot be indented with CSS, so the tree depth is drawn with non-breaking spaces.
const OPTION_INDENT = '   ';

interface CostForm {
  date: string;
  category_id: string | null;
  status: ProjectCostStatus;
  amount: number | null;
  task_id: string | null;
  supplier_name: string;
  document_number: string;
  description: string;
}

/** Modal for adding or editing one cost item; used by the Finance tab and by the task panel. */
@Component({
  selector: 'wt-project-cost-form',
  standalone: true,
  imports: [FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mol" *transloco="let t; prefix: 'projects'" (click)="closed.emit()">
      <div class="mo" (click)="$event.stopPropagation()">
        <div class="moh">
          <div class="mot">{{ t(item() ? 'finance.costForm.editTitle' : 'finance.costForm.addTitle') }}</div>
          <button class="mox" (click)="closed.emit()">✕</button>
        </div>
        <div class="mob">
          <div class="fgrid">
            <div class="fg">
              <label class="fl">{{ t('finance.costForm.date') }} <span class="req">*</span></label>
              <input class="fi" type="date" [(ngModel)]="form.date">
            </div>
            <div class="fg">
              <label class="fl">{{ t('finance.costForm.status') }}</label>
              <select class="fsel" [(ngModel)]="form.status">
                @for (status of statuses; track status) {
                  <option [ngValue]="status">{{ t('finance.costStatuses.' + status) }}</option>
                }
              </select>
            </div>
            <div class="fg">
              <label class="fl">{{ t('finance.costForm.category') }} <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.category_id">
                <option [ngValue]="null">{{ t('finance.costForm.selectCategory') }}</option>
                @for (category of selectableCategories(); track category.id) {
                  <option [ngValue]="category.id">{{ category.name }}</option>
                }
              </select>
            </div>
            <div class="fg">
              <label class="fl">{{ t('finance.costForm.amount') }} <span class="req">*</span></label>
              <div class="money">
                <input class="fi" type="number" min="0.01" step="0.01" [(ngModel)]="form.amount">
                <select class="fsel" [ngModel]="currency()" (ngModelChange)="currency.set($event)"
                        [attr.aria-label]="t('finance.costForm.currency')">
                  @for (code of currencies(); track code) { <option [ngValue]="code">{{ code }}</option> }
                </select>
              </div>
            </div>
          </div>
          @if (isForeignCurrency()) {
            <p class="hint">{{ t('finance.costForm.conversionHint', { currency: projectCurrency() }) }}</p>
          }
          @if (storedConversion(); as conversion) {
            <p class="hint">{{ t('finance.costForm.storedConversion', conversion) }}</p>
          }

          @if (!isTaskLocked()) {
            <div class="fg">
              <label class="fl">{{ t('finance.costForm.task') }}</label>
              <select class="fsel" [(ngModel)]="form.task_id">
                <option [ngValue]="null">{{ t('finance.costForm.noTask') }}</option>
                @for (option of taskOptions(); track option.id) {
                  <option [ngValue]="option.id">{{ option.label }}</option>
                }
              </select>
            </div>
          }
          <div class="fgrid">
            <div class="fg">
              <label class="fl">{{ t('finance.costForm.supplier') }}</label>
              <input class="fi" [(ngModel)]="form.supplier_name" maxlength="200">
            </div>
            <div class="fg">
              <label class="fl">{{ t('finance.costForm.documentNumber') }}</label>
              <input class="fi" [(ngModel)]="form.document_number" maxlength="100">
            </div>
          </div>
          <div class="fg">
            <label class="fl">{{ t('finance.costForm.description') }}</label>
            <textarea class="fta" rows="3" [(ngModel)]="form.description" maxlength="2000"></textarea>
          </div>
        </div>
        <div class="mof">
          <button class="btn btn-g" (click)="closed.emit()">{{ 'actions.cancel' | transloco }}</button>
          <button class="btn btn-p" [disabled]="!isValid() || isSaving()" (click)="save()">
            {{ isSaving() ? t('finance.saving') : ('actions.save' | transloco) }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [PROJECTS_SHARED_STYLES, PROJECT_FINANCE_STYLES, `
    .mo { width:620px; max-height:92vh; display:flex; flex-direction:column; }
    .mob { overflow-y:auto; }
    .money { display:grid; grid-template-columns:1fr 90px; gap:8px; }
  `],
})
export class ProjectCostFormComponent implements OnInit {
  private readonly api = inject(ProjectFinanceApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly format = inject(ProjectFinanceFormatService);

  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  readonly projectCurrency = input.required<string>();
  readonly categories = input.required<ProjectCostCategory[]>();
  readonly tasks = input<ProjectTask[]>([]);
  /** null opens the form for a new cost item. */
  readonly item = input<ProjectCostItem | null>(null);
  /** Task preselected for a new item. */
  readonly taskId = input<string | null>(null);
  /** A participant adds costs only to the task the form was opened from. */
  readonly isTaskLocked = input(false);

  readonly closed = output<void>();
  readonly saved = output<ProjectCostItem>();

  readonly statuses = COST_STATUSES;
  readonly isSaving = signal(false);
  /** Currency the amount is typed in; a signal because the hints below follow it. */
  readonly currency = signal('');

  // A deactivated category stays selectable only for the item that already uses it.
  readonly selectableCategories = computed(() =>
    this.categories().filter(category => category.is_active || category.id === this.item()?.category_id));
  readonly currencies = computed(() =>
    [...new Set([this.projectCurrency(), ...PROJECT_CURRENCIES, this.item()?.original_currency ?? this.projectCurrency()])]);
  readonly isForeignCurrency = computed(() => this.currency() !== this.projectCurrency());
  readonly taskOptions = computed(() => buildTaskRows(this.tasks()).map(row => ({
    id: row.task.id,
    label: `${OPTION_INDENT.repeat(row.depth)}${this.projectKey()}-${row.task.task_number} ${row.task.name}`,
  })));
  readonly storedConversion = computed(() => {
    const item = this.item();
    if (!item || item.exchange_rate === null) return null;
    return {
      amount: this.format.money(item.amount, this.projectCurrency()),
      rate: this.format.exchangeRate(item.exchange_rate),
      date: this.format.date(item.exchange_rate_date),
    };
  });

  form: CostForm = {
    date: new Date().toISOString().slice(0, 10), category_id: null, status: 'incurred', amount: null,
    task_id: null, supplier_name: '', document_number: '', description: '',
  };

  ngOnInit(): void {
    const item = this.item();
    this.currency.set(item?.original_currency ?? this.projectCurrency());
    if (!item) {
      this.form.task_id = this.taskId();
      return;
    }
    this.form = {
      date: item.date.slice(0, 10),
      category_id: item.category_id,
      status: item.status,
      amount: item.original_amount ?? item.amount,
      task_id: item.task_id,
      supplier_name: item.supplier_name ?? '',
      document_number: item.document_number ?? '',
      description: item.description ?? '',
    };
  }

  isValid(): boolean {
    return Boolean(this.form.date) && this.form.category_id !== null && Number(this.form.amount) > 0;
  }

  save(): void {
    const item = this.item();
    const payload = this.buildPayload(item);
    const request = item
      ? this.api.updateCost(this.projectId(), item.id, payload)
      : this.api.createCost(this.projectId(), payload);

    this.isSaving.set(true);
    request.subscribe({
      next: savedItem => {
        this.isSaving.set(false);
        this.toast.success(this.savedMessage(savedItem));
        this.saved.emit(savedItem);
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.finance.costForm.saveFailed'));
      },
    });
  }

  private buildPayload(item: ProjectCostItem | null): ProjectCostItemPayload {
    const payload: ProjectCostItemPayload = {
      date: this.form.date,
      category_id: this.form.category_id ?? undefined,
      status: this.form.status,
      task_id: this.form.task_id,
      supplier_name: this.form.supplier_name.trim() || null,
      document_number: this.form.document_number.trim() || null,
      description: this.form.description.trim() || null,
    };
    const amount = Number(this.form.amount);
    const currency = this.currency();
    // Money is sent only when it was touched: the API recalculates the exchange
    // rate whenever it receives an amount, and an untouched item must keep its rate.
    const isMoneyChanged = !item
      || amount !== (item.original_amount ?? item.amount)
      || currency !== (item.original_currency ?? this.projectCurrency());
    if (!isMoneyChanged) return payload;

    if (this.isForeignCurrency()) {
      // Without `amount` the API converts the original amount itself.
      return { ...payload, original_amount: amount, original_currency: currency };
    }
    return { ...payload, amount, original_amount: null, original_currency: null };
  }

  // After a conversion the user is told which rate the API applied.
  private savedMessage(item: ProjectCostItem): string {
    if (item.exchange_rate === null) return this.transloco.translate('projects.finance.costForm.saved');
    return this.transloco.translate('projects.finance.costForm.savedWithRate', {
      amount: this.format.money(item.amount, this.projectCurrency()),
      rate: this.format.exchangeRate(item.exchange_rate),
      date: this.format.date(item.exchange_rate_date),
    });
  }
}

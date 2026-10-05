import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../core/services/toast.service';
import { ProjectCostItem, ProjectCostStatus, ProjectFinanceApiService } from '../../core/services/project-finance-api.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectCostCategory, ProjectTask } from '../../core/services/projects-api.service';
import { ProjectCostFormComponent } from './project-cost-form.component';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { PROJECT_FINANCE_STYLES } from './project-finance.styles';

// Filter value for cost items that belong to no task.
const WITHOUT_TASK = 'none';

interface FilterOption {
  id: string;
  label: string;
}

/** Cost items of the whole project with filters; add / edit / delete for those who may write. */
@Component({
  selector: 'wt-project-finance-costs',
  standalone: true,
  imports: [FormsModule, TranslocoDirective, ProjectCostFormComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card block" *transloco="let t; prefix: 'projects'">
      <div class="block-head">
        <div class="sec-title">{{ t('finance.costs.title') }}</div>
        @if (costs().length > 0) {
          <select class="fsel filter" [ngModel]="categoryFilter()" (ngModelChange)="categoryFilter.set($event)"
                  [attr.aria-label]="t('finance.costs.columns.category')">
            <option [ngValue]="null">{{ t('finance.costs.filters.allCategories') }}</option>
            @for (option of categoryOptions(); track option.id) { <option [ngValue]="option.id">{{ option.label }}</option> }
          </select>
          <select class="fsel filter" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)"
                  [attr.aria-label]="t('finance.costs.columns.status')">
            <option [ngValue]="null">{{ t('finance.costs.filters.allStatuses') }}</option>
            <option ngValue="incurred">{{ t('finance.costStatuses.incurred') }}</option>
            <option ngValue="planned">{{ t('finance.costStatuses.planned') }}</option>
          </select>
          <select class="fsel filter" [ngModel]="taskFilter()" (ngModelChange)="taskFilter.set($event)"
                  [attr.aria-label]="t('finance.costs.columns.task')">
            <option [ngValue]="null">{{ t('finance.costs.filters.allTasks') }}</option>
            <option [ngValue]="withoutTask">{{ t('finance.costs.filters.withoutTask') }}</option>
            @for (option of taskOptions(); track option.id) { <option [ngValue]="option.id">{{ option.label }}</option> }
          </select>
        }
        @if (canWrite()) {
          <button class="btn btn-p btn-sm" (click)="openForm(null)">+ {{ t('finance.costs.add') }}</button>
        }
      </div>

      @if (costs().length === 0) {
        <p class="hint">{{ t('finance.costs.empty') }}</p>
      } @else if (visibleCosts().length === 0) {
        <p class="hint">{{ t('finance.costs.emptyForFilters') }}</p>
      } @else {
        <div class="tw">
          <table class="grid">
            <thead>
              <tr>
                <th>{{ t('finance.costs.columns.date') }}</th>
                <th>{{ t('finance.costs.columns.category') }}</th>
                <th>{{ t('finance.costs.columns.description') }}</th>
                <th>{{ t('finance.costs.columns.task') }}</th>
                <th>{{ t('finance.costs.columns.supplier') }}</th>
                <th>{{ t('finance.costs.columns.documentNumber') }}</th>
                <th>{{ t('finance.costs.columns.status') }}</th>
                <th class="amount">{{ t('finance.costs.columns.amount') }}</th>
                @if (canWrite()) { <th></th> }
              </tr>
            </thead>
            <tbody>
              @for (item of visibleCosts(); track item.id) {
                <tr>
                  <td class="nowrap">{{ format.date(item.date) }}</td>
                  <td>{{ item.category_name }}</td>
                  <td class="description">{{ item.description }}</td>
                  <td>
                    @if (item.task_id; as taskId) {
                      <button class="link" (click)="taskOpened.emit(taskId)">
                        <span class="mono">{{ projectKey() }}-{{ item.task_number }}</span> {{ item.task_name }}
                      </button>
                    }
                  </td>
                  <td>{{ item.supplier_name }}</td>
                  <td>{{ item.document_number }}</td>
                  <td><span class="pill status-pill" [class]="item.status">{{ t('finance.costStatuses.' + item.status) }}</span></td>
                  <td class="amount">
                    {{ format.money(item.amount, currency()) }}
                    @if (item.original_amount !== null && item.original_currency) {
                      <span class="secondary">
                        {{ format.money(item.original_amount, item.original_currency) }}
                        @if (item.exchange_rate !== null) {
                          · {{ t('finance.costs.rateNote', { rate: format.exchangeRate(item.exchange_rate), date: format.date(item.exchange_rate_date) }) }}
                        }
                      </span>
                    }
                  </td>
                  @if (canWrite()) {
                    <td class="row-action">
                      <button class="link" (click)="openForm(item)">{{ t('finance.edit') }}</button>
                      <button class="link-danger" (click)="remove(item)">{{ t('finance.delete') }}</button>
                    </td>
                  }
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="7">{{ t('finance.costs.totalIncurred') }}</td>
                <td class="amount">{{ format.money(visibleIncurredTotal(), currency()) }}</td>
                @if (canWrite()) { <td></td> }
              </tr>
            </tfoot>
          </table>
        </div>
      }

      @if (isFormOpen()) {
        <wt-project-cost-form
          [projectId]="projectId()" [projectKey]="projectKey()" [projectCurrency]="currency()"
          [categories]="categories()" [tasks]="tasks()" [item]="editedItem()"
          (closed)="isFormOpen.set(false)" (saved)="onSaved()" />
      }
    </section>
  `,
  styles: [PROJECTS_SHARED_STYLES, PROJECT_FINANCE_STYLES, `
    .filter { width:auto; max-width:200px; padding:5px 8px; font-size:12.5px; }
    .description { max-width:280px; white-space:pre-wrap; overflow-wrap:anywhere; }
  `],
})
export class ProjectFinanceCostsComponent {
  private readonly api = inject(ProjectFinanceApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(ProjectFinanceFormatService);

  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  readonly currency = input.required<string>();
  readonly costs = input.required<ProjectCostItem[]>();
  readonly categories = input.required<ProjectCostCategory[]>();
  readonly tasks = input.required<ProjectTask[]>();
  readonly canWrite = input(false);

  /** Emitted after a cost item was added, changed or deleted. */
  readonly changed = output<void>();
  readonly taskOpened = output<string>();

  readonly withoutTask = WITHOUT_TASK;
  readonly categoryFilter = signal<string | null>(null);
  readonly statusFilter = signal<ProjectCostStatus | null>(null);
  readonly taskFilter = signal<string | null>(null);
  readonly isFormOpen = signal(false);
  readonly editedItem = signal<ProjectCostItem | null>(null);

  // Filters offer only what occurs in the list, so no choice leads to an empty table.
  readonly categoryOptions = computed(() => uniqueOptions(
    this.costs().map(item => ({ id: item.category_id, label: item.category_name }))));
  readonly taskOptions = computed(() => uniqueOptions(
    this.costs()
      .filter(item => item.task_id !== null)
      .map(item => ({ id: item.task_id as string, label: `${this.projectKey()}-${item.task_number} ${item.task_name}` }))));

  readonly visibleCosts = computed(() => {
    const category = this.categoryFilter();
    const status = this.statusFilter();
    const task = this.taskFilter();
    return this.costs().filter(item =>
      (category === null || item.category_id === category)
      && (status === null || item.status === status)
      && (task === null || (task === WITHOUT_TASK ? item.task_id === null : item.task_id === task)));
  });
  readonly visibleIncurredTotal = computed(() =>
    this.visibleCosts().filter(item => item.status === 'incurred').reduce((total, item) => total + item.amount, 0));

  openForm(item: ProjectCostItem | null): void {
    this.editedItem.set(item);
    this.isFormOpen.set(true);
  }

  onSaved(): void {
    this.isFormOpen.set(false);
    this.changed.emit();
  }

  remove(item: ProjectCostItem): void {
    const label = `${this.format.date(item.date)}, ${this.format.money(item.amount, this.currency())}`;
    if (!confirm(this.transloco.translate('projects.finance.costs.deleteConfirm', { item: label }))) return;
    this.api.deleteCost(this.projectId(), item.id).subscribe({
      next: () => this.changed.emit(),
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('projects.finance.costs.deleteFailed')),
    });
  }
}

function uniqueOptions(options: FilterOption[]): FilterOption[] {
  const byId = new Map(options.map(option => [option.id, option]));
  return [...byId.values()].sort((first, second) => first.label.localeCompare(second.label, undefined, { numeric: true }));
}

import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../core/services/toast.service';
import {
  ProjectFinanceApiService, ProjectFinanceCategoryRow, ProjectFinanceSummary,
} from '../../core/services/project-finance-api.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { PROJECT_FINANCE_STYLES, parseMoneyInput } from './project-finance.styles';

/** Budget per cost category against what was incurred and what is still planned. */
@Component({
  selector: 'wt-project-finance-categories',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card block" *transloco="let t; prefix: 'projects'">
      <div class="sec-title">{{ t('finance.categories.title') }}</div>
      @if (summary().categories.length === 0) {
        <p class="hint">{{ t('finance.categories.empty') }}</p>
      } @else {
        <div class="tw">
          <table class="grid">
            <thead>
              <tr>
                <th>{{ t('finance.categories.columns.category') }}</th>
                <th class="amount">{{ t('finance.categories.columns.budget') }}</th>
                <th class="amount">{{ t('finance.categories.columns.incurred') }}</th>
                <th class="amount">{{ t('finance.categories.columns.planned') }}</th>
                <th class="amount">{{ t('finance.categories.columns.variance') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of summary().categories; track row.category_id) {
                <tr [class.over-budget]="row.is_over_budget">
                  <td>
                    {{ row.name }}
                    @if (!row.is_active) { <span class="muted"> {{ t('finance.categories.inactive') }}</span> }
                  </td>
                  <td class="amount">
                    @if (canEditBudget(row)) {
                      <input class="fi cell-input" type="number" min="0" step="0.01" [value]="row.budget"
                             [attr.aria-label]="t('finance.categories.budgetOf', { name: row.name })"
                             (change)="changeBudget(row, $event)">
                    } @else { {{ money(row.budget) }} }
                  </td>
                  <td class="amount">{{ money(row.incurred) }}</td>
                  <td class="amount">{{ money(row.planned) }}</td>
                  <td class="amount" [class.danger]="row.variance < 0">{{ money(row.variance) }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td>{{ t('finance.categories.total') }}</td>
                <td class="amount">{{ money(summary().cost.planned) }}</td>
                <td class="amount">{{ money(summary().cost.actual) }}</td>
                <td class="amount">{{ money(summary().cost.planned_items) }}</td>
                <td class="amount" [class.danger]="summary().remaining_budget < 0">{{ money(summary().remaining_budget) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="hint">{{ t('finance.categories.hint') }}</p>
      }
    </section>
  `,
  styles: [PROJECTS_SHARED_STYLES, PROJECT_FINANCE_STYLES, `
    tr.over-budget td { background:#FEF2F2; }
  `],
})
export class ProjectFinanceCategoriesComponent {
  private readonly api = inject(ProjectFinanceApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly format = inject(ProjectFinanceFormatService);

  readonly projectId = input.required<string>();
  readonly summary = input.required<ProjectFinanceSummary>();
  readonly canWrite = input(false);
  readonly saved = output<ProjectFinanceSummary>();

  money(amount: number): string {
    return this.format.money(amount, this.summary().currency);
  }

  // The API refuses a first budget for a deactivated category; one it already has stays editable.
  canEditBudget(row: ProjectFinanceCategoryRow): boolean {
    return this.canWrite() && (row.is_active || row.budget > 0);
  }

  changeBudget(row: ProjectFinanceCategoryRow, event: Event): void {
    const input = event.target as HTMLInputElement;
    const restore = () => { input.value = String(row.budget); };
    const budget = parseMoneyInput(input.value) ?? 0;
    if (Number.isNaN(budget)) {
      restore();
      return;
    }
    // The budget is stored as one list; a category without a budget is simply left out of it.
    const categoryBudgets = this.summary().categories
      .map(category => ({
        category_id: category.category_id,
        planned_cost: category.category_id === row.category_id ? budget : category.budget,
      }))
      .filter(entry => entry.planned_cost > 0);

    this.api.updatePlan(this.projectId(), { category_budgets: categoryBudgets }).subscribe({
      next: summary => this.saved.emit(summary),
      error: err => {
        restore();
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.finance.categories.saveFailed'));
      },
    });
  }
}

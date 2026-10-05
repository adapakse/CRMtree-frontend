import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../core/services/toast.service';
import {
  ProjectFinanceApiService, ProjectFinanceSummary, ProjectFinanceTaskRow,
} from '../../core/services/project-finance-api.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectTask } from '../../core/services/projects-api.service';
import { INDENT_PX_PER_LEVEL, buildTaskRows } from './project-task-tree.util';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { PROJECT_FINANCE_STYLES, parseMoneyInput } from './project-finance.styles';

interface TaskCostRow {
  task: ProjectTask;
  depth: number;
  figures: ProjectFinanceTaskRow | null;
}

/** Costs per task in tree order: the task's planned cost and what its items (and its subtasks' items) add up to. */
@Component({
  selector: 'wt-project-finance-task-costs',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card block" *transloco="let t; prefix: 'projects'">
      <div class="sec-title">{{ t('finance.taskCosts.title') }}</div>
      @if (rows().length === 0) {
        <p class="hint">{{ t('finance.taskCosts.empty') }}</p>
      } @else {
        <div class="tw">
          <table class="grid">
            <thead>
              <tr>
                <th>{{ t('finance.taskCosts.columns.task') }}</th>
                <th class="amount">{{ t('finance.taskCosts.columns.plannedCost') }}</th>
                <th class="amount">{{ t('finance.taskCosts.columns.ownIncurred') }}</th>
                <th class="amount">{{ t('finance.taskCosts.columns.totalIncurred') }}</th>
                <th class="amount">{{ t('finance.taskCosts.columns.totalPlanned') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.task.id) {
                <tr>
                  <td>
                    <button class="link task" [style.padding-left.px]="row.depth * indentPx" (click)="taskOpened.emit(row.task.id)">
                      <span class="mono">{{ projectKey() }}-{{ row.task.task_number }}</span>
                      <span [class.root-name]="row.depth === 0">{{ row.task.name }}</span>
                    </button>
                  </td>
                  <td class="amount">
                    @if (canWrite()) {
                      <input class="fi cell-input" type="number" min="0" step="0.01" [value]="row.figures?.planned_cost ?? ''"
                             [attr.aria-label]="t('finance.taskCosts.plannedCostOf', { task: row.task.name })"
                             (change)="changePlannedCost(row, $event)">
                    } @else { {{ money(row.figures?.planned_cost) }} }
                  </td>
                  <td class="amount">{{ money(row.figures?.own_incurred ?? 0) }}</td>
                  <td class="amount" [class.danger]="isOverPlannedCost(row)">{{ money(row.figures?.total_incurred ?? 0) }}</td>
                  <td class="amount">{{ money(row.figures?.total_planned ?? 0) }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td>{{ t('finance.taskCosts.total') }}</td>
                <td class="amount">{{ money(summary().cost.task_planned_total) }}</td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="hint">{{ t('finance.taskCosts.hint') }}</p>
      }
    </section>
  `,
  styles: [PROJECTS_SHARED_STYLES, PROJECT_FINANCE_STYLES, `
    .task { display:flex; align-items:baseline; gap:7px; color:var(--gray-800); font-size:13px; }
    .task:hover { color:var(--orange); }
    .root-name { font-weight:600; }
  `],
})
export class ProjectFinanceTaskCostsComponent {
  private readonly api = inject(ProjectFinanceApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly format = inject(ProjectFinanceFormatService);

  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  readonly summary = input.required<ProjectFinanceSummary>();
  readonly tasks = input.required<ProjectTask[]>();
  readonly canWrite = input(false);

  /** Emitted after a task's planned cost was saved. */
  readonly changed = output<void>();
  readonly taskOpened = output<string>();

  readonly indentPx = INDENT_PX_PER_LEVEL;

  // The summary lists only tasks that carry a figure. Someone who may write
  // sees every task, so a first planned cost can be entered; a reader sees
  // only the tasks with figures.
  readonly rows = computed<TaskCostRow[]>(() => {
    const figuresByTask = new Map(this.summary().tasks.map(figures => [figures.task_id, figures]));
    const listedTasks = this.canWrite() ? this.tasks() : this.tasks().filter(task => figuresByTask.has(task.id));
    return buildTaskRows(listedTasks).map(row => ({
      task: row.task, depth: row.depth, figures: figuresByTask.get(row.task.id) ?? null,
    }));
  });

  money(amount: number | null | undefined): string {
    return this.format.money(amount, this.summary().currency);
  }

  isOverPlannedCost(row: TaskCostRow): boolean {
    const plannedCost = row.figures?.planned_cost ?? null;
    return plannedCost !== null && (row.figures?.total_incurred ?? 0) > plannedCost;
  }

  changePlannedCost(row: TaskCostRow, event: Event): void {
    const input = event.target as HTMLInputElement;
    const restore = () => { input.value = String(row.figures?.planned_cost ?? ''); };
    const plannedCost = parseMoneyInput(input.value);
    if (Number.isNaN(plannedCost)) {
      restore();
      return;
    }
    this.api.setTaskPlannedCost(this.projectId(), row.task.id, plannedCost).subscribe({
      next: () => this.changed.emit(),
      error: err => {
        restore();
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.finance.taskCosts.saveFailed'));
      },
    });
  }
}

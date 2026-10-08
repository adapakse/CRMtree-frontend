import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import { ToastService } from '../../core/services/toast.service';
import {
  ProjectCostItem, ProjectFinanceApiService, ProjectFinanceSummary, ProjectRevenueItem,
} from '../../core/services/project-finance-api.service';
import { ProjectCostCategory, ProjectFinanceAccess, ProjectTask } from '../../core/services/projects-api.service';
import { ProjectFinanceCategoriesComponent } from './project-finance-categories.component';
import { ProjectFinanceCostsComponent } from './project-finance-costs.component';
import { ProjectFinancePlanComponent } from './project-finance-plan.component';
import { ProjectFinanceRevenuesComponent } from './project-finance-revenues.component';
import { ProjectFinanceSummaryComponent } from './project-finance-summary.component';
import { ProjectFinanceTaskCostsComponent } from './project-finance-task-costs.component';

/**
 * "Finance" tab of a project: summary tiles, plan, budget per category, cost
 * and revenue items, costs per task. Read-only for the controller and for a
 * closed project (`access.can_write` is false in both cases).
 */
@Component({
  selector: 'wt-project-finance',
  standalone: true,
  imports: [
    TranslocoDirective, TranslocoPipe,
    ProjectFinanceSummaryComponent, ProjectFinancePlanComponent, ProjectFinanceCategoriesComponent,
    ProjectFinanceCostsComponent, ProjectFinanceRevenuesComponent, ProjectFinanceTaskCostsComponent,
  ],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (summary(); as loaded) {
        @if (!access().can_write) { <div class="read-only-note">{{ t('finance.readOnlyNote') }}</div> }
        <wt-project-finance-summary [summary]="loaded" />
        <wt-project-finance-plan [projectId]="projectId()" [summary]="loaded" [canWrite]="access().can_write"
                                 (saved)="onPlanSaved($event)" />
        <wt-project-finance-categories [projectId]="projectId()" [summary]="loaded" [canWrite]="access().can_write"
                                       (saved)="summary.set($event)" />
        <wt-project-finance-costs
          [projectId]="projectId()" [projectKey]="projectKey()" [currency]="loaded.currency"
          [costs]="costs()" [categories]="categories()" [tasks]="tasks()" [canWrite]="access().can_write"
          (changed)="reload()" (taskOpened)="taskOpened.emit($event)" />
        <wt-project-finance-revenues [projectId]="projectId()" [currency]="loaded.currency" [revenues]="revenues()"
                                     [canWrite]="access().can_write" (changed)="reload()" />
        <wt-project-finance-task-costs
          [projectId]="projectId()" [projectKey]="projectKey()" [summary]="loaded" [tasks]="tasks()"
          [canWrite]="access().can_write" (changed)="reload()" (taskOpened)="taskOpened.emit($event)" />
      } @else {
        <div class="empty-state">{{ hasLoadFailed() ? t('finance.loadFailed') : ('states.loading' | transloco) }}</div>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:16px; }
    .read-only-note { font-size:12.5px; color:var(--gray-500); }
  `],
})
export class ProjectFinanceComponent implements OnInit {
  private readonly api = inject(ProjectFinanceApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  readonly access = input.required<ProjectFinanceAccess>();
  readonly categories = input.required<ProjectCostCategory[]>();
  readonly tasks = input.required<ProjectTask[]>();

  readonly taskOpened = output<string>();
  /** Emitted when the project currency changed: the project itself carries it too. */
  readonly currencyChanged = output<void>();

  readonly summary = signal<ProjectFinanceSummary | null>(null);
  readonly costs = signal<ProjectCostItem[]>([]);
  readonly revenues = signal<ProjectRevenueItem[]>([]);
  readonly hasLoadFailed = signal(false);

  ngOnInit(): void {
    this.reload();
  }

  /** Also called by the project view after a cost was changed in the task panel. */
  reload(): void {
    const projectId = this.projectId();
    forkJoin({
      summary: this.api.getSummary(projectId),
      costs: this.api.listCosts(projectId),
      revenues: this.api.listRevenues(projectId),
    }).subscribe({
      next: ({ summary, costs, revenues }) => {
        this.summary.set(summary);
        this.costs.set(costs);
        this.revenues.set(revenues);
        this.hasLoadFailed.set(false);
      },
      error: err => {
        this.hasLoadFailed.set(true);
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.finance.loadFailed'));
      },
    });
  }

  onPlanSaved(summary: ProjectFinanceSummary): void {
    const hasCurrencyChanged = summary.currency !== this.summary()?.currency;
    this.summary.set(summary);
    if (hasCurrencyChanged) this.currencyChanged.emit();
  }
}

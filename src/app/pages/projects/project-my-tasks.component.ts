import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { ProjectConfig, ProjectTaskRow, ProjectsApiService } from '../../core/services/projects-api.service';
import { ToastService } from '../../core/services/toast.service';
import { ListFilterBarComponent } from '../../shared/list/list-filter-bar.component';
import { ListParams, ListQueryState, createListLoader } from '../../shared/list/list-query';
import { ProjectDeadlineLegendComponent } from './project-deadline-legend.component';
import { ProjectListFiltersService } from './project-list-filters.service';
import { ProjectTaskTableComponent } from './project-task-table.component';

/**
 * Tasks assigned to the signed-in user across all their open projects — the
 * "my tasks" view for people who have no CRM calendar (non-sales staff,
 * external accounts).
 */
@Component({
  selector: 'wt-project-my-tasks',
  standalone: true,
  imports: [TranslocoDirective, TranslocoPipe, ListFilterBarComponent, ProjectDeadlineLegendComponent, ProjectTaskTableComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (filters(); as taskFilters) {
        <wt-list-filter-bar [filters]="taskFilters.all" [query]="query">
          <label class="toggle">
            <input type="checkbox" [checked]="includesDone()" (change)="toggleIncludesDone()">
            {{ t('myTasks.includeDone') }}
          </label>
        </wt-list-filter-bar>
        <wt-project-deadline-legend [atRiskThresholdDays]="config()!.at_risk_threshold_days" />
        <wt-project-task-table
          [rows]="loader.result()?.items ?? []" [total]="loader.result()?.total ?? 0" [isLoading]="loader.isLoading()"
          [query]="query" [filters]="taskFilters" [showsProject]="true" [showsAssignees]="false" [showsCalendarExport]="true"
          [emptyMessage]="t('myTasks.empty.description')" (taskOpened)="open($event)" />
      } @else {
        <div class="empty-state">{{ 'states.loading' | transloco }}</div>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:12px; }
    .toggle { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--gray-700); cursor:pointer; white-space:nowrap; }
  `],
})
export class ProjectMyTasksComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly filterDefinitions = inject(ProjectListFiltersService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly query = new ListQueryState();
  readonly config = signal<ProjectConfig | null>(null);
  readonly includesDone = signal(false);

  // No assignee filter (the list is the viewer's own) and no cost: the endpoint spans projects with different rights.
  readonly filters = computed(() => {
    const config = this.config();
    return config ? this.filterDefinitions.taskFilters({ config, includesCost: false }) : null;
  });

  private readonly requestParams = computed<ListParams>(() =>
    (this.includesDone() ? { ...this.query.params(), include_done: 'true' } : this.query.params()));

  readonly loader = createListLoader(
    this.requestParams,
    params => this.api.listMyTasks(params),
    error => this.toast.error(apiErrorMessage(error) ?? this.transloco.translate('projects.myTasks.loadFailed')),
  );

  ngOnInit(): void {
    this.api.getConfig().subscribe({
      next: config => this.config.set(config),
      error: error => this.toast.error(apiErrorMessage(error) ?? this.transloco.translate('projects.myTasks.loadFailed')),
    });
  }

  toggleIncludesDone(): void {
    this.includesDone.update(isIncluded => !isIncluded);
    this.query.page.set(1);
  }

  open(task: ProjectTaskRow): void {
    this.router.navigate(['/projects', task.project_id], { queryParams: { task: task.id } });
  }
}

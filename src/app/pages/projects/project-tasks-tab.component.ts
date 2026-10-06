import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { ProjectConfig, ProjectDetail, ProjectTask, ProjectsApiService } from '../../core/services/projects-api.service';
import { ToastService } from '../../core/services/toast.service';
import { ListFilterBarComponent } from '../../shared/list/list-filter-bar.component';
import { ListParams, ListQueryState, createListLoader } from '../../shared/list/list-query';
import { ProjectAssigneeSummaryComponent } from './project-assignee-summary.component';
import { ProjectDeadlineLegendComponent } from './project-deadline-legend.component';
import { FilterSet, TaskFilterId } from './project-list-filters.service';
import { ProjectTaskListComponent } from './project-task-list.component';
import { ProjectTaskTableComponent } from './project-task-table.component';

/**
 * The Tasks tab of a project. Without any filter it shows the whole project
 * as a tree; a filter, a sort order or the "flat list" switch replaces the
 * tree with the paged flat list the server filters.
 */
@Component({
  selector: 'wt-project-tasks-tab',
  standalone: true,
  imports: [
    TranslocoDirective, ListFilterBarComponent, ProjectAssigneeSummaryComponent, ProjectDeadlineLegendComponent,
    ProjectTaskListComponent, ProjectTaskTableComponent,
  ],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (canSeeAssigneeSummary()) {
        <wt-project-assignee-summary [projectId]="detail().project.id" [query]="query()" />
      }
      <wt-list-filter-bar [filters]="filters().all" [query]="query()">
        <label class="toggle">
          <input type="checkbox" [checked]="showsFlatList()" [disabled]="!query().isDefault()" (change)="prefersFlatList.set(!prefersFlatList())">
          {{ t('taskList.flatList') }}
        </label>
      </wt-list-filter-bar>
      <wt-project-deadline-legend [atRiskThresholdDays]="config().at_risk_threshold_days" />

      @if (showsFlatList()) {
        <wt-project-task-table
          [rows]="loader.result()?.items ?? []" [total]="loader.result()?.total ?? 0" [isLoading]="loader.isLoading()"
          [query]="query()" [filters]="filters()" [showsCost]="canReadFinance()" [emptyMessage]="emptyMessage()"
          (taskOpened)="taskOpened.emit($event.id)" />
      } @else {
        <wt-project-task-list
          [tasks]="treeTasks()" [config]="config()" [projectKey]="detail().project.key" [query]="query()" [filters]="filters()"
          [emptyMessage]="emptyMessage()" (taskOpened)="taskOpened.emit($event)" />
      }
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:12px; }
    .toggle { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--gray-700); cursor:pointer; white-space:nowrap; }
  `],
})
export class ProjectTasksTabComponent {
  private readonly api = inject(ProjectsApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly detail = input.required<ProjectDetail>();
  readonly config = input.required<ProjectConfig>();
  /** The whole project (already narrowed to "my tasks" when that switch is on), for the tree. */
  readonly treeTasks = input.required<ProjectTask[]>();
  readonly showsOnlyMyTasks = input(false);
  readonly query = input.required<ListQueryState>();
  readonly filters = input.required<FilterSet<TaskFilterId>>();
  readonly emptyMessage = input('');

  readonly taskOpened = output<string>();

  readonly prefersFlatList = signal(false);
  readonly showsFlatList = computed(() => this.prefersFlatList() || !this.query().isDefault());
  readonly canReadFinance = computed(() => this.detail().finance?.can_read === true);
  // The same people the server answers: PM and tenant admin (can_manage) and the controller.
  readonly canSeeAssigneeSummary = computed(() => this.detail().can_manage || this.detail().my_role === 'controller');

  private readonly summary = viewChild(ProjectAssigneeSummaryComponent);

  private readonly searchParams = computed<ListParams | null>(() => {
    if (!this.showsFlatList()) return null;
    return this.showsOnlyMyTasks() ? { ...this.query().params(), mine: 'true' } : this.query().params();
  });

  readonly loader = createListLoader(
    this.searchParams,
    params => this.api.searchTasks(this.detail().project.id, params),
    error => this.toast.error(apiErrorMessage(error) ?? this.transloco.translate('projects.detail.tasksLoadFailed')),
  );

  /** Called by the project view after a task was saved or the team changed. */
  reload(): void {
    this.loader.reload();
    this.summary()?.reload();
  }
}

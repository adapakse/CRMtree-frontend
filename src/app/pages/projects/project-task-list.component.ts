import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgStyle } from '@angular/common';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectConfig, ProjectDictionaryItem, ProjectTask } from '../../core/services/projects-api.service';
import { ProjectTaskDueDateComponent } from '../../shared/components/project-deadlines/project-task-due-date.component';
import { ProjectTaskTimelinessComponent } from '../../shared/components/project-deadlines/project-task-timeliness.component';
import { ListColumnHeaderComponent } from '../../shared/list/list-column-header.component';
import { ListQueryState } from '../../shared/list/list-query';
import { FilterSet, ProjectListFiltersService, TaskFilterId } from './project-list-filters.service';
import { INDENT_PX_PER_LEVEL, buildTaskRows } from './project-task-tree.util';
import { PROJECTS_SHARED_STYLES, chipStyle } from './projects-shared.styles';

/**
 * The whole project as a task tree — the default look of the Tasks tab. Its
 * column headers carry the same filters and sorting as the flat list; using
 * one makes the parent switch to that list, because a filtered or sorted
 * result is no longer a tree.
 */
@Component({
  selector: 'wt-project-task-list',
  standalone: true,
  imports: [NgStyle, TranslocoDirective, ListColumnHeaderComponent, ProjectTaskDueDateComponent, ProjectTaskTimelinessComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (rows().length === 0) {
        <div class="empty-state">
          <div class="empty-title">{{ t('taskList.emptyTitle') }}</div>
          {{ emptyMessage() || t('taskList.emptyMessage') }}
        </div>
      } @else {
        <div class="tw scroll">
          <table class="grid">
            <thead>
              <tr>
                <th [wtListColumn]="t('taskList.columns.number')" [query]="query()" sortKey="number" [filter]="filters().byId.number"></th>
                <th [wtListColumn]="t('taskList.columns.task')" [query]="query()" sortKey="name" [filter]="filters().byId.name"
                    [moreSorts]="taskColumnSorts"></th>
                <th [wtListColumn]="t('taskList.columns.type')" [query]="query()" sortKey="type" [filter]="filters().byId.type"></th>
                <th [wtListColumn]="t('taskList.columns.status')" [query]="query()" sortKey="status" [filter]="filters().byId.status"></th>
                <th [wtListColumn]="t('taskList.columns.priority')" [query]="query()" sortKey="priority" [filter]="filters().byId.priority"></th>
                <th [wtListColumn]="t('taskList.columns.assignees')" [query]="query()" sortKey="assignee" [filter]="filters().byId.assignee"></th>
                <th [wtListColumn]="t('taskList.columns.startDate')" [query]="query()" sortKey="start_date" [filter]="filters().byId.startDate"></th>
                <th [wtListColumn]="t('taskList.columns.endDate')" [query]="query()" sortKey="end_date" [filter]="filters().byId.endDate"
                    [moreFilters]="[filters().byId.originalEndDate, filters().byId.slip]" [moreSorts]="endColumnSorts"></th>
                <th [wtListColumn]="t('taskList.columns.timeliness')" [query]="query()" sortKey="days_overdue" [filter]="filters().byId.timeliness"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.task.id) {
                <tr class="task-row" (click)="taskOpened.emit(row.task.id)">
                  <td class="mono">{{ projectKey() }}-{{ row.task.task_number }}</td>
                  <td>
                    <div class="task-name" [style.padding-left.px]="row.depth * indentPx">
                      @if (row.task.parent_task_id === null) {
                        <svg class="parent-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                             stroke-linecap="round" stroke-linejoin="round" [attr.aria-label]="t('taskList.parentTask')">
                          <title>{{ t('taskList.parentTask') }}</title>
                          <path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 13 9 5 9-5"/>
                        </svg>
                      } @else {
                        <svg class="child-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                             stroke-linecap="round" stroke-linejoin="round" [attr.aria-label]="t('taskList.subtask')">
                          <title>{{ t('taskList.subtask') }}</title>
                          <path d="M6 4v8a3 3 0 0 0 3 3h9"/><path d="m14 11 4 4-4 4"/>
                        </svg>
                      }
                      <span [class.root-name]="row.task.parent_task_id === null">{{ row.task.name }}</span>
                    </div>
                  </td>
                  <td>
                    @if (typeOf(row.task); as type) { <span class="chip" [ngStyle]="chipStyle(type.color)">{{ type.name }}</span> }
                  </td>
                  <td>
                    @if (statusOf(row.task); as status) {
                      <span class="chip" [ngStyle]="chipStyle(status.color)">
                        <span class="chip-dot" [style.background]="status.color"></span>{{ status.name }}
                      </span>
                    }
                  </td>
                  <td>
                    @if (priorityOf(row.task); as priority) {
                      <span class="chip" [ngStyle]="chipStyle(priority.color)">{{ priority.name }}</span>
                    }
                  </td>
                  <td class="assignees">{{ assigneeNames(row.task) }}</td>
                  <td class="date">{{ format.date(row.task.start_date) }}</td>
                  <td><wt-project-task-due-date [task]="row.task" /></td>
                  <td><wt-project-task-timeliness [task]="row.task" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </ng-container>
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    :host { display:block; height:auto; }
    .scroll { overflow-x:auto; }
    .task-row { cursor:pointer; }
    .task-row:hover td { background:var(--gray-50); }
    .task-name { display:flex; align-items:center; gap:7px; }
    .parent-icon { width:15px; height:15px; color:var(--orange); flex-shrink:0; }
    .child-icon { width:14px; height:14px; color:var(--gray-400); flex-shrink:0; }
    .root-name { font-weight:600; }
    .assignees { color:var(--gray-600); font-size:12.5px; }
    .date { white-space:nowrap; font-size:12.5px; color:var(--gray-600); font-variant-numeric:tabular-nums; }
  `],
})
export class ProjectTaskListComponent {
  readonly format = inject(ProjectFinanceFormatService);
  private readonly filterDefinitions = inject(ProjectListFiltersService);

  readonly taskColumnSorts = [this.filterDefinitions.taskSortOption('parent')];
  readonly endColumnSorts = [
    this.filterDefinitions.taskSortOption('original_end_date'), this.filterDefinitions.taskSortOption('slip_days'),
  ];

  readonly tasks = input.required<ProjectTask[]>();
  readonly config = input.required<ProjectConfig>();
  readonly projectKey = input.required<string>();
  readonly query = input.required<ListQueryState>();
  readonly filters = input.required<FilterSet<TaskFilterId>>();
  readonly emptyMessage = input('');
  readonly taskOpened = output<string>();

  readonly indentPx = INDENT_PX_PER_LEVEL;
  readonly chipStyle = chipStyle;
  readonly rows = computed(() => buildTaskRows(this.tasks()));

  private readonly statusById = computed(() => new Map(this.config().statuses.map(status => [status.id, status])));
  private readonly typeById = computed(() => new Map(this.config().types.map(type => [type.id, type])));
  private readonly priorityById = computed(() => new Map(this.config().priorities.map(priority => [priority.id, priority])));

  statusOf(task: ProjectTask) {
    return this.statusById().get(task.status_id);
  }

  typeOf(task: ProjectTask): ProjectDictionaryItem | undefined {
    return task.type_id ? this.typeById().get(task.type_id) : undefined;
  }

  priorityOf(task: ProjectTask): ProjectDictionaryItem | undefined {
    return task.priority_id ? this.priorityById().get(task.priority_id) : undefined;
  }

  assigneeNames(task: ProjectTask): string {
    return task.assignees.map(assignee => assignee.display_name).join(', ') || '—';
  }
}

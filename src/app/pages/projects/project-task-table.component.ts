import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgStyle } from '@angular/common';
import { TranslocoDirective, TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectTaskRow } from '../../core/services/projects-api.service';
import { AddToCalendarComponent } from '../../shared/components/add-to-calendar/add-to-calendar.component';
import { ProjectTaskDueDateComponent } from '../../shared/components/project-deadlines/project-task-due-date.component';
import { ProjectTaskTimelinessComponent } from '../../shared/components/project-deadlines/project-task-timeliness.component';
import { ListColumnHeaderComponent } from '../../shared/list/list-column-header.component';
import { ListPagerComponent } from '../../shared/list/list-pager.component';
import { ListQueryState } from '../../shared/list/list-query';
import { CalendarEntry, projectTaskCalendarEntry } from '../../shared/utils/calendar-export.util';
import { FilterSet, ProjectListFiltersService, TaskFilterId } from './project-list-filters.service';
import { PROJECTS_SHARED_STYLES, chipStyle } from './projects-shared.styles';

const ALWAYS_SHOWN_COLUMN_COUNT = 8;

/**
 * The paged flat task table of the Projects module: a project's filtered
 * tasks, "my tasks" and the cross-project task list. Sorting and filtering
 * happen in the column headers and go to the server through the query state.
 */
@Component({
  selector: 'wt-project-task-table',
  standalone: true,
  imports: [
    NgStyle, TranslocoDirective, TranslocoPipe, AddToCalendarComponent, ListColumnHeaderComponent, ListPagerComponent,
    ProjectTaskDueDateComponent, ProjectTaskTimelinessComponent,
  ],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div class="tw scroll" [class.is-loading]="isLoading()">
        <table class="grid">
          <thead>
            <tr>
              <th [wtListColumn]="t('taskList.columns.number')" [query]="query()" sortKey="number" [filter]="filters().byId.number"></th>
              <th [wtListColumn]="t('taskList.columns.task')" [query]="query()" sortKey="name" [filter]="filters().byId.name"
                    [moreSorts]="taskColumnSorts"></th>
              @if (showsProject()) {
                <th [wtListColumn]="t('taskList.columns.project')" [query]="query()" sortKey="project" [filter]="filters().byId.project"></th>
              }
              <th [wtListColumn]="t('taskList.columns.type')" [query]="query()" sortKey="type" [filter]="filters().byId.type"></th>
              <th [wtListColumn]="t('taskList.columns.status')" [query]="query()" sortKey="status" [filter]="filters().byId.status"></th>
              <th [wtListColumn]="t('taskList.columns.priority')" [query]="query()" sortKey="priority" [filter]="filters().byId.priority"></th>
              @if (showsAssignees()) {
                <th [wtListColumn]="t('taskList.columns.assignees')" [query]="query()" sortKey="assignee" [filter]="filters().byId.assignee"></th>
              }
              <th [wtListColumn]="t('taskList.columns.startDate')" [query]="query()" sortKey="start_date" [filter]="filters().byId.startDate"></th>
              <th [wtListColumn]="t('taskList.columns.endDate')" [query]="query()" sortKey="end_date" [filter]="filters().byId.endDate"
                    [moreFilters]="[filters().byId.originalEndDate, filters().byId.slip]" [moreSorts]="endColumnSorts"></th>
              <th [wtListColumn]="t('taskList.columns.timeliness')" [query]="query()" sortKey="days_overdue" [filter]="filters().byId.timeliness"></th>
              @if (showsCost()) {
                <th class="amount" [wtListColumn]="t('taskList.columns.cost')" [query]="query()" sortKey="cost" [filter]="filters().byId.cost"></th>
              }
              @if (showsCalendarExport()) { <th></th> }
            </tr>
          </thead>
          <tbody>
            @for (task of rows(); track task.id) {
              <tr class="task-row" (click)="taskOpened.emit(task)">
                <td class="mono">{{ task.project_key }}-{{ task.task_number }}</td>
                <td>
                  <div class="task-name">{{ task.name }}</div>
                  @if (task.parent_task_number !== null) {
                    <div class="parent" [title]="t('taskList.parentTask')">
                      ↳ <span class="mono">{{ task.project_key }}-{{ task.parent_task_number }}</span> {{ task.parent_task_name }}
                    </div>
                  }
                </td>
                @if (showsProject()) { <td class="secondary-cell">{{ task.project_name }}</td> }
                <td>
                  @if (task.type_name && task.type_color) { <span class="chip" [ngStyle]="chipStyle(task.type_color)">{{ task.type_name }}</span> }
                </td>
                <td>
                  <span class="chip" [ngStyle]="chipStyle(task.status_color)">
                    <span class="chip-dot" [style.background]="task.status_color"></span>{{ task.status_name }}
                  </span>
                </td>
                <td>
                  @if (task.priority_name && task.priority_color) {
                    <span class="chip" [ngStyle]="chipStyle(task.priority_color)">{{ task.priority_name }}</span>
                  }
                </td>
                @if (showsAssignees()) { <td class="secondary-cell">{{ assigneeNames(task) }}</td> }
                <td class="date">{{ format.date(task.start_date) }}</td>
                <td><wt-project-task-due-date [task]="task" /></td>
                <td><wt-project-task-timeliness [task]="task" /></td>
                @if (showsCost()) {
                  <td class="amount">{{ task.cost_currency ? format.money(task.cost_total, task.cost_currency) : '—' }}</td>
                }
                @if (showsCalendarExport()) {
                  <td class="actions"><wt-add-to-calendar [entry]="calendarEntry(task)" (click)="$event.stopPropagation()" /></td>
                }
              </tr>
            } @empty {
              <tr>
                <td class="state-cell" [attr.colspan]="columnCount()">
                  @if (isLoading()) {
                    {{ 'states.loading' | transloco }}
                  } @else {
                    <div class="empty-title">{{ t('taskList.emptyTitle') }}</div>
                    {{ query().activeFilterCount() > 0 ? t('taskList.emptyForFilters') : emptyMessage() }}
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <wt-list-pager [query]="query()" [total]="total()" />
    </ng-container>
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    :host { display:flex; flex-direction:column; gap:10px; height:auto; }
    .scroll { overflow-x:auto; }
    .is-loading tbody { opacity:.55; }
    .task-row { cursor:pointer; }
    .task-row:hover td { background:var(--gray-50); }
    .task-name { font-weight:600; }
    .parent { font-size:11.5px; color:var(--gray-500); margin-top:2px; }
    .secondary-cell { color:var(--gray-600); font-size:12.5px; }
    .date { white-space:nowrap; font-size:12.5px; color:var(--gray-600); font-variant-numeric:tabular-nums; }
    .amount { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .actions { text-align:right; }
    .state-cell { text-align:center; padding:36px 24px !important; color:var(--gray-400); }
    .empty-title { font-weight:600; color:var(--gray-600); margin-bottom:4px; }
  `],
})
export class ProjectTaskTableComponent {
  readonly format = inject(ProjectFinanceFormatService);
  private readonly filterDefinitions = inject(ProjectListFiltersService);

  // The end column also shows the original date and the shift, the task column the parent.
  readonly taskColumnSorts = [this.filterDefinitions.taskSortOption('parent')];
  readonly endColumnSorts = [
    this.filterDefinitions.taskSortOption('original_end_date'), this.filterDefinitions.taskSortOption('slip_days'),
  ];

  readonly rows = input.required<ProjectTaskRow[]>();
  readonly total = input.required<number>();
  readonly isLoading = input(false);
  readonly query = input.required<ListQueryState>();
  readonly filters = input.required<FilterSet<TaskFilterId>>();
  readonly showsProject = input(false);
  readonly showsAssignees = input(true);
  /** Only when the viewer gets task costs from the server; otherwise the column would be all dashes. */
  readonly showsCost = input(false);
  readonly showsCalendarExport = input(false);
  /** Shown when the list is empty without any filter. */
  readonly emptyMessage = input('');

  readonly taskOpened = output<ProjectTaskRow>();

  readonly chipStyle = chipStyle;
  readonly columnCount = computed(() => ALWAYS_SHOWN_COLUMN_COUNT
    + [this.showsProject(), this.showsAssignees(), this.showsCost(), this.showsCalendarExport()].filter(Boolean).length);

  assigneeNames(task: ProjectTaskRow): string {
    return task.assignees.map(assignee => assignee.display_name).join(', ') || '—';
  }

  calendarEntry(task: ProjectTaskRow): CalendarEntry | null {
    return projectTaskCalendarEntry({
      projectId: task.project_id, projectKey: task.project_key, projectName: task.project_name,
      taskId: task.id, taskNumber: task.task_number, name: task.name, endDate: task.end_date,
    });
  }
}

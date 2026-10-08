import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ProjectConfig, ProjectDictionaryEntry } from '../../core/services/projects-api.service';
import { ListFilter, ListFilterOption, ListSortOption } from '../../shared/list/list-query';

export const UNASSIGNED = 'unassigned';

export type TaskFilterId =
  | 'name' | 'number' | 'project' | 'status' | 'statusCategory' | 'priority' | 'type' | 'assignee'
  | 'startDate' | 'endDate' | 'originalEndDate' | 'slip' | 'timeliness' | 'cost';

export type ProjectFilterId =
  | 'name' | 'manager' | 'startDate' | 'endDate' | 'progress' | 'overdue' | 'atRisk' | 'delayed' | 'delayReason' | 'myRole'
  | 'cost' | 'revenue';

export interface ProjectFilterOptions {
  /** People offered in the project manager filter. */
  managers: ListFilterOption[];
  /** True only when the server says the viewer may filter by cost and revenue. */
  includesFinance: boolean;
}

const MAX_PERCENT = 100;

/** The filters of one list: in the order of the filter bar, and by id for the column headers. */
export interface FilterSet<Id extends string> {
  all: ListFilter[];
  byId: Partial<Record<Id, ListFilter>>;
}

export interface TaskFilterOptions {
  config: ProjectConfig;
  /** People offered in the assignee filter; omitted where the list has no such filter ("my tasks"). */
  assignees?: ListFilterOption[];
  /** Projects offered in the project filter; only the cross-project view passes them. */
  projects?: ListFilterOption[];
  /** Only for a viewer who gets task costs from the server. */
  includesCost: boolean;
}

function toFilterSet<Id extends string>(filters: (ListFilter & { id: Id })[]): FilterSet<Id> {
  const byId: Partial<Record<Id, ListFilter>> = {};
  for (const filter of filters) byId[filter.id] = filter;
  return { all: filters, byId };
}

const dictionaryOptions = (entries: ProjectDictionaryEntry[]): ListFilterOption[] =>
  entries.map(entry => ({ value: entry.id, label: entry.name }));

/** Builds the filter definitions of the Projects module lists; parameter names follow the API's shared convention. */
@Injectable({ providedIn: 'root' })
export class ProjectListFiltersService {
  private readonly transloco = inject(TranslocoService);

  taskFilters(options: TaskFilterOptions): FilterSet<TaskFilterId> {
    const { config } = options;
    const filters: (ListFilter & { id: TaskFilterId })[] = [
      { id: 'name', label: this.label('name'), kind: 'text', params: ['name'], maxLength: 300 },
      { id: 'number', label: this.label('number'), kind: 'text', params: ['number'], maxLength: 30 },
    ];
    if (options.projects) {
      filters.push({ id: 'project', label: this.label('project'), kind: 'multi', params: ['project_ids'], options: options.projects });
    }
    filters.push(
      { id: 'status', label: this.label('status'), kind: 'multi', params: ['status_ids'], options: dictionaryOptions(config.statuses) },
      {
        id: 'statusCategory', label: this.label('statusCategory'), kind: 'multi', params: ['status_category'],
        options: ['todo', 'in_progress', 'done'].map(category => ({
          value: category, label: this.transloco.translate(`projects.labels.statusCategories.${category}`),
        })),
      },
      { id: 'priority', label: this.label('priority'), kind: 'multi', params: ['priority_ids'], options: dictionaryOptions(config.priorities) },
      { id: 'type', label: this.label('type'), kind: 'multi', params: ['type_ids'], options: dictionaryOptions(config.types) },
    );
    if (options.assignees) {
      filters.push({
        id: 'assignee', label: this.label('assignee'), kind: 'select', params: ['assignee'],
        options: [{ value: UNASSIGNED, label: this.transloco.translate('projects.filters.unassigned') }, ...options.assignees],
      });
    }
    filters.push(
      { id: 'startDate', label: this.label('startDate'), kind: 'dateRange', params: ['start_from', 'start_to'] },
      { id: 'endDate', label: this.label('endDate'), kind: 'dateRange', params: ['end_from', 'end_to'] },
      { id: 'originalEndDate', label: this.label('originalEndDate'), kind: 'dateRange', params: ['original_end_from', 'original_end_to'] },
      { id: 'slip', label: this.label('slip'), kind: 'numberRange', params: ['slip_min', 'slip_max'] },
      {
        id: 'timeliness', label: this.label('timeliness'), kind: 'multi', params: ['timeliness'],
        options: ['overdue', 'at_risk', 'on_time'].map(value => ({
          value, label: this.transloco.translate(`projects.filters.timelinessValues.${value}`),
        })),
      },
    );
    if (options.includesCost) {
      filters.push({ id: 'cost', label: this.label('cost'), kind: 'numberRange', params: ['cost_min', 'cost_max'], min: 0 });
    }
    return toFilterSet(filters);
  }

  projectFilters(options: ProjectFilterOptions): FilterSet<ProjectFilterId> {
    const filters: (ListFilter & { id: ProjectFilterId })[] = [
      { id: 'name', label: this.label('projectName'), kind: 'text', params: ['name'], maxLength: 200 },
      { id: 'manager', label: this.label('manager'), kind: 'select', params: ['pm'], options: options.managers },
      { id: 'startDate', label: this.label('projectStartDate'), kind: 'dateRange', params: ['start_from', 'start_to'] },
      { id: 'endDate', label: this.label('projectEndDate'), kind: 'dateRange', params: ['end_from', 'end_to'] },
      {
        id: 'progress', label: this.label('progress'), kind: 'numberRange', params: ['progress_min', 'progress_max'],
        min: 0, max: MAX_PERCENT,
      },
      { id: 'overdue', label: this.label('overdueCount'), kind: 'numberRange', params: ['overdue_min', 'overdue_max'], min: 0 },
      { id: 'atRisk', label: this.label('atRiskCount'), kind: 'numberRange', params: ['at_risk_min', 'at_risk_max'], min: 0 },
      {
        id: 'delayed', label: this.label('delayed'), kind: 'select', params: ['delayed'],
        options: [
          { value: 'true', label: this.transloco.translate('projects.filters.delayedValues.yes') },
          { value: 'false', label: this.transloco.translate('projects.filters.delayedValues.no') },
        ],
      },
      {
        id: 'delayReason', label: this.label('delayReason'), kind: 'multi', params: ['delay_reason'],
        options: ['task_after_end', 'end_passed'].map(reason => ({
          value: reason, label: this.transloco.translate(`projects.filters.delayReasonValues.${reason}`),
        })),
      },
      {
        id: 'myRole', label: this.label('myRole'), kind: 'multi', params: ['my_role'],
        options: ['pm', 'controller', 'participant'].map(role => ({
          value: role, label: this.transloco.translate(`projects.filters.myRoleValues.${role}`),
        })),
      },
    ];
    if (options.includesFinance) {
      filters.push(
        { id: 'cost', label: this.label('projectCost'), kind: 'numberRange', params: ['cost_min', 'cost_max'], min: 0 },
        { id: 'revenue', label: this.label('projectRevenue'), kind: 'numberRange', params: ['revenue_min', 'revenue_max'], min: 0 },
      );
    }
    return toFilterSet(filters);
  }

  /** For lists shown as cards, which have no column headers to sort by. */
  projectSortOptions(options: { includesFinance: boolean }): ListSortOption[] {
    const keys = ['name', 'key', 'status', 'pm', 'start_date', 'end_date', 'progress', 'overdue', 'at_risk', 'delay'];
    if (options.includesFinance) keys.push('cost', 'revenue');
    return keys.map(key => ({
      key, label: this.transloco.translate(`projects.filters.projectSort.${key}`),
    }));
  }

  /** Sort orders of a task table that have no column of their own; they sit in the popover of a related column. */
  taskSortOption(key: 'parent' | 'original_end_date' | 'slip_days'): ListSortOption {
    return { key, label: this.transloco.translate(`projects.filters.taskSort.${key}`) };
  }

  private label(key: string): string {
    return this.transloco.translate(`projects.filters.${key}`);
  }
}

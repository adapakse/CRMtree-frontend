import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { ProjectGanttResult, ProjectTaskRow } from '../../core/services/projects-api.service';
import { ToastService } from '../../core/services/toast.service';
import { ListFilterBarComponent } from '../../shared/list/list-filter-bar.component';
import { ListParams, ListQueryState, createListLoader } from '../../shared/list/list-query';
import { ProjectDeadlineLegendComponent } from './project-deadline-legend.component';
import { ProjectGanttComponent } from './project-gantt.component';
import { GanttProject } from './project-gantt.util';
import { FilterSet, TaskFilterId } from './project-list-filters.service';

/**
 * A timeline with the task filter bar above it — of one project or across
 * projects, depending on the `fetch` it is given. The timeline is not paged:
 * past the server's limit it is cut and a notice asks to narrow the filters.
 */
@Component({
  selector: 'wt-project-gantt-view',
  standalone: true,
  imports: [TranslocoDirective, TranslocoPipe, ListFilterBarComponent, ProjectDeadlineLegendComponent, ProjectGanttComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <wt-list-filter-bar [filters]="filters().all" [query]="query()" />
      <wt-project-deadline-legend [atRiskThresholdDays]="atRiskThresholdDays()" [showsTimelineMarks]="true" />
      @if (loader.result(); as result) {
        @if (result.truncated) {
          <div class="notice">{{ t('gantt.truncated', { limit: result.limit }) }}</div>
        }
        <wt-project-gantt
          [class.is-loading]="loader.isLoading()" [tasks]="result.items" [projects]="projects()"
          [isGroupedByProject]="isGroupedByProject()"
          [emptyMessage]="query().activeFilterCount() > 0 ? t('taskList.emptyForFilters') : emptyMessage()"
          (taskOpened)="taskOpened.emit($event)" />
      } @else if (loader.isLoading()) {
        <div class="empty-state">{{ 'states.loading' | transloco }}</div>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:12px; }
    .notice { padding:9px 14px; border-radius:9px; background:#FEF3C7; color:#92400E; font-size:12.5px; }
    .is-loading { opacity:.55; }
  `],
})
export class ProjectGanttViewComponent {
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly query = input.required<ListQueryState>();
  readonly filters = input.required<FilterSet<TaskFilterId>>();
  readonly fetch = input.required<(params: ListParams) => Observable<ProjectGanttResult>>();
  readonly projects = input.required<GanttProject[]>();
  readonly isGroupedByProject = input(false);
  readonly atRiskThresholdDays = input.required<number>();
  /** Parameters of the screen that are not filters of the bar, e.g. "only my tasks". */
  readonly extraParams = input<ListParams>({});
  readonly emptyMessage = input('');

  readonly taskOpened = output<ProjectTaskRow>();

  // Sorting and paging of the shared query state do not apply to a timeline.
  private readonly requestParams = computed<ListParams>(() => ({ ...this.query().filters(), ...this.extraParams() }));

  readonly loader = createListLoader(
    this.requestParams,
    params => this.fetch()(params),
    error => this.toast.error(apiErrorMessage(error) ?? this.transloco.translate('projects.gantt.loadFailed')),
  );

  reload(): void {
    this.loader.reload();
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoDirective, TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectListItem } from '../../core/services/projects-api.service';
import { ProjectDelayBadgeComponent } from '../../shared/components/project-deadlines/project-delay-badge.component';
import { ListColumnHeaderComponent } from '../../shared/list/list-column-header.component';
import { ListPagerComponent } from '../../shared/list/list-pager.component';
import { ListQueryState } from '../../shared/list/list-query';
import { FilterSet, ProjectFilterId } from './project-list-filters.service';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';

const ALWAYS_SHOWN_COLUMN_COUNT = 8;
const FINANCE_COLUMN_COUNT = 2;

/** Projects overview of the cross-project view: dates, progress and delay of every project in the viewer's scope. */
@Component({
  selector: 'wt-project-portfolio-projects',
  standalone: true,
  imports: [TranslocoDirective, TranslocoPipe, ListColumnHeaderComponent, ListPagerComponent, ProjectDelayBadgeComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div class="tw scroll" [class.is-loading]="isLoading()">
        <table class="grid">
          <thead>
            <tr>
              <th [wtListColumn]="t('portfolio.columns.project')" [query]="query()" sortKey="name" [filter]="filters().byId.name"></th>
              <th [wtListColumn]="t('portfolio.columns.projectManagers')" [query]="query()" sortKey="pm" [filter]="filters().byId.manager"></th>
              <th [wtListColumn]="t('portfolio.columns.startDate')" [query]="query()" sortKey="start_date" [filter]="filters().byId.startDate"></th>
              <th [wtListColumn]="t('portfolio.columns.endDate')" [query]="query()" sortKey="end_date" [filter]="filters().byId.endDate"></th>
              <th [wtListColumn]="t('portfolio.columns.progress')" [query]="query()" sortKey="progress" [filter]="filters().byId.progress"></th>
              <th [wtListColumn]="t('portfolio.columns.overdue')" [query]="query()" sortKey="overdue" [filter]="filters().byId.overdue"></th>
              <th [wtListColumn]="t('portfolio.columns.atRisk')" [query]="query()" sortKey="at_risk" [filter]="filters().byId.atRisk"></th>
              <th [wtListColumn]="t('portfolio.columns.delay')" [query]="query()" sortKey="delay" [filter]="filters().byId.delayed"
                  [moreFilters]="[filters().byId.delayReason]"></th>
              @if (showsFinance()) {
                <th class="amount" [wtListColumn]="t('portfolio.columns.cost')" [query]="query()" sortKey="cost" [filter]="filters().byId.cost"></th>
                <th class="amount" [wtListColumn]="t('portfolio.columns.revenue')" [query]="query()" sortKey="revenue" [filter]="filters().byId.revenue"></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (project of rows(); track project.id) {
              <tr class="project-row" (click)="projectOpened.emit(project)">
                <td><span class="mono">{{ project.key }}</span> <span class="project-name">{{ project.name }}</span></td>
                <td class="secondary-cell">{{ managerNames(project) }}</td>
                <td class="date">{{ format.date(project.start_date) }}</td>
                <td class="date">{{ format.date(project.end_date) }}</td>
                <td>
                  <div class="progress" [title]="t('list.stats.doneOfTotalHint')">
                    <span class="progress-track"><span class="progress-fill" [style.width.%]="project.progress_percent"></span></span>
                    <span class="progress-label">{{ format.percent(project.progress_percent) }} · {{ project.done_task_count }}/{{ project.task_count }}</span>
                  </div>
                </td>
                <td class="count" [class.overdue]="project.overdue_task_count > 0">{{ project.overdue_task_count }}</td>
                <td class="count" [class.at-risk]="project.at_risk_task_count > 0">{{ project.at_risk_task_count }}</td>
                <td><wt-project-delay-badge [schedule]="project" display="both" /></td>
                @if (showsFinance()) {
                  <td class="amount">{{ project.finance ? format.money(project.finance.cost.actual, project.finance.currency) : '—' }}</td>
                  <td class="amount">{{ project.finance ? format.money(project.finance.revenue.actual, project.finance.currency) : '—' }}</td>
                }
              </tr>
            } @empty {
              <tr>
                <td class="state-cell" [attr.colspan]="columnCount()">
                  @if (isLoading()) {
                    {{ 'states.loading' | transloco }}
                  } @else {
                    <div class="empty-title">{{ t('list.empty.title') }}</div>
                    {{ t(query().activeFilterCount() > 0 ? 'list.empty.noneForFilter' : 'portfolio.noProjects') }}
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
    .project-row { cursor:pointer; }
    .project-row:hover td { background:var(--gray-50); }
    .project-name { font-weight:600; }
    .secondary-cell { color:var(--gray-600); font-size:12.5px; }
    .date { white-space:nowrap; font-size:12.5px; color:var(--gray-600); font-variant-numeric:tabular-nums; }
    .progress { display:flex; align-items:center; gap:8px; white-space:nowrap; }
    .progress-track { width:70px; height:6px; border-radius:3px; background:var(--gray-100); overflow:hidden; }
    .progress-fill { display:block; height:100%; background:var(--orange); }
    .progress-label { font-size:12px; color:var(--gray-600); font-variant-numeric:tabular-nums; }
    .count { font-variant-numeric:tabular-nums; color:var(--gray-400); }
    .count.overdue { color:#B91C1C; font-weight:700; }
    .count.at-risk { color:#92400E; font-weight:700; }
    .amount { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .state-cell { text-align:center; padding:36px 24px !important; color:var(--gray-400); }
    .empty-title { font-weight:600; color:var(--gray-600); margin-bottom:4px; }
  `],
})
export class ProjectPortfolioProjectsComponent {
  readonly format = inject(ProjectFinanceFormatService);

  readonly rows = input.required<ProjectListItem[]>();
  readonly total = input.required<number>();
  readonly isLoading = input(false);
  readonly query = input.required<ListQueryState>();
  readonly filters = input.required<FilterSet<ProjectFilterId>>();
  /** Cost and revenue columns, for a viewer the server lets filter and sort by them. */
  readonly showsFinance = input(false);

  readonly projectOpened = output<ProjectListItem>();

  readonly columnCount = computed(() => ALWAYS_SHOWN_COLUMN_COUNT + (this.showsFinance() ? FINANCE_COLUMN_COUNT : 0));

  managerNames(project: ProjectListItem): string {
    return project.project_managers.map(manager => manager.display_name).join(', ') || '—';
  }
}

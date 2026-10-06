import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { NavBackService } from '../../core/services/nav-back.service';
import { ProjectTaskNavigationService } from '../../core/services/project-task-navigation.service';
import {
  PortfolioProjectOption, ProjectConfig, ProjectListItem, ProjectTaskAssignee, ProjectTaskRow, ProjectsApiService,
} from '../../core/services/projects-api.service';
import { ToastService } from '../../core/services/toast.service';
import { ListFilterBarComponent } from '../../shared/list/list-filter-bar.component';
import { ListParams, ListQueryState, createListLoader } from '../../shared/list/list-query';
import { ProjectDeadlineLegendComponent } from './project-deadline-legend.component';
import { ProjectGanttViewComponent } from './project-gantt-view.component';
import { ProjectListFiltersService } from './project-list-filters.service';
import { ProjectPortfolioProjectsComponent } from './project-portfolio-projects.component';
import { ProjectTaskTableComponent } from './project-task-table.component';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { ProjectsViewSwitchComponent } from './projects-view-switch.component';

type PortfolioTab = 'projects' | 'tasks' | 'gantt';

const TABS: { value: PortfolioTab; labelKey: string }[] = [
  { value: 'projects', labelKey: 'portfolio.tabs.projects' },
  { value: 'tasks', labelKey: 'portfolio.tabs.tasks' },
  { value: 'gantt', labelKey: 'portfolio.tabs.timeline' },
];

const PORTFOLIO_ROUTE = '/projects/portfolio';

/**
 * The cross-project view of a PM, controller or tenant admin: every open
 * project in their scope, the tasks of all of them, and one timeline. The
 * active tab and its filters live in the address, so a filtered view can be
 * reloaded, bookmarked and returned to from a task.
 */
@Component({
  selector: 'wt-project-portfolio',
  standalone: true,
  imports: [
    TranslocoDirective, TranslocoPipe, ListFilterBarComponent, ProjectDeadlineLegendComponent, ProjectGanttViewComponent,
    ProjectPortfolioProjectsComponent, ProjectTaskTableComponent, ProjectsViewSwitchComponent,
  ],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div id="topbar">
        <span class="page-title">{{ t('list.title') }}</span>
        <wt-projects-view-switch active="portfolio" [showsPortfolio]="true" />
      </div>

      <div id="content">
        @if (config(); as loadedConfig) {
          <div class="tabs">
            @for (tab of tabs; track tab.value) {
              <button class="tab-btn" [class.active]="activeTab() === tab.value" (click)="activeTab.set(tab.value)">{{ t(tab.labelKey) }}</button>
            }
          </div>

          @if (activeTab() === 'projects') {
            <wt-list-filter-bar class="bar" [filters]="projectFilters().all" [query]="projectQuery" />
            <wt-project-portfolio-projects
              [rows]="projectLoader.result()?.items ?? []" [total]="projectLoader.result()?.total ?? 0"
              [isLoading]="projectLoader.isLoading()" [query]="projectQuery" [filters]="projectFilters()"
              [showsFinance]="canFilterFinance()" (projectOpened)="openProject($event)" />
          } @else if (activeTab() === 'tasks') {
            <wt-list-filter-bar class="bar" [filters]="taskFilters().all" [query]="taskQuery" />
            <wt-project-deadline-legend class="bar" [atRiskThresholdDays]="loadedConfig.at_risk_threshold_days" />
            <wt-project-task-table
              [rows]="taskLoader.result()?.items ?? []" [total]="taskLoader.result()?.total ?? 0" [isLoading]="taskLoader.isLoading()"
              [query]="taskQuery" [filters]="taskFilters()" [showsProject]="true" [showsCost]="loadedConfig.finance_enabled"
              [emptyMessage]="t('portfolio.noTasks')" (taskOpened)="openTask($event)" />
          } @else {
            <wt-project-gantt-view
              [query]="taskQuery" [filters]="taskFilters()" [fetch]="fetchGantt" [projects]="scopeProjects()"
              [isGroupedByProject]="true" [atRiskThresholdDays]="loadedConfig.at_risk_threshold_days"
              [emptyMessage]="t('portfolio.noTasks')" (taskOpened)="openTask($event)" />
          }
        } @else {
          <div class="empty-state">{{ 'states.loading' | transloco }}</div>
        }
      </div>
    </ng-container>
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    .tabs { width:420px; }
    .bar { margin-bottom:12px; }
  `],
})
export class ProjectPortfolioComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly filterDefinitions = inject(ProjectListFiltersService);
  private readonly navBack = inject(NavBackService);
  private readonly projectTaskNavigation = inject(ProjectTaskNavigationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly tabs = TABS;
  readonly projectQuery = new ListQueryState();
  /** Shared by the Tasks and the Timeline tab, so switching between them keeps the filters. */
  readonly taskQuery = new ListQueryState();

  readonly activeTab = signal<PortfolioTab>('projects');
  readonly config = signal<ProjectConfig | null>(null);
  /** Every project of the viewer's scope: options of the project filter and the end-date lines of the timeline. */
  readonly scopeProjects = signal<PortfolioProjectOption[]>([]);
  /** Everyone in the viewer's scope: options of the participant and the project manager filter. */
  private readonly scopePeople = signal<ProjectTaskAssignee[]>([]);
  private readonly peopleOptions = computed(() =>
    this.scopePeople().map(person => ({ value: person.user_id, label: person.display_name })));

  readonly canFilterFinance = computed(() => this.projectLoader.result()?.can_filter_finance === true);
  readonly projectFilters = computed(() =>
    this.filterDefinitions.projectFilters({ managers: this.peopleOptions(), includesFinance: this.canFilterFinance() }));

  readonly taskFilters = computed(() => this.filterDefinitions.taskFilters({
    // Guarded by the template: the filters are read only once the configuration is loaded.
    config: this.config()!,
    projects: this.scopeProjects().map(project => ({ value: project.id, label: `${project.key} ${project.name}` })),
    assignees: this.peopleOptions(),
    includesCost: this.config()?.finance_enabled === true,
  }));

  // Nothing is requested before the configuration arrived: its failure means the viewer has no access here.
  private readonly projectParams = computed<ListParams | null>(() => (this.config() && this.activeTab() === 'projects' ? this.projectQuery.params() : null));
  private readonly taskParams = computed<ListParams | null>(() => (this.config() && this.activeTab() === 'tasks' ? this.taskQuery.params() : null));

  readonly projectLoader = createListLoader(
    this.projectParams,
    params => this.api.listPortfolioProjects(params),
    error => this.toast.error(apiErrorMessage(error) ?? this.transloco.translate('projects.list.loadFailed')),
  );

  readonly taskLoader = createListLoader(
    this.taskParams,
    params => this.api.listPortfolioTasks(params),
    error => this.toast.error(apiErrorMessage(error) ?? this.transloco.translate('projects.detail.tasksLoadFailed')),
  );

  readonly fetchGantt = (params: ListParams) => this.api.getPortfolioGantt(params);

  private readonly addressParams = computed<ListParams>(() => {
    const tab = this.activeTab();
    const listParams = tab === 'projects' ? this.projectQuery.queryParams() : this.taskQuery.queryParams();
    return tab === 'projects' ? listParams : { ...listParams, tab };
  });

  constructor() {
    // The user is back, so the "return here" button of the project view has done its job.
    this.navBack.clear();

    const initialParams = this.route.snapshot.queryParamMap;
    const requestedTab = initialParams.get('tab');
    if (requestedTab === 'tasks' || requestedTab === 'gantt') this.activeTab.set(requestedTab);
    (this.activeTab() === 'projects' ? this.projectQuery : this.taskQuery).restore(initialParams, ['tab']);

    effect(() => {
      const queryParams = this.addressParams();
      untracked(() => this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true }));
    });
  }

  ngOnInit(): void {
    forkJoin({
      config: this.api.getConfig(),
      projects: this.api.listPortfolioProjectOptions(),
      people: this.api.listPortfolioPeople(),
    }).subscribe({
      next: ({ config, projects, people }) => {
        this.scopeProjects.set(projects.projects);
        this.scopePeople.set(people.people);
        this.config.set(config);
      },
      // Also the answer for someone who has no cross-project scope and typed the address by hand.
      error: error => {
        this.toast.error(apiErrorMessage(error) ?? this.transloco.translate('projects.portfolio.loadFailed'));
        this.router.navigate(['/projects']);
      },
    });
  }

  openProject(project: ProjectListItem): void {
    this.projectTaskNavigation.open(project.id, null, this.returnOrigin());
  }

  openTask(task: ProjectTaskRow): void {
    this.projectTaskNavigation.open(task.project_id, task.id, this.returnOrigin());
  }

  private returnOrigin() {
    return {
      label: this.transloco.translate('projects.list.views.portfolio'),
      route: [PORTFOLIO_ROUTE],
      queryParams: this.addressParams(),
    };
  }
}

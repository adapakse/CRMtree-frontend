import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { catchError, of } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { ToastService } from '../../core/services/toast.service';
import {
  ProjectConfig, ProjectListItem, ProjectStatusFilter, ProjectTaskAssignee, ProjectsApiService,
} from '../../core/services/projects-api.service';
import { ListFilterBarComponent } from '../../shared/list/list-filter-bar.component';
import { ListPagerComponent } from '../../shared/list/list-pager.component';
import { ListParams, ListQueryState, createListLoader } from '../../shared/list/list-query';
import { ProjectListCardComponent } from './project-list-card.component';
import { ProjectListFiltersService } from './project-list-filters.service';
import { ProjectMyTasksComponent } from './project-my-tasks.component';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { ProjectsView, ProjectsViewSwitchComponent } from './projects-view-switch.component';

const DEFAULT_STATUS_FILTER: ProjectStatusFilter = 'open';

const STATUS_FILTERS: { value: ProjectStatusFilter; labelKey: string }[] = [
  { value: 'open', labelKey: 'list.filters.open' },
  { value: 'closed', labelKey: 'list.filters.closed' },
  { value: 'all', labelKey: 'list.filters.all' },
];

// Query parameters of this screen that are not filters of the project list.
const SCREEN_PARAMS = ['view', 'status'];

@Component({
  selector: 'wt-projects-list',
  standalone: true,
  imports: [
    FormsModule, TranslocoDirective, TranslocoPipe, ListFilterBarComponent, ListPagerComponent, ProjectListCardComponent,
    ProjectMyTasksComponent, ProjectsViewSwitchComponent,
  ],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div id="topbar">
        <span class="page-title">{{ t('list.title') }}</span>
        <wt-projects-view-switch [active]="view()" [showsPortfolio]="config()?.has_cross_project_view === true" />
        <span class="tsp"></span>
        @if (view() === 'projects') {
          <div class="filter">
            @for (filter of statusFilters; track filter.value) {
              <button class="filter-btn" [class.active]="statusFilter() === filter.value"
                      (click)="setStatusFilter(filter.value)">{{ t(filter.labelKey) }}</button>
            }
          </div>
          @if (canCreate()) {
            <button class="btn btn-p" (click)="openCreateForm()">+ {{ t('list.newProject') }}</button>
          }
        }
      </div>

      <div id="content">
        @if (view() === 'my-tasks') {
          <wt-project-my-tasks />
        } @else {
          <wt-list-filter-bar class="list-bar" [filters]="filters().all" [query]="query" [sortOptions]="sortOptions()" />
          @if (projects().length > 0) {
            <div class="project-grid" [class.is-loading]="loader.isLoading()">
              @for (project of projects(); track project.id) {
                <wt-project-list-card [project]="project" (opened)="openProject(project)" />
              }
            </div>
            <wt-list-pager class="list-pager" [query]="query" [total]="loader.result()?.total ?? 0" />
          } @else if (loader.isLoading()) {
            <div class="empty-state">{{ 'states.loading' | transloco }}</div>
          } @else {
            <div class="empty-state">
              <div class="empty-title">{{ t('list.empty.title') }}</div>
              {{ t(hasNarrowedList() ? 'list.empty.noneForFilter' : 'list.empty.noOpenProjects') }}
            </div>
          }
        }
      </div>

      @if (isCreateFormOpen()) {
        <div class="mol" (click)="isCreateFormOpen.set(false)">
          <div class="mo" (click)="$event.stopPropagation()">
            <div class="moh">
              <div class="mot">{{ t('list.newProject') }}</div>
              <button class="mox" (click)="isCreateFormOpen.set(false)">✕</button>
            </div>
            <div class="mob">
              <div class="fg">
                <label class="fl">{{ t('list.createForm.name') }} <span class="req">*</span></label>
                <input class="fi" [(ngModel)]="newName" maxlength="200" [placeholder]="t('list.createForm.namePlaceholder')">
                <span class="hint">{{ t('list.createForm.keyHint') }}</span>
              </div>
              <div class="fg">
                <label class="fl">{{ t('list.createForm.description') }}</label>
                <textarea class="fta" [(ngModel)]="newDescription" rows="4"></textarea>
              </div>
              <div class="fgrid">
                <div class="fg">
                  <label class="fl">{{ t('card.startDate') }}</label>
                  <input class="fi" type="date" [(ngModel)]="newStartDate">
                </div>
                <div class="fg">
                  <label class="fl">{{ t('card.endDate') }}</label>
                  <input class="fi" type="date" [(ngModel)]="newEndDate" [min]="newStartDate">
                </div>
              </div>
              @if (hasInvalidNewDates()) { <span class="hint danger">{{ t('card.errors.endBeforeStart') }}</span> }
            </div>
            <div class="mof">
              <button class="btn btn-g" (click)="isCreateFormOpen.set(false)">{{ 'actions.cancel' | transloco }}</button>
              <button class="btn btn-p" [disabled]="!newName.trim() || hasInvalidNewDates() || isSaving()" (click)="createProject()">
                {{ t(isSaving() ? 'list.createForm.saving' : 'list.createForm.submit') }}
              </button>
            </div>
          </div>
        </div>
      }
    </ng-container>
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    .filter { display:flex; gap:2px; background:var(--gray-100); border-radius:9px; padding:3px; }
    .filter-btn { border:none; background:transparent; padding:6px 12px; border-radius:7px; font-size:12.5px; color:var(--gray-500); cursor:pointer; font-family:inherit; }
    .filter-btn.active { background:white; color:var(--orange); font-weight:600; box-shadow:var(--shadow-sm); }
    .list-bar { margin-bottom:14px; }
    .list-pager { margin-top:14px; }
    .project-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px; }
    .project-grid.is-loading { opacity:.55; }
    .hint { font-size:11.5px; color:var(--gray-400); }
    .hint.danger { color:#DC2626; }
  `],
})
export class ProjectsListComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly filterDefinitions = inject(ProjectListFiltersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly statusFilters = STATUS_FILTERS;
  readonly query = new ListQueryState();

  readonly config = signal<ProjectConfig | null>(null);
  readonly statusFilter = signal<ProjectStatusFilter>(DEFAULT_STATUS_FILTER);
  readonly isCreateFormOpen = signal(false);
  readonly isSaving = signal(false);

  private readonly queryParamMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly view = computed<ProjectsView>(() => (this.queryParamMap().get('view') === 'my-tasks' ? 'my-tasks' : 'projects'));

  /** People of the cross-project scope; stays empty for a viewer without one. */
  private readonly scopePeople = signal<ProjectTaskAssignee[]>([]);

  // Someone without a cross-project scope has no people list to ask for, so the project manager
  // filter offers the managers of the projects on the page (and keeps the chosen one selectable).
  private readonly managerOptions = computed(() => {
    const people = new Map(this.scopePeople().map(person => [person.user_id, person.display_name]));
    for (const project of this.projects()) {
      for (const manager of project.project_managers) people.set(manager.user_id, manager.display_name);
    }
    return [...people]
      .map(([value, label]) => ({ value, label }))
      .sort((first, second) => first.label.localeCompare(second.label));
  });

  readonly canFilterFinance = computed(() => this.loader.result()?.can_filter_finance === true);
  readonly filters = computed(() =>
    this.filterDefinitions.projectFilters({ managers: this.managerOptions(), includesFinance: this.canFilterFinance() }));
  readonly sortOptions = computed(() => this.filterDefinitions.projectSortOptions({ includesFinance: this.canFilterFinance() }));

  private readonly requestParams = computed<ListParams | null>(() =>
    (this.view() === 'projects' ? { ...this.query.params(), status: this.statusFilter() } : null));

  readonly loader = createListLoader(
    this.requestParams,
    params => this.api.listProjects(params),
    error => this.toast.error(apiErrorMessage(error) ?? this.transloco.translate('projects.list.loadFailed')),
  );

  readonly projects = computed<ProjectListItem[]>(() => this.loader.result()?.items ?? []);
  readonly canCreate = computed(() => this.loader.result()?.can_create === true);
  readonly hasNarrowedList = computed(() => this.query.activeFilterCount() > 0 || this.statusFilter() !== DEFAULT_STATUS_FILTER);

  newName = '';
  newDescription = '';
  newStartDate = '';
  newEndDate = '';

  constructor() {
    const initialParams = this.route.snapshot.queryParamMap;
    this.query.restore(initialParams, SCREEN_PARAMS);
    const requestedStatus = initialParams.get('status');
    if (requestedStatus === 'closed' || requestedStatus === 'all') this.statusFilter.set(requestedStatus);

    // Keeps the filtered list in the address, so it survives a reload and can be bookmarked.
    effect(() => {
      if (this.view() !== 'projects') return;
      const queryParams: ListParams = { ...this.query.queryParams() };
      if (this.statusFilter() !== DEFAULT_STATUS_FILTER) queryParams['status'] = this.statusFilter();
      untracked(() => this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true }));
    });
  }

  ngOnInit(): void {
    // The list works without the configuration; it only decides which extras are offered.
    this.api.getConfig().subscribe({
      next: config => {
        this.config.set(config);
        if (config.has_cross_project_view) this.loadScopePeople();
      },
      error: () => this.config.set(null),
    });
  }

  private loadScopePeople(): void {
    this.api.listPortfolioPeople().pipe(catchError(() => of({ people: [] }))).subscribe(result => this.scopePeople.set(result.people));
  }

  setStatusFilter(filter: ProjectStatusFilter): void {
    this.statusFilter.set(filter);
    this.query.page.set(1);
  }

  hasInvalidNewDates(): boolean {
    return !!this.newStartDate && !!this.newEndDate && this.newEndDate < this.newStartDate;
  }

  openProject(project: ProjectListItem): void {
    this.router.navigate(['/projects', project.id]);
  }

  openCreateForm(): void {
    this.newName = '';
    this.newDescription = '';
    this.newStartDate = '';
    this.newEndDate = '';
    this.isCreateFormOpen.set(true);
  }

  createProject(): void {
    this.isSaving.set(true);
    this.api.createProject({
      name: this.newName.trim(),
      description: this.newDescription.trim() || null,
      start_date: this.newStartDate || null,
      end_date: this.newEndDate || null,
    }).subscribe({
      next: project => {
        this.isSaving.set(false);
        this.router.navigate(['/projects', project.id], { queryParams: { tab: 'card' } });
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error(apiErrorMessage(err) ?? this.transloco.translate('projects.list.createFailed'));
      },
    });
  }
}

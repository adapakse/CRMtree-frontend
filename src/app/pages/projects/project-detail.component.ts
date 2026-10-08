import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { NavBackService } from '../../core/services/nav-back.service';
import { ToastService } from '../../core/services/toast.service';
import { ProjectConfig, ProjectDetail, ProjectTask, ProjectsApiService } from '../../core/services/projects-api.service';
import { ProjectDelayBadgeComponent } from '../../shared/components/project-deadlines/project-delay-badge.component';
import { ListParams, ListQueryState } from '../../shared/list/list-query';
import { ProjectCardComponent } from './project-card.component';
import { ProjectChatComponent } from './project-chat.component';
import { ProjectFinanceComponent } from './project-finance.component';
import { ProjectGanttViewComponent } from './project-gantt-view.component';
import { GanttProject } from './project-gantt.util';
import { FilterSet, ProjectListFiltersService, TaskFilterId } from './project-list-filters.service';
import { ProjectTaskPanelComponent } from './project-task-panel.component';
import { ProjectTasksTabComponent } from './project-tasks-tab.component';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';

type ProjectTab = 'tasks' | 'gantt' | 'chat' | 'finance' | 'card';

// Marks the task panel as open for a task that does not exist yet.
const NEW_TASK = 'new';

// Query parameters that belong to the screen, not to the task filters.
const ADDRESS_PARAMS_OF_THE_SCREEN = ['tab', 'task'];

@Component({
  selector: 'wt-project-detail',
  standalone: true,
  imports: [
    RouterLink, TranslocoDirective, TranslocoPipe,
    ProjectCardComponent, ProjectChatComponent, ProjectDelayBadgeComponent, ProjectFinanceComponent, ProjectGanttViewComponent,
    ProjectTaskPanelComponent, ProjectTasksTabComponent,
  ],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div id="topbar">
        @if (navBack.ctx(); as origin) {
          <a class="back" [routerLink]="origin.route" [queryParams]="origin.queryParams">← {{ origin.label }}</a>
        } @else {
          <a class="back" routerLink="/projects">← {{ t('detail.backToProjects') }}</a>
        }
        @if (detail(); as loaded) {
          <span class="mono">{{ loaded.project.key }}</span>
          <span class="page-title">{{ loaded.project.name }}</span>
          @if (loaded.project.status === 'closed') { <span class="pill closed">{{ t('detail.closedBadge') }}</span> }
          <wt-project-delay-badge [schedule]="loaded.project" />
        }
        <span class="tsp"></span>
        @if (canCreateTask()) {
          <button class="btn btn-p" (click)="openTask(newTask)">+ {{ t('detail.newTask') }}</button>
        }
      </div>

      <div id="content">
        @if (detail(); as loaded) {
          @if (config(); as loadedConfig) {
            <div class="tab-bar">
              <div class="tabs" [class.with-finance]="canReadFinance()">
                <button class="tab-btn" [class.active]="activeTab() === 'tasks'" (click)="selectTab('tasks')">
                  {{ t('detail.tabs.tasks', { count: tasks().length }) }}
                </button>
                <button class="tab-btn" [class.active]="activeTab() === 'gantt'" (click)="selectTab('gantt')">{{ t('detail.tabs.timeline') }}</button>
                <button class="tab-btn" [class.active]="activeTab() === 'chat'" (click)="selectTab('chat')">{{ t('detail.tabs.chat') }}</button>
                @if (canReadFinance()) {
                  <button class="tab-btn" [class.active]="activeTab() === 'finance'" (click)="selectTab('finance')">{{ t('detail.tabs.finance') }}</button>
                }
                <button class="tab-btn" [class.active]="activeTab() === 'card'" (click)="selectTab('card')">{{ t('detail.tabs.card') }}</button>
              </div>
              @if (activeTab() === 'tasks' || activeTab() === 'gantt') {
                <label class="mine-toggle">
                  <input type="checkbox" [checked]="showsOnlyMyTasks()" (change)="toggleOnlyMyTasks()">
                  {{ t('detail.showOnlyMyTasks') }}
                </label>
              }
            </div>

            @if (activeTab() === 'tasks') {
              <wt-project-tasks-tab
                [detail]="loaded" [config]="loadedConfig" [treeTasks]="visibleTasks()" [showsOnlyMyTasks]="showsOnlyMyTasks()"
                [query]="taskQuery" [filters]="taskFilters()"
                [emptyMessage]="t(showsOnlyMyTasks() ? 'detail.empty.noAssignedTasks' : 'detail.empty.noTasks')"
                (taskOpened)="openTask($event)" />
            } @else if (activeTab() === 'gantt') {
              <wt-project-gantt-view
                [query]="taskQuery" [filters]="taskFilters()" [fetch]="fetchGantt" [projects]="ganttProjects()"
                [extraParams]="ganttExtraParams()" [atRiskThresholdDays]="loadedConfig.at_risk_threshold_days"
                [emptyMessage]="t(showsOnlyMyTasks() ? 'detail.empty.noAssignedTasks' : 'detail.empty.noTasks')"
                (taskOpened)="openTask($event.id)" />
            } @else if (activeTab() === 'chat') {
              <section class="card chat-card">
                <wt-project-chat [projectId]="loaded.project.id" [canPost]="loaded.project.status === 'open'" />
              </section>
            } @else if (activeTab() === 'finance' && loaded.finance?.can_read) {
              <wt-project-finance
                [projectId]="loaded.project.id" [projectKey]="loaded.project.key" [access]="loaded.finance!"
                [categories]="loadedConfig.cost_categories" [tasks]="tasks()"
                (taskOpened)="openTask($event)" (currencyChanged)="loadProject()" />
            } @else {
              <wt-project-card [detail]="loaded" [config]="loadedConfig" (changed)="loadProject()" />
            }

            @if (openTaskId(); as taskId) {
              <wt-project-task-panel
                [projectId]="loaded.project.id" [projectKey]="loaded.project.key" [projectName]="loaded.project.name"
                [taskId]="taskId === newTask ? null : taskId"
                [config]="loadedConfig" [members]="loaded.members" [fields]="loaded.fields" [tasks]="tasks()"
                [isProjectOpen]="loaded.project.status === 'open'" [finance]="loaded.finance"
                (closed)="closeTask()" (saved)="onTaskSaved()" (fieldsChanged)="loadProject()"
                (costsChanged)="financeTab()?.reload()" />
            }
          }
        } @else {
          <div class="empty-state">{{ 'states.loading' | transloco }}</div>
        }
      </div>
    </ng-container>
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    .back { font-size:12.5px; color:var(--gray-500); text-decoration:none; margin-right:6px; }
    .back:hover { color:var(--orange); }
    .pill.closed { background:var(--gray-100); color:var(--gray-500); }
    .tab-bar { display:flex; align-items:flex-start; gap:16px; }
    .tabs { width:560px; }
    .tabs.with-finance { width:700px; }
    .chat-card { padding:18px 20px; max-width:900px; }
    .mine-toggle { display:flex; align-items:center; gap:7px; font-size:13px; color:var(--gray-700); padding-top:9px; cursor:pointer; }
  `],
})
export class ProjectDetailComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly auth = inject(AuthService);
  private readonly filterDefinitions = inject(ProjectListFiltersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  /** Set when the user arrived from a lead / partner card, the calendar or the dashboard. */
  readonly navBack = inject(NavBackService);

  readonly newTask = NEW_TASK;

  readonly detail = signal<ProjectDetail | null>(null);
  readonly config = signal<ProjectConfig | null>(null);
  readonly tasks = signal<ProjectTask[]>([]);
  readonly activeTab = signal<ProjectTab>('tasks');
  readonly showsOnlyMyTasks = signal(false);
  readonly openTaskId = signal<string | null>(null);
  // Present only while the Finance tab is shown; refreshed after a cost changed in the task panel.
  readonly financeTab = viewChild(ProjectFinanceComponent);
  private readonly tasksTab = viewChild(ProjectTasksTabComponent);
  private readonly ganttTab = viewChild(ProjectGanttViewComponent);

  /** Shared by the Tasks and the Timeline tab, so switching between them keeps the filters. */
  readonly taskQuery = new ListQueryState();

  readonly taskFilters = computed<FilterSet<TaskFilterId>>(() => {
    const detail = this.detail();
    const config = this.config();
    // Read by the template only once both are loaded.
    if (!detail || !config) return { all: [], byId: {} };
    return this.filterDefinitions.taskFilters({
      config,
      // An external participant is shown only their own tasks, so choosing a person makes no sense for them.
      assignees: detail.my_role === 'external_participant'
        ? undefined
        : detail.members.map(member => ({ value: member.user_id, label: member.display_name })),
      includesCost: detail.finance?.can_read === true,
    });
  });

  readonly fetchGantt = (params: ListParams) => this.api.getProjectGantt(this.projectId, params);
  readonly ganttProjects = computed<GanttProject[]>(() => {
    const project = this.detail()?.project;
    return project ? [{ id: project.id, key: project.key, name: project.name, end_date: project.end_date }] : [];
  });
  readonly ganttExtraParams = computed(() => {
    const params: ListParams = {};
    if (this.showsOnlyMyTasks()) params['mine'] = 'true';
    return params;
  });

  // Without finance read rights the tab does not exist at all, also when the address asks for it.
  readonly canReadFinance = computed(() => this.detail()?.finance?.can_read === true);

  readonly canCreateTask = computed(() => {
    const detail = this.detail();
    return detail !== null && detail.can_manage && detail.project.status === 'open';
  });

  readonly visibleTasks = computed(() => {
    if (!this.showsOnlyMyTasks()) return this.tasks();
    const myId = this.auth.user()?.id;
    return this.tasks().filter(task => task.assignees.some(assignee => assignee.user_id === myId));
  });

  private get projectId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  // What the address carries: the tab, the open task (links from e-mails lead to ?task=…) and, on
  // the Tasks and Timeline tabs, the task filters — so a filtered view survives a reload.
  private readonly addressParams = computed(() => {
    const tab = this.activeTab();
    const params: ListParams = tab === 'tasks' || tab === 'gantt' ? { ...this.taskQuery.queryParams() } : {};
    if (tab !== 'tasks') params['tab'] = tab;
    const taskId = this.openTaskId();
    if (taskId && taskId !== NEW_TASK) params['task'] = taskId;
    return params;
  });

  constructor() {
    const query = this.route.snapshot.queryParamMap;
    const requestedTab = query.get('tab');
    if (requestedTab === 'card' || requestedTab === 'gantt' || requestedTab === 'chat' || requestedTab === 'finance') {
      this.activeTab.set(requestedTab);
    }
    this.openTaskId.set(query.get('task'));
    if (this.activeTab() === 'tasks' || this.activeTab() === 'gantt') this.taskQuery.restore(query, ADDRESS_PARAMS_OF_THE_SCREEN);

    effect(() => {
      const queryParams = this.addressParams();
      untracked(() => this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true }));
    });
  }

  ngOnInit(): void {

    forkJoin({
      config: this.api.getConfig(),
      detail: this.api.getProject(this.projectId),
      tasks: this.api.listTasks(this.projectId, false),
    }).subscribe({
      next: ({ config, detail, tasks }) => {
        this.config.set(config);
        this.detail.set(detail);
        this.tasks.set(tasks);
        if (this.activeTab() === 'finance' && !this.canReadFinance()) this.activeTab.set('tasks');
      },
      error: err => {
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.detail.openFailed'));
        this.router.navigate(['/projects']);
      },
    });
  }

  selectTab(tab: ProjectTab): void {
    this.activeTab.set(tab);
  }

  toggleOnlyMyTasks(): void {
    this.showsOnlyMyTasks.update(isOn => !isOn);
    this.taskQuery.page.set(1);
  }

  openTask(taskId: string): void {
    this.openTaskId.set(taskId);
  }

  closeTask(): void {
    this.openTaskId.set(null);
  }

  // A moved or finished task can change whether the project counts as delayed, so the project is reloaded too.
  onTaskSaved(): void {
    this.closeTask();
    this.loadProject();
  }

  loadProject(): void {
    this.api.getProject(this.projectId).subscribe({
      next: detail => {
        this.detail.set(detail);
        if (this.activeTab() === 'finance' && !this.canReadFinance()) this.activeTab.set('tasks');
      },
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('projects.detail.refreshFailed')),
    });
    // Removing a member unassigns them from tasks, so the task list may have changed too.
    this.loadTasks();
  }

  private loadTasks(): void {
    this.tasksTab()?.reload();
    this.ganttTab()?.reload();
    this.api.listTasks(this.projectId, false).subscribe({
      next: tasks => this.tasks.set(tasks),
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('projects.detail.tasksLoadFailed')),
    });
  }
}

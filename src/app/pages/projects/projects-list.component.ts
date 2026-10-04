import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';
import {
  PROJECT_ROLE_LABELS, ProjectListItem, ProjectStatusFilter, ProjectsApiService,
} from '../../core/services/projects-api.service';
import { ProjectMyTasksComponent } from './project-my-tasks.component';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';

const STATUS_FILTERS: { value: ProjectStatusFilter; label: string }[] = [
  { value: 'open', label: 'Otwarte' },
  { value: 'closed', label: 'Zamknięte' },
  { value: 'all', label: 'Wszystkie' },
];

@Component({
  selector: 'wt-projects-list',
  standalone: true,
  imports: [FormsModule, ProjectMyTasksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="topbar">
      <span class="page-title">Projekty</span>
      <div class="filter">
        <button class="filter-btn" [class.active]="view() === 'projects'" (click)="view.set('projects')">Projekty</button>
        <button class="filter-btn" [class.active]="view() === 'my-tasks'" (click)="view.set('my-tasks')">Moje zadania</button>
      </div>
      <span class="tsp"></span>
      <div class="filter" [class.is-hidden]="view() !== 'projects'">
        @for (filter of statusFilters; track filter.value) {
          <button class="filter-btn" [class.active]="statusFilter() === filter.value"
                  (click)="setStatusFilter(filter.value)">{{ filter.label }}</button>
        }
      </div>
      @if (canCreate() && view() === 'projects') {
        <button class="btn btn-p" (click)="openCreateForm()">+ Nowy projekt</button>
      }
    </div>

    <div id="content">
      @if (view() === 'my-tasks') {
        <wt-project-my-tasks />
      } @else if (isLoading()) {
        <div class="empty-state">Ładowanie…</div>
      } @else if (projects().length === 0) {
        <div class="empty-state">
          <div class="empty-title">Brak projektów</div>
          {{ statusFilter() === 'open' ? 'Nie uczestniczysz w żadnym otwartym projekcie.' : 'Brak projektów dla wybranego filtra.' }}
        </div>
      } @else {
        <div class="project-grid">
          @for (project of projects(); track project.id) {
            <button class="card project-card" (click)="openProject(project)">
              <div class="project-head">
                <span class="mono">{{ project.key }}</span>
                @if (project.status === 'closed') { <span class="pill closed">Zamknięty</span> }
                @if (project.my_role) { <span class="pill role">{{ roleLabels[project.my_role] }}</span> }
              </div>
              <div class="project-name">{{ project.name }}</div>
              @if (project.description) { <div class="project-description">{{ project.description }}</div> }
              <div class="project-stats">
                <span><strong>{{ project.task_count }}</strong> zadań</span>
                <span><strong>{{ project.member_count }}</strong> osób</span>
                @if (project.my_open_task_count > 0) {
                  <span class="mine"><strong>{{ project.my_open_task_count }}</strong> moich otwartych</span>
                }
              </div>
            </button>
          }
        </div>
      }
    </div>

    @if (isCreateFormOpen()) {
      <div class="mol" (click)="isCreateFormOpen.set(false)">
        <div class="mo" (click)="$event.stopPropagation()">
          <div class="moh">
            <div class="mot">Nowy projekt</div>
            <button class="mox" (click)="isCreateFormOpen.set(false)">✕</button>
          </div>
          <div class="mob">
            <div class="fg">
              <label class="fl">Nazwa <span class="req">*</span></label>
              <input class="fi" [(ngModel)]="newName" maxlength="200" placeholder="np. Wdrożenie systemu CRM">
              <span class="hint">Prefiks numerów zadań powstanie automatycznie z nazwy projektu.</span>
            </div>
            <div class="fg">
              <label class="fl">Opis</label>
              <textarea class="fta" [(ngModel)]="newDescription" rows="4"></textarea>
            </div>
          </div>
          <div class="mof">
            <button class="btn btn-g" (click)="isCreateFormOpen.set(false)">Anuluj</button>
            <button class="btn btn-p" [disabled]="!newName.trim() || isSaving()" (click)="createProject()">
              {{ isSaving() ? 'Zapisywanie…' : 'Utwórz projekt' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    .filter { display:flex; gap:2px; background:var(--gray-100); border-radius:9px; padding:3px; }
    .filter-btn { border:none; background:transparent; padding:6px 12px; border-radius:7px; font-size:12.5px; color:var(--gray-500); cursor:pointer; font-family:inherit; }
    .filter.is-hidden { display:none; }
    .filter-btn.active { background:white; color:var(--orange); font-weight:600; box-shadow:var(--shadow-sm); }
    .project-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:14px; }
    .project-card { text-align:left; padding:16px; cursor:pointer; font-family:inherit; display:flex; flex-direction:column; gap:8px; transition:box-shadow .15s, border-color .15s; }
    .project-card:hover { box-shadow:var(--shadow); border-color:var(--orange-muted); }
    .project-head { display:flex; align-items:center; gap:6px; }
    .project-name { font-size:15px; font-weight:700; color:var(--gray-900); }
    .project-description { font-size:12.5px; color:var(--gray-500); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .project-stats { display:flex; gap:14px; font-size:12px; color:var(--gray-500); margin-top:auto; }
    .project-stats .mine strong { color:var(--orange); }
    .pill.role { background:var(--orange-pale); color:var(--orange-dark); }
    .pill.closed { background:var(--gray-100); color:var(--gray-500); }
    .hint { font-size:11.5px; color:var(--gray-400); }
  `],
})
export class ProjectsListComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly statusFilters = STATUS_FILTERS;
  readonly roleLabels = PROJECT_ROLE_LABELS;

  readonly projects = signal<ProjectListItem[]>([]);
  readonly canCreate = signal(false);
  readonly isLoading = signal(true);
  readonly statusFilter = signal<ProjectStatusFilter>('open');
  readonly view = signal<'projects' | 'my-tasks'>('projects');
  readonly isCreateFormOpen = signal(false);
  readonly isSaving = signal(false);

  newName = '';
  newDescription = '';

  ngOnInit(): void {
    this.loadProjects();
  }

  setStatusFilter(filter: ProjectStatusFilter): void {
    this.statusFilter.set(filter);
    this.loadProjects();
  }

  openProject(project: ProjectListItem): void {
    this.router.navigate(['/projects', project.id]);
  }

  openCreateForm(): void {
    this.newName = '';
    this.newDescription = '';
    this.isCreateFormOpen.set(true);
  }

  createProject(): void {
    this.isSaving.set(true);
    this.api.createProject({ name: this.newName.trim(), description: this.newDescription.trim() || null }).subscribe({
      next: project => {
        this.isSaving.set(false);
        this.router.navigate(['/projects', project.id], { queryParams: { tab: 'card' } });
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error(err?.error?.error ?? 'Nie udało się utworzyć projektu');
      },
    });
  }

  private loadProjects(): void {
    this.isLoading.set(true);
    this.api.listProjects(this.statusFilter()).subscribe({
      next: result => {
        this.projects.set(result.projects);
        this.canCreate.set(result.can_create);
        this.isLoading.set(false);
      },
      error: err => {
        this.isLoading.set(false);
        this.toast.error(err?.error?.error ?? 'Nie udało się pobrać projektów');
      },
    });
  }
}

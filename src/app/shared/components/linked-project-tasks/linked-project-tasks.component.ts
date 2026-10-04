import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { LinkedProject, ProjectTaskSummary, ProjectsApiService } from '../../../core/services/projects-api.service';
import { ProjectTaskNavigationService } from '../../../core/services/project-task-navigation.service';
import { AddToCalendarComponent } from '../add-to-calendar/add-to-calendar.component';
import { CalendarEntry, projectTaskCalendarEntry } from '../../utils/calendar-export.util';

/**
 * Read-only list of the projects linked to a lead or a partner, with their
 * tasks. Shown to everyone who can open the card — also to people who are not
 * members of the project. Clicking a task opens it in the Projects module;
 * the back button there returns to this card.
 */
@Component({
  selector: 'wt-linked-project-tasks',
  standalone: true,
  imports: [AddToCalendarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isEnabled && projects().length > 0) {
      <section class="linked">
        <div class="linked-title">Zadania projektowe</div>
        @for (project of projects(); track project.id) {
          <div class="project">
            <button class="project-head" [class.locked]="!project.can_open" [title]="lockedHint(project)"
                    (click)="open(project, null)">
              <span class="key">{{ project.key }}</span>
              <span class="name">{{ project.name }}</span>
              @if (project.status === 'closed') { <span class="closed">zamknięty</span> }
              <span class="count">{{ openTaskCount(project) }} otwartych z {{ project.tasks.length }}</span>
            </button>
            @if (project.status === 'open' || expandedClosedProjectId() === project.id) {
              @for (task of project.tasks; track task.id) {
                <div class="task" [class.done]="task.status_category === 'done'" [class.locked]="!project.can_open"
                     [title]="lockedHint(project)" (click)="open(project, task)">
                  <span class="task-number">{{ project.key }}-{{ task.task_number }}</span>
                  <span class="task-name">{{ task.name }}</span>
                  <span class="status" [style.color]="task.status_color" [style.background]="task.status_color + '1F'">
                    {{ task.status_name }}
                  </span>
                  <span class="assignees">{{ assigneeNames(task) }}</span>
                  <span class="due" [class.overdue]="isOverdue(task)">{{ task.end_date ?? 'bez terminu' }}</span>
                  <wt-add-to-calendar [entry]="calendarEntry(project, task)" (click)="$event.stopPropagation()" />
                </div>
              } @empty {
                <div class="empty">Projekt nie ma jeszcze zadań.</div>
              }
            } @else {
              <button class="show-closed" (click)="expandedClosedProjectId.set(project.id)">
                Pokaż zadania zamkniętego projektu
              </button>
            }
          </div>
        }
      </section>
    }
  `,
  styles: [`
    .linked { margin:12px 0; border:1px solid #e5e7eb; border-radius:10px; background:white; overflow:hidden; }
    .linked-title { padding:9px 14px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#5b21b6; background:#f5f3ff; }
    .project + .project { border-top:1px solid #e5e7eb; }
    .project-head { width:100%; display:flex; align-items:center; gap:8px; padding:9px 14px; border:none; background:#fafafa; cursor:pointer; font-family:inherit; text-align:left; }
    .project-head:hover { background:#f3f4f6; }
    .key { font-size:11px; font-weight:700; color:#2F8F4D; background:#E6F4EA; border-radius:5px; padding:1px 7px; }
    .name { font-size:13px; font-weight:700; color:#111827; flex:1; }
    .closed { font-size:11px; color:#6b7280; background:#f3f4f6; border-radius:10px; padding:1px 8px; }
    .count { font-size:11.5px; color:#6b7280; }
    .task { display:grid; grid-template-columns:70px 1fr auto 150px 92px auto; align-items:center; gap:10px; padding:7px 14px; border-top:1px solid #f3f4f6; font-size:12.5px; cursor:pointer; }
    .task:hover { background:#f9fafb; }
    .locked { cursor:default !important; }
    .task.done .task-name { color:#9ca3af; text-decoration:line-through; }
    .task-number { font-size:11px; font-weight:600; color:#9ca3af; }
    .task-name { color:#111827; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .status { font-size:11px; font-weight:600; border-radius:10px; padding:1px 8px; white-space:nowrap; }
    .assignees { color:#6b7280; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .due { color:#6b7280; white-space:nowrap; }
    .due.overdue { color:#dc2626; font-weight:600; }
    .empty, .show-closed { padding:8px 14px; font-size:12px; color:#9ca3af; border-top:1px solid #f3f4f6; }
    .show-closed { width:100%; text-align:left; border-left:none; border-right:none; border-bottom:none; background:white; cursor:pointer; font-family:inherit; }
    .show-closed:hover { color:#374151; }
  `],
})
export class LinkedProjectTasksComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly auth = inject(AuthService);
  private readonly projectTaskNavigation = inject(ProjectTaskNavigationService);

  readonly sourceType = input.required<'lead' | 'partner'>();
  readonly sourceId = input.required<number | string>();
  readonly sourceName = input('');

  readonly isEnabled = this.auth.hasFeature('projects');
  readonly projects = signal<LinkedProject[]>([]);
  readonly expandedClosedProjectId = signal<string | null>(null);
  private readonly today = new Date().toISOString().slice(0, 10);

  private readonly origin = computed(() => {
    const isLead = this.sourceType() === 'lead';
    return {
      label: `${isLead ? 'Lead' : 'Partner'} ${this.sourceName()}`.trim(),
      route: [isLead ? '/crm/leads' : '/crm/partners', this.sourceId()],
    };
  });

  ngOnInit(): void {
    if (!this.isEnabled) return;
    const request = this.sourceType() === 'lead'
      ? this.api.listLeadProjects(this.sourceId())
      : this.api.listPartnerProjects(this.sourceId());
    // The card works without this section, so a failed load is not reported.
    request.subscribe({ next: projects => this.projects.set(projects), error: () => this.projects.set([]) });
  }

  open(project: LinkedProject, task: ProjectTaskSummary | null): void {
    if (!project.can_open) return;
    this.projectTaskNavigation.open(project.id, task?.id ?? null, this.origin());
  }

  lockedHint(project: LinkedProject): string {
    return project.can_open ? '' : 'Podgląd — nie jesteś uczestnikiem tego projektu';
  }

  openTaskCount(project: LinkedProject): number {
    return project.tasks.filter(task => task.status_category !== 'done').length;
  }

  assigneeNames(task: ProjectTaskSummary): string {
    return task.assignees.map(assignee => assignee.display_name).join(', ') || '—';
  }

  isOverdue(task: ProjectTaskSummary): boolean {
    return task.end_date !== null && task.end_date < this.today && task.status_category !== 'done';
  }

  calendarEntry(project: LinkedProject, task: ProjectTaskSummary): CalendarEntry | null {
    return projectTaskCalendarEntry({
      projectId: project.id, projectKey: project.key, projectName: project.name,
      taskId: task.id, taskNumber: task.task_number, name: task.name, endDate: task.end_date,
    });
  }
}

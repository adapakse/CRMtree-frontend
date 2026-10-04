import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { AssignedProjectTask, ProjectsApiService } from '../../core/services/projects-api.service';
import { ToastService } from '../../core/services/toast.service';
import { AddToCalendarComponent } from '../../shared/components/add-to-calendar/add-to-calendar.component';
import { CalendarEntry, projectTaskCalendarEntry } from '../../shared/utils/calendar-export.util';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';

/**
 * Open tasks assigned to the signed-in user across all their projects — the
 * "my tasks" view for people who have no CRM calendar (non-sales staff,
 * external accounts).
 */
@Component({
  selector: 'wt-project-my-tasks',
  standalone: true,
  imports: [AddToCalendarComponent, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (isLoading()) {
        <div class="empty-state">{{ 'states.loading' | transloco }}</div>
      } @else if (tasks().length === 0) {
        <div class="empty-state">
          <div class="empty-title">{{ t('myTasks.empty.title') }}</div>
          {{ t('myTasks.empty.description') }}
        </div>
      } @else {
        <div class="tw">
          <table class="grid">
            <thead>
              <tr>
                <th>{{ t('myTasks.columns.dueDate') }}</th><th>{{ t('myTasks.columns.task') }}</th>
                <th>{{ t('myTasks.columns.project') }}</th><th>{{ t('myTasks.columns.status') }}</th>
                <th>{{ t('myTasks.columns.priority') }}</th><th></th>
              </tr>
            </thead>
            <tbody>
              @for (task of tasks(); track task.id) {
                <tr class="task-row" (click)="open(task)">
                  <td class="due" [class.overdue]="isOverdue(task)" [class.today]="task.end_date === today">
                    {{ task.end_date ?? t('myTasks.noDueDate') }}
                  </td>
                  <td><span class="mono">{{ task.project_key }}-{{ task.task_number }}</span> {{ task.name }}</td>
                  <td class="muted-cell">{{ task.project_name }}</td>
                  <td>
                    <span class="chip" [style.color]="task.status_color" [style.background]="task.status_color + '1F'">
                      {{ task.status_name }}
                    </span>
                  </td>
                  <td>
                    @if (task.priority_name) {
                      <span class="chip" [style.color]="task.priority_color" [style.background]="task.priority_color + '1F'">
                        {{ task.priority_name }}
                      </span>
                    }
                  </td>
                  <td class="actions"><wt-add-to-calendar [entry]="calendarEntry(task)" (click)="$event.stopPropagation()" /></td>
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
    .task-row { cursor:pointer; }
    .task-row:hover td { background:var(--gray-50); }
    .due { white-space:nowrap; font-size:12.5px; color:var(--gray-600); }
    .due.today { color:#1d4ed8; font-weight:600; }
    .due.overdue { color:#DC2626; font-weight:600; }
    .muted-cell { color:var(--gray-500); font-size:12.5px; }
    .actions { text-align:right; }
  `],
})
export class ProjectMyTasksComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly tasks = signal<AssignedProjectTask[]>([]);
  readonly isLoading = signal(true);
  readonly today = new Date().toISOString().slice(0, 10);

  ngOnInit(): void {
    this.api.listAssignedTasks().subscribe({
      next: tasks => { this.tasks.set(tasks); this.isLoading.set(false); },
      error: err => {
        this.isLoading.set(false);
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.myTasks.loadFailed'));
      },
    });
  }

  open(task: AssignedProjectTask): void {
    this.router.navigate(['/projects', task.project_id], { queryParams: { task: task.id } });
  }

  isOverdue(task: AssignedProjectTask): boolean {
    return task.end_date !== null && task.end_date < this.today;
  }

  calendarEntry(task: AssignedProjectTask): CalendarEntry | null {
    return projectTaskCalendarEntry({
      projectId: task.project_id, projectKey: task.project_key, projectName: task.project_name,
      taskId: task.id, taskNumber: task.task_number, name: task.name, endDate: task.end_date,
    });
  }
}

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgStyle } from '@angular/common';
import { ProjectConfig, ProjectDictionaryItem, ProjectTask } from '../../core/services/projects-api.service';
import { INDENT_PX_PER_LEVEL, buildTaskRows } from './project-task-tree.util';
import { PROJECTS_SHARED_STYLES, chipStyle } from './projects-shared.styles';

@Component({
  selector: 'wt-project-task-list',
  standalone: true,
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length === 0) {
      <div class="empty-state">
        <div class="empty-title">Brak zadań</div>
        {{ emptyMessage() }}
      </div>
    } @else {
      <div class="tw">
        <table class="grid">
          <thead>
            <tr>
              <th>Nr</th><th>Zadanie</th><th>Typ</th><th>Status</th><th>Priorytet</th>
              <th>Osoby</th><th>Początek</th><th>Koniec</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.task.id) {
              <tr class="task-row" (click)="taskOpened.emit(row.task.id)">
                <td class="mono">{{ projectKey() }}-{{ row.task.task_number }}</td>
                <td>
                  <div class="task-name" [style.padding-left.px]="row.depth * indentPx">
                    @if (row.task.parent_task_id === null) {
                      <svg class="parent-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round" aria-label="Zadanie nadrzędne">
                        <title>Zadanie nadrzędne</title>
                        <path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 13 9 5 9-5"/>
                      </svg>
                    } @else {
                      <svg class="child-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round" aria-label="Podzadanie">
                        <title>Podzadanie</title>
                        <path d="M6 4v8a3 3 0 0 0 3 3h9"/><path d="m14 11 4 4-4 4"/>
                      </svg>
                    }
                    <span [class.root-name]="row.task.parent_task_id === null">{{ row.task.name }}</span>
                  </div>
                </td>
                <td>
                  @if (typeOf(row.task); as type) { <span class="chip" [ngStyle]="chipStyle(type.color)">{{ type.name }}</span> }
                </td>
                <td>
                  @if (statusOf(row.task); as status) {
                    <span class="chip" [ngStyle]="chipStyle(status.color)">
                      <span class="chip-dot" [style.background]="status.color"></span>{{ status.name }}
                    </span>
                  }
                </td>
                <td>
                  @if (priorityOf(row.task); as priority) {
                    <span class="chip" [ngStyle]="chipStyle(priority.color)">{{ priority.name }}</span>
                  }
                </td>
                <td class="assignees">{{ assigneeNames(row.task) }}</td>
                <td class="date">{{ row.task.start_date ?? '—' }}</td>
                <td class="date" [class.overdue]="isOverdue(row.task)">{{ row.task.end_date ?? '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    :host { display:block; height:auto; }
    .task-row { cursor:pointer; }
    .task-row:hover td { background:var(--gray-50); }
    .task-name { display:flex; align-items:center; gap:7px; }
    .parent-icon { width:15px; height:15px; color:var(--orange); flex-shrink:0; }
    .child-icon { width:14px; height:14px; color:var(--gray-400); flex-shrink:0; }
    .root-name { font-weight:600; }
    .assignees { color:var(--gray-600); font-size:12.5px; }
    .date { white-space:nowrap; font-size:12.5px; color:var(--gray-600); }
    .date.overdue { color:#DC2626; font-weight:600; }
  `],
})
export class ProjectTaskListComponent {
  readonly tasks = input.required<ProjectTask[]>();
  readonly config = input.required<ProjectConfig>();
  readonly projectKey = input.required<string>();
  readonly emptyMessage = input('W tym projekcie nie ma jeszcze zadań.');
  readonly taskOpened = output<string>();

  readonly indentPx = INDENT_PX_PER_LEVEL;
  readonly chipStyle = chipStyle;
  readonly rows = computed(() => buildTaskRows(this.tasks()));

  private readonly statusById = computed(() => new Map(this.config().statuses.map(status => [status.id, status])));
  private readonly typeById = computed(() => new Map(this.config().types.map(type => [type.id, type])));
  private readonly priorityById = computed(() => new Map(this.config().priorities.map(priority => [priority.id, priority])));
  private readonly today = new Date().toISOString().slice(0, 10);

  statusOf(task: ProjectTask) {
    return this.statusById().get(task.status_id);
  }

  typeOf(task: ProjectTask): ProjectDictionaryItem | undefined {
    return task.type_id ? this.typeById().get(task.type_id) : undefined;
  }

  priorityOf(task: ProjectTask): ProjectDictionaryItem | undefined {
    return task.priority_id ? this.priorityById().get(task.priority_id) : undefined;
  }

  assigneeNames(task: ProjectTask): string {
    return task.assignees.map(assignee => assignee.display_name).join(', ') || '—';
  }

  isOverdue(task: ProjectTask): boolean {
    return task.end_date !== null && task.end_date < this.today && this.statusOf(task)?.category !== 'done';
  }
}

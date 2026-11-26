import { Injectable, computed, inject, signal } from '@angular/core';
import { ProjectUnreadMessages, ProjectsApiService } from './projects-api.service';

const NOTHING_UNREAD: ProjectUnreadMessages = { total: 0, projects: [] };

/**
 * The signed-in person's unread messages of the Projects chat. One copy for
 * the whole app: the menu, the project list, the chat tab and the task rows
 * all read their badge from it, so they change together.
 */
@Injectable({ providedIn: 'root' })
export class ProjectUnreadService {
  private readonly api = inject(ProjectsApiService);
  private readonly summary = signal<ProjectUnreadMessages>(NOTHING_UNREAD);

  readonly total = computed(() => this.summary().total);
  private readonly byProject = computed(() => new Map(this.summary().projects.map(project => [project.project_id, project])));
  private readonly byTask = computed(() => new Map(
    this.summary().projects.flatMap(project => project.tasks.map(task => [task.task_id, task.unread] as const)),
  ));

  /** The general thread and every task thread of the project together. */
  ofProject(projectId: string): number {
    return this.byProject().get(projectId)?.unread ?? 0;
  }

  ofGeneralThread(projectId: string): number {
    return this.byProject().get(projectId)?.general_unread ?? 0;
  }

  ofTask(taskId: string): number {
    return this.byTask().get(taskId) ?? 0;
  }

  refresh(): void {
    this.api.getUnreadMessages().subscribe({
      next: summary => this.summary.set(summary),
      // A failed background refresh keeps the last known numbers.
      error: () => undefined,
    });
  }

  clear(): void {
    this.summary.set(NOTHING_UNREAD);
  }
}

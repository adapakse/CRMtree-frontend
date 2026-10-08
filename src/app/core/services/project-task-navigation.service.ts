import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NavBackService } from './nav-back.service';

export interface ProjectTaskOrigin {
  /** Shown on the back button in the project view, e.g. "Lead Acme". */
  label: string;
  route: unknown[];
  queryParams?: Record<string, string>;
}

/**
 * Opens a project task from outside the Projects module (lead / partner card,
 * calendar, dashboard, invoice document) and remembers where the user came
 * from, so the project view can offer a way back to that exact place.
 */
@Injectable({ providedIn: 'root' })
export class ProjectTaskNavigationService {
  private readonly router = inject(Router);
  private readonly navBack = inject(NavBackService);

  open(projectId: string, taskId: string | null, origin: ProjectTaskOrigin): void {
    this.rememberOrigin(origin);
    this.router.navigate(['/projects', projectId], { queryParams: taskId ? { task: taskId } : {} });
  }

  /** Opens the Finance tab; the project view shows Tasks instead to someone who may not read the finance. */
  openFinance(projectId: string, origin: ProjectTaskOrigin): void {
    this.rememberOrigin(origin);
    this.router.navigate(['/projects', projectId], { queryParams: { tab: 'finance' } });
  }

  private rememberOrigin(origin: ProjectTaskOrigin): void {
    this.navBack.set({
      label: origin.label,
      route: origin.route as any[],
      queryParams: origin.queryParams,
      targetUrlPrefix: '/projects',
    });
  }
}

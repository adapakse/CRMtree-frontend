import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

export type ProjectsView = 'projects' | 'my-tasks' | 'portfolio';

/** Switches between the top-level views of the Projects module; each has its own address. */
@Component({
  selector: 'wt-projects-view-switch',
  standalone: true,
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <a class="view" [class.active]="active() === 'projects'" routerLink="/projects">{{ t('list.views.projects') }}</a>
      <a class="view" [class.active]="active() === 'my-tasks'" routerLink="/projects" [queryParams]="{ view: 'my-tasks' }">
        {{ t('list.views.myTasks') }}
      </a>
      @if (showsPortfolio()) {
        <a class="view" [class.active]="active() === 'portfolio'" routerLink="/projects/portfolio">{{ t('list.views.portfolio') }}</a>
      }
    </ng-container>
  `,
  styles: [`
    /* The module's main views: a segmented control, one level above the filters. */
    :host { display:inline-flex; gap:2px; padding:4px; background:var(--gray-100); border-radius:12px; }
    .view {
      display:inline-flex; align-items:center; height:30px; padding:0 14px; border-radius:9px;
      font-size:12px; font-weight:500; color:var(--gray-500); text-decoration:none; white-space:nowrap;
      transition:background .15s, color .15s, box-shadow .15s;
    }
    .view:hover { color:var(--gray-800); }
    .view.active { background:white; color:var(--gray-900); box-shadow:0 1px 3px rgba(0,0,0,.10); }
  `],
})
export class ProjectsViewSwitchComponent {
  readonly active = input.required<ProjectsView>();
  /** The cross-project view exists only for a tenant admin and for PMs / controllers of an open project. */
  readonly showsPortfolio = input(false);
}

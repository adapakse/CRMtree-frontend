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
    :host { display:flex; gap:2px; background:var(--gray-100); border-radius:9px; padding:3px; }
    .view { padding:6px 12px; border-radius:7px; font-size:12.5px; color:var(--gray-500); cursor:pointer; text-decoration:none; white-space:nowrap; }
    .view.active { background:white; color:var(--orange); font-weight:600; box-shadow:var(--shadow-sm); }
  `],
})
export class ProjectsViewSwitchComponent {
  readonly active = input.required<ProjectsView>();
  /** The cross-project view exists only for a tenant admin and for PMs / controllers of an open project. */
  readonly showsPortfolio = input(false);
}

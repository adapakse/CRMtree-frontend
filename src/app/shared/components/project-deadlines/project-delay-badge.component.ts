import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectSchedule } from '../../../core/services/projects-api.service';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * Marks a delayed project: a "Delayed" badge whose tooltip gives the reason,
 * the reason as visible text, or both. Renders nothing for a project that is
 * not delayed.
 */
@Component({
  selector: 'wt-project-delay-badge',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // An empty host would still take a gap in the flex rows it is placed in.
  host: { '[class.is-hidden]': '!schedule().is_delayed' },
  template: `
    @if (schedule().is_delayed) {
      <ng-container *transloco="let t; prefix: 'projects'">
        @if (display() !== 'reason') {
          <span class="badge" [title]="tooltip(t)">{{ t('delay.badge') }}</span>
        }
        @if (display() !== 'badge') {
          <span class="reason">
            @for (reason of reasons(t); track reason) { <span>{{ reason }}</span> }
          </span>
        }
      </ng-container>
    }
  `,
  styles: [`
    :host { display:inline-flex; align-items:baseline; gap:8px; min-width:0; }
    :host(.is-hidden) { display:none; }
    .badge { padding:1px 8px; border-radius:10px; font-size:11px; font-weight:600; background:#FEE2E2; color:#B91C1C; white-space:nowrap; cursor:default; }
    .reason { display:inline-flex; flex-direction:column; font-size:11.5px; color:#B91C1C; line-height:1.4; }
  `],
})
export class ProjectDelayBadgeComponent {
  readonly schedule = input.required<ProjectSchedule>();
  readonly display = input<'badge' | 'reason' | 'both'>('badge');

  // Takes the template's translate function so the texts follow the lazily loaded scope.
  reasons(t: Translate): string[] {
    const { delay_reasons: delayReasons, delay_details: details } = this.schedule();
    return delayReasons.map(reason => (reason === 'task_after_end'
      ? t('delay.reasons.taskAfterEnd', { count: details.tasks_after_end_count, days: details.days_after_end ?? 0 })
      : t('delay.reasons.endPassed', { count: details.open_task_count, days: details.days_past_end ?? 0 })));
  }

  tooltip(t: Translate): string {
    return this.reasons(t).join('\n');
  }
}

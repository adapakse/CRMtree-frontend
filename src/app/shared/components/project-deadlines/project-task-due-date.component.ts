import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectFinanceFormatService } from '../../../core/services/project-finance-format.service';
import { TaskDeadlineInfo } from '../../../core/services/projects-api.service';

type DueDateFacts = { end_date: string | null } & Pick<TaskDeadlineInfo, 'original_end_date' | 'slip_days' | 'timeliness'>;

/**
 * The end date of a task. When the date was moved, the original date is shown
 * greyed out beside it with the shift in days ("+5 d" later, "−2 d" earlier).
 */
@Component({
  selector: 'wt-project-task-due-date',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <span class="current" [class.overdue]="task().timeliness === 'overdue'" [class.at-risk]="task().timeliness === 'at_risk'">
        {{ task().end_date ? format.date(task().end_date) : (emptyLabel() || '—') }}
      </span>
      @if (slip(); as moved) {
        <span class="original" [title]="t('deadlines.originalEndDateHint')">
          <span class="original-date">{{ format.date(task().original_end_date) }}</span>
          <span class="slip" [class.later]="moved.isLater">
            {{ t(moved.isLater ? 'deadlines.slipLater' : 'deadlines.slipEarlier', { days: moved.days }) }}
          </span>
        </span>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:inline-flex; flex-direction:column; gap:1px; white-space:nowrap; font-size:12.5px; color:var(--gray-600, #52525B); font-variant-numeric:tabular-nums; }
    :host(.inline) { flex-direction:row; align-items:baseline; gap:6px; }
    .current.overdue { color:#DC2626; font-weight:600; }
    .current.at-risk { color:#B45309; font-weight:600; }
    .original { display:inline-flex; align-items:baseline; gap:5px; font-size:11px; color:var(--gray-400, #A1A1AA); }
    .original-date { text-decoration:line-through; }
    .slip { font-weight:600; color:#15803D; }
    .slip.later { color:#B45309; }
  `],
})
export class ProjectTaskDueDateComponent {
  readonly format = inject(ProjectFinanceFormatService);

  readonly task = input.required<DueDateFacts>();
  /** Shown instead of a dash when the task has no end date. */
  readonly emptyLabel = input('');

  readonly slip = computed(() => {
    const { slip_days: slipDays, original_end_date: originalEndDate } = this.task();
    if (slipDays === null || slipDays === 0 || !originalEndDate) return null;
    return { isLater: slipDays > 0, days: Math.abs(slipDays) };
  });
}

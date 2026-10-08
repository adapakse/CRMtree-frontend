import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { TaskDeadlineInfo } from '../../../core/services/projects-api.service';

type TimelinessFacts = Pick<TaskDeadlineInfo, 'timeliness' | 'days_overdue' | 'is_completed_late' | 'has_overdue_subtasks'>;

/**
 * Deadline markers of one task: overdue (with the number of days), at risk,
 * completed late, and the weaker "has overdue subtasks" for a parent that is
 * not overdue itself. Renders nothing for a task that is on time.
 */
@Component({
  selector: 'wt-project-task-timeliness',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (task().timeliness === 'overdue') {
        <span class="marker overdue" [title]="t('deadlines.overdueHint')">
          @if (task().days_overdue; as days) {
            {{ isCompact() ? t('deadlines.daysShort', { days }) : t('deadlines.overdueDays', { days }) }}
          } @else {
            {{ t('deadlines.overdue') }}
          }
        </span>
      } @else if (task().timeliness === 'at_risk') {
        <span class="marker at-risk" [class.dot]="isCompact()" [title]="t('deadlines.atRiskHint')">
          @if (!isCompact()) { {{ t('deadlines.atRisk') }} }
        </span>
      } @else if (task().is_completed_late) {
        <span class="marker late" [class.dot]="isCompact()" [title]="t('deadlines.completedLateHint')">
          @if (!isCompact()) { {{ t('deadlines.completedLate') }} }
        </span>
      }
      @if (task().has_overdue_subtasks && task().timeliness !== 'overdue') {
        <span class="marker subtasks" [class.dot]="isCompact()" [title]="t('deadlines.overdueSubtasksHint')">
          @if (!isCompact()) { {{ t('deadlines.overdueSubtasks') }} }
        </span>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:inline-flex; flex-wrap:wrap; align-items:center; gap:4px; }
    .marker { display:inline-flex; align-items:center; padding:1px 8px; border-radius:10px; font-size:11px; font-weight:600; white-space:nowrap; line-height:1.5; }
    .overdue { background:#FEE2E2; color:#B91C1C; }
    .at-risk { background:#FEF3C7; color:#92400E; }
    .late { background:#F4F4F5; color:#71717A; }
    .subtasks { background:white; color:#B91C1C; box-shadow:inset 0 0 0 1px #FCA5A5; }
    .dot { width:9px; height:9px; padding:0; border-radius:50%; flex-shrink:0; }
    .at-risk.dot { background:#F59E0B; }
    .late.dot { background:#A1A1AA; }
    .subtasks.dot { box-shadow:inset 0 0 0 2px #F87171; }
  `],
})
export class ProjectTaskTimelinessComponent {
  readonly task = input.required<TimelinessFacts>();
  /** Days only for an overdue task and coloured dots for the rest — for narrow rows. */
  readonly isCompact = input(false);
}

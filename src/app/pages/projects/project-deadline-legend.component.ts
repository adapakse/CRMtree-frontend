import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/** Explains the deadline markers of task lists and, on request, the extra marks of the timeline. */
@Component({
  selector: 'wt-project-deadline-legend',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <span class="item"><span class="swatch overdue"></span>{{ t('deadlines.legend.overdue') }}</span>
      <span class="item"><span class="swatch at-risk"></span>{{ t('deadlines.legend.atRisk', { days: atRiskThresholdDays() }) }}</span>
      <span class="item"><span class="swatch late"></span>{{ t('deadlines.legend.completedLate') }}</span>
      <span class="item"><span class="swatch subtasks"></span>{{ t('deadlines.legend.overdueSubtasks') }}</span>
      <span class="item"><span class="swatch original"></span>{{ t('deadlines.legend.originalEndDate') }}</span>
      @if (showsTimelineMarks()) {
        <span class="item"><span class="swatch project-end"></span>{{ t('deadlines.legend.projectEndDate') }}</span>
        <span class="item"><span class="swatch beyond-end"></span>{{ t('deadlines.legend.beyondProjectEnd') }}</span>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-wrap:wrap; gap:4px 14px; font-size:11.5px; color:var(--gray-500); }
    .item { display:inline-flex; align-items:center; gap:5px; white-space:nowrap; }
    .swatch { width:10px; height:10px; border-radius:50%; flex-shrink:0; box-sizing:border-box; }
    .overdue { background:#DC2626; }
    .at-risk { background:#F59E0B; }
    .late { background:#A1A1AA; }
    .subtasks { border:2px solid #F87171; }
    .original { width:16px; height:4px; border-radius:2px; background:#A1A1AA; }
    .project-end { width:0; height:12px; border-radius:0; border-left:2px dashed #7C3AED; }
    .beyond-end { width:16px; border-radius:3px; background:repeating-linear-gradient(135deg, #DC2626 0 3px, #FCA5A5 3px 6px); }
  `],
})
export class ProjectDeadlineLegendComponent {
  readonly atRiskThresholdDays = input.required<number>();
  readonly showsTimelineMarks = input(false);
}

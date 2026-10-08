import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectCostItem } from '../../core/services/project-finance-api.service';
import { taskLabel } from './project-ksef.styles';

/**
 * Red note under a cost item whose KSeF invoice is also linked to other cost
 * items. Shown to everyone who can read the project finance — it is built from
 * the cost item alone and needs no KSeF permission.
 */
@Component({
  selector: 'wt-project-ksef-other-links',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (item().other_links.length > 0) {
      <span class="warning" role="note" *transloco="let t; prefix: 'projects'">
        {{ t('ksef.otherLinks.intro') }}
        @for (link of item().other_links; track link.cost_item_id; let isLast = $last) {
          <span class="target">{{ link.task_id === null
            ? t('ksef.otherLinks.wholeProject', { project: link.project_key + ' ' + link.project_name })
            : taskLabel(link.project_key, link.task_number, link.task_name) }}{{ isLast ? '.' : ';' }}</span>
        }
        @if (item().ksef_invoice?.is_over_allocated) { {{ t('ksef.otherLinks.overAllocated') }} }
      </span>
    }
  `,
  styles: [`
    :host { display:contents; }
    .warning { display:block; color:#DC2626; font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
    .target { font-weight:600; margin-right:3px; }
  `],
})
export class ProjectKsefOtherLinksComponent {
  readonly item = input.required<ProjectCostItem>();
  readonly taskLabel = taskLabel;
}

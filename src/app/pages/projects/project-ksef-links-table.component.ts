import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { KsefInvoiceLink } from '../../core/services/ksef-api.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { PROJECT_FINANCE_STYLES } from './project-finance.styles';
import { taskLabel } from './project-ksef.styles';

/** Where a KSeF invoice is linked: project, task (or the whole project) and the assigned amount. */
@Component({
  selector: 'wt-project-ksef-links-table',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tw" *transloco="let t; prefix: 'projects'">
      <table class="grid">
        <thead>
          <tr>
            <th>{{ t('ksef.links.columns.project') }}</th>
            <th>{{ t('ksef.links.columns.task') }}</th>
            <th class="amount">{{ t('ksef.links.columns.amount') }}</th>
            <th>{{ t('ksef.links.columns.status') }}</th>
            @if (isDetailed()) { <th>{{ t('ksef.links.columns.linkedBy') }}</th> }
          </tr>
        </thead>
        <tbody>
          @for (link of links(); track link.cost_item_id) {
            <tr>
              <td><span class="mono">{{ link.project_key }}</span> {{ link.project_name }}</td>
              <td>
                {{ link.task_id === null
                  ? t('ksef.links.wholeProject')
                  : taskLabel(link.project_key, link.task_number, link.task_name) }}
              </td>
              <td class="amount">{{ format.money(link.amount, link.currency) }}</td>
              <td><span class="pill status-pill" [class]="link.status">{{ t('finance.costStatuses.' + link.status) }}</span></td>
              @if (isDetailed()) {
                <td>{{ link.linked_by_name }} <span class="secondary">{{ format.dateTime(link.linked_at) }}</span></td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [PROJECTS_SHARED_STYLES, PROJECT_FINANCE_STYLES, `
    .tw { background:white; }
  `],
})
export class ProjectKsefLinksTableComponent {
  readonly format = inject(ProjectFinanceFormatService);

  readonly links = input.required<KsefInvoiceLink[]>();
  /** Adds who linked the invoice and when. */
  readonly isDetailed = input(false);

  readonly taskLabel = taskLabel;
}

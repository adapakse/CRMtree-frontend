import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { DocumentProjectLink } from '../../../core/models/models';
import { ProjectFinanceFormatService } from '../../../core/services/project-finance-format.service';
import { ProjectTaskNavigationService } from '../../../core/services/project-task-navigation.service';

/**
 * Project cost items an invoice document is linked to. Everyone who can read
 * the document sees the list; a row leads to the project (its task, or the
 * Finance tab for a cost of the whole project) only for someone who may open
 * that project. The back button of the project view returns to this document.
 */
@Component({
  selector: 'wt-document-project-links',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('documents')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'documents'">
      <div class="sec-title">{{ t('invoice.projectLinks.title') }}</div>
      @if (links().length === 0) {
        <div class="empty">{{ t('invoice.projectLinks.empty') }}</div>
      } @else {
        @if (links().length > 1) {
          <div class="warning" role="note">{{ t('invoice.projectLinks.severalLinks') }}</div>
        }
        <ul class="links">
          @for (link of links(); track link.cost_item_id) {
            <li class="link-row">
              <div class="target">
                @if (link.can_open) {
                  <button type="button" class="open" (click)="open(link)">
                    <span class="key">{{ link.project_key }}</span> {{ link.project_name }}
                    <span class="task">· {{ taskLabel(link) ?? t('invoice.projectLinks.wholeProject') }}</span>
                  </button>
                } @else {
                  <span>
                    <span class="key">{{ link.project_key }}</span> {{ link.project_name }}
                    <span class="task">· {{ taskLabel(link) ?? t('invoice.projectLinks.wholeProject') }}</span>
                  </span>
                }
                <div class="meta">
                  @if (link.linked_by_name) {
                    {{ t('invoice.projectLinks.linkedBy', { name: link.linked_by_name, date: format.dateTime(link.linked_at) }) }}
                  } @else {
                    {{ t('invoice.projectLinks.linkedAt', { date: format.dateTime(link.linked_at) }) }}
                  }
                </div>
              </div>
              <span class="cost-status" [class.incurred]="link.status === 'incurred'">{{ t('invoice.projectLinks.costStatuses.' + link.status) }}</span>
              <span class="amount">{{ format.money(link.amount, link.currency) }}</span>
            </li>
          }
        </ul>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:block; margin-top:20px; }
    .empty { font-size:12.5px; color:var(--gray-400); margin-bottom:12px; }
    .warning { color:#DC2626; font-size:12px; line-height:1.5; margin-bottom:8px; }
    .links { list-style:none; margin:0 0 12px; padding:0; border:1px solid var(--gray-200); border-radius:8px; }
    .link-row { display:grid; grid-template-columns:1fr auto auto; gap:12px; align-items:center; padding:8px 12px; font-size:13px; color:var(--gray-800); }
    .link-row + .link-row { border-top:1px solid var(--gray-100); }
    .target { min-width:0; overflow-wrap:anywhere; }
    .open { border:none; background:none; padding:0; font:inherit; color:var(--accent-blue, #3B82F6); cursor:pointer; text-align:left; }
    .open:hover { text-decoration:underline; }
    .key { font-size:11px; font-weight:700; color:var(--orange-dark); background:var(--orange-pale); border-radius:5px; padding:1px 7px; }
    .task { color:var(--gray-600); }
    .open .task { color:inherit; }
    .meta { font-size:11.5px; color:var(--gray-400); margin-top:2px; }
    .cost-status { padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; white-space:nowrap; background:var(--gray-100); color:var(--gray-600); }
    .cost-status.incurred { background:var(--orange-pale); color:var(--orange-dark); }
    .amount { white-space:nowrap; font-variant-numeric:tabular-nums; font-weight:600; }
  `],
})
export class DocumentProjectLinksComponent {
  private readonly projectTaskNavigation = inject(ProjectTaskNavigationService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(ProjectFinanceFormatService);

  readonly links = input.required<DocumentProjectLink[]>();
  readonly documentId = input.required<string>();
  readonly documentNumber = input.required<string>();

  /** "KEY-12 Task name", the way the Projects module writes a task; null for a cost of the whole project. */
  taskLabel(link: DocumentProjectLink): string | null {
    if (link.task_id === null) return null;
    return `${link.project_key}-${link.task_number} ${link.task_name ?? ''}`.trim();
  }

  open(link: DocumentProjectLink): void {
    const origin = {
      label: this.transloco.translate('documents.invoice.projectLinks.backLabel', { number: this.documentNumber() }),
      route: ['/documents'],
      queryParams: { open: this.documentId() },
    };
    if (link.task_id) this.projectTaskNavigation.open(link.project_id, link.task_id, origin);
    else this.projectTaskNavigation.openFinance(link.project_id, origin);
  }
}

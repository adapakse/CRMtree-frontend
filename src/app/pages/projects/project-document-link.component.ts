import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectCostDocument } from '../../core/services/project-finance-api.service';

/**
 * The invoice document of a cost item: its number and name. A link into the
 * Documents module for someone who may open the document, plain text for
 * anyone else — the Documents module would refuse to show it.
 */
@Component({
  selector: 'wt-project-document-link',
  standalone: true,
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (document().can_open) {
        <a class="document" [routerLink]="['/documents']" [queryParams]="{ open: document().id }"
           [title]="t('finance.document.openTitle')">
          <span class="number">{{ document().doc_number }}</span> {{ document().name }}
        </a>
      } @else {
        <span class="document locked" [title]="t('finance.document.lockedTitle')">
          <span class="number">{{ document().doc_number }}</span> {{ document().name }}
        </span>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:inline-block; max-width:100%; }
    .document { font-size:12px; line-height:1.4; overflow-wrap:anywhere; color:var(--accent-blue, #3B82F6); text-decoration:none; }
    a.document:hover { text-decoration:underline; }
    .document.locked { color:var(--gray-600); }
    .number { font-weight:600; white-space:nowrap; }
  `],
})
export class ProjectDocumentLinkComponent {
  readonly document = input.required<ProjectCostDocument>();
}

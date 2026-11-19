import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** "Fix the fields marked in red (N)" — shown next to a submit button after a failed click. */
@Component({
  selector: 'wt-form-error-summary',
  standalone: true,
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count() > 0) {
      <span class="pf-err" role="alert">{{ 'form.fixErrors' | transloco: { count: count() } }}</span>
    }
  `,
  styles: [`:host { display: contents; }`],
})
export class FormErrorSummaryComponent {
  readonly count = input(0);
}

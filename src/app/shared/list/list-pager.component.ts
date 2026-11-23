import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ListQueryState } from './list-query';
import { PageNavComponent } from './page-nav.component';

/** The shared page navigation bound to a list's query state. */
@Component({
  selector: 'wt-list-pager',
  standalone: true,
  imports: [PageNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<wt-page-nav [page]="query().page()" [total]="total()" (pageChange)="query().page.set($event)" />`,
  styles: [`:host { display:block; }`],
})
export class ListPagerComponent {
  readonly query = input.required<ListQueryState>();
  readonly total = input.required<number>();
}

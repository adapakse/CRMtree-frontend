import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ListFilterMenuComponent } from './list-filter-menu.component';
import { ListFilter, ListQueryState, ListSortOption } from './list-query';

/**
 * Header cell of a server-side list: click the label to sort, the funnel to
 * filter by this column. A column showing several values passes their
 * filters and sort orders as `moreFilters` / `moreSorts`; they appear in the
 * funnel's popover.
 */
@Component({
  // An attribute on the <th> itself, because a table row accepts no other element.
  selector: 'th[wtListColumn]',
  standalone: true,
  imports: [ListFilterMenuComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-sort]': 'ariaSort()' },
  template: `
    <span class="head" *transloco="let t; prefix: 'list'">
      @if (sortKey(); as key) {
        <button type="button" class="sort" [class.sorted]="isSorted()" [title]="t('sortBy', { name: label() })"
                (click)="query().toggleSort(key)">
          {{ label() }}
          <span class="arrow" aria-hidden="true">{{ isSorted() ? (query().order() === 'asc' ? '▲' : '▼') : '↕' }}</span>
        </button>
      } @else {
        <span>{{ label() }}</span>
      }
      @if (menuFilters().length > 0 || moreSorts().length > 0) {
        <wt-list-filter-menu variant="icon" [label]="label()" [filters]="menuFilters()" [sortOptions]="moreSorts()" [query]="query()" />
      }
    </span>
  `,
  styles: [`
    .head { display:inline-flex; align-items:center; gap:4px; }
    .sort { display:inline-flex; align-items:center; gap:4px; border:none; background:none; padding:0; font:inherit; color:inherit; text-transform:inherit; letter-spacing:inherit; cursor:pointer; }
    .sort:hover { color:var(--gray-800); }
    .arrow { font-size:9px; color:var(--gray-300); }
    .sort.sorted { color:var(--orange-dark); }
    .sort.sorted .arrow { color:var(--orange-dark); }
  `],
})
export class ListColumnHeaderComponent {
  readonly label = input.required<string>({ alias: 'wtListColumn' });
  readonly query = input.required<ListQueryState>();
  readonly sortKey = input<string | null>(null);
  /** Undefined entries (a filter this viewer does not get) are skipped. */
  readonly filter = input<ListFilter | undefined>(undefined);
  readonly moreFilters = input<(ListFilter | undefined)[]>([]);
  readonly moreSorts = input<ListSortOption[]>([]);

  readonly menuFilters = computed(() =>
    [this.filter(), ...this.moreFilters()].filter((filter): filter is ListFilter => filter !== undefined));
  readonly isSorted = computed(() => this.sortKey() !== null && this.query().sort() === this.sortKey());
  readonly ariaSort = computed(() => {
    if (!this.isSorted()) return null;
    return this.query().order() === 'asc' ? 'ascending' : 'descending';
  });
}

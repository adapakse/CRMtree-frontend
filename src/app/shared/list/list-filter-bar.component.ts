import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ListFilterControlComponent } from './list-filter-control.component';
import { ListFilterMenuComponent } from './list-filter-menu.component';
import { ListFilter, ListQueryState, ListSortOption, ListSortOrder } from './list-query';

/**
 * The row of filters above a server-side list: text filters as inline
 * fields, the rest as buttons that open a popover, an optional sort choice
 * (for lists without sortable column headers), the number of active filters
 * and "clear filters". Extra toggles of the screen are projected into it.
 */
@Component({
  selector: 'wt-list-filter-bar',
  standalone: true,
  imports: [ListFilterControlComponent, ListFilterMenuComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'list'">
      @for (filter of filters(); track filter.id) {
        @if (filter.kind === 'text') {
          <wt-list-filter-control class="text-filter" [filter]="filter" [query]="query()" [showsPlaceholder]="true" />
        } @else {
          <wt-list-filter-menu [label]="filter.label" [filters]="[filter]" [query]="query()" />
        }
      }
      @if (sortOptions().length > 0) {
        <label class="sort">
          <span>{{ t('sort') }}</span>
          <select class="fsel" (change)="setSort($any($event.target).value)">
            <option value="" [selected]="query().sort() === null">{{ t('defaultSort') }}</option>
            @for (option of sortOptions(); track option.key) {
              <option [value]="option.key" [selected]="query().sort() === option.key">{{ option.label }}</option>
            }
          </select>
          <button type="button" class="order" [disabled]="query().sort() === null"
                  [title]="t(query().order() === 'asc' ? 'ascending' : 'descending')"
                  [attr.aria-label]="t(query().order() === 'asc' ? 'ascending' : 'descending')" (click)="flipOrder()">
            {{ query().order() === 'asc' ? '▲' : '▼' }}
          </button>
        </label>
      }
      <ng-content />
      @if (query().activeFilterCount() > 0) {
        <span class="active-count">{{ t('activeFilters', { count: query().activeFilterCount() }) }}</span>
        <button type="button" class="clear" (click)="query().clearFilters()">{{ t('clearFilters') }}</button>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
    .text-filter { width:170px; }
    .sort { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--gray-500); }
    .sort .fsel { width:auto; padding:5px 8px; font-size:12.5px; }
    .order { border:1.5px solid var(--gray-200); background:white; border-radius:8px; padding:5px 8px; font-size:10px; color:var(--gray-600); cursor:pointer; }
    .order:disabled { opacity:.4; cursor:default; }
    .active-count { font-size:12px; font-weight:600; color:var(--orange-dark); background:var(--orange-pale); border-radius:12px; padding:3px 10px; white-space:nowrap; }
    .clear { border:none; background:none; padding:0; font-size:12.5px; color:var(--accent-blue, #3B82F6); cursor:pointer; font-family:inherit; white-space:nowrap; }
  `],
})
export class ListFilterBarComponent {
  readonly filters = input.required<ListFilter[]>();
  readonly query = input.required<ListQueryState>();
  readonly sortOptions = input<ListSortOption[]>([]);

  setSort(key: string): void {
    this.query().setSort(key || null, this.query().order());
  }

  flipOrder(): void {
    const flipped: ListSortOrder = this.query().order() === 'asc' ? 'desc' : 'asc';
    this.query().setSort(this.query().sort(), flipped);
  }
}

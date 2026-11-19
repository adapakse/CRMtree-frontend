import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ListFilterControlComponent } from './list-filter-control.component';
import { ListFilterMenuComponent } from './list-filter-menu.component';
import { ListFilter, ListQueryState, ListSortOption, ListSortOrder } from './list-query';

/**
 * The filters above a server-side list: text filters as inline fields with
 * the screen's projected toggles and an optional sort choice (for lists
 * without sortable column headers) on top; below them every other filter as
 * a chip that opens a popover, the number of active filters and "clear
 * filters".
 */
@Component({
  selector: 'wt-list-filter-bar',
  standalone: true,
  imports: [ListFilterControlComponent, ListFilterMenuComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'list'">
      <div class="search-row">
        @for (filter of textFilters(); track filter.id) {
          <wt-list-filter-control class="text-filter" [filter]="filter" [query]="query()" [showsPlaceholder]="true" />
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
              <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
                @if (query().order() === 'asc') { <path d="M12 19V5M6 11l6-6 6 6"/> } @else { <path d="M12 5v14M6 13l6 6 6-6"/> }
              </svg>
            </button>
          </label>
        }
        <ng-content />
      </div>
      @if (menuFilters().length > 0 || query().activeFilterCount() > 0) {
        <div class="chip-row">
          @for (filter of menuFilters(); track filter.id) {
            <wt-list-filter-menu [label]="filter.label" [filters]="[filter]" [query]="query()" />
          }
          @if (query().activeFilterCount() > 0) {
            <span class="active-summary">
              <span class="active-count">{{ t('activeFilters', { count: query().activeFilterCount() }) }}</span>
              <button type="button" class="btn-reset" (click)="query().clearFilters()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>{{ t('clearFilters') }}</button>
            </span>
          }
        </div>
      }
    </ng-container>
  `,
  styles: [`
    /* The same white filter card as on Leads: fields and the sort order on top, one quiet chip per filter below. */
    :host { display:flex; flex-direction:column; gap:12px; padding:12px 16px; background:var(--surface); border-radius:var(--radius); box-shadow:var(--shadow-filter); }
    .search-row, .chip-row { display:flex; flex-wrap:wrap; align-items:center; min-width:0; }
    .search-row { gap:8px 12px; }
    /* What follows the fields (sort, the screen's toggles) keeps to the right edge of the card. */
    .text-filter + :not(.text-filter) { margin-left:auto; }
    .search-row:empty { display:none; }
    .chip-row { gap:6px; }
    .text-filter { width:260px; }
    .sort { display:inline-flex; align-items:center; gap:8px; font-size:12px; color:var(--gray-500); }
    .sort .fsel { width:auto; height:30px !important; min-height:30px !important; padding-top:0; padding-bottom:0; font-size:12px; border-radius:8px !important; }
    .order { display:inline-flex; align-items:center; justify-content:center; height:30px; width:30px; padding:0; border:1px solid var(--control-border); background:var(--control-bg); border-radius:8px; color:var(--gray-700); cursor:pointer; }
    .order:hover:not(:disabled) { border-color:var(--gray-300); }
    .order:disabled { opacity:.4; cursor:default; }
    .active-summary { display:inline-flex; align-items:center; gap:6px; margin-left:4px; }
    .active-count { font-size:12px; font-weight:600; color:var(--gray-600); white-space:nowrap; }
    .btn-reset { height:28px; }
    /* On a phone the typed filters take a full row each, like the fields of every other filter bar. */
    @media (max-width: 767px) {
      .text-filter { flex:1 1 100%; width:auto; min-width:0; }
      .text-filter + :not(.text-filter) { margin-left:0; }
    }
  `],
})
export class ListFilterBarComponent {
  readonly filters = input.required<ListFilter[]>();
  readonly query = input.required<ListQueryState>();
  readonly sortOptions = input<ListSortOption[]>([]);

  readonly textFilters = computed(() => this.filters().filter(filter => filter.kind === 'text'));
  readonly menuFilters = computed(() => this.filters().filter(filter => filter.kind !== 'text'));

  setSort(key: string): void {
    this.query().setSort(key || null, this.query().order());
  }

  flipOrder(): void {
    const flipped: ListSortOrder = this.query().order() === 'asc' ? 'desc' : 'asc';
    this.query().setSort(this.query().sort(), flipped);
  }
}

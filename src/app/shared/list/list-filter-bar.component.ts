import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ListFilterControlComponent } from './list-filter-control.component';
import { ListFilterMenuComponent } from './list-filter-menu.component';
import { ListFilter, ListQueryState, ListSortOption, ListSortOrder } from './list-query';

/**
 * The filters above a server-side list: text filters as inline fields with
 * the screen's projected toggles and an optional sort choice (for lists
 * without sortable column headers) on top; below them every other filter as
 * a pill that opens a popover, and "clear filters" with the number of
 * active filters.
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
        @if (query().activeFilterCount() > 0) {
          <button type="button" class="clear-filters narrow" [attr.aria-label]="t('clearFilters') + ', ' + t('activeFilters', { count: query().activeFilterCount() })"
                  (click)="query().clearFilters()">{{ t('clearFilter') }}<span class="count" aria-hidden="true">{{ query().activeFilterCount() }}</span></button>
        }
      </div>
      @if (menuFilters().length > 0 || query().activeFilterCount() > 0) {
        <div class="chip-row">
          @for (filter of menuFilters(); track filter.id) {
            <wt-list-filter-menu [label]="filter.label" [filters]="[filter]" [query]="query()" />
          }
          @if (query().activeFilterCount() > 0) {
            <button type="button" class="clear-filters wide" [attr.aria-label]="t('clearFilters') + ', ' + t('activeFilters', { count: query().activeFilterCount() })"
                    (click)="query().clearFilters()">{{ t('clearFilters') }}<span class="count" aria-hidden="true">{{ query().activeFilterCount() }}</span></button>
          }
        </div>
      }
    </ng-container>
  `,
  styles: [`
    /* The same white filter card as on Leads: fields and the sort order on top, one pill per filter below.
       Pills are filters; fields and actions keep rounded corners. Every control has the depth of a secondary button. */
    :host { display:flex; flex-direction:column; gap:12px; padding:12px 16px; background:var(--surface); border-radius:var(--radius); box-shadow:var(--shadow-filter);
            --bar-shadow:0 5px 14px rgba(0,0,0,.081); --bar-ring:0 0 0 3px rgba(59,170,93,.12);
            /* Brand green dark enough for AA text on white and on the pale green; light enough on the dark theme. */
            --bar-green-text:oklch(from var(--orange) max(min(l, 0.52), var(--text-min-l)) c h); }
    .search-row, .chip-row { display:flex; flex-wrap:wrap; align-items:center; min-width:0; }
    .search-row { gap:8px 12px; }
    /* What follows the fields (sort, the screen's toggles) keeps to the right edge of the card. */
    .text-filter + :not(.text-filter) { margin-left:auto; }
    .search-row:empty { display:none; }
    .chip-row { gap:8px; }
    .text-filter { width:260px; }
    .sort { display:inline-flex; align-items:center; gap:8px; font-size:12px; color:var(--gray-500); }
    .sort .fsel { width:auto; height:32px !important; min-height:32px !important; padding-top:0; padding-bottom:0; font-size:12px; border-radius:8px !important; box-shadow:var(--bar-shadow); transition:border-color .15s, box-shadow .15s; }
    .sort .fsel:hover { border-color:var(--orange); box-shadow:var(--bar-shadow), var(--bar-ring); }
    .order { display:inline-flex; align-items:center; justify-content:center; height:32px; width:32px; padding:0; border:1px solid var(--control-border); background:var(--control-bg); border-radius:8px; color:var(--gray-700); cursor:pointer; box-shadow:var(--bar-shadow); transition:border-color .15s, box-shadow .15s, color .15s; }
    .order:hover:not(:disabled) { border-color:var(--orange); color:var(--bar-green-text); box-shadow:var(--bar-shadow), var(--bar-ring); }
    .order:disabled { opacity:.4; cursor:default; }
    .clear-filters { display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 12px; border:none; border-radius:8px; background:none; font-family:inherit; font-size:12px; font-weight:600; color:var(--bar-green-text); white-space:nowrap; cursor:pointer; }
    .clear-filters:hover { background:var(--orange-pale); }
    .clear-filters .count { display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px; padding:0 6px; border-radius:10px; background:oklch(from var(--orange) min(l, 0.52) c h); color:var(--on-primary); font-size:12px; line-height:1; }
    .clear-filters.narrow { display:none; }
    /* On a phone the typed filters take a full row each and the pills stay on one row that scrolls sideways;
       the padding (taken back by the margin) leaves room for the pills' shadow, which the scrolling row would clip. */
    @media (max-width: 767px) {
      .text-filter { flex:1 1 100%; width:auto; min-width:0; }
      .text-filter + :not(.text-filter) { margin-left:0; }
      .chip-row { flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; margin:-6px -16px -12px; padding:6px 16px 12px; }
      .chip-row::-webkit-scrollbar { display:none; }
      .chip-row > * { flex:none; }
      .clear-filters.wide { display:none; }
      .clear-filters.narrow { display:inline-flex; margin-left:auto; }
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

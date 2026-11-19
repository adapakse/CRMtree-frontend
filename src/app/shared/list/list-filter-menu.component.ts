import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { ListFilterControlComponent } from './list-filter-control.component';
import { LocaleService } from '../../core/i18n/locale.service';
import { ListFilter, ListQueryState, ListSortOption } from './list-query';

const POPOVER_WIDTH_PX = 250;
const VIEWPORT_MARGIN_PX = 12;
const GAP_BELOW_TRIGGER_PX = 4;
const MULTI_VALUE_SEPARATOR = ',';

/** What a chosen filter shows on its chip: a single value, or the bounds of a range. */
export type PickedFilterValue = { text: string; from?: never; to?: never } | { text?: never; from: string; to: string };

/**
 * A button that opens filters in a small popover: a funnel icon in a column
 * header, or a labelled button in a filter bar. A column that shows more than
 * one value (the end date with its original date and shift) lists several
 * filters and the extra sort orders of those values.
 */
@Component({
  selector: 'wt-list-filter-menu',
  standalone: true,
  imports: [ListFilterControlComponent, TranslocoDirective, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'list'">
      <button type="button" class="trigger" [class.icon-only]="variant() === 'icon'" [class.active]="isActive()"
              [title]="t('filterBy', { name: label() })" [attr.aria-label]="t('filterBy', { name: label() })"
              [attr.aria-expanded]="isOpen()" (click)="toggle($event)">
        @if (variant() === 'labelled') {
          <span class="name">{{ label() }}</span>
          @if (pickedValue(); as picked) {
            <span class="picked">{{ picked.text ?? (picked.from && picked.to ? picked.from + '–' + picked.to : picked.from ? t('from') + ' ' + picked.from : t('to') + ' ' + picked.to) }}</span>
          }
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        } @else {
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 5h18l-7 8v6l-4-2v-4L3 5z"/>
          </svg>
        }
      </button>
      @if (isOpen()) {
        <div class="backdrop" (click)="close($event)"></div>
        <div class="popover" [style.top.px]="position().top" [style.left.px]="position().left" [style.width.px]="popoverWidthPx"
             (click)="$event.stopPropagation()" (keydown.escape)="isOpen.set(false)">
          @for (filter of filters(); track filter.id) {
            <div class="section">
              <div class="popover-title">{{ filter.label }}</div>
              <wt-list-filter-control [filter]="filter" [query]="query()" />
            </div>
          }
          @if (sortOptions().length > 0) {
            <div class="section">
              <div class="popover-title">{{ t('sort') }}</div>
              @for (option of sortOptions(); track option.key) {
                <button type="button" class="sort-option" [class.sorted]="query().sort() === option.key" (click)="query().toggleSort(option.key)">
                  {{ option.label }}
                  <span aria-hidden="true">{{ query().sort() === option.key ? (query().order() === 'asc' ? '▲' : '▼') : '↕' }}</span>
                </button>
              }
            </div>
          }
          <div class="popover-foot">
            <button type="button" class="clear" [disabled]="!hasActiveFilter()" (click)="clear()">{{ t('clearFilter') }}</button>
            <button type="button" class="btn btn-g btn-sm" (click)="isOpen.set(false)">{{ 'actions.close' | transloco }}</button>
          </div>
        </div>
      }
    </ng-container>
  `,
  styles: [`
    /* Brand green dark enough for AA text on white and on the pale green; light enough on the dark theme. */
    :host { display:inline-flex; max-width:100%; min-width:0; --green-text-aa:oklch(from var(--orange) max(min(l, 0.52), var(--text-min-l)) c h); }
    /* In a filter bar: a white pill with the depth and hover of a secondary button; a chosen filter turns green and shows what was picked. */
    .trigger { display:inline-flex; align-items:center; gap:2px; height:32px; max-width:100%; min-width:0; border:1px solid var(--control-border); background:var(--control-bg); border-radius:16px; padding:0 8px 0 12px; font-size:12px; font-weight:500; color:var(--gray-700); cursor:pointer; font-family:inherit; white-space:nowrap; box-shadow:0 5px 14px rgba(0,0,0,.081); transition:border-color .15s, box-shadow .15s, color .15s; }
    .trigger svg { width:12px; height:12px; flex-shrink:0; }
    .trigger:hover { border-color:var(--orange); color:var(--green-text-aa); box-shadow:0 5px 14px rgba(0,0,0,.081), 0 0 0 3px rgba(59,170,93,.12); }
    .trigger:hover .chevron { color:inherit; }
    .trigger:focus-visible { outline:none; border-color:var(--orange); box-shadow:0 5px 14px rgba(0,0,0,.081), var(--ring-field); }
    .trigger.active { border-color:var(--orange); color:var(--gray-900); background:var(--orange-pale); }
    .trigger.active .name::after { content:':'; }
    .picked { margin-left:2px; font-weight:600; overflow:hidden; text-overflow:ellipsis; max-width:180px; }
    .chevron { color:var(--gray-500); }
    .trigger.icon-only { height:auto; border:none; background:none; box-shadow:none; padding:2px 4px; border-radius:6px; color:var(--gray-400); }
    .trigger.icon-only:hover { color:var(--gray-700); background:var(--gray-200); }
    .trigger.icon-only.active { color:var(--orange-dark); background:var(--orange-pale); }
    .backdrop { position:fixed; inset:0; z-index:340; }
    /* Fixed, because the table wrapper clips anything that overflows it. */
    .popover { position:fixed; z-index:341; max-height:70vh; overflow-y:auto; background:var(--surface); border:1px solid var(--gray-200); border-radius:10px; box-shadow:var(--shadow-lg); padding:12px; display:flex; flex-direction:column; gap:12px; box-sizing:border-box; text-transform:none; letter-spacing:0; font-weight:400; white-space:normal; text-align:left; }
    .section { display:flex; flex-direction:column; gap:6px; }
    .popover-title { font-size:12px; font-weight:900; color:var(--gray-900); }
    .sort-option { display:flex; justify-content:space-between; gap:8px; border:1px solid var(--gray-200); background:var(--surface); border-radius:7px; padding:4px 8px; font-size:12px; color:var(--gray-700); cursor:pointer; font-family:inherit; }
    .sort-option.sorted { border-color:var(--orange); color:var(--orange-dark); background:var(--orange-pale); font-weight:600; }
    .popover-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .clear { border:none; background:none; padding:0; font-size:12px; font-weight:600; color:var(--green-text-aa); cursor:pointer; font-family:inherit; }
    .clear:disabled { color:var(--gray-300); cursor:default; }
  `],
})
export class ListFilterMenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dateFormatter = new Intl.DateTimeFormat(inject(LocaleService).activeLocale(), {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  });

  /** Names the button: the column or the filter it belongs to. */
  readonly label = input.required<string>();
  readonly filters = input.required<ListFilter[]>();
  readonly query = input.required<ListQueryState>();
  /** Sort orders offered inside the popover, for values that have no header of their own. */
  readonly sortOptions = input<ListSortOption[]>([]);
  readonly variant = input<'icon' | 'labelled'>('labelled');

  readonly popoverWidthPx = POPOVER_WIDTH_PX;
  readonly isOpen = signal(false);
  readonly position = signal({ top: 0, left: 0 });
  readonly hasActiveFilter = computed(() =>
    this.filters().some(filter => filter.params.some(param => this.query().value(param) !== '')));
  /** Only a filter bar chip of one filter shows its value; a column header keeps to its icon. */
  readonly pickedValue = computed<PickedFilterValue | null>(() => {
    const filters = this.filters();
    if (this.variant() !== 'labelled' || filters.length !== 1) return null;
    const filter = filters[0];
    const [lower, upper] = filter.params.map(param => this.query().value(param));
    switch (filter.kind) {
      case 'select':
        return lower ? { text: this.optionLabel(filter, lower) } : null;
      case 'multi': {
        const picked = lower ? lower.split(MULTI_VALUE_SEPARATOR) : [];
        if (picked.length === 0) return null;
        const first = this.optionLabel(filter, picked[0]);
        return { text: picked.length > 1 ? `${first} +${picked.length - 1}` : first };
      }
      case 'dateRange':
        return lower || upper ? { from: this.formatDate(lower), to: this.formatDate(upper) } : null;
      case 'numberRange':
        return lower || upper ? { from: lower, to: upper } : null;
      default:
        return lower ? { text: lower } : null;
    }
  });
  readonly isActive = computed(() =>
    this.hasActiveFilter() || this.sortOptions().some(option => option.key === this.query().sort()));

  toggle(event: Event): void {
    event.stopPropagation();
    if (this.isOpen()) {
      this.isOpen.set(false);
      return;
    }
    const trigger = this.host.nativeElement.getBoundingClientRect();
    const maxLeft = window.innerWidth - POPOVER_WIDTH_PX - VIEWPORT_MARGIN_PX;
    this.position.set({
      top: trigger.bottom + GAP_BELOW_TRIGGER_PX,
      left: Math.max(VIEWPORT_MARGIN_PX, Math.min(trigger.left, maxLeft)),
    });
    this.isOpen.set(true);
  }

  close(event: Event): void {
    event.stopPropagation();
    this.isOpen.set(false);
  }

  clear(): void {
    const params = this.filters().flatMap(filter => filter.params);
    this.query().setValues(Object.fromEntries(params.map(param => [param, ''])));
  }

  private optionLabel(filter: ListFilter, value: string): string {
    return filter.options?.find(option => option.value === value)?.label ?? value;
  }

  private formatDate(isoDate: string): string {
    if (!isoDate) return '';
    const date = new Date(`${isoDate}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? isoDate : this.dateFormatter.format(date);
  }
}

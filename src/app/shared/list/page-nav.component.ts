import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LIST_PAGE_SIZE } from './list-query';

type PageSlot = number | 'gap';

const NEIGHBOURS_EACH_SIDE = 2;

/**
 * Centered page numbers ("‹ 1 … 5 6 7 8 9 … 41 ›") with the record range below.
 * Clicking an ellipsis turns it into a field for typing a page number.
 * Renders nothing for an empty list; the numbers appear only when there is more than one page.
 */
@Component({
  selector: 'wt-page-nav',
  standalone: true,
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <ng-container *transloco="let t; prefix: 'list'">
        @if (pageCount() > 1) {
          <nav class="pages" [attr.aria-label]="t('pager.label')">
            <button type="button" class="step" [disabled]="page() <= 1"
              [title]="t('pager.previous')" [attr.aria-label]="t('pager.previous')" (click)="goTo(page() - 1)">‹</button>
            @for (slot of slots(); track $index) {
              @if (slot !== 'gap') {
                <button type="button" class="num" [class.current]="slot === page()"
                  [attr.aria-current]="slot === page() ? 'page' : null" (click)="goTo(slot)">{{ slot }}</button>
              } @else if (editedGapIndex() === $index) {
                <input #pageField class="jump" type="text" inputmode="numeric" maxlength="6"
                  [attr.aria-label]="t('pager.goTo')" [placeholder]="page()"
                  (keydown.enter)="jumpTo(pageField)" (keydown.escape)="editedGapIndex.set(null)" (blur)="jumpTo(pageField)" />
              } @else {
                <button type="button" class="gap" [title]="t('pager.goTo')" [attr.aria-label]="t('pager.goTo')"
                  (click)="editGap($index)">…</button>
              }
            }
            <button type="button" class="step" [disabled]="page() >= pageCount()"
              [title]="t('pager.next')" [attr.aria-label]="t('pager.next')" (click)="goTo(page() + 1)">›</button>
          </nav>
        }
        <span class="range">{{ t('pager.range', { from: firstItem(), to: lastItem(), total: total() }) }}</span>
      </ng-container>
    }
  `,
  styles: [`
    :host { display:flex; flex-direction:column; align-items:center; gap:6px; }
    .pages { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:2px; }
    .num, .step, .gap {
      min-width:32px; height:32px; padding:0 6px; border:0; border-radius:8px; background:none;
      font:inherit; font-size:14px; font-variant-numeric:tabular-nums; color:var(--gray-600); cursor:pointer;
    }
    .num:hover, .step:hover:not(:disabled), .gap:hover { background:var(--gray-100); color:var(--gray-800); }
    .num.current { background:var(--orange); color:#fff; font-weight:600; cursor:default; }
    .step { font-size:18px; line-height:1; }
    .step:disabled { color:var(--gray-300); cursor:default; }
    .num:focus-visible, .step:focus-visible, .gap:focus-visible, .jump:focus-visible { outline:2px solid var(--orange); outline-offset:2px; }
    .jump {
      width:56px; height:32px; padding:0 6px; font:inherit; font-size:14px; text-align:center;
      border:1px solid var(--control-border); border-radius:8px; background:var(--control-bg); color:inherit;
    }
    .range { font-size:12px; color:var(--gray-500); font-variant-numeric:tabular-nums; }
  `],
})
export class PageNavComponent {
  readonly page = input.required<number>();
  readonly total = input.required<number>();
  readonly pageSize = input(LIST_PAGE_SIZE);
  readonly pageChange = output<number>();

  /** Position (in `slots`) of the ellipsis currently replaced by the page field. */
  readonly editedGapIndex = signal<number | null>(null);
  private readonly pageField = viewChild<ElementRef<HTMLInputElement>>('pageField');

  constructor() {
    // The field exists only while an ellipsis is being edited; focus it as soon as it is rendered.
    effect(() => this.pageField()?.nativeElement.focus());
  }

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  // A page past the end (the list shrank meanwhile) reads "230–230 of 230" and still lets the user go back.
  readonly firstItem = computed(() => Math.min((this.page() - 1) * this.pageSize() + 1, this.total()));
  readonly lastItem = computed(() => Math.min(this.page() * this.pageSize(), this.total()));

  /** First and last page always, the current page with two neighbours each side, gaps in between. */
  readonly slots = computed<PageSlot[]>(() => {
    const last = this.pageCount();
    const current = Math.min(this.page(), last);
    const from = Math.max(2, current - NEIGHBOURS_EACH_SIDE);
    const to = Math.min(last - 1, current + NEIGHBOURS_EACH_SIDE);
    const slots: PageSlot[] = [1];
    if (from > 2) slots.push('gap');
    for (let page = from; page <= to; page++) slots.push(page);
    if (to < last - 1) slots.push('gap');
    if (last > 1) slots.push(last);
    return slots;
  });

  goTo(page: number): void {
    this.editedGapIndex.set(null);
    const target = Math.min(Math.max(1, page), this.pageCount());
    if (target !== this.page()) this.pageChange.emit(target);
  }

  editGap(index: number): void {
    this.editedGapIndex.set(index);
  }

  jumpTo(field: HTMLInputElement): void {
    const requested = Number(field.value);
    this.editedGapIndex.set(null);
    if (Number.isInteger(requested) && requested > 0) this.goTo(requested);
  }
}

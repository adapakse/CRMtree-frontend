import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LIST_PAGE_SIZE, ListQueryState } from './list-query';

/** "1–50 of 230" with previous / next page buttons; renders nothing for an empty list. */
@Component({
  selector: 'wt-list-pager',
  standalone: true,
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <ng-container *transloco="let t; prefix: 'list'">
        <span class="range">{{ t('pager.range', { from: firstItem(), to: lastItem(), total: total() }) }}</span>
        <button type="button" class="btn btn-g btn-sm" [disabled]="query().page() <= 1" (click)="goTo(query().page() - 1)">
          ← {{ t('pager.previous') }}
        </button>
        <button type="button" class="btn btn-g btn-sm" [disabled]="lastItem() >= total()" (click)="goTo(query().page() + 1)">
          {{ t('pager.next') }} →
        </button>
      </ng-container>
    }
  `,
  styles: [`
    :host { display:flex; align-items:center; justify-content:flex-end; gap:8px; }
    .range { font-size:12.5px; color:var(--gray-500); font-variant-numeric:tabular-nums; margin-right:4px; }
  `],
})
export class ListPagerComponent {
  readonly query = input.required<ListQueryState>();
  readonly total = input.required<number>();

  // A page past the end (the list shrank meanwhile) reads "230–230 of 230" and still lets the user go back.
  readonly firstItem = computed(() => Math.min((this.query().page() - 1) * LIST_PAGE_SIZE + 1, this.total()));
  readonly lastItem = computed(() => Math.min(this.query().page() * LIST_PAGE_SIZE, this.total()));

  goTo(page: number): void {
    this.query().page.set(page);
  }
}

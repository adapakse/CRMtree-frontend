import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ListFilter, ListQueryState } from './list-query';

const TYPING_DEBOUNCE_MS = 350;
const MULTI_VALUE_SEPARATOR = ',';

/**
 * The input(s) of one list filter, bound to the list's query state. Typed
 * values (text, numbers) reach the state only after the user pauses, so the
 * server is not asked on every keystroke.
 */
@Component({
  selector: 'wt-list-filter-control',
  standalone: true,
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'list'">
      @switch (filter().kind) {
        @case ('text') {
          <input class="fi" type="text" [attr.maxlength]="filter().maxLength ?? null"
                 [placeholder]="showsPlaceholder() ? filter().label : ''" [attr.aria-label]="filter().label"
                 [value]="query().value(lowerParam())" (input)="setAfterPause(lowerParam(), $any($event.target).value)">
        }
        @case ('select') {
          <select class="fsel" [attr.aria-label]="filter().label" (change)="query().setValue(lowerParam(), $any($event.target).value)">
            <option value="" [selected]="query().value(lowerParam()) === ''">{{ t('anyValue') }}</option>
            @for (option of filter().options ?? []; track option.value) {
              <option [value]="option.value" [selected]="query().value(lowerParam()) === option.value">{{ option.label }}</option>
            }
          </select>
        }
        @case ('multi') {
          <div class="options">
            @for (option of filter().options ?? []; track option.value) {
              <label class="option">
                <input type="checkbox" [checked]="pickedValues().includes(option.value)" (change)="toggleOption(option.value)">
                {{ option.label }}
              </label>
            } @empty {
              <span class="note">{{ t('noOptions') }}</span>
            }
          </div>
        }
        @case ('dateRange') {
          <label class="bound">
            <span>{{ t('from') }}</span>
            <input class="fi" type="date" [value]="query().value(lowerParam())"
                   (change)="query().setValue(lowerParam(), $any($event.target).value)">
          </label>
          <label class="bound">
            <span>{{ t('to') }}</span>
            <input class="fi" type="date" [value]="query().value(upperParam())"
                   (change)="query().setValue(upperParam(), $any($event.target).value)">
          </label>
        }
        @case ('numberRange') {
          <label class="bound">
            <span>{{ t('from') }}</span>
            <input class="fi" type="number" [attr.min]="filter().min ?? null" [attr.max]="filter().max ?? null" [value]="query().value(lowerParam())"
                   (input)="setNumberAfterPause(lowerParam(), $any($event.target).value)">
          </label>
          <label class="bound">
            <span>{{ t('to') }}</span>
            <input class="fi" type="number" [attr.min]="filter().min ?? null" [attr.max]="filter().max ?? null" [value]="query().value(upperParam())"
                   (input)="setNumberAfterPause(upperParam(), $any($event.target).value)">
          </label>
        }
      }
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .fi, .fsel { padding:6px 9px; font-size:12.5px; }
    .options { display:flex; flex-direction:column; gap:6px; max-height:260px; overflow-y:auto; }
    .option { display:flex; align-items:center; gap:7px; font-size:13px; color:var(--gray-700); cursor:pointer; text-transform:none; letter-spacing:0; font-weight:400; }
    .bound { display:grid; grid-template-columns:34px 1fr; align-items:center; gap:8px; font-size:12px; color:var(--gray-500); text-transform:none; letter-spacing:0; font-weight:400; }
    .note { font-size:12.5px; color:var(--gray-400); }
  `],
})
export class ListFilterControlComponent {
  readonly filter = input.required<ListFilter>();
  readonly query = input.required<ListQueryState>();
  /** For a text field shown without a visible label of its own. */
  readonly showsPlaceholder = input(false);

  readonly lowerParam = computed(() => this.filter().params[0]);
  readonly upperParam = computed(() => this.filter().params[1]);
  readonly pickedValues = computed(() => {
    const joined = this.query().value(this.lowerParam());
    return joined ? joined.split(MULTI_VALUE_SEPARATOR) : [];
  });

  private readonly pendingValues = new Map<string, { timer: ReturnType<typeof setTimeout>; value: string }>();

  constructor() {
    // A popover may close before the pause ends; what was typed must still be applied.
    inject(DestroyRef).onDestroy(() => {
      for (const [param, pending] of this.pendingValues) {
        clearTimeout(pending.timer);
        this.query().setValue(param, pending.value);
      }
    });
  }

  toggleOption(value: string): void {
    const picked = this.pickedValues();
    const next = picked.includes(value) ? picked.filter(item => item !== value) : [...picked, value];
    this.query().setValue(this.lowerParam(), next.join(MULTI_VALUE_SEPARATOR));
  }

  setAfterPause(param: string, rawValue: string): void {
    const value = rawValue.trim();
    clearTimeout(this.pendingValues.get(param)?.timer);
    const timer = setTimeout(() => {
      this.pendingValues.delete(param);
      this.query().setValue(param, value);
    }, TYPING_DEBOUNCE_MS);
    this.pendingValues.set(param, { timer, value });
  }

  // The server answers 400 to a number outside the allowed range, so such input is not sent at all.
  setNumberAfterPause(param: string, rawValue: string): void {
    const { min, max } = this.filter();
    const value = Number(rawValue);
    const isOutOfRange = rawValue !== '' && ((min !== undefined && value < min) || (max !== undefined && value > max));
    if (!isOutOfRange) this.setAfterPause(param, rawValue);
  }
}

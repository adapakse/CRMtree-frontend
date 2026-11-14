import { ChangeDetectionStrategy, Component } from '@angular/core';

/** White card with a soft shadow that holds a screen's filters, with even spacing. */
@Component({
  selector: 'wt-filter-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styles: [`
    :host {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
      padding: 12px 18px; margin-bottom: 16px;
      background: var(--surface); border-radius: 14px; box-shadow: var(--shadow-filter);
    }
  `],
})
export class FilterBarComponent {}

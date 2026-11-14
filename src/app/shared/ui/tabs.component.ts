import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface TabItem {
  key: string;
  /** Already translated by the caller. */
  label: string;
  count?: number;
}

/** Underline tabs (same look as the mobile app). Two-way binds the active key. */
@Component({
  selector: 'wt-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs" role="tablist">
      @for (tab of tabs(); track tab.key) {
        <button type="button" role="tab" class="tab" [class.active]="tab.key === active()"
                [attr.aria-selected]="tab.key === active()" (click)="active.set(tab.key)">
          {{ tab.label }}
          @if (tab.count !== undefined) { <span class="count">{{ tab.count }}</span> }
        </button>
      }
    </div>
  `,
  styles: [`
    .tabs { display: flex; border-bottom: 1px solid var(--gray-200); margin-bottom: 20px; }
    .tab {
      flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 12px; margin-bottom: -1px;
      background: none; border: none; border-bottom: 2.5px solid transparent;
      font: inherit; font-size: 12px; font-weight: 500; color: var(--gray-500); cursor: pointer;
      transition: color .15s, border-color .15s;
    }
    .tab:hover { color: var(--gray-800); }
    .tab.active { color: var(--orange-dark); font-weight: 600; border-bottom-color: var(--orange); }
    .count { background: var(--gray-100); color: var(--gray-500); border-radius: 999px; padding: 1px 8px; font-size: 12px; font-weight: 600; }
    .tab.active .count { background: rgba(59,170,93,.16); color: var(--orange-dark); }
  `],
})
export class TabsComponent {
  readonly tabs = input.required<TabItem[]>();
  readonly active = model.required<string>();
}

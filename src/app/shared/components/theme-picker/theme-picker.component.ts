import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ThemeMode, ThemeService } from '../../../core/services/theme.service';

interface ThemeOption {
  mode: ThemeMode;
  label: string;
}

/**
 * Light / dark choice with a small preview of the CRM in each theme (like claude.ai's
 * appearance settings). The previews use fixed colours on purpose: they must show both themes
 * whatever theme is active.
 */
@Component({
  selector: 'wt-theme-picker',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tp" role="radiogroup" [attr.aria-label]="ariaLabel()">
      @for (option of options(); track option.mode) {
        <button type="button" class="tp-option" role="radio"
                [class.on]="theme.mode() === option.mode" [attr.aria-checked]="theme.mode() === option.mode"
                (click)="theme.setMode(option.mode)">
          <span class="tp-preview" [class.light]="option.mode === 'light'" [class.dark]="option.mode === 'dark'">
            <ng-container *ngTemplateOutlet="mini" />
          </span>
          <span class="tp-label">
            <span class="tp-radio"></span>{{ option.label }}
          </span>
        </button>
      }
    </div>

    <ng-template #mini>
      <span class="m-app">
        <span class="m-side">
          <span class="m-logo"></span>
          <span class="m-item"></span><span class="m-item on"></span><span class="m-item"></span><span class="m-item"></span>
        </span>
        <span class="m-main">
          <span class="m-title"></span>
          <span class="m-kpis"><span class="m-card"><i></i></span><span class="m-card"><i></i></span><span class="m-card"><i></i></span></span>
          <span class="m-card m-wide"><span class="m-bar" style="width:70%"></span><span class="m-bar" style="width:35%"></span><span class="m-bar o" style="width:55%"></span></span>
        </span>
      </span>
    </ng-template>
  `,
  styles: [`
    .tp { display: grid; grid-template-columns: repeat(2, minmax(0, 260px)); gap: 16px; }
    @media (max-width: 640px) { .tp { grid-template-columns: 1fr; } }
    .tp-option {
      display: flex; flex-direction: column; gap: 10px; padding: 0; border: none; background: none;
      font-family: inherit; text-align: left; cursor: pointer;
    }
    .tp-preview {
      display: flex; height: 110px; border-radius: 12px; overflow: hidden;
      border: 1px solid var(--gray-200); box-shadow: var(--shadow-sm); transition: border-color .15s, box-shadow .15s;
    }
    .tp-option:hover .tp-preview { border-color: var(--gray-300); }
    .tp-option.on .tp-preview { border-color: var(--orange); box-shadow: 0 0 0 3px var(--orange-pale); }
    .tp-option:focus-visible { outline: none; }
    .tp-option:focus-visible .tp-preview { box-shadow: 0 0 0 3px var(--orange-muted); }
    .tp-label { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: var(--gray-800); }
    .tp-radio { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--gray-300); flex-shrink: 0; transition: border .15s; }
    .tp-option.on .tp-radio { border: 5px solid var(--orange); }

    /* Mini CRM — fixed colours per preview theme */
    .light { --m-frame: #EEEEF0; --m-page: #F8F9FB; --m-card: #FFFFFF; --m-line: #E4E4E7; --m-ink: #D4D4D8; --m-on: #FFFFFF; --m-shadow: 0 2px 5px rgba(0,0,0,.07); }
    .dark  { --m-frame: #202124; --m-page: #27282C; --m-card: #313237; --m-line: #45464C; --m-ink: #55565C; --m-on: rgba(255,255,255,.1); --m-shadow: none; }
    .m-app { display: flex; flex: 1; background: var(--m-frame); }
    .m-side { width: 28%; padding: 8px 6px; display: flex; flex-direction: column; gap: 4px; }
    .m-logo { height: 8px; width: 60%; border-radius: 4px; background: #3BAA5D; margin: 0 0 4px 4px; }
    .m-item { height: 6px; border-radius: 4px; background: var(--m-ink); margin: 0 4px; opacity: .8; }
    .m-item.on { height: 10px; margin: 0; background: var(--m-on); border-radius: 4px; position: relative; opacity: 1; }
    .m-item.on::before { content: ''; position: absolute; left: 4px; top: 4px; width: 4px; height: 2px; border-radius: 2px; background: #46B467; }
    .m-main { flex: 1; background: var(--m-page); border-radius: 10px 0 0 10px; padding: 8px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .m-title { height: 8px; width: 45%; border-radius: 4px; background: var(--m-ink); }
    .m-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .m-card { background: var(--m-card); border-radius: 6px; box-shadow: var(--m-shadow); height: 22px; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
    .m-card i { display: block; height: 4px; width: 60%; border-radius: 2px; background: var(--m-ink); }
    .m-wide { flex: 1; height: auto; }
    .m-bar { display: block; height: 4px; border-radius: 2px; background: var(--m-line); }
    .m-bar.o { background: #46B467; }
  `],
})
export class ThemePickerComponent {
  readonly theme = inject(ThemeService);
  readonly ariaLabel = input('Motyw');
  readonly options = input<ThemeOption[]>([
    { mode: 'light', label: 'Jasny' },
    { mode: 'dark', label: 'Ciemny' },
  ]);
}

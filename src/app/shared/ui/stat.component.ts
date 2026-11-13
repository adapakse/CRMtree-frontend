import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatTone = 'default' | 'green' | 'amber' | 'red';

/** A number with a small caption above it. */
@Component({
  selector: 'wt-stat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="label"><ng-content select="[icon]" />{{ label() }}</div>
    <div class="value" [attr.data-tone]="tone()">{{ value() }}</div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 6px; padding: 14px 18px; background: var(--surface); border-radius: 12px; box-shadow: var(--shadow-sm); }
    .label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: var(--gray-400); }
    .value { font-family: 'Sora', sans-serif; font-size: 24px; font-weight: 600; line-height: 1.15; letter-spacing: -.01em; color: var(--gray-900); font-variant-numeric: tabular-nums; }
    .value[data-tone='green'] { color: var(--orange-dark); }
    .value[data-tone='amber'] { color: color-mix(in srgb, #b7791f var(--tint-text-mix), #FFFFFF); }
    .value[data-tone='red'] { color: color-mix(in srgb, #dc2626 var(--tint-text-mix), #FFFFFF); }
  `],
})
export class StatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly tone = input<StatTone>('default');
}

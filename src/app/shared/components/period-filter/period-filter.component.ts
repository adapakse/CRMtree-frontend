import {
  Component, Input, Output, EventEmitter, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getPresetDates, PeriodDates } from '../../utils/period-dates';

export interface PeriodChangeEvent extends PeriodDates {
  preset: string;
}

@Component({
  selector: 'period-filter',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">

  <select [ngStyle]="selStyle" [(ngModel)]="preset" (ngModelChange)="onPresetChange($event)">
    <optgroup label="Bieżące">
      <option value="cm"   style="color:#374151">Bieżący miesiąc</option>
      <option value="cq"   style="color:#374151">Bieżący kwartał</option>
      <option value="ytd"  style="color:#374151">Bieżący rok (YTD {{ year }})</option>
    </optgroup>
    <optgroup label="Poprzednie">
      <option value="prev_1m"   style="color:#374151">Poprzedni miesiąc</option>
      <option value="prev_q"    style="color:#374151">Poprzedni kwartał</option>
      <option value="prev_year" style="color:#374151">Poprzedni rok ({{ year - 1 }})</option>
    </optgroup>
    <optgroup label="Własny">
      <option value="custom" style="color:#374151">Własny przedział…</option>
    </optgroup>
  </select>

  <ng-container *ngIf="preset === 'custom'">
    <input type="date" [ngStyle]="inputStyle"
           [(ngModel)]="customFrom" (ngModelChange)="onCustomChange()" />
    <span [style.color]="variant === 'inverted' ? 'rgba(255,255,255,.6)' : '#71717a'"
          style="font-size:11px">–</span>
    <input type="date" [ngStyle]="inputStyle"
           [(ngModel)]="customTo" (ngModelChange)="onCustomChange()" />
  </ng-container>

</div>
  `,
})
export class PeriodFilterComponent {
  @Input() preset = 'cq';
  @Input() variant: 'default' | 'inverted' = 'default';
  @Output() periodChange = new EventEmitter<PeriodChangeEvent>();

  customFrom = '';
  customTo   = '';
  readonly year = new Date().getFullYear();

  get selStyle(): Record<string, string> {
    if (this.variant === 'inverted') {
      return {
        background:      'rgba(59,170,93,.2)',
        border:          '1px solid rgba(59,170,93,.35)',
        'border-radius': '6px',
        color:           'white',
        'font-size':     '10px',
        padding:         '2px 5px',
        cursor:          'pointer',
        outline:         'none',
        'max-width':     '140px',
      };
    }
    return {
      border:          '1px solid #d1d5db',
      'border-radius': '6px',
      padding:         '5px 8px',
      'font-size':     '12px',
      color:           '#374151',
      background:      'white',
      cursor:          'pointer',
      outline:         'none',
    };
  }

  get inputStyle(): Record<string, string> {
    if (this.variant === 'inverted') {
      return {
        background:      'rgba(59,170,93,.2)',
        border:          '1px solid rgba(59,170,93,.35)',
        'border-radius': '6px',
        color:           'white',
        'font-size':     '10px',
        padding:         '2px 4px',
        outline:         'none',
        width:           '108px',
      };
    }
    return {
      border:          '1px solid #d1d5db',
      'border-radius': '6px',
      padding:         '5px 6px',
      'font-size':     '12px',
      color:           '#374151',
      background:      'white',
      outline:         'none',
      width:           '120px',
    };
  }

  onPresetChange(preset: string): void {
    if (preset !== 'custom') {
      this.emit(preset);
    } else if (this.customFrom && this.customTo) {
      this.emitCustom();
    }
  }

  onCustomChange(): void {
    if (this.customFrom && this.customTo && this.customFrom <= this.customTo) {
      this.emitCustom();
    }
  }

  private emit(preset: string): void {
    this.periodChange.emit({ preset, ...getPresetDates(preset) });
  }

  private emitCustom(): void {
    this.periodChange.emit({
      preset:    'custom',
      from:      this.customFrom,
      to:        this.customTo,
      periodEnd: this.customTo,
    });
  }
}

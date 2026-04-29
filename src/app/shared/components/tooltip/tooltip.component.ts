import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { AppSettingsService } from '../../../core/services/app-settings.service';

@Component({
  selector: 'wt-tooltip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text()) {
      <span class="tt-wrap" (mouseenter)="onEnter($event)">
        <span class="tt-icon">?</span>
        <span class="tt-pop" [class.tt-below]="below()">{{ text() }}</span>
      </span>
    }
  `,
  styles: [`
    :host { display:inline-flex; align-items:center; vertical-align:middle; }
    .tt-wrap { position:relative; display:inline-flex; align-items:center; }
    .tt-icon {
      display:inline-flex; align-items:center; justify-content:center;
      width:15px; height:15px; border-radius:50%;
      background:#e5e7eb; color:#9ca3af;
      font-size:9px; font-weight:800; font-family:sans-serif;
      cursor:default; margin-left:5px; flex-shrink:0; line-height:1;
      transition:background .15s, color .15s; user-select:none;
    }
    .tt-wrap:hover .tt-icon { background:#d1d5db; color:#374151; }
    .tt-pop {
      display:none; position:absolute; z-index:9999;
      bottom:calc(100% + 8px); top:auto; left:50%; transform:translateX(-50%);
      background:#1f2937; color:#f9fafb;
      font-size:12px; font-weight:400; line-height:1.6;
      padding:10px 14px; border-radius:8px;
      width:260px; white-space:normal;
      box-shadow:0 4px 16px rgba(0,0,0,.25);
      pointer-events:none;
    }
    .tt-pop::after {
      content:''; position:absolute; top:100%; bottom:auto; left:50%; transform:translateX(-50%);
      border:6px solid transparent; border-top-color:#1f2937;
    }
    .tt-pop.tt-below {
      bottom:auto; top:calc(100% + 8px);
    }
    .tt-pop.tt-below::after {
      top:auto; bottom:100%;
      border-top-color:transparent; border-bottom-color:#1f2937;
    }
    .tt-wrap:hover .tt-pop { display:block; }
  `],
})
export class TooltipComponent {
  readonly key = input.required<string>();

  private settings = inject(AppSettingsService);

  protected below = signal(false);

  protected readonly text = computed(() => {
    const k = this.key();
    const entry = this.settings.meta().find(m => m.key === k && m.category === 'tooltip');
    return entry?.value?.trim() || null;
  });

  protected onEnter(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    // Show below when there's not enough room above (topbar 60px + tooltip ~120px + gap 8px)
    this.below.set(rect.top < 160);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { AppSettingsService } from '../../../core/services/app-settings.service';

@Component({
  selector: 'wt-tooltip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text()) {
      <span class="tt-wrap" (mouseenter)="onEnter($event)" (mouseleave)="visible.set(false)">
        <span class="tt-icon">?</span>
        @if (visible()) {
          <span class="tt-pop" [class.tt-below]="pos().below"
                [style.top.px]="pos().top"
                [style.left.px]="pos().left">
            {{ text() }}
            <span class="tt-arr" [class.tt-arr-below]="pos().below" [style.left.px]="pos().arrowLeft"></span>
          </span>
        }
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

    /* Popup — fixed so it's never clipped by overflow:hidden ancestors */
    .tt-pop {
      position:fixed; z-index:10000;
      transform:translateY(calc(-100% - 8px));
      background:#1f2937; color:#f9fafb;
      font-size:12px; font-weight:400; line-height:1.6;
      padding:10px 14px; border-radius:8px;
      width:260px; white-space:normal;
      box-shadow:0 4px 16px rgba(0,0,0,.25);
      pointer-events:none;
    }
    .tt-pop.tt-below {
      transform:translateY(8px);
    }

    /* Arrow — separate element so left can be set dynamically */
    .tt-arr {
      position:absolute; width:0; height:0;
      top:100%; transform:translateX(-50%);
      border:6px solid transparent;
      border-top-color:#1f2937;
    }
    .tt-arr.tt-arr-below {
      top:auto; bottom:100%;
      border-top-color:transparent;
      border-bottom-color:#1f2937;
    }
  `],
})
export class TooltipComponent {
  readonly key = input.required<string>();

  private settings = inject(AppSettingsService);

  protected visible = signal(false);
  protected pos = signal<{ top: number; left: number; below: boolean; arrowLeft: number }>({
    top: 0, left: 0, below: false, arrowLeft: 130,
  });

  protected readonly text = computed(() => {
    const k = this.key();
    const entry = this.settings.meta().find(m => m.key === k && m.category === 'tooltip');
    return entry?.value?.trim() || null;
  });

  protected onEnter(event: MouseEvent): void {
    const wrap = event.currentTarget as HTMLElement;
    const rect = wrap.getBoundingClientRect();
    const W = 260;
    const gap = 8;

    const iconCenterX = rect.left + rect.width / 2;

    // Center tooltip on icon, clamp to viewport with 8px margin
    let left = iconCenterX - W / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - W - 8));

    // Arrow points at icon regardless of horizontal shift
    const arrowLeft = Math.max(14, Math.min(iconCenterX - left, W - 14));

    // Show below when there's not enough room above (need ~160px + gap)
    const below = rect.top < 168;
    const top = below ? rect.bottom : rect.top;

    this.pos.set({ top, left, below, arrowLeft });
    this.visible.set(true);
  }
}

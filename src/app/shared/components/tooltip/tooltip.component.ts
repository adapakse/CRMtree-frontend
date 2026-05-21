import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, input } from '@angular/core';
import { AppSettingsService } from '../../../core/services/app-settings.service';

@Component({
  selector: 'wt-tooltip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text()) {
      <span class="tt-wrap" (mouseenter)="show($event)" (mouseleave)="hide()">
        <span class="tt-icon">?</span>
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
  `],
})
export class TooltipComponent implements OnDestroy {
  readonly key = input.required<string>();

  private settings = inject(AppSettingsService);
  private popEl: HTMLDivElement | null = null;

  protected readonly text = computed(() => {
    const k = this.key();
    const entry = this.settings.meta().find(m => m.key === k && m.category === 'tooltip');
    return entry?.value?.trim() || null;
  });

  show(event: MouseEvent): void {
    const txt = this.text();
    if (!txt) return;

    this.hide();

    const wrap = event.currentTarget as HTMLElement;
    const rect = wrap.getBoundingClientRect();
    const W = 260;

    const iconCenterX = rect.left + rect.width / 2;
    let left = iconCenterX - W / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
    const arrowLeft = Math.max(14, Math.min(iconCenterX - left, W - 14));
    const below = rect.top < 168;
    const top = below ? rect.bottom + 8 : rect.top - 8;

    const pop = document.createElement('div');
    pop.textContent = txt;
    pop.style.cssText = [
      'position:fixed',
      `z-index:10000`,
      `top:${top}px`,
      `left:${left}px`,
      below ? '' : 'transform:translateY(-100%)',
      'background:#1f2937',
      'color:#f9fafb',
      'font-size:12px',
      'font-weight:400',
      'line-height:1.6',
      'padding:10px 14px',
      'border-radius:8px',
      `width:${W}px`,
      'white-space:normal',
      'box-shadow:0 4px 16px rgba(0,0,0,.25)',
      'pointer-events:none',
    ].filter(Boolean).join(';');

    // Arrow
    const arr = document.createElement('span');
    arr.style.cssText = [
      'position:absolute',
      'width:0',
      'height:0',
      below
        ? 'bottom:100%;border:6px solid transparent;border-bottom-color:#1f2937'
        : 'top:100%;border:6px solid transparent;border-top-color:#1f2937',
      `left:${arrowLeft}px`,
      'transform:translateX(-50%)',
    ].join(';');
    pop.appendChild(arr);

    document.body.appendChild(pop);
    this.popEl = pop;
  }

  hide(): void {
    if (this.popEl) {
      this.popEl.remove();
      this.popEl = null;
    }
  }

  ngOnDestroy(): void {
    this.hide();
  }
}

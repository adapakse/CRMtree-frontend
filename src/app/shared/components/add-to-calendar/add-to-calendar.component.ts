import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { CalendarEntry, downloadIcs, googleCalendarUrl, outlookCalendarUrl } from '../../utils/calendar-export.util';

const MENU_WIDTH_PX = 200;
// Three items of ~33px plus padding; used only to decide whether the menu fits below the button.
const MENU_HEIGHT_PX = 112;
const MENU_GAP_PX = 4;

/**
 * "Add to calendar" button for any task: opens a small menu with Google
 * Calendar, Outlook and an .ics file. Renders nothing when the task has no
 * date (entry = null).
 */
@Component({
  selector: 'wt-add-to-calendar',
  standalone: true,
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entry(); as calendarEntry) {
      <ng-container *transloco="let t; prefix: 'addToCalendar'">
      <button type="button" class="trigger" [class.labelled]="showLabel()" [title]="t('title')"
              (click)="toggleMenu($event)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="13" x2="12" y2="18"/><line x1="9.5" y1="15.5" x2="14.5" y2="15.5"/>
        </svg>
        @if (showLabel()) { <span>{{ t('title') }}</span> }
      </button>
      @if (isMenuOpen()) {
        <div class="menu" [style.left.px]="menuPosition().left" [style.top.px]="menuPosition().top"
             (click)="$event.stopPropagation()">
          <a [href]="googleUrl()" target="_blank" rel="noopener" (click)="isMenuOpen.set(false)">{{ t('google') }}</a>
          <a [href]="outlookUrl()" target="_blank" rel="noopener" (click)="isMenuOpen.set(false)">{{ t('outlook') }}</a>
          <button type="button" (click)="download(calendarEntry)">{{ t('icsFile') }}</button>
        </div>
      }
      </ng-container>
    }
  `,
  styles: [`
    :host { position:relative; display:inline-flex; }
    .trigger { display:inline-flex; align-items:center; gap:6px; border:1px solid #e5e7eb; background:white; border-radius:7px; padding:4px 6px; cursor:pointer; color:#6b7280; font-family:inherit; font-size:12px; }
    .trigger:hover { color:#2F8F4D; border-color:#A8D9B6; }
    .trigger.labelled { padding:6px 10px; }
    .trigger svg { width:15px; height:15px; }
    .menu { position:fixed; z-index:1000; width:200px; background:white; border:1px solid #e5e7eb; border-radius:9px; box-shadow:0 8px 24px rgba(0,0,0,.12); padding:4px; display:flex; flex-direction:column; }
    .menu a, .menu button { text-align:left; padding:7px 10px; border:none; background:none; border-radius:6px; font-size:12.5px; color:#111827; text-decoration:none; cursor:pointer; font-family:inherit; }
    .menu a:hover, .menu button:hover { background:#f3f4f6; }
  `],
})
export class AddToCalendarComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly entry = input.required<CalendarEntry | null>();
  readonly showLabel = input(false);

  readonly isMenuOpen = signal(false);
  readonly menuPosition = signal({ left: 0, top: 0 });
  readonly googleUrl = computed(() => { const entry = this.entry(); return entry ? googleCalendarUrl(entry) : ''; });
  readonly outlookUrl = computed(() => { const entry = this.entry(); return entry ? outlookCalendarUrl(entry) : ''; });

  toggleMenu(event: Event): void {
    // The button often sits inside a clickable row or link; neither must react.
    event.stopPropagation();
    event.preventDefault();
    if (!this.isMenuOpen()) this.menuPosition.set(this.computeMenuPosition());
    this.isMenuOpen.update(isOpen => !isOpen);
  }

  private computeMenuPosition(): { left: number; top: number } {
    const button = this.host.nativeElement.getBoundingClientRect();
    const hasRoomBelow = button.bottom + MENU_GAP_PX + MENU_HEIGHT_PX <= window.innerHeight;
    return {
      left: Math.max(MENU_GAP_PX, Math.min(button.right - MENU_WIDTH_PX, window.innerWidth - MENU_WIDTH_PX - MENU_GAP_PX)),
      top: hasRoomBelow ? button.bottom + MENU_GAP_PX : button.top - MENU_GAP_PX - MENU_HEIGHT_PX,
    };
  }

  // A fixed-position menu would stay behind while the page scrolls under it.
  @HostListener('window:scroll')
  @HostListener('window:resize')
  closeOnViewportChange(): void {
    this.isMenuOpen.set(false);
  }

  download(entry: CalendarEntry): void {
    downloadIcs(entry);
    this.isMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: Event): void {
    if (this.isMenuOpen() && !this.host.nativeElement.contains(event.target as Node)) this.isMenuOpen.set(false);
  }
}

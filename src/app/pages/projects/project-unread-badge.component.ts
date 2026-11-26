import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/**
 * The number of unread chat messages; renders nothing when there are none.
 * Where the number stands among other facts (a project card, a task row) the
 * chat bubble says what is being counted; on the chat tab it would repeat the tab.
 */
@Component({
  selector: 'wt-project-unread-badge',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (count() > 0) {
        <span class="unread" [class.with-icon]="showsIcon()" [title]="t('chat.unreadCount', { count: count() })"
              role="img" [attr.aria-label]="t('chat.unreadCount', { count: count() })">
          @if (showsIcon()) {
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          }
          {{ count() }}
        </span>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:inline-flex; flex-shrink:0; vertical-align:middle; }
    .unread {
      display:inline-flex; align-items:center; justify-content:center; gap:4px;
      min-width:20px; height:20px; padding:0 6px; border-radius:999px;
      background:var(--count-badge-bg); color:var(--count-badge-text);
      border:1px solid var(--count-badge-border); box-sizing:border-box;
      font-size:12px; font-weight:600; line-height:1; font-variant-numeric:tabular-nums;
    }
    .unread.with-icon { padding:0 8px 0 6px; }
    .unread svg { width:12px; height:12px; }
  `],
})
export class ProjectUnreadBadgeComponent {
  readonly count = input.required<number>();
  readonly showsIcon = input(false);
}

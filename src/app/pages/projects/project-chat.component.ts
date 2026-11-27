import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, inject, input, signal, viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ProjectMessage, ProjectsApiService } from '../../core/services/projects-api.service';
import { ProjectUnreadService } from '../../core/services/project-unread.service';
import { localizedApiErrorMessage } from '../../core/services/api-error.util';

// The backend has no push channel, so an open thread is refreshed by polling.
const POLL_INTERVAL_MS = 20_000;
const MAX_MESSAGE_LENGTH = 4000;

/** Chat thread of a project (taskId = null) or of a single task. */
@Component({
  selector: 'wt-project-chat',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div class="thread" #thread>
        @for (message of messages(); track message.id) {
          <div class="message" [class.own]="message.author_id === currentUserId">
            <div class="meta">
              <strong>{{ message.author_name ?? t('chat.deletedUser') }}</strong>
              <span>{{ message.created_at | date:'dd.MM.yyyy HH:mm' }}</span>
              @if (message.author_id === currentUserId) {
                <span class="receipt" [class.by-all]="message.is_read_by_all" role="img"
                      [title]="receiptLabel(message)" [attr.aria-label]="receiptLabel(message)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    @if (hasReaders(message)) {
                      <path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>
                    } @else {
                      <path d="M20 6 9 17l-5-5"/>
                    }
                  </svg>
                </span>
              }
            </div>
            <div class="body">{{ message.body }}</div>
          </div>
        } @empty {
          <div class="empty">{{ isLoading() ? ('states.loading' | transloco) : t('chat.empty') }}</div>
        }
      </div>

      @if (canPost()) {
        <div class="composer">
          <textarea class="fta" rows="2" [(ngModel)]="draft" [maxlength]="maxLength" [placeholder]="t('chat.placeholder')"
                    (keydown.enter)="sendOnEnter($event)" [class.fi-err]="isEmptySubmitted && !draft.trim()"></textarea>
          <button class="btn btn-p btn-sm" [disabled]="isSending()" (click)="send()">{{ t('chat.send') }}</button>
        </div>
        @if (isEmptySubmitted && !draft.trim()) { <span class="ferr" role="alert">{{ t('chat.errors.empty') }}</span> }
        <div class="hint">{{ t('chat.hint') }}</div>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:8px; flex-shrink:0; }
    .thread { display:flex; flex-direction:column; gap:8px; overflow-y:auto; max-height:420px; padding:4px 2px; flex-shrink:0; }
    .message { flex-shrink:0; }
    .message { align-self:flex-start; max-width:80%; background:var(--gray-100); border-radius:10px; padding:8px 12px; }
    .message.own { align-self:flex-end; background:var(--orange-pale); }
    .meta { display:flex; gap:8px; font-size:12px; color:var(--gray-500); margin-bottom:2px; }
    .meta strong { color:var(--gray-700); }
    .receipt { display:inline-flex; align-items:center; margin-left:auto; color:var(--gray-500); }
    .receipt.by-all { color:var(--orange-text); }
    .receipt svg { width:16px; height:16px; }
    .body { font-size:14px; color:var(--gray-800); white-space:pre-wrap; overflow-wrap:anywhere; }
    .empty { font-size:14px; color:var(--gray-400); padding:12px 0; }
    .composer { display:flex; gap:8px; align-items:flex-end; margin-top:8px; }
    .composer textarea { min-height:44px; }
    .hint { font-size:12px; color:var(--gray-400); }
  `],
})
export class ProjectChatComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly unread = inject(ProjectUnreadService);

  readonly projectId = input.required<string>();
  readonly taskId = input<string | null>(null);
  readonly canPost = input(true);

  readonly messages = signal<ProjectMessage[]>([]);
  readonly isLoading = signal(true);
  readonly isSending = signal(false);
  readonly maxLength = MAX_MESSAGE_LENGTH;
  readonly currentUserId = this.auth.user()?.id;
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');

  draft = '';
  private lastReadMessageId: string | null = null;

  ngOnInit(): void {
    this.loadMessages();
    const timer = setInterval(() => this.loadMessages(), POLL_INTERVAL_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  isEmptySubmitted = false;

  hasReaders(message: ProjectMessage): boolean {
    return (message.read_by?.length ?? 0) > 0;
  }

  /** One tick: sent. Two ticks: somebody has read it; in colour once everyone has. */
  receiptLabel(message: ProjectMessage): string {
    if (!this.hasReaders(message)) return this.transloco.translate('projects.chat.read.sent');
    const names = message.read_by!
      .map(reader => reader.display_name ?? this.transloco.translate('projects.chat.deletedUser'))
      .join(', ');
    return this.transloco.translate(
      message.is_read_by_all ? 'projects.chat.read.readByAll' : 'projects.chat.read.readBy', { names },
    );
  }

  sendOnEnter(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) return;
    event.preventDefault();
    this.send();
  }

  send(): void {
    const body = this.draft.trim();
    if (this.isSending()) return;
    if (!body) {
      this.isEmptySubmitted = true;
      return;
    }
    this.isEmptySubmitted = false;
    this.isSending.set(true);
    this.api.postMessage(this.projectId(), this.taskId(), body).subscribe({
      next: message => {
        this.draft = '';
        this.isSending.set(false);
        this.messages.update(messages => [...messages, message]);
        // The server counts the thread as read by its author up to this message.
        this.lastReadMessageId = message.id;
        this.scrollToNewest();
      },
      error: err => {
        this.isSending.set(false);
        this.toast.error(localizedApiErrorMessage(err?.error?.error, this.transloco) ?? this.transloco.translate('projects.chat.sendFailed'));
      },
    });
  }

  private loadMessages(): void {
    this.api.listMessages(this.projectId(), this.taskId()).subscribe({
      next: messages => {
        const hasNewMessages = messages.length !== this.messages().length;
        this.messages.set(messages);
        this.isLoading.set(false);
        if (hasNewMessages) this.scrollToNewest();
        this.markShownMessagesRead(messages);
      },
      // A failed background refresh is not worth a toast every 20 seconds.
      error: () => this.isLoading.set(false),
    });
  }

  // An open thread on a visible page counts as read up to its newest message.
  private markShownMessagesRead(messages: ProjectMessage[]): void {
    const newest = messages.at(-1);
    if (!newest || newest.id === this.lastReadMessageId || document.visibilityState !== 'visible') return;
    this.api.markMessagesRead(this.projectId(), this.taskId(), newest.id).subscribe({
      next: () => {
        this.lastReadMessageId = newest.id;
        this.unread.refresh();
      },
      // Not marked: the next refresh of the thread tries again.
      error: () => undefined,
    });
  }

  private scrollToNewest(): void {
    // Deferred so the new message is rendered before measuring the scroll height.
    setTimeout(() => {
      const element = this.thread()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}

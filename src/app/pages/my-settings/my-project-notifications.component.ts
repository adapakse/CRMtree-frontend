import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { ProjectsApiService } from '../../core/services/projects-api.service';
import { ToastService } from '../../core/services/toast.service';

/** The user's own switch for e-mails about project deadlines. */
@Component({
  selector: 'wt-my-project-notifications',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('account')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card block" *transloco="let t; prefix: 'account'">
      <h2>{{ t('mySettings.projectDeadlines.title') }}</h2>
      <label class="switch">
        <input type="checkbox" [checked]="isEnabled()" [disabled]="isSaving()" (change)="toggle()">
        {{ t('mySettings.projectDeadlines.toggle') }}
      </label>
      <p class="hint">{{ t('mySettings.projectDeadlines.hint') }}</p>
    </div>
  `,
  styles: [`
    .block { padding:24px; display:flex; flex-direction:column; gap:10px; }
    h2 { font-family:'Sora',sans-serif; font-size:15px; font-weight:700; color:#18181b; margin:0; }
    .switch { display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; color:#27272a; cursor:pointer; }
    .hint { margin:0; font-size:12.5px; color:#6b7280; line-height:1.5; }
  `],
})
export class MyProjectNotificationsComponent {
  private readonly api = inject(ProjectsApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  // The e-mails are on for everyone who never touched the switch.
  readonly isEnabled = signal(this.auth.user()?.project_deadline_notifications_enabled !== false);
  readonly isSaving = signal(false);

  toggle(): void {
    const requested = !this.isEnabled();
    this.isEnabled.set(requested);
    this.isSaving.set(true);
    this.api.setDeadlineNotificationsEnabled(requested).subscribe({
      next: result => {
        this.isEnabled.set(result.project_deadline_notifications_enabled);
        this.isSaving.set(false);
        // Keeps the signed-in user's copy of the flag current for the next visit to this screen.
        this.auth.loadCurrentUser().subscribe({ error: () => undefined });
      },
      error: error => {
        this.isEnabled.set(!requested);
        this.isSaving.set(false);
        this.toast.error(apiErrorMessage(error) ?? this.transloco.translate('account.mySettings.projectDeadlines.saveFailed'));
      },
    });
  }
}

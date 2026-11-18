import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { EmailCampaignsService, SendgridSettings, SendgridSettingsUpdate } from '../../../core/services/email-campaigns.service';
import { describeHttpError } from '../../../core/services/http-error-message';
import { EMAIL_CAMPAIGNS_SHARED_STYLES } from './email-campaigns.styles';

/** What happens to a write-only secret on save. The webhook key can only be kept or replaced. */
type SecretChange = 'keep' | 'replace' | 'remove';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The tenant's own SendGrid account (tenant admins only). The API key and the
 * webhook's public key are write-only: the API says only whether one is saved.
 */
@Component({
  selector: 'wt-crm-email-campaign-settings',
  standalone: true,
  imports: [FormsModule, TranslocoDirective],
  providers: [provideTranslocoScope('campaigns')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<ng-container *transloco="let t; prefix: 'campaigns.settings'">
  @if (loadError()) {
    <div class="ec-error">{{ loadError() }}</div>
  } @else if (!settings()) {
    <div class="card empty-state">{{ t('loading') }}</div>
  } @else {
    @let current = settings()!;
    <form class="card ecs" (ngSubmit)="save()" autocomplete="off">
      <h2><i class="ei ei-key"></i> {{ t('title') }}</h2>
      <p class="ec-muted ecs-lead">{{ t('lead') }}</p>

      <div class="ecs-fld">
        <label for="ecsApiKey">{{ t('apiKey') }}</label>
        @if (current.has_api_key && apiKeyChange() === 'keep') {
          <div class="ecs-secret">
            <span class="ec-badge st-sent">{{ t('savedEndingWith', { hint: current.api_key_hint || '' }) }}</span>
            <button type="button" class="btn btn-g btn-sm" (click)="apiKeyChange.set('replace')">{{ t('change') }}</button>
            <button type="button" class="btn btn-sm btn-d" (click)="apiKeyChange.set('remove')">{{ t('remove') }}</button>
          </div>
        } @else if (apiKeyChange() === 'remove') {
          <div class="ecs-secret">
            <span class="ec-badge st-failed">{{ t('willBeRemoved') }}</span>
            <button type="button" class="btn btn-g btn-sm" (click)="apiKeyChange.set('keep')">{{ t('undo') }}</button>
          </div>
        } @else {
          <div class="ecs-secret">
            <input id="ecsApiKey" name="apiKey" type="password" class="ec-input ecs-wide" autocomplete="new-password" spellcheck="false"
                   [(ngModel)]="apiKey" [placeholder]="t('apiKeyPlaceholder')" [class.fi-err]="isTestNeedsKeyShown() && !current.has_api_key">
            @if (current.has_api_key) { <button type="button" class="btn btn-g btn-sm" (click)="apiKeyChange.set('keep'); apiKey = ''">{{ t('cancelChange') }}</button> }
          </div>
          <span class="ec-muted">{{ t('apiKeyHint') }}</span>
        }
      </div>

      <div class="ecs-row">
        <div class="ecs-fld">
          <label for="ecsFromEmail">{{ t('fromEmail') }} <span class="ecs-req">*</span></label>
          <input id="ecsFromEmail" name="fromEmail" type="email" class="ec-input" required [(ngModel)]="fromEmail" [class.fi-err]="!!fieldError('fromEmail')">
          @if (fieldError('fromEmail'); as error) { <span class="ferr">{{ t(error) }}</span> }
          <span class="ec-muted">{{ t('fromEmailHint') }}</span>
        </div>
        <div class="ecs-fld">
          <label for="ecsFromName">{{ t('fromName') }}</label>
          <input id="ecsFromName" name="fromName" class="ec-input" maxlength="100" [(ngModel)]="fromName">
        </div>
      </div>
      <div class="ecs-row">
        <div class="ecs-fld">
          <label for="ecsReplyTo">{{ t('replyTo') }} <span class="ec-muted">{{ t('optional') }}</span></label>
          <input id="ecsReplyTo" name="replyTo" type="email" class="ec-input" [(ngModel)]="replyTo" [class.fi-err]="!!fieldError('replyTo')">
          @if (fieldError('replyTo'); as error) { <span class="ferr">{{ t(error) }}</span> }
        </div>
        <div class="ecs-fld">
          <label for="ecsAsm">{{ t('asmGroup') }}</label>
          <input id="ecsAsm" name="asm" type="number" min="1" step="1" class="ec-input" [(ngModel)]="asmGroupId" [class.fi-err]="!!fieldError('asmGroup')">
          @if (fieldError('asmGroup'); as error) { <span class="ferr">{{ t(error) }}</span> }
          <span class="ec-muted">{{ t('asmGroupHint') }}</span>
        </div>
      </div>

      @if (current.consent_types?.length) {
        <div class="ecs-fld">
          <label for="ecsConsent">{{ t('consent') }}</label>
          <select id="ecsConsent" name="consent" class="sel ecs-wide" [(ngModel)]="consentKey">
            <option value="">{{ t('consentAuto') }}</option>
            @for (type of current.consent_types; track type.key) { <option [value]="type.key">{{ type.label }}</option> }
          </select>
          <span class="ec-muted">{{ t('consentHint') }}</span>
        </div>
      }

      <h3>{{ t('webhookTitle') }}</h3>
      @if (current.webhook_url) {
        <div class="ecs-fld">
          <label for="ecsWebhookUrl">{{ t('webhookUrl') }}</label>
          <div class="ecs-secret">
            <input id="ecsWebhookUrl" class="ec-input ecs-wide ecs-mono" readonly [value]="current.webhook_url" (focus)="$any($event.target).select()">
            <button type="button" class="btn btn-g btn-sm" (click)="copyWebhookUrl(current.webhook_url)">
              <i class="ei" [class.ei-check]="isCopied()" [class.ei-clipboard]="!isCopied()"></i> {{ t(isCopied() ? 'copied' : 'copy') }}</button>
          </div>
        </div>
      }
      <ol class="ecs-steps">
        <li>{{ t('steps.one') }}</li>
        <li>{{ t('steps.two') }}</li>
        <li>{{ t('steps.three') }}</li>
      </ol>
      <div class="ecs-fld">
        <label for="ecsWebhookKey">{{ t('webhookKey') }}</label>
        @if (current.has_webhook_public_key && webhookKeyChange() === 'keep') {
          <div class="ecs-secret">
            <span class="ec-badge st-sent">{{ t('webhookKeySaved') }}</span>
            <button type="button" class="btn btn-g btn-sm" (click)="webhookKeyChange.set('replace')">{{ t('change') }}</button>
          </div>
        } @else {
          <textarea id="ecsWebhookKey" name="webhookKey" class="ec-input ecs-mono" rows="4" spellcheck="false" [(ngModel)]="webhookKey"
                    [placeholder]="t('webhookKeyPlaceholder')"></textarea>
          @if (current.has_webhook_public_key) {
            <div><button type="button" class="btn btn-g btn-sm" (click)="webhookKeyChange.set('keep'); webhookKey = ''">{{ t('cancelChange') }}</button></div>
          }
        }
      </div>

      @if (message(); as note) { <div [class]="note.isError ? 'ec-error' : 'ec-ok'" role="status">{{ note.text }}</div> }

      <div class="ecs-actions">
        <button type="submit" class="btn btn-p" [disabled]="isSaving()"><i class="ei ei-save"></i> {{ t(isSaving() ? 'saving' : 'save') }}</button>
        <button type="button" class="btn btn-g" [disabled]="isTesting()" (click)="testConnection()"
                [title]="current.has_api_key ? '' : t('testNeedsKey')"><i class="ei ei-signal"></i> {{ t(isTesting() ? 'testing' : 'test') }}</button>
        @if (isSubmitted() && errorCount()) { <span class="pf-err" role="alert">{{ t('fixErrors', { count: errorCount() }) }}</span> }
      </div>
    </form>
  }
</ng-container>
  `,
  styles: [EMAIL_CAMPAIGNS_SHARED_STYLES, `
    :host { display: block; min-width: 0; }
    .ecs { padding: 20px; display: grid; gap: 16px; max-width: 760px; }
    h2 { margin: 0; font: 600 16px 'Sora', sans-serif; color: var(--gray-900); display: flex; align-items: center; gap: 8px; }
    h3 { margin: 8px 0 0; font: 600 14px 'Sora', sans-serif; color: var(--gray-900); padding-top: 14px; border-top: 1px solid var(--gray-100); }
    .ecs-lead { margin: -8px 0 0; font-size: 14px; }
    .ecs-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
    .ecs-fld { display: grid; gap: 6px; min-width: 0; align-content: start; }
    .ecs-fld > label { font-size: 12px; font-weight: 600; color: var(--gray-600); }
    .ecs-req { color: oklch(from #DC2626 max(l, var(--text-min-l)) c h); }
    .ecs-secret { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .ecs-wide { flex: 1 1 280px; }
    .ecs-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .ecs-steps { margin: 0; padding-left: 20px; display: grid; gap: 6px; font-size: 14px; color: var(--gray-700); line-height: 1.5; }
    .ecs-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  `],
})
export class CrmEmailCampaignSettingsComponent implements OnInit {
  private readonly api = inject(EmailCampaignsService);
  private readonly transloco = inject(TranslocoService);

  readonly saved = output<void>();

  readonly settings = signal<SendgridSettings | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly apiKeyChange = signal<SecretChange>('keep');
  readonly webhookKeyChange = signal<SecretChange>('keep');
  readonly isSaving = signal(false);
  readonly isTesting = signal(false);
  readonly isCopied = signal(false);
  readonly message = signal<{ text: string; isError: boolean } | null>(null);

  apiKey = '';
  webhookKey = '';
  fromEmail = '';
  fromName = '';
  replyTo = '';
  asmGroupId: number | null = null;
  consentKey = '';

  ngOnInit(): void {
    this.api.getSendgridSettings().subscribe({
      next: settings => this.applySettings(settings),
      error: error => this.loadError.set(describeHttpError(error, this.transloco)),
    });
  }

  /** Set by a click on "Save" with errors; from then on each wrong field is red with its message under it. */
  readonly isSubmitted = signal(false);
  readonly isTestNeedsKeyShown = signal(false);

  fieldError(field: 'fromEmail' | 'replyTo' | 'asmGroup'): string | null {
    return this.isSubmitted() ? this.validationErrors()[field] ?? null : null;
  }
  errorCount(): number { return Object.keys(this.validationErrors()).length; }

  save(): void {
    if (this.errorCount() > 0) {
      this.isSubmitted.set(true);
      this.message.set(null);
      return;
    }
    this.isSubmitted.set(false);
    this.isSaving.set(true);
    this.api.saveSendgridSettings(this.buildUpdate()).subscribe({
      next: settings => {
        this.isSaving.set(false);
        this.applySettings(settings);
        this.showMessage(this.translate('savedMessage'), false);
        this.saved.emit();
      },
      error: error => { this.isSaving.set(false); this.showMessage(describeHttpError(error, this.transloco), true); },
    });
  }

  testConnection(): void {
    if (!this.settings()?.has_api_key) {
      this.isTestNeedsKeyShown.set(true);
      this.showMessage(this.translate('testNeedsKey'), true);
      return;
    }
    this.isTesting.set(true);
    this.api.testSendgridConnection().subscribe({
      next: result => { this.isTesting.set(false); this.showMessage(this.translate('testOk', { count: result.templates }), false); },
      error: error => { this.isTesting.set(false); this.showMessage(this.translate('testFailed') + ' ' + describeHttpError(error, this.transloco), true); },
    });
  }

  copyWebhookUrl(url: string): void {
    navigator.clipboard?.writeText(url).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    }).catch(() => undefined);
  }

  private applySettings(settings: SendgridSettings): void {
    this.settings.set(settings);
    this.fromEmail = settings.from_email || '';
    this.fromName = settings.from_name || '';
    this.replyTo = settings.reply_to || '';
    this.asmGroupId = settings.asm_group_id;
    this.consentKey = settings.consent_key || '';
    this.apiKey = '';
    this.webhookKey = '';
    this.apiKeyChange.set(settings.has_api_key ? 'keep' : 'replace');
    this.webhookKeyChange.set(settings.has_webhook_public_key ? 'keep' : 'replace');
  }

  private validationErrors(): Partial<Record<'fromEmail' | 'replyTo' | 'asmGroup', string>> {
    const errors: Partial<Record<'fromEmail' | 'replyTo' | 'asmGroup', string>> = {};
    if (!EMAIL_PATTERN.test(this.fromEmail.trim())) errors.fromEmail = 'errors.fromEmail';
    if (this.replyTo.trim() && !EMAIL_PATTERN.test(this.replyTo.trim())) errors.replyTo = 'errors.replyTo';
    if (this.asmGroupId !== null && `${this.asmGroupId}` !== '' && !(Number.isInteger(Number(this.asmGroupId)) && Number(this.asmGroupId) > 0)) {
      errors.asmGroup = 'errors.asmGroup';
    }
    return errors;
  }

  /** Secrets travel only when the admin typed a new one or asked to remove it. */
  private buildUpdate(): SendgridSettingsUpdate {
    const asmGroup = this.asmGroupId === null || `${this.asmGroupId}` === '' ? null : Number(this.asmGroupId);
    const update: SendgridSettingsUpdate = {
      from_email: this.fromEmail.trim(),
      from_name: this.fromName.trim() || null,
      reply_to: this.replyTo.trim() || null,
      asm_group_id: asmGroup,
    };
    // Empty = the server picks the consent type itself.
    update.consent_key = this.consentKey || null;
    if (this.apiKeyChange() === 'remove') update.api_key = null;
    else if (this.apiKeyChange() === 'replace' && this.apiKey.trim()) update.api_key = this.apiKey.trim();
    if (this.webhookKeyChange() === 'replace' && this.webhookKey.trim()) update.webhook_public_key = this.webhookKey.trim();
    return update;
  }

  private showMessage(text: string, isError: boolean): void { this.message.set({ text, isError }); }
  private translate(key: string, params?: Record<string, unknown>): string { return this.transloco.translate('campaigns.settings.' + key, params); }
}

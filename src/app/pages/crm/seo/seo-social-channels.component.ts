import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { CrmSeoService, SocialAccount, SocialPlatform } from '../../../core/services/crm-seo.service';
import { ToastService } from '../../../core/services/toast.service';

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  wordpress: 'WordPress',
};

@Component({
  selector: 'wt-seo-social-channels',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideTranslocoScope('crm')],
  imports: [FormsModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t; prefix: 'crm'">
    <div class="channels-box">
      <p class="hint">
        {{ t('seo.socialChannels.hint') }}
      </p>
      <div class="channels-list">
        <div class="channel-row">
          <span class="channel-name">LinkedIn</span>
          @if (isConnected('linkedin')) {
            <span class="channel-connected">{{ t('seo.socialChannels.connected') }}{{ accountName('linkedin') ? ' — ' + accountName('linkedin') : '' }}</span>
            <button type="button" class="btn-ghost btn-sm" (click)="disconnect('linkedin')">{{ t('seo.socialChannels.disconnect') }}</button>
          } @else {
            <button type="button" class="btn-ghost btn-sm" (click)="connect('linkedin')">{{ t('seo.socialChannels.connect') }}</button>
          }
        </div>
        <div class="channel-row">
          <span class="channel-name">Facebook</span>
          @if (isConnected('facebook')) {
            <span class="channel-connected">{{ t('seo.socialChannels.connected') }}{{ accountName('facebook') ? ' — ' + accountName('facebook') : '' }}</span>
            <button type="button" class="btn-ghost btn-sm" (click)="disconnect('facebook')">{{ t('seo.socialChannels.disconnect') }}</button>
          } @else {
            <button type="button" class="btn-ghost btn-sm" (click)="connect('facebook')">{{ t('seo.socialChannels.connect') }}</button>
          }
        </div>
        <div class="channel-row">
          <span class="channel-name">Instagram</span>
          @if (isConnected('instagram')) {
            <span class="channel-connected">{{ t('seo.socialChannels.connected') }}{{ accountName('instagram') ? ' — ' + accountName('instagram') : '' }}</span>
          } @else {
            <span class="channel-hint">{{ t('seo.socialChannels.instagramHint') }}</span>
          }
        </div>
        <div class="channel-row wp-row">
          <span class="channel-name">WordPress</span>
          @if (isConnected('wordpress')) {
            <span class="channel-connected">{{ t('seo.socialChannels.connected') }}{{ accountName('wordpress') ? ' — ' + accountName('wordpress') : '' }}</span>
            <button type="button" class="btn-ghost btn-sm" (click)="disconnect('wordpress')">{{ t('seo.socialChannels.disconnect') }}</button>
          } @else {
            <span class="channel-hint">{{ t('seo.socialChannels.wordpressHint') }}</span>
          }
        </div>
        @if (!isConnected('wordpress')) {
          <div class="wp-form">
            <label class="field-label">{{ t('seo.socialChannels.wordpress.siteUrl') }}</label>
            <input class="field-input" [(ngModel)]="wpSiteUrl" [placeholder]="t('seo.socialChannels.wordpress.siteUrlPlaceholder')">
            <label class="field-label">{{ t('seo.socialChannels.wordpress.username') }}</label>
            <input class="field-input" [(ngModel)]="wpUsername" [placeholder]="t('seo.socialChannels.wordpress.usernamePlaceholder')">
            <label class="field-label">{{ t('seo.socialChannels.wordpress.appPassword') }}</label>
            <input class="field-input" type="password" [(ngModel)]="wpAppPassword" [placeholder]="t('seo.socialChannels.wordpress.appPasswordPlaceholder')">
            <button type="button" class="btn-ghost btn-sm" (click)="connectWordpress()" [disabled]="connectingWp() || !wpSiteUrl || !wpUsername || !wpAppPassword">
              @if (connectingWp()) { {{ t('seo.socialChannels.wordpress.connecting') }} } @else { {{ t('seo.socialChannels.wordpress.connect') }} }
            </button>
          </div>
        }
      </div>
    </div>
    </ng-container>
  `,
  styles: [`
    .channels-box { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1rem 1.1rem; background: #fff; }
    .hint { font-size: 0.78rem; color: var(--gray-500); margin: 0 0 0.9rem; }
    .channels-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .channel-row {
      display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
      padding: 0.5rem 0.7rem; border: 1px solid var(--gray-200); border-radius: 8px; background: var(--gray-50);
    }
    .channel-name { font-size: 0.85rem; font-weight: 700; color: var(--gray-900); min-width: 5.5rem; }
    .channel-connected { font-size: 0.82rem; color: var(--orange-dark); flex: 1; }
    .channel-hint { font-size: 0.78rem; color: var(--gray-500); flex: 1; }
    .btn-ghost { border: none; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--gray-100); color: var(--gray-800); }
    .btn-ghost:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-sm { padding: 0.4rem 0.75rem; font-size: 0.8rem; white-space: nowrap; }
    .wp-row { align-items: flex-start; }
    .wp-form {
      display: flex; flex-direction: column; gap: 0.3rem;
      padding: 0.7rem 0.7rem 0.9rem; border: 1px dashed var(--gray-200); border-radius: 8px;
    }
    .field-label { font-size: 0.75rem; font-weight: 600; color: var(--gray-700); margin-top: 0.35rem; }
    .field-input { border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.5rem 0.65rem; font-family: inherit; font-size: 0.85rem; }
    .wp-form .btn-sm { align-self: flex-start; margin-top: 0.6rem; }
  `],
})
export class SeoSocialChannelsComponent implements OnInit {
  private seoService = inject(CrmSeoService);
  private toast = inject(ToastService);
  private transloco = inject(TranslocoService);

  readonly accounts = signal<SocialAccount[]>([]);
  readonly connectingWp = signal(false);

  wpSiteUrl = '';
  wpUsername = '';
  wpAppPassword = '';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.seoService.socialAccounts().subscribe((a) => this.accounts.set(a));
  }

  isConnected(platform: SocialPlatform): boolean {
    return this.accounts().some((a) => a.platform === platform);
  }

  accountName(platform: SocialPlatform): string | null {
    return this.accounts().find((a) => a.platform === platform)?.account_name ?? null;
  }

  connect(platform: 'linkedin' | 'facebook'): void {
    const authUrl$ = platform === 'linkedin' ? this.seoService.linkedinAuthUrl() : this.seoService.facebookAuthUrl();
    authUrl$.subscribe({
      next: (res) => window.location.assign(res.url),
      error: (err) => this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.socialChannels.toasts.connectStartFailed', { platform: PLATFORM_LABELS[platform] })),
    });
  }

  disconnect(platform: SocialPlatform): void {
    this.seoService.disconnectSocialAccount(platform).subscribe({
      next: () => { this.toast.info(this.transloco.translate('crm.seo.socialChannels.toasts.disconnected', { platform: PLATFORM_LABELS[platform] })); this.load(); },
      error: () => this.toast.error(this.transloco.translate('crm.seo.socialChannels.toasts.disconnectFailed')),
    });
  }

  connectWordpress(): void {
    this.connectingWp.set(true);
    this.seoService.connectWordpress(this.wpSiteUrl, this.wpUsername, this.wpAppPassword).subscribe({
      next: () => {
        this.connectingWp.set(false);
        this.toast.success(this.transloco.translate('crm.seo.socialChannels.toasts.wordpressConnected'));
        this.wpSiteUrl = '';
        this.wpUsername = '';
        this.wpAppPassword = '';
        this.load();
      },
      error: (err) => {
        this.connectingWp.set(false);
        this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.socialChannels.toasts.wordpressConnectFailed'));
      },
    });
  }
}

import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CrmSeoService, SocialAccount, SocialPlatform } from '../../../core/services/crm-seo.service';
import { ToastService } from '../../../core/services/toast.service';

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

@Component({
  selector: 'wt-seo-social-channels',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="channels-box">
      <h3>Kanały social</h3>
      <p class="hint">
        Zatwierdzenie artykułu publikuje go równocześnie na podłączonych kanałach — jednym kliknięciem.
        Instagram łączy się automatycznie razem z Facebookiem (to samo konto Meta).
      </p>
      <div class="channels-list">
        <div class="channel-row">
          <span class="channel-name">LinkedIn</span>
          @if (isConnected('linkedin')) {
            <span class="channel-connected">Połączony{{ accountName('linkedin') ? ' — ' + accountName('linkedin') : '' }}</span>
            <button type="button" class="btn-ghost btn-sm" (click)="disconnect('linkedin')">Rozłącz</button>
          } @else {
            <button type="button" class="btn-ghost btn-sm" (click)="connect('linkedin')">Połącz</button>
          }
        </div>
        <div class="channel-row">
          <span class="channel-name">Facebook</span>
          @if (isConnected('facebook')) {
            <span class="channel-connected">Połączony{{ accountName('facebook') ? ' — ' + accountName('facebook') : '' }}</span>
            <button type="button" class="btn-ghost btn-sm" (click)="disconnect('facebook')">Rozłącz</button>
          } @else {
            <button type="button" class="btn-ghost btn-sm" (click)="connect('facebook')">Połącz</button>
          }
        </div>
        <div class="channel-row">
          <span class="channel-name">Instagram</span>
          @if (isConnected('instagram')) {
            <span class="channel-connected">Połączony{{ accountName('instagram') ? ' — ' + accountName('instagram') : '' }}</span>
          } @else {
            <span class="channel-hint">Połącz się automatycznie po podłączeniu Facebooka, jeśli strona ma powiązane konto Instagram Business.</span>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .channels-box { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1rem 1.1rem; background: #fff; margin-bottom: 1.25rem; }
    .channels-box h3 { font-size: 0.95rem; margin: 0 0 0.25rem; }
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
    .btn-sm { padding: 0.4rem 0.75rem; font-size: 0.8rem; white-space: nowrap; }
  `],
})
export class SeoSocialChannelsComponent implements OnInit {
  private seoService = inject(CrmSeoService);
  private toast = inject(ToastService);

  readonly accounts = signal<SocialAccount[]>([]);

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
    authUrl$.subscribe((res) => window.location.assign(res.url));
  }

  disconnect(platform: SocialPlatform): void {
    this.seoService.disconnectSocialAccount(platform).subscribe({
      next: () => { this.toast.info(`${PLATFORM_LABELS[platform]} rozłączony.`); this.load(); },
      error: () => this.toast.error('Nie udało się rozłączyć.'),
    });
  }
}

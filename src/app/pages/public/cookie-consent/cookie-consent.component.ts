import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';

const CONSENT_KEY = 'crmtree_cookie_consent';

@Component({
  selector: 'wt-cookie-consent',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (visible()) {
      <div class="cookie-banner" role="dialog" aria-label="Zgoda na cookies">
        <p>
          Używamy plików cookie do analizy ruchu na stronie. Szczegóły w
          <a routerLink="/polityka-prywatnosci">polityce prywatności</a>.
        </p>
        <div class="cookie-actions">
          <button type="button" class="btn-ghost" (click)="decline()">Odrzuć</button>
          <button type="button" class="btn-accent" (click)="accept()">Akceptuję</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .cookie-banner {
      position:fixed; left:1rem; right:1rem; bottom:1rem; z-index:1000;
      max-width:640px; margin:0 auto;
      background:var(--gray-900); color:#fff;
      border-radius:var(--radius); padding:1rem 1.25rem;
      display:flex; flex-wrap:wrap; align-items:center; gap:1rem;
      box-shadow:var(--shadow-lg);
    }
    .cookie-banner p { margin:0; flex:1 1 260px; font-size:0.88rem; line-height:1.4; }
    .cookie-banner a { color:var(--orange-light); }
    .cookie-actions { display:flex; gap:0.6rem; }
    .btn-ghost, .btn-accent {
      border:none; border-radius:8px; padding:0.5rem 1rem; font-weight:600; cursor:pointer; font-size:0.85rem;
    }
    .btn-ghost { background:transparent; color:#fff; border:1px solid rgba(255,255,255,.3); }
    .btn-accent { background:var(--orange); color:#fff; }
  `],
})
export class CookieConsentComponent {
  private platformId = inject(PLATFORM_ID);
  readonly visible = signal(false);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const stored = localStorage.getItem(CONSENT_KEY);
      this.visible.set(!stored);
    }
  }

  accept(): void {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    this.visible.set(false);
    // Analytics loading (GA4) hooks off this consent — wired once a real measurement ID exists.
  }

  decline(): void {
    localStorage.setItem(CONSENT_KEY, 'declined');
    this.visible.set(false);
  }
}

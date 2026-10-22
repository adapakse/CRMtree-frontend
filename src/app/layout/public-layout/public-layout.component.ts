import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { CookieConsentComponent } from '../../pages/public/cookie-consent/cookie-consent.component';

@Component({
  selector: 'wt-public-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterOutlet, CookieConsentComponent, TranslocoDirective],
  template: `
    <div class="public-shell" *transloco="let t; prefix: 'public'">
      <header class="public-header">
        <a href="https://crmtree.pl/" class="public-logo">
          <img src="assets/crmtree-logo-reverse.png" alt="CRMtree">
        </a>
        <nav class="public-nav">
          <a routerLink="/blog">{{ t('nav.blog') }}</a>
          <a routerLink="/login" class="public-cta">{{ t('nav.login') }}</a>
        </nav>
      </header>

      <main class="public-main">
        <router-outlet />
      </main>

      <footer class="public-footer">
        <span>&copy; {{ year }} CRMtree</span>
        <nav>
          <a routerLink="/polityka-prywatnosci">{{ t('footer.privacy') }}</a>
          <a routerLink="/regulamin">{{ t('footer.terms') }}</a>
        </nav>
      </footer>

      <wt-cookie-consent />
    </div>
  `,
  styles: [`
    .public-shell {
      display:flex; flex-direction:column;
      height:calc(100vh - var(--test-banner-height, 0px));
      overflow-y:auto; overflow-x:hidden;
    }
    .public-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:0.75rem 2rem; border-bottom:1px solid var(--gray-200);
    }
    .public-logo img { display:block; height:90px; width:auto; }
    .public-nav { display:flex; align-items:center; gap:1.5rem; }
    .public-nav a { color:var(--gray-700); text-decoration:none; font-size:0.95rem; }
    .public-nav a:hover { color:var(--orange); }
    .public-cta {
      background:var(--orange); color:#fff !important; padding:0.5rem 1.1rem;
      border-radius:var(--radius); font-weight:600;
    }
    .public-main { flex:1; }
    .public-footer {
      display:flex; align-items:center; justify-content:space-between;
      padding:1.5rem 2rem; border-top:1px solid var(--gray-200);
      color:var(--gray-500); font-size:0.85rem;
    }
    .public-footer nav { display:flex; gap:1.2rem; }
    .public-footer a { color:var(--gray-500); text-decoration:none; }
    .public-footer a:hover { color:var(--orange); }
  `],
})
export class PublicLayoutComponent {
  readonly year = new Date().getFullYear();
}

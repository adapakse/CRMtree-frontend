import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AppLocale, DEFAULT_LOCALE, isSupportedLocale } from './locales';
import { matchTenantSlug } from '../tenant-host';

// Renamed from 'wt_locale', which also held mere guesses (browser language):
// one of those left behind would outrank the host's organisation default.
const STORAGE_KEY = 'crmtree_locale';

/**
 * Decides which language the interface speaks and switches it.
 *
 * Order of precedence: the signed-in user's own choice, their tenant's
 * default, the choice remembered in this browser (used before login), the
 * default of the organisation whose host this is ({slug}.crmtree.pl), the
 * browser's language, Polish.
 *
 * Only a real choice is remembered — the signed-in user's language or one
 * picked on the login page, never a guess.
 *
 * The language is fixed for the lifetime of the page: Angular binds date,
 * number and currency formatting to the locale at start-up, so every switch
 * goes through a page reload.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _activeLocale = signal<AppLocale>(DEFAULT_LOCALE);
  readonly activeLocale = this._activeLocale.asReadonly();
  private isInitialised = false;
  private hostLocale: AppLocale | null = null;

  // A login happens without a page load, in the language guessed before it.
  // When the person who signed in uses another language, the page reloads
  // into it — this covers every login path (password, SSO callback) at once.
  private readonly followSignedInUser = effect(() => {
    const user = this.auth.user();
    if (!this.isInitialised || !user) return;
    const locale = this.resolveLocale();
    this.remember(locale);
    if (locale === this._activeLocale()) return;
    this.reload();
  });

  /** Called once at app start, after the signed-in user (if any) is known. */
  async init(): Promise<void> {
    if (this.isBrowser && !this.auth.user()) this.hostLocale = await this.loadHostLocale();
    const locale = this.resolveLocale();
    this._activeLocale.set(locale);
    if (this.auth.user()) this.remember(locale);
    this.transloco.setActiveLang(locale);
    // Loaded up front so the first screen never flashes untranslated keys.
    await firstValueFrom(this.transloco.load(locale));
    this.isInitialised = true;
  }

  /** The user's own language; null returns them to their organisation's default. */
  async change(locale: AppLocale | null): Promise<void> {
    if (this.auth.isLoggedIn()) {
      await firstValueFrom(this.http.put(`${environment.apiUrl}/profile/locale`, { locale }));
    }
    if (locale) this.remember(locale); else this.forget();
    this.reload();
  }

  /** The organisation's default language (tenant admin only). */
  async changeTenantDefault(locale: AppLocale): Promise<void> {
    await firstValueFrom(this.http.put(`${environment.apiUrl}/admin/settings/default-locale`, { locale }));
    this.reload();
  }

  private resolveLocale(): AppLocale {
    const user = this.auth.user();
    if (user) {
      if (isSupportedLocale(user.locale)) return user.locale;
      if (isSupportedLocale(user.tenant_default_locale)) return user.tenant_default_locale;
    }
    if (!this.isBrowser) return DEFAULT_LOCALE;
    const remembered = this.readRemembered();
    if (remembered) return remembered;
    if (this.hostLocale) return this.hostLocale;
    const browserLanguage = navigator.language?.slice(0, 2).toLowerCase();
    return isSupportedLocale(browserLanguage) ? browserLanguage : DEFAULT_LOCALE;
  }

  private async loadHostLocale(): Promise<AppLocale | null> {
    const slug = matchTenantSlug(window.location.hostname);
    if (!slug) return null;
    try {
      const tenant = await firstValueFrom(this.http.get<{ default_locale?: string }>(
        `${environment.apiUrl}/public/tenants/by-slug/${encodeURIComponent(slug)}`));
      return isSupportedLocale(tenant.default_locale) ? tenant.default_locale : null;
    } catch {
      // Unknown tenant, older backend or no network: fall back to the browser's language.
      return null;
    }
  }

  private readRemembered(): AppLocale | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return isSupportedLocale(stored) ? stored : null;
    } catch {
      return null;
    }
  }

  private remember(locale: AppLocale): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Private mode / blocked storage: the language is simply resolved again next time.
    }
    this.shareWithLanding(locale);
  }

  /**
   * Strona marketingowa stoi na crmtree.pl, a aplikacja na {slug}.crmtree.pl i
   * app.crmtree.pl. localStorage jest per origin, więc się nim nie podzielą —
   * ciasteczko na `.crmtree.pl` już tak. Dzięki temu klient, któremu CRM działa
   * po rosyjsku, widzi po rosyjsku także crmtree.pl, zamiast lądować na polskiej
   * wersji. Landing czyta ten sam klucz (public/i18n.js w repo CRMtree-landing).
   *
   * Poza domeną crmtree.pl (localhost, własna domena klienta) ciasteczko jest
   * zapisywane bez `domain`, więc po prostu nie jest współdzielone — nic się nie
   * psuje, landing po prostu wraca do wykrywania z przeglądarki.
   */
  private shareWithLanding(locale: AppLocale): void {
    try {
      const host = window.location.hostname;
      const shared = /(^|\.)crmtree\.pl$/.test(host) ? '; domain=.crmtree.pl' : '';
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie =
        `crmtree_lang=${locale}; path=/; max-age=31536000${shared}${secure}; SameSite=Lax`;
    } catch {
      // Ciasteczka zablokowane — landing wykryje język po swojemu.
    }
  }

  private forget(): void {
    if (!this.isBrowser) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing was stored, nothing to remove.
    }
  }

  private reload(): void {
    if (this.isBrowser) window.location.reload();
  }
}

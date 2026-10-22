import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, lastValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, AuthTokens, CrmFeature } from '../models/models';

const ACCESS_KEY  = 'wt_access';
const REFRESH_KEY = 'wt_refresh';
const RETURN_URL_KEY = 'wt_return_url';

// Only a page of this app may be a return target: no other origin
// ('//host') and no page of the sign-in flow itself.
const SIGN_IN_PATHS = ['/login', '/auth/', '/change-password'];
const isSafeReturnUrl = (url: string): boolean =>
  url.startsWith('/') && !url.startsWith('//') && !SIGN_IN_PATHS.some(path => url.startsWith(path));

/**
 * Moduły, do których dostęp admin tenanta nadaje pojedynczym osobom
 * (user_feature_access, migracja 0330). Lista musi zgadzać się z
 * USER_MANAGED_FEATURES w backendowym `middleware/crm-rbac.js` — rozjazd
 * oznacza menu pokazujące moduł, do którego backend i tak nie wpuści.
 */
export const USER_MANAGED_FEATURES: CrmFeature[] = ['call_analysis'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = environment.apiUrl;

  // Reactive state
  private _user = signal<User | null>(null);
  readonly user  = this._user.asReadonly();
  readonly isLoggedIn         = computed(() => this._user() !== null);
  readonly isAdmin            = computed(() => this._user()?.is_admin ?? false);
  readonly isSuperAdmin       = computed(() => this._user()?.is_super_admin ?? false);
  readonly mustChangePassword = computed(() => this._user()?.must_change_password ?? false);
  readonly canViewKsefInvoices = computed(() =>
    this._user()?.is_admin === true || this._user()?.can_view_ksef_invoices === true);
  readonly isCrmUser          = computed(() =>
    this._user()?.is_admin === true ||
    this._user()?.crm_role === 'salesperson' ||
    this._user()?.crm_role === 'sales_manager'
  );

  /** Synchroniczny dostęp do bieżącego użytkownika (dla guardów i komponentów CRM) */
  get currentUser(): User | null { return this._user(); }

  hasFeature(feature: CrmFeature): boolean {
    const features = this._user()?.tenant_features;
    if (!features) return true; // gold / brak danych → wszystko włączone
    if (features[feature] !== true) return false;

    // Druga bramka, dla modułów rozdawanych imiennie: superadmin włącza moduł
    // tenantowi, admin tenanta daje go konkretnym osobom. Bez tego menu
    // prowadziłoby takiego usera prosto w 403 z backendu.
    if (!USER_MANAGED_FEATURES.includes(feature)) return true;
    if (this._user()?.is_admin) return true;
    return this._user()?.user_features?.[feature] === true;
  }

  loginWithPassword(email: string, password: string): Observable<{ access_token: string; refresh_token: string; must_change_password?: boolean }> {
    return this.http.post<any>(`${this.api}/auth/login`, { email, password });
  }

  changePassword(current_password: string | null, new_password: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.api}/auth/change-password`, { current_password, new_password });
  }

  constructor(private http: HttpClient, private router: Router) {}

  // ── Called at app init (APP_INITIALIZER) ──────────────
  init(): Promise<void> {
    const token = this.getAccessToken();
    if (!token) return Promise.resolve();
    return lastValueFrom(this.loadCurrentUser()).then(() => {}).catch(() => {});
  }

  // ── SAML login — redirect to backend SSO endpoint ─────
  loginWithSaml(): void {
    window.location.href = `${this.api}/auth/saml`;
  }

  // ── Called from /auth/callback route with query params ─
  handleCallback(accessToken: string, refreshToken: string): void {
    sessionStorage.setItem(ACCESS_KEY,  accessToken);
    sessionStorage.setItem(REFRESH_KEY, refreshToken);
    this.loadCurrentUser().subscribe({
      next: (user) => this.router.navigateByUrl(this.landingUrl(user)),
      error: () => this.logout(),
    });
  }

  // ── Refresh token ──────────────────────────────────────
  refreshToken(): Observable<AuthTokens> {
    const refresh_token = this.getRefreshToken();
    return this.http.post<AuthTokens>(`${this.api}/auth/refresh`, { refresh_token }).pipe(
      tap(tokens => {
        sessionStorage.setItem(ACCESS_KEY,  tokens.access_token);
        sessionStorage.setItem(REFRESH_KEY, tokens.refresh_token);
      })
    );
  }

  // ── Load current user from /me ─────────────────────────
  loadCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.api}/auth/me`).pipe(
      tap(user => this._user.set(user))
    );
  }

  // ── Return to the requested page after signing in ─────
  // Links in e-mails open a new tab, which has no session (tokens live in
  // sessionStorage), so the guard sends the user to sign in first. The page
  // they asked for is kept here — in sessionStorage, so it survives the SSO
  // round trip through the backend — and used once after signing in.
  rememberReturnUrl(url: string): void {
    if (!isPlatformBrowser(this.platformId) || !isSafeReturnUrl(url)) return;
    sessionStorage.setItem(RETURN_URL_KEY, url);
  }

  /** The remembered page if there is one, else the user's start page. */
  landingUrl(user: User): string {
    const remembered = isPlatformBrowser(this.platformId) ? sessionStorage.getItem(RETURN_URL_KEY) : null;
    if (remembered) sessionStorage.removeItem(RETURN_URL_KEY);
    if (remembered && isSafeReturnUrl(remembered)) return remembered;
    return (user.crm_role === 'salesperson' || user.crm_role === 'sales_manager') ? '/crm/dashboard' : '/dashboard';
  }

  // ── Logout ─────────────────────────────────────────────
  logout(): void {
    const refresh_token = this.getRefreshToken();
    this.http.post(`${this.api}/auth/logout`, { refresh_token }).subscribe();
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(RETURN_URL_KEY);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  // ── Token accessors ────────────────────────────────────
  // sessionStorage doesn't exist during SSR — server-side renders are always anonymous.
  private readonly platformId = inject(PLATFORM_ID);

  getAccessToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return sessionStorage.getItem(ACCESS_KEY);
  }

  private getRefreshToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return sessionStorage.getItem(REFRESH_KEY);
  }
}

import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, lastValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, AuthTokens, CrmFeature } from '../models/models';

const ACCESS_KEY  = 'wt_access';
const REFRESH_KEY = 'wt_refresh';

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
    return features[feature] === true;
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
      next: (user) => {
        const dest = (user.crm_role === 'salesperson' || user.crm_role === 'sales_manager')
          ? '/crm/dashboard' : '/dashboard';
        this.router.navigate([dest]);
      },
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

  // ── Logout ─────────────────────────────────────────────
  logout(): void {
    const refresh_token = this.getRefreshToken();
    this.http.post(`${this.api}/auth/logout`, { refresh_token }).subscribe();
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  // ── Token accessors ────────────────────────────────────
  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_KEY);
  }

  private getRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_KEY);
  }
}

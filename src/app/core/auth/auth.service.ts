import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, lastValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, AuthTokens } from '../models/models';

const ACCESS_KEY  = 'wt_access';
const REFRESH_KEY = 'wt_refresh';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = environment.apiUrl;

  // Reactive state
  private _user = signal<User | null>(null);
  readonly user  = this._user.asReadonly();
  readonly isLoggedIn  = computed(() => this._user() !== null);
  readonly isAdmin     = computed(() => this._user()?.is_admin ?? false);
  readonly isCrmUser   = computed(() =>
    this._user()?.is_admin === true ||
    this._user()?.crm_role === 'salesperson' ||
    this._user()?.crm_role === 'sales_manager'
  );

  /** Synchroniczny dostęp do bieżącego użytkownika (dla guardów i komponentów CRM) */
  get currentUser(): User | null {
    return this._user();
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
      next: () => this.router.navigate(['/dashboard']),
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

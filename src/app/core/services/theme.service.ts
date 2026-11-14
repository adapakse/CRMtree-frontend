import { Injectable, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme_mode';

export function readStoredThemeMode(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function storeThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* storage blocked: the account still keeps the choice */ }
}

/**
 * Light or dark theme, applied as <html data-theme="…">. The choice is saved on the user's
 * account, so it follows them to every computer; this browser keeps a copy so the page opens
 * in the right theme before the account is loaded.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly mode = signal<ThemeMode>(readStoredThemeMode());

  constructor() {
    effect(() => this.doc.documentElement.setAttribute('data-theme', this.mode()));
    effect(() => {
      const saved = this.auth.user()?.theme_mode;
      if (saved === 'light' || saved === 'dark') {
        this.mode.set(saved);
        storeThemeMode(saved);
      }
    });
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    storeThemeMode(mode);
    if (!this.auth.user()) return;
    this.http.put(`${environment.apiUrl}/profile/theme`, { theme_mode: mode })
      .subscribe({ error: () => { /* offline: this browser keeps the choice until the next change */ } });
  }
}

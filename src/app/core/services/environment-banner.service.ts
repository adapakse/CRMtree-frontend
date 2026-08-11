import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class EnvironmentBannerService {
  private platformId = inject(PLATFORM_ID);

  private readonly isTest = signal(false);
  /** True when the server's APP_ENV env var (exposed via /env-config.json) is anything but 'production'. */
  readonly isTestEnvironment = this.isTest.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    // `ng serve` (local dev, `npm start`) has no Express server behind it, so
    // /env-config.json 404s — the fetch below would silently never resolve
    // isTest to true, leaving local dev stuck on the production-only login
    // view. Short-circuit on the well-known local hostnames instead of
    // waiting on a request that can't succeed there.
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      this.isTest.set(true);
      return;
    }

    fetch('/env-config.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((config: { appEnv?: string } | null) => this.isTest.set(config?.appEnv !== 'production'))
      .catch(() => {});
  }
}

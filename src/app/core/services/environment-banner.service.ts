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
    fetch('/env-config.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((config: { appEnv?: string } | null) => this.isTest.set(config?.appEnv !== 'production'))
      .catch(() => {});
  }
}

import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { jwtInterceptor } from './core/auth/jwt.interceptor';
import { ssrApiBaseUrlInterceptor } from './core/services/ssr-api-base-url.interceptor';
import { AuthService } from './core/auth/auth.service';
import { AppSettingsService } from './core/services/app-settings.service';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { LocaleService } from './core/i18n/locale.service';
import { provideI18n } from './core/i18n/provide-i18n';

function initApp(auth: AuthService, settings: AppSettingsService, locale: LocaleService) {
  return async () => {
    await auth.init();
    // The interface language depends on who is signed in, so it is settled right after.
    await locale.init();
    // Settings are only ever read by authenticated CRM/admin pages — loading them
    // unconditionally blocked APP_INITIALIZER (and so every SSR render, including
    // the public /blog pages that never touch AppSettingsService) on a doomed
    // admin-only API call for anonymous visitors, adding a wasted round trip to
    // every public page load.
    if (auth.isLoggedIn()) {
      await settings.load();
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([ssrApiBaseUrlInterceptor, jwtInterceptor])),
    provideAnimations(),
    ...provideI18n(),
    {
      provide: APP_INITIALIZER,
      useFactory: initApp,
      deps: [AuthService, AppSettingsService, LocaleService],
      multi: true,
    }, provideClientHydration(withEventReplay()),
  ],
};

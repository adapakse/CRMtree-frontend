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

function initApp(auth: AuthService, settings: AppSettingsService) {
  return async () => {
    await auth.init();
    await settings.load();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([ssrApiBaseUrlInterceptor, jwtInterceptor])),
    provideAnimations(),
    {
      provide: APP_INITIALIZER,
      useFactory: initApp,
      deps: [AuthService, AppSettingsService],
      multi: true,
    }, provideClientHydration(withEventReplay()),
  ],
};

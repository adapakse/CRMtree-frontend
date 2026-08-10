import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { HttpInterceptorFn } from '@angular/common/http';

/**
 * During SSR, relative API URLs (e.g. `/api/...`) can't be resolved — Node has no
 * browser `location` to resolve against. Rewrite them to the real backend host,
 * same env var (`API_UPSTREAM`) the SSR server's own `/api` proxy uses.
 */
export const ssrApiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  if (isPlatformServer(platformId) && req.url.startsWith('/api')) {
    const base = process.env['API_UPSTREAM'] || 'http://127.0.0.1:3001';
    return next(req.clone({ url: base + req.url }));
  }
  return next(req);
};

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoService } from '@jsverse/transloco';
import { catchError, throwError } from 'rxjs';
import { ToastService } from './toast.service';
import { SHOWS_OWN_ERROR, describeHttpError } from './http-error-message';

const CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Sign-in and token refresh have their own screens and messages.
const OWN_FLOW = /\/api\/auth\//;

/**
 * Every failed save, change or delete tells the user why (a toast), even on
 * screens that used to swallow the error. Reads are left to their screens.
 */
export const saveErrorInterceptor: HttpInterceptorFn = (req, next) => {
  if (!CHANGING_METHODS.has(req.method) || OWN_FLOW.test(req.url) || req.context.get(SHOWS_OWN_ERROR)
      || !isPlatformBrowser(inject(PLATFORM_ID))) {
    return next(req);
  }
  const toast = inject(ToastService);
  const transloco = inject(TranslocoService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // An expired session is renewed by the JWT interceptor; only a real failure is reported.
      if (!(err.status === 401 && err.error?.code === 'TOKEN_EXPIRED')) toast.error(describeHttpError(err, transloco));
      return throwError(() => err);
    }),
  );
};

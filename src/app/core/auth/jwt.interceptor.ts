import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject, NgZone } from '@angular/core';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth  = inject(AuthService);
  const zone  = inject(NgZone);
  const token = auth.getAccessToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  const response$ = next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && err.error?.code === 'TOKEN_EXPIRED') {
        return auth.refreshToken().pipe(
          switchMap(tokens => {
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${tokens.access_token}` },
            });
            return next(retryReq);
          }),
          catchError(() => {
            auth.logout();
            return throwError(() => err);
          })
        );
      }
      return throwError(() => err);
    })
  );

  // Wrap response in NgZone.run() so Angular change detection
  // always triggers after every HTTP response
  return new Observable(subscriber => {
    response$.subscribe({
      next:     v => zone.run(() => subscriber.next(v)),
      error:    e => zone.run(() => subscriber.error(e)),
      complete: () => zone.run(() => subscriber.complete()),
    });
  });
};

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { map, of, catchError } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  const token = auth.getAccessToken();
  if (!token) {
    router.navigate(['/login']);
    return false;
  }

  return auth.loadCurrentUser().pipe(
    map(() => {
      if (auth.isLoggedIn()) return true;
      router.navigate(['/login']);
      return false;
    }),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    })
  );
};

export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) return true;
  router.navigate(['/dashboard']);
  return false;
};

// CRM Dodaj na końcu pliku guards.ts:
export const crmGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const user   = auth.user();

  const hasCrmAccess = user?.is_admin ||
    user?.crm_role === 'salesperson' ||
    user?.crm_role === 'sales_manager';

  if (hasCrmAccess) return true;
  router.navigate(['/dashboard']);
  return false;
};

// Guard dla ekranu User Management — dostępny dla admina i Sales Managera
export const adminOrSalesManagerGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const user   = auth.user();

  if (user?.is_admin || user?.crm_role === 'sales_manager') return true;
  router.navigate(['/dashboard']);
  return false;
};

export const superAdminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (auth.isSuperAdmin()) return true;
  router.navigate(['/dashboard']);
  return false;
};



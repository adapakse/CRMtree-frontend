// ─────────────────────────────────────────────────────────────────
// src/app/core/auth/guards.ts  — PATCH (POPRAWIONA WERSJA)
//
// Zamień poprzedni crmGuard na ten poniżej.
// Różnica: używa auth.user() (Signal) zamiast auth.currentUser
// (który nie istnieje w auth.service.ts i powodował zawsze redirect)
// ─────────────────────────────────────────────────────────────────

// ★ Upewnij się, że na początku guards.ts są te importy:
// import { inject } from '@angular/core';
// import { Router, CanActivateFn } from '@angular/router';
// import { AuthService } from './auth.service';

export const crmGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const user   = auth.user();          // ← POPRAWKA: Signal, nie .currentUser

  const hasCrmAccess = user?.is_admin ||
    user?.crm_role === 'salesperson' ||
    user?.crm_role === 'sales_manager';

  if (hasCrmAccess) return true;

  router.navigate(['/dashboard']);
  return false;
};

import { inject } from '@angular/core';
import { CanActivateFn, Routes } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { catchError, forkJoin, map, of } from 'rxjs';

// A route path → the Transloco scopes its screens use. A full path wins over
// its first segment, so one screen can pull in a scope its siblings do not.
const SCOPES_BY_PATH_PREFIX: Record<string, string[]> = {
  // Both Prospects screens share the `prospects` scope although they sit under
  // different sections; matched by full path so the other /admin and /crm
  // screens do not download those texts.
  'admin/prospects': ['admin', 'crm', 'prospects'],
  'crm/prospects-dashboard': ['crm', 'prospects'],
  crm: ['crm'],
  projects: ['projects'],
  // Call analysis lives under /admin but belongs to the CRM texts.
  admin: ['admin', 'crm'],
  users: ['admin'],
  groups: ['admin'],
  logs: ['admin'],
  dashboard: ['documents'],
  documents: ['documents'],
  workflow: ['documents'],
  'my-settings': ['account'],
  'change-password': ['auth'],
};

/**
 * Loads a module's texts before its screen is created. A module's texts are
 * fetched lazily; without this guard a component that builds labels in
 * TypeScript on init (chart legends, option lists) could run before they
 * arrive and show raw keys.
 */
function i18nScopeGuard(scopes: string[]): CanActivateFn {
  return () => {
    const transloco = inject(TranslocoService);
    const lang = transloco.getActiveLang();
    return forkJoin(scopes.map(scope => transloco.load(`${scope}/${lang}`).pipe(
      // Missing texts must never block navigation; the Polish fallback still applies.
      catchError(() => of(null)),
    ))).pipe(map(() => true));
  };
}

/** Adds the scope guard to every route (at any depth) whose path belongs to a translated module. */
export function withI18nScopes(routes: Routes): Routes {
  return routes.map(route => {
    const path = route.path ?? '';
    const scopes = SCOPES_BY_PATH_PREFIX[path] ?? SCOPES_BY_PATH_PREFIX[path.split('/')[0]];
    return {
      ...route,
      ...(scopes ? { canActivate: [...(route.canActivate ?? []), i18nScopeGuard(scopes)] } : {}),
      ...(route.children ? { children: withI18nScopes(route.children) } : {}),
    };
  });
}

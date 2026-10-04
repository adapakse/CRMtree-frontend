import { inject } from '@angular/core';
import { CanActivateFn, Routes } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { catchError, map, of } from 'rxjs';

// First path segment of a route → the Transloco scope its screens use.
const SCOPE_BY_PATH_PREFIX: Record<string, string> = {
  crm: 'crm',
  projects: 'projects',
};

/**
 * Loads a module's texts before its screen is created. A module's texts are
 * fetched lazily; without this guard a component that builds labels in
 * TypeScript on init (chart legends, option lists) could run before they
 * arrive and show raw keys.
 */
function i18nScopeGuard(scope: string): CanActivateFn {
  return () => {
    const transloco = inject(TranslocoService);
    return transloco.load(`${scope}/${transloco.getActiveLang()}`).pipe(
      map(() => true),
      // Missing texts must never block navigation; the Polish fallback still applies.
      catchError(() => of(true)),
    );
  };
}

/** Adds the scope guard to every route (at any depth) whose path belongs to a translated module. */
export function withI18nScopes(routes: Routes): Routes {
  return routes.map(route => {
    const scope = SCOPE_BY_PATH_PREFIX[(route.path ?? '').split('/')[0]];
    return {
      ...route,
      ...(scope ? { canActivate: [...(route.canActivate ?? []), i18nScopeGuard(scope)] } : {}),
      ...(route.children ? { children: withI18nScopes(route.children) } : {}),
    };
  });
}

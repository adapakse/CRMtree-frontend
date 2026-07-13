import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Public marketing/blog surface — SSR so content is indexable (Faza 0).
  { path: '', renderMode: RenderMode.Server },
  { path: 'blog', renderMode: RenderMode.Server },
  { path: 'blog/:slug', renderMode: RenderMode.Server },
  { path: 'polityka-prywatnosci', renderMode: RenderMode.Prerender },
  { path: 'regulamin', renderMode: RenderMode.Prerender },
  // Everything else (login, dashboard, crm/*, ...) is the authenticated SPA —
  // no SEO value, needs browser-only APIs (sessionStorage) — client-rendered only.
  { path: '**', renderMode: RenderMode.Client },
];

import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';

// Mirrors the backend's src/config/tenantHost.js — kept in sync manually
// since frontend/backend are separate repos. Any change to the reserved-slug
// list or base domains there should be reflected here too.
const BASE_DOMAINS = ['crmtree.pl', 'crmtree.com'];
const RESERVED_SLUGS = new Set([
  'app', 'api', 'www', 'admin', 'mail', 'ftp', 'static', 'cdn', 'assets',
  'int', 'staging', 'stage', 'dev', 'test', 'preview', 'crmtree-gold',
]);

function matchTenantSlug(hostname: string): string | null {
  const escaped = BASE_DOMAINS.map((d) => d.replace(/\./g, '\\.')).join('|');
  const match = hostname.toLowerCase().match(new RegExp(`^([a-z0-9][a-z0-9-]*)\\.(${escaped})$`));
  if (!match) return null;
  const slug = match[1];
  return RESERVED_SLUGS.has(slug) ? null : slug;
}

interface TenantLookupResponse {
  name: string;
  slug: string;
  is_active: boolean;
}

/**
 * Resolves the tenant subdomain (if any) from window.location.hostname and
 * fetches its public name for branding on the login page. Browser-only,
 * same pattern as EnvironmentBannerService — a public, unauthenticated
 * lookup that doesn't need to block first paint.
 */
@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private platformId = inject(PLATFORM_ID);

  private readonly slug = signal<string | null>(null);
  private readonly name = signal<string | null>(null);
  private readonly notFound = signal(false);

  readonly tenantSlug = this.slug.asReadonly();
  readonly tenantName = this.name.asReadonly();
  /** True when the host is a recognized tenant-subdomain shape but no matching active tenant was found. */
  readonly isUnknownTenantHost = this.notFound.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    const slug = matchTenantSlug(window.location.hostname);
    if (!slug) return;
    this.slug.set(slug);

    fetch(`${environment.apiUrl}/public/tenants/by-slug/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? (r.json() as Promise<TenantLookupResponse>) : null))
      .then((tenant) => {
        if (tenant) this.name.set(tenant.name);
        else this.notFound.set(true);
      })
      .catch(() => this.notFound.set(true));
  }
}

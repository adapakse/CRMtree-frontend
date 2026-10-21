import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import { matchTenantSlug } from '../tenant-host';

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

// Mirrors the backend's src/config/tenantHost.js — kept in sync manually
// since frontend/backend are separate repos. Any change to the reserved-slug
// list or base domains there should be reflected here too.
const BASE_DOMAINS = ['crmtree.pl', 'crmtree.com', 'int.crmtree.pl'];
const RESERVED_SLUGS = new Set([
  'app', 'api', 'www', 'admin', 'mail', 'ftp', 'static', 'cdn', 'assets',
  'int', 'staging', 'stage', 'dev', 'test', 'preview', 'crmtree-gold',
]);

export function matchTenantSlug(hostname: string): string | null {
  const escaped = BASE_DOMAINS.map((d) => d.replace(/\./g, '\\.')).join('|');
  const match = hostname.toLowerCase().match(new RegExp(`^([a-z0-9][a-z0-9-]*)\\.(${escaped})$`));
  if (!match) return null;
  const slug = match[1];
  return RESERVED_SLUGS.has(slug) ? null : slug;
}

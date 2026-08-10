// Normalizes a LinkedIn profile URL typed into the SEO author form — editors
// commonly paste "linkedin.com/in/..." or "www.linkedin.com/in/..." without a
// scheme, which would otherwise render as a broken relative link. Doesn't
// validate the URL actually points at LinkedIn; that's not worth blocking
// form submission over.
export function normalizeLinkedinUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
}

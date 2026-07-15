// Formats a raw phone number for display only (e.g. WhatsApp tab "Do" field)
// — never used to validate or normalize what's actually sent to the backend,
// which does its own digit-only normalization server-side (see
// whatsappService.normalizePhone). Strips spaces/dashes/parens from whatever
// the user typed or pasted, then re-groups the remaining digits.
//
// CRMtree is multi-country: this never guesses a country code and never adds
// "+48" (or any other prefix) on its own. A leading "+" is kept only if the
// user typed one. See requiresCountryCode() for the "did the user actually
// include a country code" check used to gate sending.
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const hasPlus = trimmed.startsWith('+');
  const digits  = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;

  // "48" + 9 digits, with or without the "+" the user already typed — group
  // as country code (2) + 3 + 3 + 3, e.g. "+48 502 345 678" / "48 502 345 678".
  // The "+" is only ever kept, never added.
  if (digits.length === 11 && digits.startsWith('48')) {
    const rest = digits.slice(2);
    return `${hasPlus ? '+' : ''}48 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6, 9)}`;
  }

  // Any other prefix (+44, +49, +1, ...) or plain digits: group everything
  // by 3 without touching the country code boundary — simple, but never
  // breaks a "+48" the user typed (handled above) and never invents one.
  const groups = digits.match(/.{1,3}/g) || [digits];
  return (hasPlus ? '+' : '') + groups.join(' ');
}

// True when `raw` is non-empty but doesn't start with "+" — i.e. it's
// missing an international country code and can't be sent as-is.
export function requiresCountryCode(raw: string | null | undefined): boolean {
  const trimmed = (raw || '').trim();
  return trimmed.length > 0 && !trimmed.startsWith('+');
}

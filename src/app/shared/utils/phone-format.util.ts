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

  // "1" + 10 digits (NANP: US/Canada) — e.g. "+15551722323" → "+1 (555) 172-2323".
  // Without this, the generic 3-digit grouping below split the "1" country
  // code across the first group (e.g. "+155 517 223 23"), which is wrong.
  if (digits.length === 11 && digits.startsWith('1')) {
    const rest = digits.slice(1);
    return `${hasPlus ? '+' : ''}1 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6, 9)}`;
  }

  // Any other country: we don't know where its country code ends, so
  // grouping digits by 3 risks the same kind of misplaced split as above —
  // safer to show the original string as typed/returned by the source
  // (e.g. Meta's display_phone_number) than to guess at a grouping.
  return trimmed;
}

// True when `raw` is non-empty but doesn't start with "+" — i.e. it's
// missing an international country code and can't be sent as-is.
export function requiresCountryCode(raw: string | null | undefined): boolean {
  const trimmed = (raw || '').trim();
  return trimmed.length > 0 && !trimmed.startsWith('+');
}

// Exact digit match against the example numbers used as placeholders in the
// WhatsApp "Do" field (e.g. "+48 123 123 123", "+48 502 345 678") — guards
// against ever prefilling the compose form's model with one of our own demo
// examples if a seed/demo record was ever created with one as literal data.
// Never used to reject a real, unrelated customer number.
const DEMO_PHONE_DIGITS = new Set(['48123123123', '48502345678']);
export function isLikelyDemoPhone(raw: string | null | undefined): boolean {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length > 0 && DEMO_PHONE_DIGITS.has(digits);
}

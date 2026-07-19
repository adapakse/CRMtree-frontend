// Formats a raw "Name <email>" / "email" address header — as returned by the
// Gmail, Outlook and Zoho parsers — into a single display string.
// Never returns a bare name without its address.
export function formatAddressDisplay(addrStr: string): string {
  if (!addrStr) return '';
  const decoded = addrStr
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const first = decoded.split(',')[0].trim();
  const nameMatch = first.match(/^(.+?)\s*<([^>]+)>/);
  if (nameMatch) {
    const name  = nameMatch[1].trim().replace(/^"(.*)"$/, '$1');
    const email = nameMatch[2].trim();
    return name ? `${name} <${email}>` : email;
  }
  const emailMatch = first.match(/<([^>]+)>/);
  if (emailMatch) return emailMatch[1].trim();
  return first;
}

// Number of additional recipients beyond the first in a comma-separated address list.
export function countExtraAddresses(addrStr: string): number {
  if (!addrStr) return 0;
  return addrStr.split(',').length - 1;
}

// Gmail (and Google Workspace via googlemail.com) ignores dots in the local
// part of an address and is case-insensitive — the same mailbox can appear
// as "first.last@gmail.com" in a stored profile and "firstlast@gmail.com" in
// a message's From/To header. Outlook/Zoho addresses have no such behavior,
// so the dot-stripping normalization is scoped to gmail.com/googlemail.com
// only — anywhere else, addresses are compared as plain, case-insensitive
// strings.
export function isSameMailboxAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const normalize = (addr: string): string => {
    const lower = addr.trim().toLowerCase();
    const at = lower.lastIndexOf('@');
    if (at < 0) return lower;
    const local  = lower.slice(0, at);
    const domain = lower.slice(at + 1);
    return (domain === 'gmail.com' || domain === 'googlemail.com')
      ? `${local.replace(/\./g, '')}@${domain}`
      : lower;
  };
  return normalize(a) === normalize(b);
}

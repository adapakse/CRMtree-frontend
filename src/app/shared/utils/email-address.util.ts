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

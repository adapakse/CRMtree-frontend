import { ALL_PHONE_COUNTRIES, PhoneCountry } from './phone-countries.data';

export type { PhoneCountry };
export const PHONE_COUNTRIES = ALL_PHONE_COUNTRIES;

// Shown at the top of the list, under the organisation's own country.
export const FREQUENT_COUNTRY_CODES = ['PL', 'DE', 'GB', 'CZ', 'UA'];

// The organisation's language decides the default prefix of a new number.
const COUNTRY_BY_LOCALE: Record<string, string> = {
  pl: 'PL', en: 'GB', de: 'DE', it: 'IT', es: 'ES', fr: 'FR', ro: 'RO', ru: 'RU', sl: 'SI', hr: 'HR',
};

// Several countries share a calling code; a typed "+1 …" or "+7 …" means the main one.
const MAIN_COUNTRY_BY_DIAL: Record<string, string> = {
  '1': 'US', '7': 'RU', '44': 'GB', '39': 'IT', '47': 'NO', '61': 'AU', '212': 'MA', '262': 'RE',
  '290': 'SH', '358': 'FI', '590': 'GP', '599': 'CW',
};

export function findCountry(iso: string): PhoneCountry | undefined {
  return PHONE_COUNTRIES.find(c => c.iso === iso);
}

export function countryForLocale(locale: string | null | undefined): PhoneCountry {
  return findCountry(COUNTRY_BY_LOCALE[(locale || '').toLowerCase()] ?? 'PL') ?? findCountry('PL')!;
}

/**
 * Splits a stored number ("+48 600 000 000") into its country and the rest.
 * A number without "+" has no known country: it keeps the fallback and the
 * whole text stays in the number part, so nothing is lost or rewritten.
 */
export function splitPhoneNumber(raw: string | null | undefined, fallback: PhoneCountry, current?: PhoneCountry):
  { country: PhoneCountry; number: string } {
  const text = (raw || '').trim();
  if (!text.startsWith('+')) return { country: fallback, number: text };
  const digits = text.slice(1).replace(/\D/g, '');
  const dial = [3, 2, 1].map(n => digits.slice(0, n)).find(code => PHONE_COUNTRIES.some(c => c.dial === code));
  if (!dial) return { country: fallback, number: text };
  const country = current?.dial === dial ? current
    : findCountry(MAIN_COUNTRY_BY_DIAL[dial] ?? '') ?? PHONE_COUNTRIES.find(c => c.dial === dial)!;
  const afterPlus = text.slice(1).trimStart();
  let consumed = 0;
  let index = 0;
  while (index < afterPlus.length && consumed < dial.length) {
    if (/\d/.test(afterPlus[index])) consumed++;
    index++;
  }
  return { country, number: afterPlus.slice(index).trim() };
}

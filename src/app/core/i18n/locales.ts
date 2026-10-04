// Interface languages of CRMtree. Polish is the source language: every text
// exists in Polish first and a missing translation falls back to it.
// Keep in sync with the backend's config/locales.js (and migration 0312).

export const SUPPORTED_LOCALES = ['pl', 'en', 'de', 'it', 'es', 'fr', 'ro', 'ru', 'sl', 'hr'] as const;

export type AppLocale = typeof SUPPORTED_LOCALES[number];

export const DEFAULT_LOCALE: AppLocale = 'pl';

/** Each language named in itself, as shown in the language picker. */
export const LOCALE_NAMES: Record<AppLocale, string> = {
  pl: 'Polski',
  en: 'English',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español',
  fr: 'Français',
  ro: 'Română',
  ru: 'Русский',
  sl: 'Slovenščina',
  hr: 'Hrvatski',
};

export function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

import { EnvironmentProviders, LOCALE_ID, Provider, inject, isDevMode } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeEn from '@angular/common/locales/en';
import localeEs from '@angular/common/locales/es';
import localeFr from '@angular/common/locales/fr';
import localeHr from '@angular/common/locales/hr';
import localeIt from '@angular/common/locales/it';
import localePl from '@angular/common/locales/pl';
import localeRo from '@angular/common/locales/ro';
import localeRu from '@angular/common/locales/ru';
import localeSl from '@angular/common/locales/sl';
import { provideTransloco } from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { LocaleService } from './locale.service';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales';
import { TranslationLoader } from './translation-loader';

const ANGULAR_LOCALE_DATA = [
  localePl, localeEn, localeDe, localeIt, localeEs, localeFr, localeRo, localeRu, localeSl, localeHr,
];

export function provideI18n(): (Provider | EnvironmentProviders)[] {
  // Date, number and currency pipes need the locale data of whichever language is active.
  for (const data of ANGULAR_LOCALE_DATA) registerLocaleData(data);

  return [
    provideTransloco({
      config: {
        availableLangs: [...SUPPORTED_LOCALES],
        defaultLang: DEFAULT_LOCALE,
        fallbackLang: DEFAULT_LOCALE,
        // The language changes only through a page reload (see LocaleService.change).
        reRenderOnLangChange: false,
        prodMode: !isDevMode(),
        missingHandler: {
          // A text missing in the active language is shown in Polish, never as a raw key.
          useFallbackTranslation: true,
          logMissingKey: isDevMode(),
        },
      },
      loader: TranslationLoader,
    }),
    // ICU plural / select syntax, the same one the mobile app's ARB files use.
    provideTranslocoMessageformat({ locales: [...SUPPORTED_LOCALES] }),
    // Angular reads LOCALE_ID after the app initializers ran, i.e. once
    // LocaleService.init() has settled on the language.
    { provide: LOCALE_ID, useFactory: () => inject(LocaleService).activeLocale() },
  ];
}

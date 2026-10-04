import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

// Translations shared by the whole app (buttons, common words) live in this
// scope; Transloco asks for it with a bare language code.
const ROOT_SCOPE = 'common';

/**
 * Loads `src/i18n/<scope>/<lang>.json`.
 *
 * The files are pulled in with a dynamic import instead of an HTTP request,
 * so the bundler emits them as hashed chunks: a deploy can never serve a
 * stale translation file from a cache, and server-side rendering needs no
 * special handling.
 */
@Injectable({ providedIn: 'root' })
export class TranslationLoader implements TranslocoLoader {
  getTranslation(path: string): Promise<Translation> {
    // Transloco passes "pl" for the root scope and "projects/pl" for a scope.
    const [scope, lang] = path.includes('/') ? path.split('/') : [ROOT_SCOPE, path];
    return import(`../../../i18n/${scope}/${lang}.json`)
      .then(module => module.default as Translation)
      // A file that does not exist yet yields no texts, and the Polish fallback takes over.
      .catch(() => ({}));
  }
}

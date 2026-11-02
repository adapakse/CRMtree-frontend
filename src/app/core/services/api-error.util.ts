import { TranslocoService } from '@jsverse/transloco';

/** The message the API put in a failed response (`{ error: "…" }`), if any. */
export function apiErrorMessage(error: unknown): string | undefined {
  return (error as { error?: { error?: string } } | null)?.error?.error;
}

/**
 * The API's own message, but only for a Polish interface. Older API messages are
 * Polish (API texts are not translated — decision of 2026-10-05), so for any other
 * language the caller's translated fallback is shown instead.
 */
export function localizedApiErrorMessage(message: string | undefined, transloco: TranslocoService): string | undefined {
  return transloco.getActiveLang() === 'pl' ? message : undefined;
}

import { HttpContextToken, HttpErrorResponse } from '@angular/common/http';
import { TranslocoService } from '@jsverse/transloco';
import { apiErrorMessage, localizedApiErrorMessage } from './api-error.util';

/**
 * Set on a request whose screen shows the failure itself (e.g. under a form),
 * so the global "save failed" toast does not repeat it.
 */
export const SHOWS_OWN_ERROR = new HttpContextToken<boolean>(() => false);

/**
 * Why a request failed, in the user's language — never a bare "something went
 * wrong". The API's own message is used where it is the most precise (Polish
 * interface only, see localizedApiErrorMessage); otherwise the HTTP status
 * tells the reason.
 */
export function describeHttpError(error: unknown, transloco: TranslocoService): string {
  const t = (key: string, params?: Record<string, unknown>) => transloco.translate(`httpErrors.${key}`, params);
  const err = error as HttpErrorResponse | null;
  const status = err?.status ?? -1;
  const apiMessage = localizedApiErrorMessage(apiErrorMessage(err), transloco);
  const details = (err?.error as { details?: { message?: string }[] } | null)?.details;

  if (status === 0) return t('offline');
  if (status === 400) {
    const detailText = transloco.getActiveLang() === 'pl'
      ? (details ?? []).map(d => d.message).filter(Boolean).join('; ')
      : '';
    if (detailText) return t('badRequestDetails', { details: detailText });
    if (apiMessage && apiMessage !== 'Validation failed') return apiMessage;
    return t('badRequest');
  }
  if (status === 401) return t('unauthorized');
  if (status === 403) return apiMessage || t('forbidden');
  if (status === 404) return t('notFound');
  if (status === 409) return apiMessage || t('conflict');
  if (status === 413) return t('tooLarge');
  if (status === 429) return t('tooManyRequests');
  if (status === 502 || status === 503 || status === 504) return t('unavailable');
  return t('server');
}

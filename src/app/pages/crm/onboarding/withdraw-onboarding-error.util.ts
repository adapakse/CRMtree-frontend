import { TranslocoService } from '@jsverse/transloco';
import { apiErrorMessage } from '../../../core/services/api-error.util';

/**
 * Message for a failed "withdraw from onboarding" request. Causes the UI can
 * name get a translated text; anything else (e.g. 409 — the partner is no longer
 * in onboarding) shows the API's own message, which is more precise than a
 * generic failure.
 */
export function withdrawOnboardingErrorMessage(err: unknown, transloco: TranslocoService): string {
  const status = (err as { status?: number } | null)?.status;
  const key = status === 403 ? 'noPermission' : status === 404 ? 'notFound' : status === 400 ? 'invalidStage' : null;
  if (key) return transloco.translate(`crm.onboardingBoard.withdraw.${key}`);
  return apiErrorMessage(err) ?? transloco.translate('crm.onboardingBoard.withdraw.failed');
}

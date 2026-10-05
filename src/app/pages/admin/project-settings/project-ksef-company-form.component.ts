import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../../core/services/toast.service';
import { KsefApiService, KsefCompany, KsefCompanyUpdatePayload } from '../../../core/services/ksef-api.service';
import { PROJECTS_SHARED_STYLES } from '../../projects/projects-shared.styles';

const NIP_LENGTH = 10;

interface ApiError {
  status?: number;
  error?: { error?: string; details?: { field: string }[] };
}

const ERROR_KEY_BY_STATUS: Record<number, string> = { 409: 'duplicateNip', 502: 'unreachable', 404: 'companyNotFound' };
// 400 covers several causes, so these are told apart by the API message.
const ERROR_KEY_BY_BAD_REQUEST_MESSAGE: Record<string, string> = {
  'Invalid NIP': 'invalidNip',
  'KSeF rejected the token for this NIP': 'tokenRejected',
  'KSeF integration is not configured': 'notConfigured',
};

/**
 * Translated text for the documented failures of the KSeF configuration
 * endpoints; anything else falls back to the API's own (English) message.
 */
export function describeKsefAdminError(err: ApiError, transloco: TranslocoService, fallbackKey: string): string {
  const message = err?.error?.error;
  let errorKey: string | undefined = ERROR_KEY_BY_STATUS[err?.status ?? 0];
  if (!errorKey && err?.status === 400) {
    const isNipRejectedByValidation = err.error?.details?.some(detail => detail.field === 'nip') === true;
    errorKey = ERROR_KEY_BY_BAD_REQUEST_MESSAGE[message ?? ''] ?? (isNipRejectedByValidation ? 'invalidNip' : undefined);
  }
  if (errorKey) return transloco.translate(`projects.ksef.settings.errors.${errorKey}`);
  return message ?? transloco.translate(fallbackKey);
}

/** Modal for adding a company whose invoices are downloaded from KSeF, or for renaming it / replacing its token. */
@Component({
  selector: 'wt-project-ksef-company-form',
  standalone: true,
  imports: [FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mol" *transloco="let t; prefix: 'projects'">
      <div class="mo">
        <div class="moh">
          <div class="mot">{{ t(company() ? 'ksef.settings.companyForm.editTitle' : 'ksef.settings.companyForm.addTitle') }}</div>
          <button class="mox" (click)="closed.emit()">✕</button>
        </div>
        <div class="mob">
          <div class="fg">
            <label class="fl">{{ t('ksef.nip') }} @if (!company()) { <span class="req">*</span> }</label>
            <input class="fi" [(ngModel)]="nip" [disabled]="company() !== null" maxlength="13" inputmode="numeric" autocomplete="off">
          </div>
          <div class="fg">
            <label class="fl">{{ t('ksef.settings.companyForm.name') }}</label>
            <input class="fi" [(ngModel)]="name" maxlength="200" autocomplete="off">
          </div>
          <div class="fg">
            <label class="fl">{{ t('ksef.settings.companyForm.token') }} @if (!company()) { <span class="req">*</span> }</label>
            <input class="fi" type="password" [(ngModel)]="token" autocomplete="new-password">
            <div class="hint">
              {{ company()
                ? t('ksef.settings.companyForm.tokenHintEdit', { hint: '••••' + company()!.token_hint })
                : t('ksef.settings.companyForm.tokenHintAdd') }}
            </div>
          </div>
        </div>
        <div class="mof">
          <button class="btn btn-g" (click)="closed.emit()">{{ 'actions.cancel' | transloco }}</button>
          <button class="btn btn-p" [disabled]="!isValid() || isSaving()" (click)="save()">
            {{ isSaving() ? t('ksef.settings.companyForm.verifying') : ('actions.save' | transloco) }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    :host { display:block; height:auto; }
    .hint { font-size:12px; color:var(--gray-500); line-height:1.5; }
    input:disabled { opacity:.75; cursor:not-allowed; }
  `],
})
export class ProjectKsefCompanyFormComponent implements OnInit {
  private readonly api = inject(KsefApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  /** null opens the form for a new company. */
  readonly company = input<KsefCompany | null>(null);

  readonly closed = output<void>();
  readonly saved = output<KsefCompany>();

  readonly isSaving = signal(false);
  nip = '';
  name = '';
  token = '';

  ngOnInit(): void {
    const company = this.company();
    if (!company) return;
    this.nip = company.nip;
    this.name = company.name ?? '';
  }

  isValid(): boolean {
    if (this.company()) return true;
    return this.nipDigits().length === NIP_LENGTH && this.token.trim() !== '';
  }

  save(): void {
    const company = this.company();
    const name = this.name.trim() || null;
    const token = this.token.trim();
    const request = company
      ? this.api.updateCompany(company.id, this.buildUpdate(company, name, token))
      : this.api.createCompany({ nip: this.nipDigits(), token, name });

    this.isSaving.set(true);
    request.subscribe({
      next: savedCompany => {
        this.isSaving.set(false);
        this.toast.success(this.transloco.translate(
          company ? 'projects.ksef.settings.companyForm.saved' : 'projects.ksef.settings.companyForm.added'));
        this.saved.emit(savedCompany);
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error(describeKsefAdminError(err, this.transloco, 'projects.ksef.settings.companyForm.saveFailed'));
      },
    });
  }

  private buildUpdate(company: KsefCompany, name: string | null, token: string): KsefCompanyUpdatePayload {
    return {
      ...(name !== company.name ? { name } : {}),
      // An empty field keeps the stored token.
      ...(token ? { token } : {}),
    };
  }

  // A NIP is often pasted as "123-456-78-90" or with a "PL" prefix.
  private nipDigits(): string {
    return this.nip.replace(/\D/g, '');
  }
}

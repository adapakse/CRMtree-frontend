import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';
import {
  OnboardingSurveyResponse, SurveyField, SurveySection,
  visibleSurveyFields, visibleSurveySections,
} from './onboarding-survey.schema';

// Read-only view of a tenant's onboarding survey for super admins (Tenants →
// "Ankieta"). The only place the survey's secrets are shown in plaintext.
@Component({
  selector: 'app-onboarding-survey-answers',
  standalone: true,
  imports: [CommonModule, TranslocoDirective],
  providers: [provideTranslocoScope('admin')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'admin'">
    @if (isLoading()) {
      <div class="state-msg">{{ t('onboardingSurvey.answers.loading') }}</div>
    } @else if (!survey() || survey()!.status === 'not_started') {
      <div class="state-msg">
        {{ t('onboardingSurvey.answers.notStarted') }}
      </div>
    } @else {
      <div class="survey-status">
        @if (survey()!.status === 'submitted') {
          <span class="badge badge-on">{{ t('onboardingSurvey.answers.statusSubmitted') }}</span>
          <span>{{ survey()!.submitted_at | date:'dd.MM.yyyy HH:mm' }}
            @if (survey()!.submitted_by_name) { · {{ survey()!.submitted_by_name }} }
          </span>
        } @else {
          <span class="badge badge-off">{{ t('onboardingSurvey.answers.statusDraft') }}</span>
        }
        <span class="survey-updated">{{ t('onboardingSurvey.answers.lastChange', { date: (survey()!.updated_at | date:'dd.MM.yyyy HH:mm') }) }}</span>
      </div>

      @for (section of sections(); track section.id) {
        <div class="answers-card">
          <div class="answers-title">{{ t(section.titleKey) }}</div>
          @for (field of fields(section); track field.key) {
            <div class="answer-row">
              <div class="answer-label">{{ t(field.labelKey) }}</div>
              <div class="answer-value">
                @if (field.type === 'secret') {
                  @if (secretValue(field.key); as secret) {
                    <code>{{ isRevealed(field.key) ? secret : '••••••••••••' }}</code>
                    <button class="btn-inline" (click)="toggleReveal(field.key)">{{ isRevealed(field.key) ? t('onboardingSurvey.answers.hideSecret') : t('onboardingSurvey.answers.showSecret') }}</button>
                    <button class="btn-inline" (click)="copySecret(secret)">{{ t('onboardingSurvey.answers.copySecret') }}</button>
                  } @else {
                    <span class="answer-empty">{{ t('onboardingSurvey.answers.secretNotProvided') }}</span>
                  }
                } @else {
                  @if (displayValue(field); as value) { {{ value }} } @else { <span class="answer-empty">—</span> }
                }
              </div>
            </div>
          }
        </div>
      }
    }
    </ng-container>
  `,
  styles: [`
    .state-msg { color: var(--gray-500); font-size: 14px; padding: 24px 0; text-align: center; }
    .survey-status { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--gray-700); margin-bottom: 16px; }
    .survey-updated { margin-left: auto; font-size: 12px; color: var(--gray-500); }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 500; }
    .badge-on  { background: color-mix(in srgb, #dcfce7 var(--tint-mix), var(--surface)); color: oklch(from #16a34a max(l, var(--text-min-l)) c h); }
    .badge-off { background: var(--gray-100); color: var(--gray-500); }
    .answers-card { background: var(--surface); border-radius: 12px; box-shadow: var(--shadow-sm); margin-bottom: 12px; overflow: hidden; }
    .answers-title { padding: 12px 16px; background: var(--gray-50); border-bottom: 1px solid var(--gray-200); font-size: 14px; font-weight: 600; color: var(--gray-800); }
    .answer-row { display: grid; grid-template-columns: 300px 1fr; gap: 16px; padding: 8px 16px; border-bottom: 1px solid var(--gray-100); font-size: 14px; }
    .answer-row:last-child { border-bottom: none; }
    .answer-label { color: var(--gray-500); }
    .answer-value { color: var(--gray-900); white-space: pre-wrap; word-break: break-word; }
    .answer-value code { background: var(--gray-100); padding: 1px 8px; border-radius: 999px; font-size: 12px; }
    .answer-empty { color: var(--gray-400); }
    .btn-inline {
      margin-left: 8px; padding: 2px 8px; font-size: 12px; background: var(--surface); color: var(--gray-700);
      border: 1px solid var(--gray-200); border-radius: 8px; cursor: pointer;
    }
    .btn-inline:hover { background: var(--gray-50); }
  `],
})
export class OnboardingSurveyAnswersComponent implements OnInit {
  private http  = inject(HttpClient);
  private toast = inject(ToastService);
  private transloco = inject(TranslocoService);

  readonly tenantId = input.required<string>();

  isLoading = signal(true);
  survey = signal<OnboardingSurveyResponse | null>(null);
  revealedSecretKeys = signal<string[]>([]);

  ngOnInit(): void {
    this.http.get<OnboardingSurveyResponse>(`${environment.apiUrl}/admin/tenants/${this.tenantId()}/onboarding-survey`).subscribe({
      next: survey => { this.survey.set(survey); this.isLoading.set(false); },
      error: () => { this.toast.error(this.transloco.translate('admin.onboardingSurvey.answers.loadFailed')); this.isLoading.set(false); },
    });
  }

  sections(): SurveySection[] { return visibleSurveySections(this.survey()?.answers ?? {}); }
  fields(section: SurveySection): SurveyField[] { return visibleSurveyFields(section, this.survey()?.answers ?? {}); }

  // Selects and checkboxes store option values; show the labels the tenant
  // admin actually picked from.
  displayValue(field: SurveyField): string {
    const value = this.survey()?.answers[field.key];
    if (value === undefined || value === '') return '';
    const optionLabel = (optionValue: string) => {
      const option = field.options?.find(candidate => candidate.value === optionValue);
      return option ? this.transloco.translate(`admin.${option.labelKey}`) : optionValue;
    };
    return Array.isArray(value) ? value.map(optionLabel).join(', ') : optionLabel(value);
  }

  secretValue(key: string): string | null { return this.survey()?.secrets?.[key] ?? null; }
  isRevealed(key: string): boolean { return this.revealedSecretKeys().includes(key); }

  toggleReveal(key: string): void {
    this.revealedSecretKeys.update(keys => keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key]);
  }

  copySecret(secret: string): void {
    navigator.clipboard.writeText(secret);
    this.toast.success(this.transloco.translate('admin.onboardingSurvey.answers.copied'));
  }
}

import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';
import {
  OnboardingSurveyResponse, SurveyAnswers, SurveyField, SurveySection,
  visibleSurveyFields, visibleSurveySections,
} from './onboarding-survey.schema';

const SURVEY_URL = `${environment.apiUrl}/admin/onboarding-survey`;

@Component({
  selector: 'app-onboarding-survey',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="topbar">
      <span class="page-title">Ankieta wdrożeniowa</span>
      @if (status() === 'submitted') {
        <span class="status-badge status-submitted">Wysłana {{ submittedAt() | date:'dd.MM.yyyy HH:mm' }}</span>
      } @else if (status() === 'draft') {
        <span class="status-badge status-draft">Wersja robocza</span>
      }
      <span class="tsp"></span>
      <a class="btn btn-g" routerLink="/admin/settings">← Ustawienia</a>
      <button class="btn btn-g" [disabled]="isSaving() || isLoading()" (click)="save(false)">Zapisz wersję roboczą</button>
      <button class="btn btn-p" [disabled]="isSaving() || isLoading()" (click)="save(true)">
        {{ status() === 'submitted' ? 'Wyślij ponownie' : 'Wyślij ankietę' }}
      </button>
    </div>

    <div id="content">
      @if (isLoading()) {
        <div class="loading-overlay"><div class="spinner"></div></div>
      } @else {
        <div class="survey">
          <div class="survey-intro">
            Na podstawie tej ankiety zespół CRMtree skonfiguruje Państwa środowisko. Można ją wypełniać etapami —
            „Zapisz wersję roboczą” zachowuje odpowiedzi, a „Wyślij ankietę” przekazuje je do nas.
            Pola oznaczone <span class="req">*</span> są wymagane do wysłania. Hasła, tokeny i klucze API są
            zapisywane w formie zaszyfrowanej i po zapisaniu nie są już wyświetlane.
          </div>

          @if (missingRequiredLabels().length > 0) {
            <div class="survey-errors">
              <strong>Uzupełnij wymagane pola, aby wysłać ankietę:</strong>
              <ul>
                @for (label of missingRequiredLabels(); track label) { <li>{{ label }}</li> }
              </ul>
            </div>
          }

          @for (section of visibleSections(); track section.id) {
            <div class="card survey-section">
              <h2 class="survey-section-title">{{ section.title }}</h2>
              @if (section.intro) { <p class="survey-section-intro">{{ section.intro }}</p> }

              @for (field of visibleFields(section); track field.key) {
                <div class="fg survey-field">
                  <label class="fl" [attr.for]="field.key">
                    {{ field.label }} @if (field.isRequired) { <span class="req">*</span> }
                  </label>

                  @switch (field.type) {
                    @case ('textarea') {
                      <textarea class="fta" rows="4" [id]="field.key" [placeholder]="field.placeholder ?? ''"
                                [(ngModel)]="answers[field.key]"></textarea>
                    }
                    @case ('select') {
                      <select class="fsel" [id]="field.key" [(ngModel)]="answers[field.key]">
                        <option value="">— wybierz —</option>
                        @for (option of field.options; track option.value) {
                          <option [value]="option.value">{{ option.label }}</option>
                        }
                      </select>
                    }
                    @case ('checkboxes') {
                      <div class="survey-options">
                        @for (option of field.options; track option.value) {
                          <label class="survey-option">
                            <input type="checkbox" [checked]="isOptionSelected(field.key, option.value)"
                                   (change)="toggleOption(field.key, option.value)">
                            <span>
                              {{ option.label }}
                              @if (option.hint) { <span class="survey-option-hint">{{ option.hint }}</span> }
                            </span>
                          </label>
                        }
                      </div>
                    }
                    @case ('secret') {
                      <input class="fi" type="password" autocomplete="new-password" [id]="field.key"
                             [placeholder]="isSecretSaved(field.key) ? '•••••••• zapisano — zostaw puste, aby nie zmieniać' : ''"
                             [(ngModel)]="secrets[field.key]">
                    }
                    @default {
                      <input class="fi" [type]="field.type" [id]="field.key" [placeholder]="field.placeholder ?? ''"
                             [(ngModel)]="answers[field.key]">
                    }
                  }

                  @if (field.hint) { <span class="survey-hint">{{ field.hint }}</span> }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .survey { max-width: 820px; }
    .survey-intro {
      background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px;
      padding: 14px 18px; margin-bottom: 20px; font-size: 13px; color: #1D4ED8; line-height: 1.55;
    }
    .survey-errors {
      background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px;
      padding: 12px 18px; margin-bottom: 20px; font-size: 13px; color: #B91C1C;
    }
    .survey-errors ul { margin: 6px 0 0; padding-left: 18px; }
    .survey-section { padding: 20px 22px; margin-bottom: 18px; }
    .survey-section-title { font-size: 15px; font-weight: 600; color: var(--gray-900); margin: 0 0 6px; }
    .survey-section-intro { font-size: 12.5px; color: var(--gray-500); margin: 0 0 14px; line-height: 1.5; }
    .survey-field { margin-top: 14px; }
    .survey-hint { font-size: 11.5px; color: var(--gray-400); line-height: 1.45; }
    .survey-options { display: flex; flex-direction: column; gap: 8px; }
    .survey-option { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--gray-700); cursor: pointer; }
    .survey-option input { margin-top: 3px; }
    .survey-option-hint { display: block; font-size: 11.5px; color: var(--gray-400); }
    .req { color: #dc2626; }
    .status-badge { margin-left: 12px; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 500; }
    .status-submitted { background: #dcfce7; color: #16a34a; }
    .status-draft { background: var(--gray-100); color: var(--gray-600); }
  `],
})
export class OnboardingSurveyComponent implements OnInit {
  private http  = inject(HttpClient);
  private toast = inject(ToastService);

  isLoading = signal(true);
  isSaving  = signal(false);
  status    = signal<OnboardingSurveyResponse['status']>('not_started');
  submittedAt = signal<string | null>(null);
  savedSecretKeys = signal<string[]>([]);
  missingRequiredLabels = signal<string[]>([]);

  answers: SurveyAnswers = {};
  secrets: Record<string, string> = {};

  ngOnInit(): void {
    this.http.get<OnboardingSurveyResponse>(SURVEY_URL).subscribe({
      next: survey => { this.applySurvey(survey); this.isLoading.set(false); },
      error: () => { this.toast.error('Nie udało się pobrać ankiety'); this.isLoading.set(false); },
    });
  }

  visibleSections(): SurveySection[] { return visibleSurveySections(this.answers); }
  visibleFields(section: SurveySection): SurveyField[] { return visibleSurveyFields(section, this.answers); }

  isSecretSaved(key: string): boolean { return this.savedSecretKeys().includes(key); }

  isOptionSelected(key: string, value: string): boolean {
    const selected = this.answers[key];
    return Array.isArray(selected) && selected.includes(value);
  }

  toggleOption(key: string, value: string): void {
    const selected = Array.isArray(this.answers[key]) ? this.answers[key] as string[] : [];
    this.answers[key] = selected.includes(value)
      ? selected.filter(item => item !== value)
      : [...selected, value];
  }

  save(isSubmit: boolean): void {
    if (isSubmit) {
      const missing = this.findMissingRequiredLabels();
      this.missingRequiredLabels.set(missing);
      if (missing.length > 0) {
        this.toast.error('Uzupełnij wymagane pola');
        document.getElementById('content')?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    this.isSaving.set(true);
    const body = { answers: this.answersForVisibleFields(), secrets: this.secrets };
    const request = isSubmit
      ? this.http.post<OnboardingSurveyResponse>(`${SURVEY_URL}/submit`, body)
      : this.http.put<OnboardingSurveyResponse>(SURVEY_URL, body);

    request.subscribe({
      next: survey => {
        this.applySurvey(survey);
        this.isSaving.set(false);
        this.toast.success(isSubmit ? 'Ankieta wysłana do zespołu CRMtree' : 'Wersja robocza zapisana');
      },
      error: err => { this.isSaving.set(false); this.toast.error(err?.error?.error ?? 'Błąd zapisu ankiety'); },
    });
  }

  private applySurvey(survey: OnboardingSurveyResponse): void {
    this.answers = { ...survey.answers };
    this.secrets = {};
    this.status.set(survey.status);
    this.submittedAt.set(survey.submitted_at);
    this.savedSecretKeys.set(survey.configured_secret_keys);
  }

  // Answers to questions that are no longer shown (e.g. a module was
  // unticked) are dropped, so super admins never act on a stale answer.
  // Number inputs yield numbers; the backend stores text only.
  private answersForVisibleFields(): SurveyAnswers {
    const visibleAnswers: SurveyAnswers = {};
    for (const section of this.visibleSections()) {
      for (const field of this.visibleFields(section)) {
        const value = this.answers[field.key];
        if (field.type === 'secret' || value === undefined || value === null || value === '') continue;
        visibleAnswers[field.key] = Array.isArray(value) ? value : String(value);
      }
    }
    return visibleAnswers;
  }

  private findMissingRequiredLabels(): string[] {
    const answered = this.answersForVisibleFields();
    return this.visibleSections()
      .flatMap(section => this.visibleFields(section))
      .filter(field => field.isRequired && !(answered[field.key]?.length))
      .map(field => field.label);
  }
}

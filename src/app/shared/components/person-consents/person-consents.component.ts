import { ChangeDetectionStrategy, Component, OnChanges, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { CrmApiService, PersonConsents } from '../../../core/services/crm-api.service';
import { EmailCampaignsService } from '../../../core/services/email-campaigns.service';
import { AuthService } from '../../../core/auth/auth.service';
import { describeHttpError } from '../../../core/services/http-error-message';
import { TenantDefaultLabelPipe } from '../../../core/i18n/tenant-default-label.pipe';

type PersonConsent = PersonConsents['consents'][number];
type ConsentChoice = 'granted' | 'denied' | 'no_data';

const KNOWN_SOURCES = ['sendgrid_unsubscribe', 'sendgrid_spam'];
const FALLBACK_CONSENT_KEY = 'marketing_comm';
const EMAIL_CONSENT_PATTERN = /e-?mail|newsletter/i;

/**
 * Per-person consents: each contact person (by e-mail address) has their own.
 * E-mail campaigns send only to people with the consent type the tenant
 * requires, so the card shows that one consent. Consent types are editable per
 * tenant, so its key is never assumed — it comes from the campaign settings.
 */
@Component({
  selector: 'wt-person-consents',
  standalone: true,
  imports: [DatePipe, TranslocoDirective, TenantDefaultLabelPipe],
  providers: [provideTranslocoScope('crm')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'crm.personConsents'">
      @if (isLoading() && !people().length) { <div class="pc-muted">{{ t('loading') }}</div> }
      @if (error()) { <div class="pc-err">{{ error() }}</div> }
      @if (!isLoading() && !people().length && !error()) { <div class="pc-muted">{{ t('noPeople') }}</div> }
      @for (person of people(); track person.email) {
        <div class="pc-person">
          <div class="pc-who">
            <b>{{ person.name || person.email }}</b>
            @if (person.is_main) { <span class="pc-tag">{{ t('mainContact') }}</span> }
            <div class="pc-mail">{{ person.email }}</div>
          </div>
          @if (shownConsent(person); as consent) {
            <div class="pc-label" [title]="consent.description | tenantLabel:'consentDescriptions'">{{ consent.label | tenantLabel:'consentLabels' }}</div>
            <div class="pc-opts" role="radiogroup" [attr.aria-label]="(consent.label | tenantLabel:'consentLabels') + ' — ' + (person.name || person.email)">
              @for (option of options; track option.value) {
                <button type="button" role="radio" [attr.aria-checked]="shownValue(person, consent) === option.value"
                        [class.on]="shownValue(person, consent) === option.value" [style.--c]="option.color"
                        [disabled]="!canEdit() || savingKey() === person.email + consent.consent_key"
                        (click)="pick(person, consent, option.value)">{{ t('values.' + option.value) }}</button>
              }
            </div>
            @if (draftFor(person, consent); as draft) {
              <div class="pc-form">
                <label class="pc-label" [attr.for]="'pcn-' + person.email">{{ t(draft.value === 'granted' ? 'noteRequired' : 'noteOptional') }}</label>
                <textarea [id]="'pcn-' + person.email" rows="2" maxlength="500" [value]="draft.note"
                          [placeholder]="t(draft.value === 'granted' ? 'grantedPlaceholder' : 'deniedPlaceholder')"
                          (input)="draft$.set({ ...draft, note: $any($event.target).value })"
                          [class.fi-err]="isNoteSubmitted() && !isNoteValid(draft)"></textarea>
                @if (isNoteSubmitted() && !isNoteValid(draft)) { <span class="ferr">{{ t('errors.note') }}</span> }
                <div class="pc-form-btns">
                  <button type="button" class="btn btn-sm btn-p" [disabled]="!!savingKey()"
                          (click)="isNoteValid(draft) ? save(person, draft.key, draft.value, draft.note) : isNoteSubmitted.set(true)">{{ t('save') }}</button>
                  <button type="button" class="btn btn-sm btn-g" (click)="draft$.set(null)">{{ t('cancel') }}</button>
                </div>
              </div>
            } @else if (consent.updated_at) {
              <div class="pc-meta">
                {{ consent.updated_at | date:'dd.MM.yyyy HH:mm' }}
                @if (isKnownSource(consent.source)) { · {{ t('sources.' + consent.source) }} }
                @else if (consent.updated_by_name) { · {{ consent.updated_by_name }} }
              </div>
              @if (consent.note) { <q class="pc-note">{{ consent.note }}</q> }
            }
          }
        </div>
      }
    </ng-container>
  `,
  styles: [`
    :host { display: block; }
    .pc-muted { font-size: 12px; color: var(--gray-400); padding: 4px 0; line-height: 1.5; }
    .pc-err { font-size: 12px; color: oklch(from #DC2626 max(l, var(--text-min-l)) c h); padding: 4px 0; }
    .pc-person { padding: 10px 0; border-bottom: 1px solid var(--gray-100); }
    .pc-person:last-child { border-bottom: none; padding-bottom: 0; }
    .pc-who b { font-size: 12px; color: var(--gray-700); font-weight: 600; }
    .pc-tag { margin-left: 6px; font-size: 10px; font-weight: 600; color: var(--chip-text); background: var(--chip-bg); border-radius: 4px; padding: 0 6px; }
    .pc-mail { font-size: 12px; color: var(--gray-500); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pc-label { display: block; font-size: 10px; color: var(--gray-400); margin: 6px 0 4px; }
    .pc-opts { display: flex; gap: 4px; }
    .pc-opts button { flex: 1; font-size: 10px; font-weight: 600; font-family: inherit; padding: 6px 2px; border-radius: 8px; border: 1px solid var(--gray-200);
                      background: var(--gray-50); color: var(--gray-500); cursor: pointer; line-height: 1.3; transition: all .12s; }
    .pc-opts button.on { background: var(--c); border-color: var(--c); color: var(--on-primary); }
    .pc-opts button:disabled { cursor: default; }
    .pc-opts button:not(.on):not(:disabled):hover { border-color: var(--c); color: oklch(from var(--c) max(l, var(--text-min-l)) c h); }
    .pc-meta { font-size: 10px; color: var(--gray-400); margin-top: 4px; }
    .pc-note { display: block; font-size: 12px; color: var(--gray-600); margin-top: 2px; line-height: 1.4; overflow-wrap: anywhere; }
    .pc-form { margin-top: 6px; }
    .pc-form textarea { width: 100%; box-sizing: border-box; resize: vertical; font: 12px/1.4 inherit; font-family: inherit; color: var(--gray-800);
                        background: var(--control-bg); border: 1px solid var(--control-border); border-radius: 8px; padding: 6px 8px; }
    .pc-form textarea:focus { outline: none; border-color: var(--orange); box-shadow: var(--ring-field); }
    .pc-form-btns { display: flex; gap: 6px; margin-top: 6px; }
  `],
})
export class PersonConsentsComponent implements OnChanges {
  private readonly api = inject(CrmApiService);
  private readonly campaigns = inject(EmailCampaignsService);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  readonly kind = input.required<'leads' | 'partners'>();
  readonly entityId = input.required<string | number | null | undefined>();
  readonly canEdit = input(false);
  /** Change it to load the people again, e.g. after the contacts were edited. */
  readonly reloadKey = input<unknown>(null);

  readonly people = signal<PersonConsents[]>([]);
  readonly isLoading = signal(false);
  readonly savingKey = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  /** A change in progress: the picked value and its note, waiting for "Save". */
  readonly draft$ = signal<{ email: string; key: string; value: ConsentChoice; note: string } | null>(null);
  /** Consent type the tenant's campaigns require; null until known or when the campaign settings are unavailable. */
  private readonly requiredConsentKey = signal<string | null>(null);
  private readonly allConsents = computed(() => this.people().flatMap(person => person.consents));
  private readonly shownConsentKey = computed(() => this.requiredConsentKey() ?? this.fallbackConsentKey());

  readonly options: { value: ConsentChoice; color: string }[] = [
    { value: 'granted', color: '#16A34A' },
    { value: 'denied',  color: '#DC2626' },
    { value: 'no_data', color: 'var(--gray-400)' },
  ];

  constructor() {
    if (this.auth.hasFeature('email_campaigns')) {
      this.campaigns.cachedSendgridStatus().subscribe(status => this.requiredConsentKey.set(status?.consent_key || null));
    }
  }

  ngOnChanges(): void { this.load(); }

  shownConsent(person: PersonConsents): PersonConsent | null {
    return person.consents.find(consent => consent.consent_key === this.shownConsentKey()) ?? null;
  }
  isKnownSource(source: string | null): boolean { return !!source && KNOWN_SOURCES.includes(source); }
  draftFor(person: PersonConsents, consent: PersonConsent) {
    const draft = this.draft$();
    return draft && draft.email === person.email && draft.key === consent.consent_key ? draft : null;
  }
  /** A granted consent needs a note on how it was obtained. */
  readonly isNoteSubmitted = signal(false);

  isNoteValid(draft: { value: string; note: string }): boolean { return draft.value !== 'granted' || draft.note.trim().length >= 3; }
  shownValue(person: PersonConsents, consent: PersonConsent): string { return this.draftFor(person, consent)?.value ?? consent.value; }

  /** "Unknown" saves at once; the other choices open the note first. */
  pick(person: PersonConsents, consent: PersonConsent, value: ConsentChoice): void {
    if (!this.canEdit() || !this.entityId()) return;
    if (value === 'no_data') {
      this.draft$.set(null);
      if (consent.value !== 'no_data') this.save(person, consent.consent_key, value, null);
      return;
    }
    this.isNoteSubmitted.set(false);
    this.draft$.set({ email: person.email, key: consent.consent_key, value, note: value === consent.value ? consent.note || '' : '' });
  }

  save(person: PersonConsents, key: string, value: ConsentChoice, note: string | null): void {
    const entityId = this.entityId();
    if (!entityId) return;
    this.savingKey.set(person.email + key);
    this.api.savePersonConsent(this.kind(), entityId, { email: person.email, key, value, note }).subscribe({
      next: list => { this.people.set(list); this.error.set(null); this.savingKey.set(null); this.draft$.set(null); },
      error: err => { this.error.set(describeHttpError(err, this.transloco)); this.savingKey.set(null); },
    });
  }

  private load(): void {
    const entityId = this.entityId();
    if (!entityId) { this.people.set([]); return; }
    this.isLoading.set(true);
    this.api.getPersonConsents(this.kind(), entityId).subscribe({
      next: people => { this.people.set(people); this.error.set(null); this.isLoading.set(false); },
      error: () => { this.error.set(this.transloco.translate('crm.personConsents.loadFailed')); this.isLoading.set(false); },
    });
  }

  /** Without the campaign settings: the classic marketing consent, else an e-mail-like type, else the first one. */
  private fallbackConsentKey(): string | null {
    const consents = this.allConsents();
    if (consents.some(consent => consent.consent_key === FALLBACK_CONSENT_KEY)) return FALLBACK_CONSENT_KEY;
    const emailLike = consents.find(consent => EMAIL_CONSENT_PATTERN.test(consent.consent_key) || EMAIL_CONSENT_PATTERN.test(consent.label));
    return emailLike?.consent_key ?? consents[0]?.consent_key ?? null;
  }
}

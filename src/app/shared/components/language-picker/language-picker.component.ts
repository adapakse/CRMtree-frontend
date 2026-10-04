import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AppLocale, DEFAULT_LOCALE, LOCALE_NAMES, SUPPORTED_LOCALES, isSupportedLocale } from '../../../core/i18n/locales';
import { ToastService } from '../../../core/services/toast.service';

/** Marks "no own choice — follow the organisation's default" in the user picker. */
const FOLLOW_TENANT = 'tenant';

/**
 * Interface language picker.
 *   - mode "user": the signed-in user's own language (or the browser's choice
 *     before login); may be left on the organisation's default.
 *   - mode "tenant": the organisation's default, set by the tenant admin.
 *   - mode "compact": a bare dropdown for the login page.
 * Changing the language reloads the page.
 */
@Component({
  selector: 'wt-language-picker',
  standalone: true,
  imports: [FormsModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'language'">
      @if (mode() === 'compact') {
        <select class="compact" [attr.aria-label]="t('title')" [ngModel]="selected()" (ngModelChange)="onChange($event)"
                [disabled]="isSaving()">
          @for (locale of locales; track locale) { <option [ngValue]="locale">{{ names[locale] }}</option> }
        </select>
      } @else {
        <div class="picker">
          <label class="fl" for="wt-language-{{ mode() }}">{{ t(mode() === 'tenant' ? 'tenantTitle' : 'title') }}</label>
          <select class="fsel" id="wt-language-{{ mode() }}" [ngModel]="selected()" (ngModelChange)="onChange($event)"
                  [disabled]="isSaving()">
            @if (mode() === 'user') {
              <option [ngValue]="followTenant">{{ t('followTenant', { language: names[tenantDefault()] }) }}</option>
            }
            @for (locale of locales; track locale) { <option [ngValue]="locale">{{ names[locale] }}</option> }
          </select>
          <div class="hint">{{ t(mode() === 'tenant' ? 'tenantHint' : 'hint') }}</div>
        </div>
      }
    </ng-container>
  `,
  styles: [`
    .picker { display:flex; flex-direction:column; gap:5px; max-width:360px; }
    .hint { font-size:11.5px; color:var(--gray-400); }
    .compact { border:1px solid var(--gray-200); border-radius:7px; padding:4px 8px; font-size:12px; color:var(--gray-600); background:white; cursor:pointer; font-family:inherit; }
  `],
})
export class LanguagePickerComponent {
  private readonly localeService = inject(LocaleService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly mode = input<'user' | 'tenant' | 'compact'>('user');

  readonly locales = SUPPORTED_LOCALES;
  readonly names = LOCALE_NAMES;
  readonly followTenant = FOLLOW_TENANT;
  readonly isSaving = signal(false);

  readonly tenantDefault = computed<AppLocale>(() => {
    const tenantLocale = this.auth.user()?.tenant_default_locale;
    return isSupportedLocale(tenantLocale) ? tenantLocale : DEFAULT_LOCALE;
  });

  readonly selected = computed<string>(() => {
    if (this.mode() === 'tenant') return this.tenantDefault();
    if (this.mode() === 'compact') return this.localeService.activeLocale();
    const ownLocale = this.auth.user()?.locale;
    return isSupportedLocale(ownLocale) ? ownLocale : FOLLOW_TENANT;
  });

  onChange(value: string): void {
    this.isSaving.set(true);
    const request = this.mode() === 'tenant'
      ? this.localeService.changeTenantDefault(value as AppLocale)
      : this.localeService.change(value === FOLLOW_TENANT ? null : value as AppLocale);
    // On success the page reloads, so only a failure needs handling here.
    request.catch(() => {
      this.isSaving.set(false);
      this.toast.error(this.transloco.translate('language.changeFailed'));
    });
  }
}

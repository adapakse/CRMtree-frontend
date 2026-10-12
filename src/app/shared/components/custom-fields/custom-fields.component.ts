import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { TenantFieldValue } from '../../../core/services/tenant-fields.service';

/** Kwota pola typu `money` trzymana jest razem z walutą. */
interface MoneyValue { amount: number; currency: string; }

const DEFAULT_CURRENCY = 'PLN';

/**
 * Pola dodatkowe zdefiniowane przez admina tenanta, na karcie leada, partnera
 * albo dokumentu (migracja 0328). Jeden komponent dla wszystkich trzech
 * formatek i dla obu trybów — podgląd na karcie i edycja w oknie — bo reguły
 * rysowania zależą wyłącznie od TYPU pola, a ten jest wszędzie ten sam.
 *
 * Wejściem są definicje RAZEM z wartościami (`custom_fields` z API), więc
 * komponent nie musi nic dopytywać: backend oddaje jedno i drugie w odpowiedzi
 * rekordu.
 *
 * Wychodzi mapa id → wartość, gotowa do wysłania jako `custom_values`.
 * Komponent niczego sam nie zapisuje: pola dodatkowe jadą razem z resztą
 * formularza, w tym samym żądaniu, więc „Zapisz" na karcie zapisuje wszystko
 * naraz i nie ma stanu, w którym część pól poszła, a część nie.
 */
@Component({
  selector: 'app-custom-fields',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (fields().length) {
      <div class="cf" [class.cf-view]="readonly()">
        @if (!readonly() && title()) { <div class="cf-title">{{ title() }}</div> }

        @for (f of fields(); track f.id) {
          <div class="cf-row">
            <label class="cf-label" [attr.for]="'cf-' + f.id">{{ f.name }}</label>

            @if (readonly()) {
              <span class="cf-value" [class.empty]="display(f) === null">
                {{ display(f) ?? t('customFields.notSet') }}
              </span>
            } @else {
              @switch (f.field_type) {
                @case ('list') {
                  <select class="fsel" [id]="'cf-' + f.id"
                          [ngModel]="asText(f)" (ngModelChange)="set(f, $event)">
                    <option value="">{{ t('customFields.choose') }}</option>
                    @for (option of f.options; track option) {
                      <option [value]="option">{{ option }}</option>
                    }
                  </select>
                }
                @case ('date') {
                  <input class="fin" type="date" [id]="'cf-' + f.id"
                         [ngModel]="asText(f)" (ngModelChange)="set(f, $event)">
                }
                @case ('number') {
                  <input class="fin" type="number" step="any" [id]="'cf-' + f.id"
                         [ngModel]="asText(f)" (ngModelChange)="set(f, $event)">
                }
                @case ('money') {
                  <span class="cf-money">
                    <input class="fin amount" type="number" step="0.01" [id]="'cf-' + f.id"
                           [ngModel]="moneyAmount(f)" (ngModelChange)="setMoneyAmount(f, $event)">
                    <input class="fin currency" maxlength="3" [placeholder]="defaultCurrency"
                           [ngModel]="moneyCurrency(f)" (ngModelChange)="setMoneyCurrency(f, $event)">
                  </span>
                }
                @default {
                  <input class="fin" [id]="'cf-' + f.id" maxlength="2000"
                         [ngModel]="asText(f)" (ngModelChange)="set(f, $event)">
                }
              }
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .cf { display:flex; flex-direction:column; gap:10px; }
    .cf-title {
      font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
      color:var(--gray-400); margin-bottom:2px;
    }
    .cf-row { display:flex; align-items:center; gap:12px; }
    .cf-label { flex:0 0 160px; font-size:12.5px; color:var(--gray-600); }
    .cf-row .fin, .cf-row .fsel { flex:1; min-width:0; }
    .cf-money { flex:1; display:flex; gap:8px; min-width:0; }
    .cf-money .amount { flex:1; min-width:0; }
    .cf-money .currency { flex:0 0 76px; text-transform:uppercase; }

    /* Podgląd na karcie: te same etykiety, ale bez kontrolek. */
    .cf-view .cf-row { gap:10px; align-items:baseline; }
    .cf-view .cf-label { flex:0 0 150px; }
    .cf-value { font-size:13px; color:var(--gray-800); word-break:break-word; }
    .cf-value.empty { color:var(--gray-400); font-style:italic; }
    @media (max-width: 720px) {
      .cf-row { flex-direction:column; align-items:stretch; gap:4px; }
      .cf-label { flex:none; }
    }
  `],
})
export class CustomFieldsComponent {
  private readonly transloco = inject(TranslocoService);

  readonly defaultCurrency = DEFAULT_CURRENCY;

  /** Definicje razem z wartościami rekordu — pole `custom_fields` z API. */
  readonly fields = input.required<TenantFieldValue[]>();
  readonly readonly = input(false);
  readonly title = input<string>('');
  /** Mapa id → wartość, do wysłania jako `custom_values`. */
  readonly valuesChange = output<Record<string, unknown>>();

  /** Robocze wartości; puste, dopóki użytkownik czegoś nie zmieni. */
  private draft: Record<string, unknown> = {};

  t(key: string): string {
    return this.transloco.translate(`crm.${key}`);
  }

  private current(field: TenantFieldValue): unknown {
    return field.id in this.draft ? this.draft[field.id] : field.value;
  }

  asText(field: TenantFieldValue): string {
    const value = this.current(field);
    return value === null || value === undefined ? '' : String(value);
  }

  moneyAmount(field: TenantFieldValue): number | '' {
    const value = this.current(field) as MoneyValue | null;
    return value && typeof value.amount === 'number' ? value.amount : '';
  }

  moneyCurrency(field: TenantFieldValue): string {
    const value = this.current(field) as MoneyValue | null;
    return value?.currency ?? '';
  }

  /** Wartość do pokazania na karcie; `null` = pole puste. */
  display(field: TenantFieldValue): string | null {
    const value = field.value;
    if (value === null || value === undefined || value === '') return null;
    if (field.field_type === 'money') {
      const money = value as MoneyValue;
      return `${money.amount} ${money.currency}`;
    }
    return String(value);
  }

  set(field: TenantFieldValue, raw: unknown): void {
    // Pusty tekst to wyczyszczenie pola, nie pusta wartość — backend kasuje
    // wtedy wpis, zamiast zapisywać pustkę.
    this.draft[field.id] = raw === '' || raw === null || raw === undefined ? null : raw;
    this.emit();
  }

  setMoneyAmount(field: TenantFieldValue, raw: unknown): void {
    const amount = raw === '' || raw === null ? null : Number(raw);
    if (amount === null) { this.set(field, null); return; }
    this.draft[field.id] = { amount, currency: this.moneyCurrency(field) || DEFAULT_CURRENCY };
    this.emit();
  }

  setMoneyCurrency(field: TenantFieldValue, raw: string): void {
    const currency = String(raw ?? '').toUpperCase();
    const amount = this.moneyAmount(field);
    // Sama waluta bez kwoty nie jest wartością — czekamy, aż pojawi się liczba.
    if (amount === '') return;
    this.draft[field.id] = { amount: Number(amount), currency };
    this.emit();
  }

  private emit(): void {
    this.valuesChange.emit({ ...this.draft });
  }

  /** Czyści robocze zmiany — po zapisaniu albo porzuceniu edycji. */
  reset(): void {
    this.draft = {};
  }
}

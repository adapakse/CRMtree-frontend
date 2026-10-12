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
                  <input class="fi" type="date" [id]="'cf-' + f.id"
                         [ngModel]="asText(f)" (ngModelChange)="set(f, $event)">
                }
                @case ('number') {
                  <input class="fi" type="number" step="any" [id]="'cf-' + f.id"
                         [ngModel]="asText(f)" (ngModelChange)="set(f, $event)">
                }
                @case ('money') {
                  <span class="cf-money">
                    <input class="fi amount" type="number" step="0.01" [id]="'cf-' + f.id"
                           [ngModel]="moneyAmount(f)" (ngModelChange)="setMoneyAmount(f, $event)">
                    <input class="fi currency" maxlength="3" [placeholder]="defaultCurrency"
                           [ngModel]="moneyCurrency(f)" (ngModelChange)="setMoneyCurrency(f, $event)">
                  </span>
                }
                @default {
                  <input class="fi" [id]="'cf-' + f.id" maxlength="2000"
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
    /* Dwa tryby, dwa osobne idiomy karty leada/partnera/dokumentu — pola
       dodatkowe maja wygladac jak pola wbudowane, a nie jak wstawka:
         - podglad: siatka auto/1fr i etykieta 11px/#9ca3af, dokladnie jak
           .info-grid i .lbl na karcie,
         - edycja: etykieta nad kontrolka, 12px/600/#374151, jak .edit-row label
           w oknie edycji. */
    .cf { display:flex; flex-direction:column; gap:12px; }
    .cf-title {
      font-size:11px; font-weight:700; letter-spacing:.6px; text-transform:uppercase;
      color:#9ca3af; margin-bottom:2px;
    }

    /* ── tryb edycji ─────────────────────────────────────────────── */
    .cf-row { display:flex; flex-direction:column; gap:4px; }
    .cf-label { font-size:12px; font-weight:600; color:#374151; }
    .cf-row .fi, .cf-row .fsel { width:100%; box-sizing:border-box; }
    .cf-money { display:flex; gap:8px; min-width:0; }
    .cf-money .amount { flex:1; min-width:0; }
    .cf-money .currency { flex:0 0 72px; text-transform:uppercase; text-align:center; }

    /* ── tryb podgladu na karcie ─────────────────────────────────── */
    .cf-view {
      display:grid; grid-template-columns:auto 1fr; gap:5px 10px;
      font-size:13px; align-items:baseline;
    }
    /* Wiersz przestaje byc pudelkiem — etykieta i wartosc wchodza wprost
       w siatke, zeby trzymaly te sama linie co pola wbudowane obok. */
    .cf-view .cf-row { display:contents; }
    .cf-view .cf-label {
      font-size:11px; font-weight:400; color:#9ca3af;
      white-space:nowrap; padding-top:2px;
    }
    .cf-value { color:var(--gray-800); word-break:break-word; }
    .cf-value.empty { color:#d1d5db; }

    @media (max-width: 720px) {
      .cf-view { grid-template-columns:1fr; gap:2px; }
      .cf-view .cf-label { padding-top:6px; }
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

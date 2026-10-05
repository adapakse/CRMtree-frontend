import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { Document } from '../../../core/models/models';
import { AppSettings, AppSettingsService } from '../../../core/services/app-settings.service';
import { BUILT_IN_PAYMENT_STATUSES } from '../../../core/services/helpers';
import { PROJECT_CURRENCIES, ProjectFinanceFormatService } from '../../../core/services/project-finance-format.service';
import { PaymentStatusBadgeComponent } from '../../../shared/components/payment-status-badge/payment-status-badge.component';

const DEFAULT_CURRENCY = 'PLN';
const DEFAULT_PAYMENT_STATUS = 'unpaid';
const PAYMENT_STATUSES_SETTING = 'doc_payment_statuses';

/** The fields a document has only when its type is "invoice". */
export interface InvoiceFieldsDraft {
  invoice_number: string;
  bank_account: string;
  payment_status: string;
  net_amount: number | null;
  vat_amount: number | null;
  gross_amount: number | null;
  currency: string;
}

export type InvoiceFieldsPayload = Partial<Pick<Document,
  'invoice_number' | 'bank_account' | 'payment_status' | 'net_amount' | 'vat_amount' | 'gross_amount' | 'currency'>>;

/** Payment status codes of the tenant; the built-in ones while the tenant has no dictionary of its own. */
export function paymentStatusCodes(settings: AppSettings | null | undefined): string[] {
  try {
    const raw = settings?.[PAYMENT_STATUSES_SETTING];
    if (raw) {
      const codes: unknown = JSON.parse(String(raw));
      if (Array.isArray(codes)) return codes.filter((code): code is string => typeof code === 'string' && code !== '');
    }
  } catch {
    // An unreadable value is treated like a missing dictionary.
  }
  return BUILT_IN_PAYMENT_STATUSES;
}

export function newInvoiceFieldsDraft(statusCodes: string[]): InvoiceFieldsDraft {
  return {
    invoice_number: '', bank_account: '',
    payment_status: statusCodes.includes(DEFAULT_PAYMENT_STATUS) ? DEFAULT_PAYMENT_STATUS : '',
    net_amount: null, vat_amount: null, gross_amount: null, currency: DEFAULT_CURRENCY,
  };
}

export function invoiceFieldsDraftOf(document: Document): InvoiceFieldsDraft {
  return {
    invoice_number: document.invoice_number ?? '',
    bank_account: document.bank_account ?? '',
    payment_status: document.payment_status ?? '',
    net_amount: document.net_amount ?? null,
    vat_amount: document.vat_amount ?? null,
    gross_amount: document.gross_amount ?? null,
    currency: document.currency ?? DEFAULT_CURRENCY,
  };
}

/**
 * The invoice fields to send. With `stored` only the changed ones: a payment
 * status the tenant has since removed from its dictionary is still shown on
 * the document, and sending it back untouched would make the API reject the
 * whole save.
 */
export function invoiceFieldsPayload(draft: InvoiceFieldsDraft, stored?: Document): InvoiceFieldsPayload {
  const values: Required<InvoiceFieldsPayload> = {
    invoice_number: draft.invoice_number.trim() || null,
    bank_account: draft.bank_account.trim() || null,
    payment_status: draft.payment_status || null,
    net_amount: draft.net_amount,
    vat_amount: draft.vat_amount,
    gross_amount: draft.gross_amount,
    currency: draft.currency || null,
  };
  if (!stored) return values;
  const fields = Object.keys(values) as (keyof InvoiceFieldsPayload)[];
  return Object.fromEntries(fields
    .filter(field => values[field] !== (stored[field] ?? null))
    .map(field => [field, values[field]]));
}

/**
 * "Invoice data" block of the document forms: invoice number, payment status,
 * amounts with their currency and the bank account. Rendered only for
 * documents of type invoice; `isReadOnly` shows the values without inputs.
 */
@Component({
  selector: 'wt-invoice-fields',
  standalone: true,
  imports: [FormsModule, TranslocoDirective, PaymentStatusBadgeComponent],
  providers: [provideTranslocoScope('documents')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'documents'">
      <div class="sec-title">{{ t('invoice.fields.title') }}</div>
      <div class="fgrid">
        <div class="fg">
          <label class="fl">{{ t('invoice.fields.invoiceNumber') }}</label>
          @if (isReadOnly()) {
            <div class="fi read-only">{{ value().invoice_number || '—' }}</div>
          } @else {
            <input class="fi" maxlength="256" [ngModel]="value().invoice_number" (ngModelChange)="patch({ invoice_number: $event })">
          }
        </div>
        <div class="fg">
          <label class="fl">{{ t('invoice.fields.paymentStatus') }}</label>
          @if (isReadOnly()) {
            <div class="badge-cell">
              <wt-payment-status-badge [status]="value().payment_status" [isOverdue]="isOverdue()" />
              @if (!value().payment_status && !isOverdue()) { — }
            </div>
          } @else {
            <select class="fsel" [ngModel]="value().payment_status" (ngModelChange)="patch({ payment_status: $event })">
              <option value="">{{ t('labels.options.choose') }}</option>
              @for (code of statusOptions(); track code) {
                <option [value]="code">{{ isBuiltInStatus(code) ? t('labels.paymentStatuses.' + code) : code }}</option>
              }
            </select>
          }
        </div>
        <div class="fg">
          <label class="fl">{{ t('invoice.fields.netAmount') }}</label>
          @if (isReadOnly()) {
            <div class="fi read-only">{{ format.money(value().net_amount, value().currency) }}</div>
          } @else {
            <input class="fi" type="number" min="0" step="0.01" [ngModel]="value().net_amount" (ngModelChange)="patch({ net_amount: $event })">
          }
        </div>
        <div class="fg">
          <label class="fl">{{ t('invoice.fields.vatAmount') }}</label>
          @if (isReadOnly()) {
            <div class="fi read-only">{{ format.money(value().vat_amount, value().currency) }}</div>
          } @else {
            <input class="fi" type="number" min="0" step="0.01" [ngModel]="value().vat_amount" (ngModelChange)="patch({ vat_amount: $event })">
          }
        </div>
        <div class="fg">
          <label class="fl">{{ t('invoice.fields.grossAmount') }}</label>
          @if (isReadOnly()) {
            <div class="fi read-only">{{ format.money(value().gross_amount, value().currency) }}</div>
          } @else {
            <input class="fi" type="number" min="0" step="0.01" [ngModel]="value().gross_amount" (ngModelChange)="patch({ gross_amount: $event })">
          }
        </div>
        <div class="fg">
          <label class="fl">{{ t('invoice.fields.currency') }}</label>
          @if (isReadOnly()) {
            <div class="fi read-only">{{ value().currency }}</div>
          } @else {
            <select class="fsel" [ngModel]="value().currency" (ngModelChange)="patch({ currency: $event })">
              @for (code of currencyOptions(); track code) { <option [value]="code">{{ code }}</option> }
            </select>
          }
        </div>
        <div class="fg full">
          <label class="fl">{{ t('invoice.fields.bankAccount') }}</label>
          @if (isReadOnly()) {
            <div class="fi read-only">{{ value().bank_account || '—' }}</div>
          } @else {
            <input class="fi" maxlength="64" [ngModel]="value().bank_account" (ngModelChange)="patch({ bank_account: $event })">
          }
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display:block; margin-top:20px; }
    .fi.read-only { background:var(--gray-100); color:var(--gray-600); }
    .badge-cell { padding-top:6px; font-size:13px; color:var(--gray-600); }
  `],
})
export class InvoiceFieldsComponent {
  private readonly settings = inject(AppSettingsService);
  readonly format = inject(ProjectFinanceFormatService);

  readonly value = model.required<InvoiceFieldsDraft>();
  readonly isReadOnly = input(false);
  /** Read-only view only: the due date has passed and the invoice is not paid. */
  readonly isOverdue = input<boolean | undefined>(false);

  // The stored status and currency stay selectable even when the tenant's
  // dictionary or the short currency list no longer contains them.
  readonly statusOptions = computed(() => withCurrentValue(paymentStatusCodes(this.settings.settings()), this.value().payment_status));
  readonly currencyOptions = computed(() => withCurrentValue(PROJECT_CURRENCIES, this.value().currency));

  isBuiltInStatus(code: string): boolean {
    return BUILT_IN_PAYMENT_STATUSES.includes(code);
  }

  patch(change: Partial<InvoiceFieldsDraft>): void {
    this.value.update(current => ({ ...current, ...change }));
  }
}

function withCurrentValue(options: string[], current: string): string[] {
  return !current || options.includes(current) ? options : [...options, current];
}

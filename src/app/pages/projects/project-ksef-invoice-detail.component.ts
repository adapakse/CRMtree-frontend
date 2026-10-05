import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { KsefApiService, KsefInvoiceDetail, KsefInvoiceLine } from '../../core/services/ksef-api.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectKsefLinksTableComponent } from './project-ksef-links-table.component';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { PROJECT_FINANCE_STYLES } from './project-finance.styles';
import { PROJECT_KSEF_STYLES } from './project-ksef.styles';

// Codes of the FA schema that have a translated name; anything else is shown as received.
const PAYMENT_FORM_KEYS: Record<string, string> = {
  1: 'cash', 2: 'card', 3: 'voucher', 4: 'cheque', 5: 'credit', 6: 'transfer', 7: 'mobile',
};
const KNOWN_INVOICE_TYPES = ['VAT', 'KOR', 'ZAL', 'ROZ', 'UPR', 'KOR_ZAL', 'KOR_ROZ'];

type LoadError = 'forbidden' | 'failed';
type PaidState = 'paid' | 'partiallyPaid' | 'unpaid' | 'unknown';

/** Read-only view of one KSeF invoice: parties, dates, payment data, line items, totals and its links. */
@Component({
  selector: 'wt-project-ksef-invoice-detail',
  standalone: true,
  imports: [TranslocoDirective, TranslocoPipe, ProjectKsefLinksTableComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mol" *transloco="let t; prefix: 'projects'" (click)="closed.emit()">
      <div class="mo" (click)="$event.stopPropagation()">
        <div class="moh">
          <div class="mot">
            {{ invoice() ? t('ksef.detail.title', { number: invoice()!.invoice_number ?? invoice()!.ksef_number }) : t('ksef.detail.titleLoading') }}
          </div>
          <button class="mox" (click)="closed.emit()">✕</button>
        </div>
        <div class="mob">
          @if (invoice(); as loaded) {
            <dl class="facts">
              <div class="fact"><dt>{{ t('ksef.detail.issueDate') }}</dt><dd>{{ format.date(loaded.issue_date) }}</dd></div>
              <div class="fact"><dt>{{ t('ksef.detail.saleDate') }}</dt><dd>{{ format.date(loaded.sale_date) }}</dd></div>
              <div class="fact"><dt>{{ t('ksef.detail.invoiceType') }}</dt><dd>{{ invoiceTypeKey(loaded) ? t(invoiceTypeKey(loaded)!) : (loaded.invoice_type ?? '—') }}</dd></div>
              <div class="fact wide"><dt>{{ t('ksef.detail.ksefNumber') }}</dt><dd class="mono">{{ loaded.ksef_number }}</dd></div>
            </dl>

            <div class="parties">
              <dl class="facts party">
                <div class="fact wide"><dt>{{ t('ksef.detail.seller') }}</dt><dd>{{ loaded.seller_name ?? '—' }}</dd></div>
                <div class="fact wide"><dt>{{ t('ksef.nip') }}</dt><dd>{{ loaded.seller_nip ?? '—' }}</dd></div>
                <div class="fact wide"><dt>{{ t('ksef.detail.address') }}</dt><dd>{{ loaded.seller_address ?? '—' }}</dd></div>
              </dl>
              <dl class="facts party">
                <div class="fact wide"><dt>{{ t('ksef.detail.buyer') }}</dt><dd>{{ loaded.buyer_name ?? '—' }}</dd></div>
                <div class="fact wide"><dt>{{ t('ksef.nip') }}</dt><dd>{{ loaded.buyer_nip ?? '—' }}</dd></div>
                <div class="fact wide"><dt>{{ t('ksef.detail.address') }}</dt><dd>{{ loaded.buyer_address ?? '—' }}</dd></div>
              </dl>
            </div>

            <div class="sec-title">{{ t('ksef.detail.payment.title') }}</div>
            <dl class="facts">
              <div class="fact"><dt>{{ t('ksef.detail.payment.state') }}</dt><dd>{{ t('ksef.detail.payment.states.' + paidState(loaded)) }}</dd></div>
              <div class="fact">
                <dt>{{ t('ksef.detail.payment.dueDates') }}</dt>
                <dd>{{ dueDates(loaded) }}</dd>
              </div>
              <div class="fact"><dt>{{ t('ksef.detail.payment.paymentDate') }}</dt><dd>{{ format.date(loaded.payment_date) }}</dd></div>
              <div class="fact"><dt>{{ t('ksef.detail.payment.amountDue') }}</dt><dd>{{ format.money(loaded.amount_due, loaded.currency) }}</dd></div>
              <div class="fact"><dt>{{ t('ksef.detail.payment.form') }}</dt><dd>{{ paymentFormKey(loaded) ? t(paymentFormKey(loaded)!) : (loaded.payment?.form ?? '—') }}</dd></div>
              <div class="fact wide">
                <dt>{{ t('ksef.detail.payment.bankAccounts') }}</dt>
                <dd>
                  @for (account of loaded.payment?.bank_accounts ?? []; track $index) {
                    <div>
                      <span class="mono">{{ account.number }}</span>
                      @if (account.bank_name) { · {{ account.bank_name }} }
                      @if (account.swift) { · {{ account.swift }} }
                      @if (account.is_factor) { <span class="pill status-pill">{{ t('ksef.detail.payment.factor') }}</span> }
                    </div>
                  } @empty {
                    <span class="mono">{{ loaded.bank_account ?? '—' }}</span>
                  }
                </dd>
              </div>
            </dl>

            <div class="sec-title">{{ t('ksef.detail.lines.title') }}</div>
            @if (loaded.lines.length === 0) {
              <p class="hint">{{ t('ksef.detail.lines.empty') }}</p>
            } @else {
              <div class="tw">
                <table class="grid">
                  <thead>
                    <tr>
                      <th>{{ t('ksef.detail.lines.number') }}</th>
                      <th>{{ t('ksef.detail.lines.name') }}</th>
                      <th class="amount">{{ t('ksef.detail.lines.quantity') }}</th>
                      <th class="amount">{{ t('ksef.detail.lines.unitNetPrice') }}</th>
                      <th class="amount">{{ t('ksef.detail.lines.netAmount') }}</th>
                      <th class="amount">{{ t('ksef.detail.lines.vatRate') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (line of loaded.lines; track $index) {
                      <tr>
                        <td>{{ line.number }}</td>
                        <td class="line-name">{{ line.name }}</td>
                        <td class="amount">{{ line.quantity }} {{ line.unit }}</td>
                        <td class="amount">{{ format.money(line.unit_net_price, loaded.currency) }}</td>
                        <td class="amount">{{ format.money(line.net_amount, loaded.currency) }}</td>
                        <td class="amount">{{ vatRate(line) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            <div class="totals">
              <span>{{ t('ksef.detail.totals.net') }} <strong>{{ format.money(loaded.net_amount, loaded.currency) }}</strong></span>
              <span>{{ t('ksef.detail.totals.vat') }} <strong>{{ format.money(loaded.vat_amount, loaded.currency) }}</strong></span>
              <span>{{ t('ksef.detail.totals.gross') }} <strong>{{ format.money(loaded.gross_amount, loaded.currency) }}</strong></span>
            </div>

            <div class="sec-title">{{ t('ksef.detail.links.title') }}</div>
            @if (loaded.links.length === 0) {
              <p class="hint">{{ t('ksef.detail.links.empty') }}</p>
            } @else {
              <wt-project-ksef-links-table [links]="loaded.links" [isDetailed]="true" />
              @if (loaded.linked_total !== null) {
                <p class="hint" [class.danger]="loaded.is_over_allocated">
                  {{ t('ksef.detail.links.linkedTotal', {
                    linked: format.money(loaded.linked_total, loaded.currency),
                    net: format.money(loaded.net_amount, loaded.currency)
                  }) }}
                  @if (loaded.is_over_allocated) { {{ t('ksef.otherLinks.overAllocated') }} }
                </p>
              }
            }
          } @else if (loadError(); as error) {
            <div class="notice error">{{ t(error === 'forbidden' ? 'ksef.errors.forbidden' : 'ksef.detail.loadFailed') }}</div>
          } @else {
            <div class="empty-state">{{ 'states.loading' | transloco }}</div>
          }
        </div>
        <div class="mof">
          <button class="btn btn-g" (click)="closed.emit()">{{ 'actions.close' | transloco }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [PROJECTS_SHARED_STYLES, PROJECT_FINANCE_STYLES, PROJECT_KSEF_STYLES, `
    .mol { cursor:default; text-align:left; white-space:normal; font-weight:400; }
    .mo { width:900px; max-height:92vh; display:flex; flex-direction:column; }
    .mob { overflow-y:auto; }
    .mob .sec-title { margin:6px 0 0; }
    .parties { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .party { padding:12px 14px; border:1px solid var(--gray-200); border-radius:9px; align-content:start; }
    .line-name { overflow-wrap:anywhere; }
    .totals { display:flex; justify-content:flex-end; gap:22px; flex-wrap:wrap; font-size:13px; color:var(--gray-600); font-variant-numeric:tabular-nums; }
    .totals strong { color:var(--gray-900); margin-left:4px; }
    @media (max-width: 700px) { .parties { grid-template-columns:1fr; } }
  `],
})
export class ProjectKsefInvoiceDetailComponent implements OnInit {
  private readonly api = inject(KsefApiService);
  readonly format = inject(ProjectFinanceFormatService);

  readonly invoiceId = input.required<string>();
  readonly closed = output<void>();

  readonly invoice = signal<KsefInvoiceDetail | null>(null);
  readonly loadError = signal<LoadError | null>(null);

  ngOnInit(): void {
    this.api.getInvoice(this.invoiceId()).subscribe({
      next: invoice => this.invoice.set(invoice),
      error: err => this.loadError.set(err?.status === 403 ? 'forbidden' : 'failed'),
    });
  }

  invoiceTypeKey(invoice: KsefInvoiceDetail): string | null {
    return invoice.invoice_type && KNOWN_INVOICE_TYPES.includes(invoice.invoice_type)
      ? `ksef.invoiceTypes.${invoice.invoice_type}` : null;
  }

  paymentFormKey(invoice: KsefInvoiceDetail): string | null {
    const formKey = PAYMENT_FORM_KEYS[invoice.payment?.form ?? ''];
    return formKey ? `ksef.paymentForms.${formKey}` : null;
  }

  paidState(invoice: KsefInvoiceDetail): PaidState {
    if (invoice.is_paid) return 'paid';
    if (invoice.payment?.is_partially_paid) return 'partiallyPaid';
    return invoice.is_paid === false ? 'unpaid' : 'unknown';
  }

  dueDates(invoice: KsefInvoiceDetail): string {
    const dates = invoice.payment?.due_dates?.length ? invoice.payment.due_dates : [invoice.payment_due_date];
    return dates.map(date => this.format.date(date)).join(', ');
  }

  // KSeF sends a rate either as a number of percent or as a code such as "zw" (exempt).
  vatRate(line: KsefInvoiceLine): string {
    if (line.vat_rate === null || line.vat_rate === '') return '—';
    return /^\d+([.,]\d+)?$/.test(String(line.vat_rate)) ? `${line.vat_rate}%` : String(line.vat_rate);
  }
}

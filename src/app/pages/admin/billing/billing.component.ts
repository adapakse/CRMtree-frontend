import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../core/services/toast.service';
import { Invoice, Tenant, BillingCycle, SellerConfig } from '../../../core/models/models';
import { environment } from '../../../../environments/environment';

const API = environment.apiUrl;

const CYCLE_LABELS: Record<BillingCycle, string> = { monthly: 'Miesięczny', annual: 'Roczny' };
const STATUS_LABELS: Record<Invoice['status'], string> = { issued: 'Wystawiona', void: 'Anulowana' };

interface InvoiceListResponse {
  data: Invoice[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Rozliczenia</h1>
          <p class="page-sub">{{ total() }} faktur{{ total() === 1 ? 'a' : '' }}</p>
        </div>
      </div>

      <!-- Dane sprzedawcy (CRMtree) — platform-wide, drives every invoice PDF -->
      <div class="seller-panel">
        <div class="seller-panel-header">
          <strong>Dane sprzedawcy (CRMtree)</strong>
        </div>
        @if (sellerConfigLoading()) {
          <div class="state-msg">Ładowanie...</div>
        } @else {
          <div class="seller-grid">
            <div class="field">
              <label>Nazwa firmy</label>
              <input [(ngModel)]="sellerConfigDraft.company_name" placeholder="np. CRMtree Sp. z o.o.">
            </div>
            <div class="field">
              <label>NIP</label>
              <input [(ngModel)]="sellerConfigDraft.nip" placeholder="np. 1234567890">
            </div>
            <div class="field">
              <label>Adres</label>
              <input [(ngModel)]="sellerConfigDraft.address" placeholder="ul. Przykładowa 1, 00-001 Warszawa">
            </div>
            <div class="field">
              <label>Nr rachunku bankowego</label>
              <input [(ngModel)]="sellerConfigDraft.bank_account_number" placeholder="PL00 0000 0000 0000 0000 0000 0000">
            </div>
            <div class="field">
              <label>Termin płatności (dni)</label>
              <input type="number" min="0" max="365" [(ngModel)]="sellerConfigDraft.payment_term_days">
            </div>
          </div>
          <div class="seller-panel-footer">
            <button class="btn-primary" [disabled]="savingSellerConfig()" (click)="saveSellerConfig()">
              {{ savingSellerConfig() ? 'Zapisuję...' : 'Zapisz dane sprzedawcy' }}
            </button>
          </div>
        }
      </div>

      <div class="toolbar">
        <div class="field">
          <label>Tenant</label>
          <select [(ngModel)]="filters.tenantId" (change)="onFilterChange()">
            <option value="">Wszyscy</option>
            @for (t of tenants(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }
          </select>
        </div>
        <div class="field">
          <label>Cykl</label>
          <select [(ngModel)]="filters.billingCycle" (change)="onFilterChange()">
            <option value="">Wszystkie</option>
            <option value="monthly">Miesięczny</option>
            <option value="annual">Roczny</option>
          </select>
        </div>
        <div class="field">
          <label>Status</label>
          <select [(ngModel)]="filters.status" (change)="onFilterChange()">
            <option value="">Wszystkie</option>
            <option value="issued">Wystawiona</option>
            <option value="void">Anulowana</option>
          </select>
        </div>
      </div>

      @if (loading()) {
        <div class="state-msg">Ładowanie...</div>
      } @else if (invoices().length === 0) {
        <div class="state-msg">Brak faktur dla wybranych filtrów.</div>
      } @else {
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nr faktury</th>
                <th>Tenant</th>
                <th>Plan</th>
                <th>Cykl</th>
                <th>Okres</th>
                <th>Aktywni użytkownicy</th>
                <th>Kwota brutto</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (inv of invoices(); track inv.id) {
                <tr>
                  <td><code class="inv-number">{{ inv.invoice_number }}</code></td>
                  <td>{{ inv.tenant_name }}</td>
                  <td>{{ inv.plan_name }}</td>
                  <td>{{ cycleLabel(inv.billing_cycle) }}</td>
                  <td class="td-muted">{{ inv.period_start | date:'dd.MM.yyyy' }} — {{ inv.period_end | date:'dd.MM.yyyy' }}</td>
                  <td>{{ inv.active_user_count }}</td>
                  <td>
                    {{ grossAmount(inv) }} {{ inv.currency }}
                    <div class="td-muted">netto {{ inv.total_amount_eur }} + VAT {{ inv.vat_rate }}%</div>
                  </td>
                  <td>
                    <span class="badge" [class.badge-on]="inv.status === 'issued'" [class.badge-off]="inv.status === 'void'"
                      [title]="inv.status === 'void' ? ('Powód: ' + inv.void_reason + ' (' + (inv.voided_at | date:'dd.MM.yyyy HH:mm') + ')') : ''">
                      {{ statusLabel(inv.status) }}
                    </span>
                  </td>
                  <td>
                    <div class="td-actions">
                      <button class="btn-icon" [disabled]="!inv.pdf_blob_path" title="Pobierz PDF" (click)="downloadPdf(inv)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7,10 12,15 17,10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      </button>
                      @if (inv.status === 'issued') {
                        <button class="btn-icon btn-danger-icon" title="Anuluj fakturę (void)" (click)="openVoidModal(inv)">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="8" y1="8" x2="16" y2="16"/>
                          </svg>
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (pages() > 1) {
          <div class="pagination">
            <button class="btn-secondary" [disabled]="page() === 1" (click)="setPage(page() - 1)">← Poprzednia</button>
            <span class="td-muted">Strona {{ page() }} z {{ pages() }}</span>
            <button class="btn-secondary" [disabled]="page() === pages()" (click)="setPage(page() + 1)">Następna →</button>
          </div>
        }
      }

      <!-- Void invoice confirm -->
      @if (voidTarget()) {
        <div class="modal-backdrop" (click)="cancelVoid()">
          <div class="modal modal-sm" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Anuluj fakturę</h2>
              <button class="btn-icon" (click)="cancelVoid()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <p>
                Anulujesz fakturę <strong>{{ voidTarget()!.invoice_number }}</strong>
                ({{ voidTarget()!.tenant_name }}, {{ voidTarget()!.total_amount_eur }} {{ voidTarget()!.currency }}).
              </p>
              <p class="hint">
                Dokument nie zostanie usunięty — pozostanie widoczny w historii ze statusem „Anulowana”.
                Po anulowaniu okres rozliczeniowy zwolni się i będzie można wygenerować poprawną fakturę.
              </p>
              <div class="field">
                <label>Powód anulowania (wymagany)</label>
                <textarea rows="3" [(ngModel)]="voidReason" placeholder="np. błędny plan / błędna kwota / literówka w danych nabywcy"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" (click)="cancelVoid()">Anuluj</button>
              <button class="btn-danger" [disabled]="voidSaving() || voidReason.trim().length < 3" (click)="confirmVoid()">
                {{ voidSaving() ? 'Anuluję...' : 'Anuluj fakturę' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 1400px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
    .page-title { font-size: 22px; font-weight: 600; color: var(--gray-900); margin: 0 0 2px; }
    .page-sub   { font-size: 13px; color: var(--gray-500); margin: 0; }
    .state-msg { color: var(--gray-500); font-size: 14px; padding: 24px 0; text-align: center; }

    .toolbar {
      display: flex; gap: 16px; background: white; border: 1px solid var(--gray-200);
      border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;
    }
    .field label { display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 4px; }
    .field select {
      padding: 7px 28px 7px 10px; border: 1px solid var(--gray-300); border-radius: 6px;
      font-size: 13px; background: white; min-width: 180px;
    }
    .field select:focus { outline: none; border-color: var(--orange); box-shadow: 0 0 0 2px rgba(59,170,93,.15); }

    .table-wrap { overflow-x: auto; }
    .data-table {
      width: 100%; border-collapse: collapse; font-size: 13.5px;
      background: white; border: 1px solid var(--gray-200); border-radius: 8px; overflow: hidden;
    }
    .data-table th {
      background: var(--gray-50); padding: 10px 14px; text-align: left;
      font-weight: 600; font-size: 11.5px; text-transform: uppercase; letter-spacing: .4px;
      color: var(--gray-500); border-bottom: 1px solid var(--gray-200);
    }
    .data-table td { padding: 12px 14px; border-bottom: 1px solid var(--gray-100); vertical-align: middle; }
    .data-table tr:last-child > td { border-bottom: none; }

    .inv-number { background: var(--gray-100); padding: 2px 7px; border-radius: 4px; font-size: 12px; color: var(--gray-700); }
    .td-muted { color: var(--gray-500); font-size: 13px; }

    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 500; }
    .badge-on  { background: #dcfce7; color: #16a34a; }
    .badge-off { background: var(--gray-100); color: var(--gray-500); }

    .btn-icon {
      width: 30px; height: 30px; border-radius: 6px; border: none; background: none;
      cursor: pointer; color: var(--gray-500);
      display: flex; align-items: center; justify-content: center; transition: background .12s, color .12s;
    }
    .btn-icon:hover:not(:disabled) { background: var(--gray-100); color: var(--gray-700); }
    .btn-icon:disabled { opacity: .35; cursor: not-allowed; }
    .btn-icon svg { width: 15px; height: 15px; }

    .btn-secondary {
      padding: 8px 18px; background: white; color: var(--gray-700);
      border: 1px solid var(--gray-300); border-radius: 7px; font-size: 13.5px;
      cursor: pointer; transition: background .12s;
    }
    .btn-secondary:hover:not(:disabled) { background: var(--gray-50); }
    .btn-secondary:disabled { opacity: .55; cursor: not-allowed; }

    .pagination { display: flex; align-items: center; gap: 12px; justify-content: flex-end; margin-top: 16px; }

    .field input:not([type=checkbox]), .field textarea {
      width: 100%; padding: 7px 10px; border: 1px solid var(--gray-300);
      border-radius: 6px; font-size: 13px; background: white; box-sizing: border-box; font-family: inherit;
    }
    .field input:focus, .field textarea:focus { outline: none; border-color: var(--orange); box-shadow: 0 0 0 2px rgba(59,170,93,.15); }
    .field textarea { resize: vertical; }

    .seller-panel {
      background: white; border: 1px solid var(--gray-200); border-radius: 8px;
      padding: 16px; margin-bottom: 16px;
    }
    .seller-panel-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
    .seller-panel-header strong { font-size: 14px; }
    .seller-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px 16px; margin-bottom: 14px;
    }
    .seller-panel-footer { display: flex; justify-content: flex-end; }

    .td-actions { display: flex; gap: 4px; justify-content: flex-end; }

    .btn-primary {
      padding: 8px 18px; background: var(--orange); color: white;
      border: none; border-radius: 7px; font-size: 13.5px; font-weight: 500;
      cursor: pointer; transition: background .12s;
    }
    .btn-primary:hover:not(:disabled) { background: var(--orange-dark); }
    .btn-primary:disabled { opacity: .55; cursor: not-allowed; }
    .btn-danger {
      padding: 8px 18px; background: #dc2626; color: white;
      border: none; border-radius: 7px; font-size: 13.5px; font-weight: 500; cursor: pointer;
    }
    .btn-danger:hover:not(:disabled) { background: #b91c1c; }
    .btn-danger:disabled { opacity: .55; cursor: not-allowed; }
    .btn-icon.btn-danger-icon { color: #dc2626; }
    .btn-icon.btn-danger-icon:hover { background: #fee2e2; color: #b91c1c; }

    /* Modal */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal { background: white; border-radius: 12px; width: 480px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
    .modal-sm { width: 360px; }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 22px 14px; border-bottom: 1px solid var(--gray-200);
    }
    .modal-header h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .modal-body { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
    .modal-body p { margin: 0; font-size: 14px; color: var(--gray-700); }
    .modal-footer {
      display: flex; gap: 8px; justify-content: flex-end;
      padding: 14px 22px 18px; border-top: 1px solid var(--gray-200);
    }
  `],
})
export class BillingComponent implements OnInit {
  private http  = inject(HttpClient);
  private toast = inject(ToastService);

  invoices = signal<Invoice[]>([]);
  tenants  = signal<Tenant[]>([]);
  loading  = signal(true);
  total    = signal(0);
  page     = signal(1);
  pages    = signal(1);

  filters = { tenantId: '', billingCycle: '', status: '' };

  sellerConfigLoading = signal(true);
  savingSellerConfig  = signal(false);
  sellerConfigDraft: { company_name: string; nip: string; address: string; bank_account_number: string; payment_term_days: number } =
    { company_name: '', nip: '', address: '', bank_account_number: '', payment_term_days: 14 };

  voidTarget = signal<Invoice | null>(null);
  voidReason = '';
  voidSaving = signal(false);

  ngOnInit(): void {
    this.http.get<Tenant[]>(`${API}/admin/tenants`).subscribe(ts => this.tenants.set(ts));
    this.loadSellerConfig();
    this.load();
  }

  private loadSellerConfig(): void {
    this.sellerConfigLoading.set(true);
    this.http.get<SellerConfig>(`${API}/admin/billing/seller-config`).subscribe({
      next: cfg => {
        this.sellerConfigDraft = {
          company_name: cfg.company_name ?? '',
          nip: cfg.nip ?? '',
          address: cfg.address ?? '',
          bank_account_number: cfg.bank_account_number ?? '',
          payment_term_days: cfg.payment_term_days,
        };
        this.sellerConfigLoading.set(false);
      },
      error: () => { this.toast.error('Błąd ładowania danych sprzedawcy'); this.sellerConfigLoading.set(false); },
    });
  }

  saveSellerConfig(): void {
    this.savingSellerConfig.set(true);
    const d = this.sellerConfigDraft;
    this.http.put<SellerConfig>(`${API}/admin/billing/seller-config`, {
      company_name: d.company_name || null,
      nip: d.nip || null,
      address: d.address || null,
      bank_account_number: d.bank_account_number || null,
      payment_term_days: d.payment_term_days,
    }).subscribe({
      next: () => { this.savingSellerConfig.set(false); this.toast.success('Dane sprzedawcy zapisane'); },
      error: err => { this.savingSellerConfig.set(false); this.toast.error(err?.error?.error ?? 'Błąd zapisu danych sprzedawcy'); },
    });
  }

  openVoidModal(inv: Invoice): void { this.voidReason = ''; this.voidTarget.set(inv); }
  cancelVoid(): void { this.voidTarget.set(null); }

  confirmVoid(): void {
    const inv = this.voidTarget();
    if (!inv || this.voidReason.trim().length < 3) return;
    this.voidSaving.set(true);
    this.http.put<Invoice>(`${API}/admin/billing/invoices/${inv.id}/void`, { reason: this.voidReason.trim() }).subscribe({
      next: updated => {
        this.invoices.update(is => is.map(i => i.id === updated.id ? { ...i, ...updated } : i));
        this.voidSaving.set(false);
        this.voidTarget.set(null);
        this.toast.success('Faktura anulowana — okres jest znów wolny do ponownego wygenerowania.');
      },
      error: err => { this.voidSaving.set(false); this.toast.error(err?.error?.error ?? 'Błąd anulowania faktury'); },
    });
  }

  cycleLabel(c: BillingCycle): string { return CYCLE_LABELS[c] ?? c; }
  statusLabel(s: Invoice['status']): string { return STATUS_LABELS[s] ?? s; }

  // total_amount_eur is net (przed VAT) — this is what the tenant actually
  // owes, shown as the primary figure in the list.
  grossAmount(inv: Invoice): string {
    return (Number(inv.total_amount_eur) + Number(inv.vat_amount_eur)).toFixed(2);
  }

  onFilterChange(): void { this.page.set(1); this.load(); }
  setPage(p: number): void { this.page.set(p); this.load(); }

  load(): void {
    this.loading.set(true);
    const params: Record<string, string> = { page: String(this.page()), limit: '50' };
    if (this.filters.tenantId)     params['tenant_id']     = this.filters.tenantId;
    if (this.filters.billingCycle) params['billing_cycle'] = this.filters.billingCycle;
    if (this.filters.status)       params['status']        = this.filters.status;

    this.http.get<InvoiceListResponse>(`${API}/admin/billing/invoices`, { params }).subscribe({
      next: res => {
        this.invoices.set(res.data);
        this.total.set(res.total);
        this.pages.set(res.pages);
        this.loading.set(false);
      },
      error: () => { this.toast.error('Nie udało się pobrać faktur'); this.loading.set(false); },
    });
  }

  downloadPdf(inv: Invoice): void {
    this.http.get(`${API}/admin/billing/invoices/${inv.id}/pdf`, { responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${inv.invoice_number}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Nie udało się pobrać PDF'),
    });
  }
}

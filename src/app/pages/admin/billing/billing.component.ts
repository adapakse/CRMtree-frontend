import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../core/services/toast.service';
import { Invoice, Tenant, BillingCycle } from '../../../core/models/models';
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
                <th>Kwota</th>
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
                  <td>{{ inv.total_amount_eur }} {{ inv.currency }}</td>
                  <td>
                    <span class="badge" [class.badge-on]="inv.status === 'issued'" [class.badge-off]="inv.status === 'void'">
                      {{ statusLabel(inv.status) }}
                    </span>
                  </td>
                  <td>
                    <button class="btn-icon" [disabled]="!inv.pdf_blob_path" title="Pobierz PDF" (click)="downloadPdf(inv)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7,10 12,15 17,10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </button>
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
      padding: 7px 10px; border: 1px solid var(--gray-300); border-radius: 6px;
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

  ngOnInit(): void {
    this.http.get<Tenant[]>(`${API}/admin/tenants`).subscribe(ts => this.tenants.set(ts));
    this.load();
  }

  cycleLabel(c: BillingCycle): string { return CYCLE_LABELS[c] ?? c; }
  statusLabel(s: Invoice['status']): string { return STATUS_LABELS[s] ?? s; }

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

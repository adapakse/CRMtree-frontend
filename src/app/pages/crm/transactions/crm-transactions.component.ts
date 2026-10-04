// src/app/pages/crm/transactions/crm-transactions.component.ts
import { Component, OnInit, inject, NgZone, ChangeDetectorRef} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CrmApiService, Transaction, PRODUCT_TYPE_ICONS, ProductType,
} from '../../../core/services/crm-api.service';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';

@Component({
  selector: 'wt-crm-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('crm')],
  template: `
<ng-container *transloco="let t; prefix: 'crm'">
<div class="txn-page">
  <div class="txn-header">
    <h1>{{ t('transactions.title') }}</h1>
  </div>

  <!-- KPI strip -->
  <div class="kpi-strip" *ngIf="report">
    <div class="kpi"><div class="kpi-val">{{report.transaction_count | number}}</div><div class="kpi-lbl">{{ t('transactions.kpi.count') }}</div></div>
    <div class="kpi accent"><div class="kpi-val">{{report.total_gross | number:'1.0-0'}} PLN</div><div class="kpi-lbl">{{ t('transactions.amounts.gross') }}</div></div>
    <div class="kpi green"><div class="kpi-val">{{report.total_margin | number:'1.0-0'}} PLN</div><div class="kpi-lbl">{{ t('transactions.amounts.margin') }}</div></div>
    <div class="kpi"><div class="kpi-val">{{report.margin_pct | number:'1.0-1'}}%</div><div class="kpi-lbl">{{ t('transactions.kpi.marginPct') }}</div></div>
    <div class="kpi"><div class="kpi-val">{{report.total_commission | number:'1.0-0'}} PLN</div><div class="kpi-lbl">{{ t('transactions.amounts.commission') }}</div></div>
    <div class="product-mix" *ngIf="productMix.length">
      <span class="mix-chip" *ngFor="let m of productMix.slice(0,5)">
        {{productIcon(m.product_type)}} {{productLabel(m.product_type)}} {{m.total_gross | number:'1.0-0'}} PLN
      </span>
    </div>
  </div>

  <!-- Filters -->
  <div class="txn-filters">
    <input type="date" [(ngModel)]="filterFrom" (ngModelChange)="reload()" class="filter-input" [placeholder]="t('transactions.filters.from')">
    <input type="date" [(ngModel)]="filterTo"   (ngModelChange)="reload()" class="filter-input" [placeholder]="t('transactions.filters.to')">
    <select [(ngModel)]="filterType" (ngModelChange)="reload()" class="filter-input">
      <option value="">{{ t('transactions.filters.allTypes') }}</option>
      <option *ngFor="let typeOption of typeOptions" [value]="typeOption.key">{{typeOption.icon}} {{productLabel(typeOption.key)}}</option>
    </select>
    <select [(ngModel)]="filterStatus" (ngModelChange)="reload()" class="filter-input">
      <option value="">{{ t('transactions.filters.allStatuses') }}</option>
      <option value="confirmed">✓ {{ t('transactions.statuses.confirmed') }}</option>
      <option value="cancelled">✗ {{ t('transactions.statuses.cancelled') }}</option>
      <option value="refunded">↩ {{ t('transactions.statuses.refunded') }}</option>
    </select>
    <span class="result-count">{{ t('transactions.filters.resultCount', { count: total }) }}</span>
  </div>

  <div *ngIf="loading" class="loading">{{ 'states.loading' | transloco }}</div>

  <div *ngIf="!loading" class="txn-table-wrap">
    <table class="txn-table">
      <thead>
        <tr>
          <th>{{ t('transactions.table.date') }}</th>
          <th>{{ t('transactions.table.reference') }}</th>
          <th>{{ t('transactions.table.partner') }}</th>
          <th>{{ t('transactions.table.traveler') }}</th>
          <th>{{ t('transactions.table.products') }}</th>
          <th class="num">{{ t('transactions.amounts.gross') }}</th>
          <th class="num green-th">{{ t('transactions.amounts.margin') }}</th>
          <th class="num">{{ t('transactions.amounts.commission') }}</th>
          <th>{{ t('transactions.table.status') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <ng-container *ngFor="let txn of transactions">
          <tr class="txn-row" [class.expanded]="expandedId === txn.id">
            <td class="muted">{{txn.transaction_date | date:'dd.MM.yyyy'}}</td>
            <td><code>{{txn.booking_ref || txn.external_id}}</code></td>
            <td>{{txn.partner_company || '—'}}</td>
            <td>
              {{txn.traveler_name || '—'}}
              <div class="row-sub" *ngIf="txn.traveler_email">{{txn.traveler_email}}</div>
            </td>
            <td>
              <div class="product-tags">
                <span class="ptag" *ngFor="let p of (txn.products || []).slice(0,3)">
                  {{productIcon(p.product_type)}} {{productLabel(p.product_type)}}
                </span>
                <span class="ptag more" *ngIf="(txn.products || []).length > 3">+{{(txn.products || []).length - 3}}</span>
              </div>
            </td>
            <td class="num">{{txn.total_gross | number:'1.0-0'}}</td>
            <td class="num green-cell">{{txn.total_margin | number:'1.0-0'}}</td>
            <td class="num">{{txn.total_commission | number:'1.0-0'}}</td>
            <td><span class="status-chip status-{{txn.status}}">{{statusLabel(txn.status)}}</span></td>
            <td><button class="expand-btn" (click)="toggleExpand(txn.id)">{{expandedId === txn.id ? '▲' : '▼'}}</button></td>
          </tr>
          <!-- Expanded products -->
          <tr *ngIf="expandedId === txn.id" class="detail-row">
            <td colspan="10">
              <table class="products-table">
                <thead>
                  <tr><th>{{ t('transactions.products.type') }}</th><th>{{ t('transactions.products.product') }}</th><th>{{ t('transactions.products.routeOrPlace') }}</th><th>{{ t('transactions.products.time') }}</th><th class="num">{{ t('transactions.amounts.net') }}</th><th class="num">{{ t('transactions.amounts.gross') }}</th><th class="num">{{ t('transactions.amounts.commission') }}</th><th class="num">{{ t('transactions.amounts.margin') }}</th><th>{{ t('transactions.products.pax') }}</th></tr>
                </thead>
                <tbody>
                  <tr *ngFor="let p of (txn.products || [])">
                    <td>{{productIcon(p.product_type)}} {{productLabel(p.product_type)}}</td>
                    <td>
                      <strong>{{p.product_name || p.hotel_name || p.flight_number || p.car_category || '—'}}</strong>
                      <div class="row-sub" *ngIf="p.airline">{{p.airline}} {{p.cabin_class}}</div>
                      <div class="row-sub" *ngIf="p.hotel_stars">{{stars(p.hotel_stars)}} {{p.room_type}}</div>
                      <div class="row-sub" *ngIf="p.supplier">{{p.supplier}}</div>
                    </td>
                    <td>
                      <span *ngIf="p.origin_city">{{p.origin_city}} → {{p.destination_city}}</span>
                      <span *ngIf="!p.origin_city && (p.hotel_name || p.destination_city)">{{p.destination_city}}</span>
                      <div class="row-sub" *ngIf="p.pickup_location">{{p.pickup_location}}</div>
                    </td>
                    <td class="muted">
                      <span *ngIf="p.departure_at">{{p.departure_at | date:'dd.MM HH:mm'}}</span>
                      <span *ngIf="p.check_in">{{p.check_in | date:'dd.MM'}} – {{p.check_out | date:'dd.MM'}}</span>
                    </td>
                    <td class="num">{{p.net_cost | number:'1.0-0'}}</td>
                    <td class="num">{{p.gross_cost | number:'1.0-0'}}</td>
                    <td class="num muted">
                      <span *ngIf="p.commission_pct">{{(p.commission_pct * 100) | number:'1.0-1'}}%</span>
                      <div *ngIf="p.commission_amt">{{p.commission_amt | number:'1.0-0'}}</div>
                    </td>
                    <td class="num green-cell">{{p.margin_amt | number:'1.0-0'}}</td>
                    <td class="num">{{p.pax_count}}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </ng-container>
        <tr *ngIf="transactions.length === 0">
          <td colspan="10" class="empty-msg">{{ t('transactions.table.empty') }}</td>
        </tr>
      </tbody>
    </table>
    <div class="pager" *ngIf="totalPages > 1">
      <button (click)="prevPage()" [disabled]="page <= 1">‹</button>
      <span>{{page}} / {{totalPages}}</span>
      <button (click)="nextPage()" [disabled]="page >= totalPages">›</button>
    </div>
  </div>
</div>
</ng-container>
  `,
  styles: [`
    .txn-page { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .txn-header { display:flex; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid #e5e7eb; }
    .txn-header h1 { font-size:18px; font-weight:700; margin:0; flex:1; }
    .kpi-strip { display:flex; align-items:center; gap:24px; flex-wrap:wrap; padding:14px 20px; border-bottom:1px solid #f3f4f6; background:#fafafa; }
    .kpi { }
    .kpi-val { font-size:18px; font-weight:800; }
    .kpi-lbl { font-size:10px; color:#9ca3af; text-transform:uppercase; }
    .kpi.accent .kpi-val { color:#f97316; }
    .kpi.green .kpi-val { color:#16a34a; }
    .product-mix { display:flex; gap:6px; flex-wrap:wrap; }
    .mix-chip { background:#f3f4f6; border-radius:8px; padding:3px 10px; font-size:11px; font-weight:600; }
    .txn-filters { display:flex; gap:10px; padding:10px 20px; border-bottom:1px solid #f3f4f6; align-items:center; flex-wrap:wrap; }
    .filter-input { border:1px solid #d1d5db; border-radius:8px; padding:6px 10px; font-size:12px; outline:none; }
    .filter-input:focus { border-color:#f97316; }
    .result-count { font-size:11px; color:#9ca3af; margin-left:auto; }
    .loading { padding:40px; text-align:center; color:#9ca3af; }
    .txn-table-wrap { flex:1; overflow:auto; }
    .txn-table { width:100%; border-collapse:collapse; }
    .txn-table th { text-align:left; padding:10px 12px; font-size:11px; color:#6b7280; font-weight:600; border-bottom:2px solid #f3f4f6; white-space:nowrap; }
    .txn-row { cursor:pointer; }
    .txn-row:hover td { background:#fafafa; }
    .txn-row.expanded td { background:#fff7ed; }
    .txn-table td { padding:8px 12px; border-bottom:1px solid #f3f4f6; font-size:12px; vertical-align:middle; }
    .num { text-align:right; font-variant-numeric:tabular-nums; }
    .green-th { color:#16a34a; }
    .green-cell { color:#16a34a; font-weight:700; }
    .muted { color:#9ca3af; }
    .row-sub { font-size:10px; color:#9ca3af; }
    code { font-size:11px; background:#f3f4f6; border-radius:4px; padding:1px 5px; }
    .product-tags { display:flex; flex-wrap:wrap; gap:3px; }
    .ptag { font-size:10px; background:#f3f4f6; border-radius:6px; padding:1px 6px; }
    .ptag.more { background:#e5e7eb; color:#6b7280; }
    .status-chip { padding:2px 8px; border-radius:8px; font-size:11px; font-weight:600; }
    .status-confirmed { background:#dcfce7; color:#166534; }
    .status-cancelled  { background:#fee2e2; color:#991b1b; }
    .status-refunded   { background:#fef3c7; color:#92400e; }
    .expand-btn { background:none; border:none; cursor:pointer; font-size:11px; color:#9ca3af; padding:2px 6px; }
    .detail-row td { background:#fff7ed; padding:0; }
    .products-table { width:100%; border-collapse:collapse; padding:8px 16px; }
    .products-table th { font-size:10px; color:#9ca3af; padding:6px 10px; border-bottom:1px solid #f3f4f6; text-align:left; }
    .products-table td { font-size:11px; padding:6px 10px; border-bottom:1px solid #f9fafb; vertical-align:top; }
    .empty-msg { text-align:center; color:#9ca3af; padding:32px; }
    .pager { display:flex; justify-content:center; gap:12px; align-items:center; padding:12px; }
    .pager button { border:1px solid #e5e7eb; background:white; border-radius:6px; padding:4px 12px; cursor:pointer; }
    .pager button:disabled { opacity:.4; cursor:default; }
  `],
})
export class CrmTransactionsComponent implements OnInit {
  private api = inject(CrmApiService);
  private zone = inject(NgZone);
  private cdr  = inject(ChangeDetectorRef);
  private transloco = inject(TranslocoService);

  transactions: Transaction[] = [];
  report: any = null;
  productMix: any[] = [];
  loading = false;
  total = 0;
  page = 1;
  pageSize = 50;
  expandedId: number | null = null;

  filterFrom = '';
  filterTo = '';
  filterType = '';
  filterStatus = '';

  typeOptions = (Object.keys(PRODUCT_TYPE_ICONS) as ProductType[])
    .map(key => ({ key, icon: PRODUCT_TYPE_ICONS[key] }));

  get totalPages() { return Math.ceil(this.total / this.pageSize); }

  ngOnInit() { this.reload(); this.loadReport(); }

  reload() {
    this.loading = true;
    const p: any = { page: this.page, limit: this.pageSize };
    if (this.filterFrom)   p.date_from = this.filterFrom;
    if (this.filterTo)     p.date_to   = this.filterTo;
    if (this.filterStatus) p.status    = this.filterStatus;
    this.api.getTransactions(p).subscribe({
      next: r => { this.transactions = r.data; this.total = r.total; this.zone.run(() => { this.loading = false; }); this.cdr.markForCheck(); },
      error: () => { this.zone.run(() => { this.loading = false; }); this.cdr.markForCheck(); },
    });
  }

  loadReport() {
    this.api.getTransactionReport().subscribe({
      next: r => { this.zone.run(() => { this.report = r.summary; this.productMix = r.by_product_type || []; this.cdr.markForCheck(); }); },
      error: () => {},
    });
  }

  toggleExpand(id: number) { this.expandedId = this.expandedId === id ? null : id; }
  productLabel(t: string) { return t in PRODUCT_TYPE_ICONS ? this.transloco.translate('crm.labels.productTypes.' + t) : t; }
  productIcon(t: string)  { return PRODUCT_TYPE_ICONS[t as ProductType] || '📦'; }
  statusLabel(s: string)  { return ['confirmed', 'cancelled', 'refunded'].includes(s) ? this.transloco.translate('crm.transactions.statuses.' + s) : s; }
  stars(n: number) { return '★'.repeat(n); }
  prevPage() { if (this.page > 1) { this.page--; this.reload(); } }
  nextPage() { if (this.page < this.totalPages) { this.page++; this.reload(); } }
}

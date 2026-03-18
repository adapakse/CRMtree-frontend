// src/app/pages/crm/transactions/crm-transactions.component.ts
import { Component, OnInit, inject, NgZone, ChangeDetectorRef} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CrmApiService, Transaction, PRODUCT_TYPE_LABELS, PRODUCT_TYPE_ICONS, ProductType,
} from '../../../core/services/crm-api.service';

@Component({
  selector: 'wt-crm-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="txn-page">
  <div class="txn-header">
    <h1>Transakcje</h1>
  </div>

  <!-- KPI strip -->
  <div class="kpi-strip" *ngIf="report">
    <div class="kpi"><div class="kpi-val">{{report.transaction_count | number}}</div><div class="kpi-lbl">Transakcji</div></div>
    <div class="kpi accent"><div class="kpi-val">{{report.total_gross | number:'1.0-0'}} PLN</div><div class="kpi-lbl">Brutto</div></div>
    <div class="kpi green"><div class="kpi-val">{{report.total_margin | number:'1.0-0'}} PLN</div><div class="kpi-lbl">Marża</div></div>
    <div class="kpi"><div class="kpi-val">{{report.margin_pct | number:'1.0-1'}}%</div><div class="kpi-lbl">Marża %</div></div>
    <div class="kpi"><div class="kpi-val">{{report.total_commission | number:'1.0-0'}} PLN</div><div class="kpi-lbl">Prowizja</div></div>
    <div class="product-mix" *ngIf="productMix.length">
      <span class="mix-chip" *ngFor="let m of productMix.slice(0,5)">
        {{productIcon(m.product_type)}} {{productLabel(m.product_type)}} {{m.total_gross | number:'1.0-0'}} PLN
      </span>
    </div>
  </div>

  <!-- Filters -->
  <div class="txn-filters">
    <input type="date" [(ngModel)]="filterFrom" (ngModelChange)="reload()" class="filter-input" placeholder="Od">
    <input type="date" [(ngModel)]="filterTo"   (ngModelChange)="reload()" class="filter-input" placeholder="Do">
    <select [(ngModel)]="filterType" (ngModelChange)="reload()" class="filter-input">
      <option value="">Wszystkie typy</option>
      <option *ngFor="let t of typeOptions" [value]="t.key">{{t.icon}} {{t.label}}</option>
    </select>
    <select [(ngModel)]="filterStatus" (ngModelChange)="reload()" class="filter-input">
      <option value="">Wszystkie statusy</option>
      <option value="confirmed">✓ Potwierdzona</option>
      <option value="cancelled">✗ Anulowana</option>
      <option value="refunded">↩ Zwrot</option>
    </select>
    <span class="result-count">{{total}} transakcji</span>
  </div>

  <div *ngIf="loading" class="loading">Ładowanie…</div>

  <div *ngIf="!loading" class="txn-table-wrap">
    <table class="txn-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Ref.</th>
          <th>Partner</th>
          <th>Podróżny</th>
          <th>Produkty</th>
          <th class="num">Brutto</th>
          <th class="num green-th">Marża</th>
          <th class="num">Prowizja</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <ng-container *ngFor="let t of transactions">
          <tr class="txn-row" [class.expanded]="expandedId === t.id">
            <td class="muted">{{t.transaction_date | date:'dd.MM.yyyy'}}</td>
            <td><code>{{t.booking_ref || t.external_id}}</code></td>
            <td>{{t.partner_company || '—'}}</td>
            <td>
              {{t.traveler_name || '—'}}
              <div class="row-sub" *ngIf="t.traveler_email">{{t.traveler_email}}</div>
            </td>
            <td>
              <div class="product-tags">
                <span class="ptag" *ngFor="let p of (t.products || []).slice(0,3)">
                  {{productIcon(p.product_type)}} {{productLabel(p.product_type)}}
                </span>
                <span class="ptag more" *ngIf="(t.products || []).length > 3">+{{(t.products || []).length - 3}}</span>
              </div>
            </td>
            <td class="num">{{t.total_gross | number:'1.0-0'}}</td>
            <td class="num green-cell">{{t.total_margin | number:'1.0-0'}}</td>
            <td class="num">{{t.total_commission | number:'1.0-0'}}</td>
            <td><span class="status-chip status-{{t.status}}">{{statusLabel(t.status)}}</span></td>
            <td><button class="expand-btn" (click)="toggleExpand(t.id)">{{expandedId === t.id ? '▲' : '▼'}}</button></td>
          </tr>
          <!-- Expanded products -->
          <tr *ngIf="expandedId === t.id" class="detail-row">
            <td colspan="10">
              <table class="products-table">
                <thead>
                  <tr><th>Typ</th><th>Produkt</th><th>Trasa / Miejsce</th><th>Czas</th><th class="num">Netto</th><th class="num">Brutto</th><th class="num">Prowizja</th><th class="num">Marża</th><th>Pax</th></tr>
                </thead>
                <tbody>
                  <tr *ngFor="let p of (t.products || [])">
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
          <td colspan="10" class="empty-msg">Brak transakcji spełniających kryteria.</td>
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

  typeOptions = Object.entries(PRODUCT_TYPE_LABELS)
    .map(([key, label]) => ({ key: key as ProductType, label, icon: PRODUCT_TYPE_ICONS[key as ProductType] }));

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
  productLabel(t: string) { return PRODUCT_TYPE_LABELS[t as ProductType] || t; }
  productIcon(t: string)  { return PRODUCT_TYPE_ICONS[t as ProductType] || '📦'; }
  statusLabel(s: string)  { return { confirmed:'Potwierdzona', cancelled:'Anulowana', refunded:'Zwrot' }[s] || s; }
  stars(n: number) { return '★'.repeat(n); }
  prevPage() { if (this.page > 1) { this.page--; this.reload(); } }
  nextPage() { if (this.page < this.totalPages) { this.page++; this.reload(); } }
}

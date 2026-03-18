// src/app/pages/crm/partners/crm-partners-list.component.ts
import { Component, OnInit, inject, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CrmApiService, Partner, PartnerStatus, PARTNER_STATUS_LABELS, CrmUser, PartnerGroup } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';

type SortDir = 'asc' | 'desc';

@Component({
  selector: 'wt-crm-partners-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
<div class="page">

  <!-- TOPBAR -->
  <div class="topbar">
    <h1>Rejestr Partnerów</h1>
    <span style="flex:1"></span>
    <button class="btn-view" [class.active]="viewMode==='cards'" (click)="viewMode='cards'">⊞ Karty</button>
    <button class="btn-view" [class.active]="viewMode==='table'" (click)="viewMode='table'">☰ Tabela</button>
    <button class="btn-primary" (click)="openCreateForm()">+ Nowy partner</button>
  </div>

  <!-- TOOLBAR -->
  <div class="toolbar">
    <input class="tb-search" [(ngModel)]="search" (ngModelChange)="onSearch()" placeholder="🔍 Szukaj firmy, kontaktu…">
    <select class="sel" [(ngModel)]="filterStatus" (ngModelChange)="reload()">
      <option value="">Wszystkie statusy</option>
      <option *ngFor="let s of statusOptions" [value]="s.key">{{s.label}}</option>
    </select>
    <select class="sel" [(ngModel)]="filterManager" (ngModelChange)="reload()" *ngIf="isManager">
      <option value="">Wszyscy handlowcy</option>
      <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
    </select>
    <select class="sel" [(ngModel)]="filterGroup" (ngModelChange)="reload()">
      <option value="">Wszystkie grupy</option>
      <option *ngFor="let g of partnerGroups" [value]="g.id">{{g.name}}</option>
    </select>
    <select class="sel" [(ngModel)]="filterIndustry" (ngModelChange)="reload()">
      <option value="">Wszystkie branże</option>
      <option *ngFor="let i of industries" [value]="i">{{i}}</option>
    </select>
    <button class="btn-clear" *ngIf="filterStatus||filterManager||filterGroup||filterIndustry" (click)="clearFilters()">✕ Wyczyść</button>
  </div>

  <div *ngIf="loading" style="height:3px;background:linear-gradient(90deg,#f97316,#fb923c)"></div>

  <!-- ══ KARTY ══ -->
  <div *ngIf="!loading && viewMode==='cards'" class="cards-grid">
    <div *ngFor="let p of partners" class="partner-card" (click)="goPartner(p.id)">
      <div class="pc-top">
        <div class="pc-company">{{p.company}}</div>
        <span class="pbadge pbadge-{{p.status}}">{{statusLabel(p.status)}}</span>
      </div>
      <div class="pc-contact" *ngIf="p.contact_name">{{p.contact_name}}<span *ngIf="p.contact_title"> · {{p.contact_title}}</span></div>
      <div class="pc-meta">
        <span *ngIf="p.group_name" class="pc-tag">🏢 {{p.group_name}}</span>
        <span *ngIf="p.industry"   class="pc-tag">🏭 {{p.industry}}</span>
        <span *ngIf="p.manager_name" class="pc-tag">👤 {{p.manager_name}}</span>
      </div>
      <div class="pc-financials">
        <span *ngIf="p.annual_turnover" class="pc-arr">{{p.annual_turnover | number:'1.0-0'}} {{p.annual_turnover_currency}}<span *ngIf="p.online_pct != null" class="pc-online"> · {{p.online_pct}}% online</span></span>
        <span *ngIf="p.open_opp_count"
              class="pc-opp" [class.pc-opp-valued]="+(p.open_opp_value||0)>0">
          💡 {{p.open_opp_count}} szans<span *ngIf="+(p.open_opp_value||0)>0"> · {{p.open_opp_value|number:'1.0-0'}} PLN</span>
        </span>
      </div>
      <div class="pc-onboarding" *ngIf="p.status==='onboarding'">
        <div class="onb-bar"><div class="onb-fill" [style.width.%]="(p.onboarding_step/3)*100"></div></div>
        <span class="onb-label">Krok {{p.onboarding_step}} / 3</span>
      </div>
    </div>
    <div class="no-data" *ngIf="partners.length===0">Brak partnerów spełniających kryteria.</div>
  </div>

  <!-- ══ TABELA ══ -->
  <div *ngIf="!loading && viewMode==='table'" class="table-wrap">
    <div class="tw-head" style="grid-template-columns:2fr 120px 130px 130px 120px 110px 90px">
      <div class="th sortable" (click)="sortBy('company')">Firma <span class="si">{{sortIcon('company')}}</span></div>
      <div class="th">Status</div>
      <div class="th sortable" (click)="sortBy('industry')">Branża <span class="si">{{sortIcon('industry')}}</span></div>
      <div class="th sortable" (click)="sortBy('group_name')">Grupa <span class="si">{{sortIcon('group_name')}}</span></div>
      <div class="th sortable" (click)="sortBy('manager_name')">Handlowiec <span class="si">{{sortIcon('manager_name')}}</span></div>
      <div class="th sortable" (click)="sortBy('annual_turnover')">Obrót roczny <span class="si">{{sortIcon('annual_turnover')}}</span></div>
      <div class="th sortable" (click)="sortBy('online_pct')">% Online <span class="si">{{sortIcon('online_pct')}}</span></div>
      <div class="th sortable" (click)="sortBy('contract_expires')">Umowa do <span class="si">{{sortIcon('contract_expires')}}</span></div>
    </div>
    <div *ngFor="let p of sortedPartners" class="tw-row" style="grid-template-columns:2fr 120px 130px 130px 120px 110px 90px"
         (click)="goPartner(p.id)">
      <div class="td">
        <span class="td-main">{{p.company}}</span>
        <span class="td-sub" *ngIf="p.contact_name">{{p.contact_name}}</span>
      </div>
      <div class="td"><span class="pbadge pbadge-{{p.status}}">{{statusLabel(p.status)}}</span></div>
      <div class="td td-sm">{{p.industry||'—'}}</div>
      <div class="td td-sm">{{p.group_name||'—'}}</div>
      <div class="td td-sm">{{p.manager_name||'—'}}</div>
      <div class="td" style="font-weight:700;color:#f97316;font-size:12px">{{p.annual_turnover?(p.annual_turnover|number:'1.0-0')+' '+(p.annual_turnover_currency||'PLN'):'—'}}</div>
      <div class="td td-sm" [class.expiring]="isExpiring(p.contract_expires)">
        {{p.contract_expires?(p.contract_expires|date:'dd.MM.yy'):'—'}}
      </div>
    </div>
    <div class="no-data" style="grid-column:1/-1" *ngIf="partners.length===0">Brak partnerów spełniających kryteria.</div>
  </div>

  <!-- Pager -->
  <div class="pager" *ngIf="totalPages>1">
    <button (click)="prevPage()" [disabled]="page<=1">‹</button>
    <span>{{page}} / {{totalPages}}</span>
    <button (click)="nextPage()" [disabled]="page>=totalPages">›</button>
  </div>

  <!-- Create panel -->
  <div class="side-panel" *ngIf="showCreate" (click)="showCreate=false">
    <div class="side-panel-inner" (click)="$event.stopPropagation()">
      <h3>Nowy partner</h3>
      <p class="hint">Możesz utworzyć partnera bez powiązanego leada.</p>
      <label>Firma *<input [(ngModel)]="newP.company" placeholder="Nazwa firmy"></label>
      <label>NIP<input [(ngModel)]="newP.nip"></label>
      <label>Kontakt<input [(ngModel)]="newP.contact_name"></label>
      <label>Email<input [(ngModel)]="newP.email" type="email"></label>
      <label>Branża<input [(ngModel)]="newP.industry"></label>
      <label>Wartość kontraktu (PLN)<input [(ngModel)]="newP.contract_value" type="number" min="0"></label>
      <label>Liczba licencji<input [(ngModel)]="newP.license_count" type="number" min="0"></label>
      <label *ngIf="isManager">Opiekun / Handlowiec
        <select [(ngModel)]="newP.manager_id">
          <option value="">— nieprzypisany —</option>
          <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
        </select>
      </label>
      <div class="panel-actions">
        <button class="btn-outline" (click)="showCreate=false">Anuluj</button>
        <button class="btn-primary" (click)="createPartner()" [disabled]="!newP.company||saving">
          {{saving?'Zapisywanie…':'Utwórz partnera'}}
        </button>
      </div>
    </div>
  </div>
</div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .page { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .topbar { display:flex; align-items:center; gap:10px; padding:12px 20px; border-bottom:1px solid #e5e7eb; flex-shrink:0; }
    .topbar h1 { font-size:17px; font-weight:700; margin:0; }
    .btn-primary { background:#f97316; color:white; border:none; border-radius:8px; padding:7px 14px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }
    .btn-outline { background:white; color:#374151; border:1px solid #d1d5db; border-radius:8px; padding:7px 14px; font-size:13px; cursor:pointer; }
    .btn-view { background:none; border:1px solid #e5e7eb; border-radius:7px; padding:5px 10px; font-size:12px; cursor:pointer; color:#6b7280; }
    .btn-view.active { background:#fff7ed; border-color:#f97316; color:#f97316; font-weight:700; }
    /* Toolbar */
    .toolbar { display:flex; align-items:center; gap:8px; padding:10px 20px; border-bottom:1px solid #f4f4f5; flex-shrink:0; flex-wrap:wrap; }
    .tb-search { border:1px solid #d1d5db; border-radius:8px; padding:6px 12px; font-size:12px; outline:none; width:200px; }
    .tb-search:focus { border-color:#f97316; }
    .sel { border:1px solid #d1d5db; border-radius:8px; padding:6px 10px; font-size:12px; outline:none; background:white; cursor:pointer; }
    .sel:focus { border-color:#f97316; }
    .btn-clear { background:#fee2e2; color:#991b1b; border:none; border-radius:8px; padding:6px 10px; font-size:11px; cursor:pointer; font-weight:600; }
    /* Cards */
    .cards-grid { flex:1; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:12px; padding:16px 20px; align-content:start; }
    .partner-card { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:14px; cursor:pointer; transition:box-shadow .15s; }
    .partner-card:hover { box-shadow:0 4px 14px rgba(0,0,0,.08); }
    .pc-top { display:flex; align-items:flex-start; gap:8px; margin-bottom:4px; }
    .pc-company { font-weight:700; font-size:14px; flex:1; color:#18181b; }
    .pc-contact { font-size:11px; color:#6b7280; margin-bottom:6px; }
    .pc-meta { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
    .pc-tag { font-size:10px; color:#6b7280; background:#f4f4f5; padding:1px 6px; border-radius:4px; }
    .pc-financials { display:flex; gap:8px; align-items:center; }
    .pc-arr { font-size:12px; font-weight:700; color:#f97316; }
    .pc-online { font-size:10px; font-weight:600; color:#3b82f6; }
    .pc-opp { font-size:10px; background:#dbeafe; color:#1e40af; padding:2px 7px; border-radius:6px; font-weight:600; }
    .pc-opp-valued { background:#fff7ed; color:#c2410c; }
    .pc-onboarding { margin-top:8px; }
    .onb-bar { height:4px; background:#e5e7eb; border-radius:2px; overflow:hidden; margin-bottom:3px; }
    .onb-fill { height:100%; background:#3b82f6; }
    .onb-label { font-size:10px; color:#6b7280; }
    /* Badges */
    .pbadge { padding:2px 8px; border-radius:8px; font-size:10px; font-weight:700; white-space:nowrap; }
    .pbadge-active { background:#dcfce7; color:#166534; }
    .pbadge-onboarding { background:#dbeafe; color:#1e40af; }
    .pbadge-inactive { background:#f3f4f6; color:#374151; }
    .pbadge-churned { background:#fee2e2; color:#991b1b; }
    /* Table */
    .table-wrap { flex:1; overflow:auto; }
    .tw-head, .tw-row { display:grid; gap:0; }
    .tw-head { background:#fafafa; border-bottom:2px solid #e5e7eb; position:sticky; top:0; z-index:1; }
    .th { padding:9px 12px; font-size:10px; font-weight:700; text-transform:uppercase; color:#9ca3af; letter-spacing:.4px; display:flex; align-items:center; gap:4px; }
    .th.sortable { cursor:pointer; user-select:none; }
    .th.sortable:hover { color:#374151; }
    .si { font-size:10px; color:#d1d5db; }
    .tw-row { border-bottom:1px solid #f4f4f5; cursor:pointer; }
    .tw-row:hover { background:#fffbf7; }
    .td { padding:10px 12px; font-size:13px; color:#374151; display:flex; flex-direction:column; justify-content:center; }
    .td-main { font-weight:600; color:#18181b; }
    .td-sub { font-size:11px; color:#9ca3af; }
    .td-sm { font-size:12px; }
    .expiring { color:#dc2626; font-weight:600; }
    .no-data { text-align:center; color:#9ca3af; padding:40px; }
    /* Pager */
    .pager { display:flex; justify-content:center; gap:12px; align-items:center; padding:12px; flex-shrink:0; }
    .pager button { border:1px solid #e5e7eb; background:white; border-radius:6px; padding:4px 12px; cursor:pointer; }
    .pager button:disabled { opacity:.4; }
    /* Side panel */
    .side-panel { position:fixed; inset:0; background:rgba(0,0,0,.3); z-index:100; display:flex; justify-content:flex-end; }
    .side-panel-inner { background:white; width:360px; height:100%; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:12px; }
    .side-panel-inner h3 { margin:0; font-size:16px; font-weight:700; }
    .hint { font-size:12px; color:#9ca3af; margin:0; }
    .side-panel-inner label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; }
    .side-panel-inner input, .side-panel-inner select { border:1px solid #d1d5db; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; }
    .panel-actions { display:flex; gap:8px; margin-top:8px; }
  `],
})
export class CrmPartnersListComponent implements OnInit {
  private api    = inject(CrmApiService);
  private zone   = inject(NgZone);
  private cdr    = inject(ChangeDetectorRef);
  private auth   = inject(AuthService);
  private router = inject(Router);

  partners: Partner[] = [];
  total = 0; page = 1; pageSize = 50; loading = false;
  search = '';
  filterStatus   = '';
  filterManager  = '';
  filterGroup    = '';
  filterIndustry = '';
  viewMode: 'cards' | 'table' = 'cards';
  showCreate = false; saving = false;
  crmUsers: CrmUser[] = [];
  partnerGroups: PartnerGroup[] = [];
  industries: string[] = [];

  // Sorting
  sortCol = 'company';
  sortDir: SortDir = 'asc';

  newP: Partial<Partner> = {};
  statusOptions = Object.entries(PARTNER_STATUS_LABELS).map(([key, label]) => ({ key: key as PartnerStatus, label }));

  get totalPages() { return Math.ceil(this.total / this.pageSize); }
  get isManager() { const u = this.auth.user(); return !!(u?.is_admin || u?.crm_role === 'sales_manager'); }
  statusLabel(s: PartnerStatus) { return PARTNER_STATUS_LABELS[s] || s; }

  get sortedPartners(): Partner[] {
    const col = this.sortCol;
    const dir = this.sortDir;
    return [...this.partners].sort((a, b) => {
      let va: any = (a as any)[col] ?? '';
      let vb: any = (b as any)[col] ?? '';
      if (col === 'annual_turnover' || col === 'online_pct') { va = +(va || 0); vb = +(vb || 0); return dir === 'asc' ? va - vb : vb - va; }
      if (col === 'contract_expires') { va = va ? new Date(va).getTime() : 0; vb = vb ? new Date(vb).getTime() : 0; return dir === 'asc' ? va - vb : vb - va; }
      const cmp = String(va).localeCompare(String(vb), 'pl', { sensitivity: 'base' });
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  sortBy(col: string): void {
    if (this.sortCol === col) { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; }
    else { this.sortCol = col; this.sortDir = 'asc'; }
    this.cdr.markForCheck();
  }
  sortIcon(col: string): string {
    if (this.sortCol !== col) return '↕';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  isExpiring(d?: string | null): boolean {
    if (!d) return false;
    return new Date(d).getTime() < Date.now() + 30 * 86_400_000;
  }

  ngOnInit() {
    this.api.getCrmUsers().subscribe({ next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); }, error: () => {} });
    this.api.getGroups().subscribe({ next: g => { this.zone.run(() => { this.partnerGroups = g; this.cdr.markForCheck(); }); }, error: () => {} });
    this.reload();
  }

  reload() {
    this.loading = true;
    const p: any = { page: this.page, limit: this.pageSize };
    if (this.search)         p.search     = this.search;
    if (this.filterStatus)   p.status     = this.filterStatus;
    if (this.filterManager && this.isManager) p.manager_id = this.filterManager;
    if (this.filterGroup)    p.group_id   = +this.filterGroup;
    if (this.filterIndustry) p.industry   = this.filterIndustry;
    const u = this.auth.user();
    if (u && !u.is_admin && u.crm_role === 'salesperson') p.manager_id = u.id;
    this.api.getPartners(p).subscribe({
      next: r => {
        this.zone.run(() => {
          this.partners = r.data;
          this.total    = r.total;
          // Collect unique industries for filter
          const set = new Set<string>(r.data.map((x: any) => x.industry).filter(Boolean));
          if (set.size > 0 || !this.industries.length) {
            this.industries = Array.from(set).sort();
          }
          this.loading = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); },
    });
  }

  clearFilters(): void {
    this.filterStatus = ''; this.filterManager = '';
    this.filterGroup = ''; this.filterIndustry = '';
    this.page = 1; this.reload();
  }

  private searchTimer: any;
  onSearch() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.page = 1; this.reload(); }, 400); }

  goPartner(id: number) { this.router.navigate(['/crm/partners', id]); }
  prevPage() { if (this.page > 1) { this.page--; this.reload(); } }
  nextPage() { if (this.page < this.totalPages) { this.page++; this.reload(); } }

  openCreateForm() {
    this.newP = {};
    this.showCreate = true;
  }

  createPartner() {
    if (!this.newP.company) return;
    this.saving = true;
    this.api.createPartner(this.newP).subscribe({
      next: p => { this.saving = false; this.showCreate = false; this.newP = {}; this.router.navigate(['/crm/partners', p.id]); },
      error: () => { this.saving = false; },
    });
  }
}

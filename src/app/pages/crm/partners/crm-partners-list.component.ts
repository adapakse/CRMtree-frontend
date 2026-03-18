// src/app/pages/crm/partners/crm-partners-list.component.ts
import { Component, OnInit, inject, NgZone, ChangeDetectorRef} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CrmApiService, Partner, PartnerStatus, PARTNER_STATUS_LABELS, CrmUser } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'wt-crm-partners-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
<div class="page">
  <div class="topbar">
    <h1>Partnerzy</h1>
    <div class="actions">
      <input class="search" [(ngModel)]="search" (ngModelChange)="onSearch()" placeholder="Szukaj…">
      <select [(ngModel)]="filterStatus" (ngModelChange)="reload()" class="filter-sel">
        <option value="">Wszystkie statusy</option>
        <option *ngFor="let s of statusOptions" [value]="s.key">{{s.label}}</option>
      </select>
      <button class="btn-primary" (click)="openCreateForm()">+ Nowy partner</button>
    </div>
  </div>

  <div *ngIf="loading" class="loading">Ładowanie…</div>

  <div *ngIf="!loading" class="partners-grid">
    <div *ngFor="let p of partners" class="partner-card" (click)="goPartner(p.id)">
      <div class="pc-top">
        <div class="pc-company">{{p.company}}</div>
        <span class="pbadge pbadge-{{p.status}}">{{statusLabel(p.status)}}</span>
      </div>
      <div class="pc-contact" *ngIf="p.contact_name">{{p.contact_name}}<span *ngIf="p.contact_title"> · {{p.contact_title}}</span></div>
      <div class="pc-meta">
        <span *ngIf="p.group_name" class="pc-group">🏢 {{p.group_name}}</span>
        <span *ngIf="p.manager_name" class="pc-mgr">👤 {{p.manager_name}}</span>
      </div>
      <div class="pc-financials">
        <span *ngIf="p.arr" class="pc-arr">{{p.arr | number:'1.0-0'}} PLN ARR</span>
        <span *ngIf="p.open_opp_count"
              class="pc-opp"
              [class.pc-opp-valued]="+(p.open_opp_value || 0) > 0"
              [title]="+(p.open_opp_value || 0) > 0 ? ((p.open_opp_value || 0) | number:'1.0-0') + ' PLN' : ''">
          💡 {{p.open_opp_count}} szans<span *ngIf="+(p.open_opp_value || 0) > 0"> · {{p.open_opp_value | number:'1.0-0'}} PLN</span>
        </span>
      </div>
      <div class="pc-onboarding" *ngIf="p.status === 'onboarding'">
        <div class="onb-bar"><div class="onb-fill" [style.width.%]="(p.onboarding_step / 3) * 100"></div></div>
        <span class="onb-label">Krok {{p.onboarding_step}} / 3</span>
      </div>
    </div>
    <div class="no-partners" *ngIf="partners.length === 0">Brak partnerów spełniających kryteria.</div>
  </div>

  <div class="pager" *ngIf="totalPages > 1">
    <button (click)="prevPage()" [disabled]="page <= 1">‹</button>
    <span>{{page}} / {{totalPages}}</span>
    <button (click)="nextPage()" [disabled]="page >= totalPages">›</button>
  </div>

  <!-- Create panel -->
  <div class="side-panel" *ngIf="showCreate" (click)="showCreate = false">
    <div class="side-panel-inner" (click)="$event.stopPropagation()">
      <h3>Nowy partner</h3>
      <p class="hint">Możesz utworzyć partnera bez powiązanego leada.</p>
      <label>Firma *<input [(ngModel)]="newP.company" placeholder="Nazwa firmy"></label>
      <label>NIP<input [(ngModel)]="newP.nip"></label>
      <label>Kontakt<input [(ngModel)]="newP.contact_name"></label>
      <label>Email<input [(ngModel)]="newP.email" type="email"></label>
      <label>Branża<input [(ngModel)]="newP.industry"></label>
      <label>Wartość kontraktu (PLN)<input [(ngModel)]="newP.contract_value" type="number" min="0"></label>
      <label>Liczba licencji<input [(ngModel)]="newP.license_count" type="number" min="1"></label>
      <label *ngIf="isManager">Opiekun / Handlowiec
        <select [(ngModel)]="newP.manager_id">
          <option value="">— nieprzypisany —</option>
          <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
        </select>
      </label>
      <div class="panel-actions">
        <button class="btn-outline" (click)="showCreate = false">Anuluj</button>
        <button class="btn-primary" (click)="createPartner()" [disabled]="!newP.company || saving">
          {{saving ? 'Zapisywanie…' : 'Utwórz partnera'}}
        </button>
      </div>
    </div>
  </div>
</div>
  `,
  styles: [`
    .page { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .topbar { display:flex; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid #e5e7eb; }
    .topbar h1 { font-size:18px; font-weight:700; margin:0; flex:1; }
    .actions { display:flex; gap:8px; align-items:center; }
    .search { border:1px solid #d1d5db; border-radius:8px; padding:7px 12px; font-size:13px; outline:none; width:200px; }
    .filter-sel { border:1px solid #d1d5db; border-radius:8px; padding:7px 10px; font-size:12px; outline:none; }
    .btn-primary { background:#f97316; color:white; border:none; border-radius:8px; padding:7px 14px; font-size:13px; font-weight:600; cursor:pointer; }
    .btn-outline { background:white; color:#374151; border:1px solid #d1d5db; border-radius:8px; padding:7px 14px; font-size:13px; cursor:pointer; }
    .loading { padding:40px; text-align:center; color:#9ca3af; }
    .partners-grid { flex:1; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px; padding:16px 20px; align-content:start; }
    .partner-card { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:14px; cursor:pointer; transition:box-shadow .15s; }
    .partner-card:hover { box-shadow:0 4px 14px rgba(0,0,0,.08); }
    .pc-top { display:flex; align-items:flex-start; gap:8px; margin-bottom:4px; }
    .pc-company { font-weight:700; font-size:14px; flex:1; }
    .pbadge { padding:2px 8px; border-radius:8px; font-size:10px; font-weight:700; white-space:nowrap; }
    .pbadge-active { background:#dcfce7; color:#166534; }
    .pbadge-onboarding { background:#dbeafe; color:#1e40af; }
    .pbadge-inactive { background:#f3f4f6; color:#374151; }
    .pbadge-churned { background:#fee2e2; color:#991b1b; }
    .pc-contact { font-size:11px; color:#6b7280; margin-bottom:6px; }
    .pc-meta { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
    .pc-group, .pc-mgr { font-size:10px; color:#9ca3af; }
    .pc-financials { display:flex; gap:8px; align-items:center; }
    .pc-arr { font-size:12px; font-weight:700; color:#f97316; }
    .pc-opp { font-size:10px; background:#dbeafe; color:#1e40af; padding:2px 7px; border-radius:6px; font-weight:600; }
    .pc-opp-valued { background:#fff7ed; color:#c2410c; }
    .pc-onboarding { margin-top:8px; }
    .onb-bar { height:4px; background:#e5e7eb; border-radius:2px; overflow:hidden; margin-bottom:3px; }
    .onb-fill { height:100%; background:#3b82f6; }
    .onb-label { font-size:10px; color:#6b7280; }
    .no-partners { grid-column:1/-1; text-align:center; color:#9ca3af; padding:32px; }
    .pager { display:flex; justify-content:center; gap:12px; align-items:center; padding:12px; }
    .pager button { border:1px solid #e5e7eb; background:white; border-radius:6px; padding:4px 12px; cursor:pointer; }
    .pager button:disabled { opacity:.4; cursor:default; }
    .side-panel { position:fixed; inset:0; background:rgba(0,0,0,.3); z-index:100; display:flex; justify-content:flex-end; }
    .side-panel-inner { background:white; width:360px; height:100%; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:12px; }
    .side-panel-inner h3 { margin:0; font-size:16px; font-weight:700; }
    .hint { font-size:12px; color:#9ca3af; margin:0; }
    .side-panel-inner label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; }
    .side-panel-inner input { border:1px solid #d1d5db; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; }
    .panel-actions { display:flex; gap:8px; margin-top:8px; }
  `],
})
export class CrmPartnersListComponent implements OnInit {
  private api    = inject(CrmApiService);
  private zone = inject(NgZone);
  private cdr  = inject(ChangeDetectorRef);
  private auth   = inject(AuthService);
  private router = inject(Router);

  partners: Partner[] = [];
  total = 0; page = 1; pageSize = 50; loading = false;
  search = ''; filterStatus = '';
  showCreate = false; saving = false;
  crmUsers: CrmUser[] = [];

  openCreateForm() {
    this.newP = {};
    this.showCreate = true;
    if (this.isManager && !this.crmUsers.length) {
      this.api.getCrmUsers().subscribe({
        next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); },
        error: () => {},
      });
    }
  }
  newP: Partial<Partner> = {};

  statusOptions = Object.entries(PARTNER_STATUS_LABELS).map(([key, label]) => ({ key: key as PartnerStatus, label }));
  get totalPages() { return Math.ceil(this.total / this.pageSize); }
  get isManager() { const u = this.auth.user(); return !!(u?.is_admin || u?.crm_role === 'sales_manager'); }
  statusLabel(s: PartnerStatus) { return PARTNER_STATUS_LABELS[s] || s; }

  ngOnInit() { this.reload(); }

  reload() {
    this.loading = true;
    const p: any = { page: this.page, limit: this.pageSize };
    if (this.search) p.search = this.search;
    if (this.filterStatus) p.status = this.filterStatus;
    const u = this.auth.user();
    if (u && !u.is_admin && u.crm_role === 'salesperson') p.manager_id = u.id;
    this.api.getPartners(p).subscribe({ next: r => { this.partners = r.data; this.total = r.total; this.zone.run(() => { this.loading = false; }); this.cdr.markForCheck(); }, error: () => { this.zone.run(() => { this.loading = false; }); this.cdr.markForCheck(); } });
  }

  private searchTimer: any;
  onSearch() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.page = 1; this.reload(); }, 400); }

  goPartner(id: number) { this.router.navigate(['/crm/partners', id]); }
  prevPage() { if (this.page > 1) { this.page--; this.reload(); } }
  nextPage() { if (this.page < this.totalPages) { this.page++; this.reload(); } }

  createPartner() {
    if (!this.newP.company) return;
    this.saving = true;
    this.api.createPartner(this.newP).subscribe({
      next: p => { this.saving = false; this.showCreate = false; this.newP = {}; this.router.navigate(['/crm/partners', p.id]); },
      error: () => { this.saving = false; },
    });
  }
}

// src/app/pages/crm/dashboard/crm-dashboard.component.ts
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CrmApiService, PRODUCT_TYPE_LABELS, PRODUCT_TYPE_ICONS, ProductType, CrmUser } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'wt-crm-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
<div class="dash-page">
  <div class="dash-header">
    <h1>Dashboard CRM</h1>
    <span style="flex:1"></span>
    <button *ngIf="persistRepName" style="font-size:11.5px;border:1px solid #BFDBFE;color:#1D4ED8;background:#EFF6FF;border-radius:8px;padding:6px 12px;cursor:pointer;margin-right:4px" (click)="clearRepFilter()">
      × {{ persistRepName }}
    </button>
    <select *ngIf="isManager" [(ngModel)]="repFilter" (ngModelChange)="onRepFilterChange($event)" class="period-sel">
      <option value="">Wszyscy handlowcy</option>
      <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
    </select>
    <select [(ngModel)]="period" (ngModelChange)="loadPerformance()" class="period-sel">
      <option value="30d">Ostatnie 30 dni</option>
      <option value="90d">Ostatnie 90 dni</option>
      <option value="12m">Ostatnie 12 m-cy</option>
      <option value="ytd">Bieżący rok</option>
    </select>
  </div>

  <!-- KPI cards (partner performance) -->
  <div class="kpi-row" *ngIf="perf">
    <div class="kpi-card"><div class="kv">{{perf.kpis?.active_partners}}</div><div class="kl">Aktywnych partnerów</div></div>
    <div class="kpi-card accent"><div class="kv">{{perf.kpis?.total_arr | number:'1.0-0'}} PLN</div><div class="kl">Łączne ARR</div></div>
    <div class="kpi-card"><div class="kv">{{perf.kpis?.avg_arr | number:'1.0-0'}} PLN</div><div class="kl">Śr. ARR / partner</div></div>
    <div class="kpi-card"><div class="kv">{{perf.kpis?.group_count}}</div><div class="kl">Grup partnerskich</div></div>
    <div class="kpi-card"><div class="kv">{{perf.kpis?.in_onboarding}}</div><div class="kl">W onboardingu</div></div>
  </div>

  <div class="dash-body">
    <!-- Pipeline -->
    <div class="dash-panel">
      <h3>Pipeline leadów</h3>
      <div *ngIf="!pipelineData.length" class="empty">Brak danych</div>
      <div class="pipeline-bars" *ngIf="pipelineData.length">
        <div class="pipe-row" *ngFor="let s of pipelineData">
          <span class="pipe-label">{{stageName(s.stage)}}</span>
          <div class="pipe-bar-wrap">
            <div class="pipe-bar" [style.width.%]="barWidth(s.count)"></div>
          </div>
          <span class="pipe-count">{{s.count}}</span>
          <span class="pipe-value" *ngIf="s.weighted_value">{{s.weighted_value | number:'1.0-0'}} PLN</span>
        </div>
      </div>
    </div>

    <!-- Product mix -->
    <div class="dash-panel" *ngIf="perf?.product_mix?.length">
      <h3>Mix produktowy ({{period}})</h3>
      <div class="mix-list">
        <div class="mix-row" *ngFor="let m of perf.product_mix">
          <span class="mix-icon">{{productIcon(m.product_type)}}</span>
          <span class="mix-name">{{productLabel(m.product_type)}}</span>
          <div class="mix-bar-wrap">
            <div class="mix-bar" [style.width.%]="mixBarWidth(m.total_gross)"></div>
          </div>
          <span class="mix-val">{{m.total_gross | number:'1.0-0'}} PLN</span>
        </div>
      </div>
    </div>

    <!-- Renewals -->
    <div class="dash-panel" *ngIf="renewals.length">
      <h3>Nadchodzące odnowienia</h3>
      <table class="mini-table">
        <thead><tr><th>Partner</th><th>Wygasa</th><th>Dni</th><th>Adopcja</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of renewals.slice(0,8)">
            <td>{{r.company}}</td>
            <td class="muted">{{r.contract_expires | date:'dd.MM.yyyy'}}</td>
            <td [class.urgent]="r.days_until_expiry <= 30">{{r.days_until_expiry}}d</td>
            <td>{{r.adoption_pct}}%</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Partner scores -->
    <div class="dash-panel wide" *ngIf="perf?.partner_scores?.length">
      <h3>Partnerzy wg wyników ({{period}})</h3>
      <table class="score-table">
        <thead>
          <tr><th>Partner</th><th>Grupa</th><th>Status</th><th class="num">ARR</th>
              <th class="num">Przychód</th><th class="num">Adopcja</th><th class="num">Szanse</th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let p of perf.partner_scores.slice(0,15)">
            <td><a [routerLink]="['/crm/partners', p.id]" class="link">{{p.company}}</a></td>
            <td class="muted">{{p.group_name || '—'}}</td>
            <td><span class="sbadge sbadge-{{p.status}}">{{statusLabel(p.status)}}</span></td>
            <td class="num">{{(p.arr || 0) | number:'1.0-0'}}</td>
            <td class="num">{{(p.period_revenue || 0) | number:'1.0-0'}}</td>
            <td class="num" [class.low-adoption]="p.adoption_pct < 75">{{p.adoption_pct}}%</td>
            <td class="num">{{p.open_opp_count}}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Recent activities -->
    <div class="dash-panel" *ngIf="recentActivities.length">
      <h3>Ostatnie aktywności</h3>
      <div class="activity-feed">
        <div class="act-item" *ngFor="let a of recentActivities">
          <span class="act-icon">{{actIcon(a.type)}}</span>
          <div class="act-body">
            <span class="act-title">{{a.title}}</span>
            <div class="act-sub">{{a.source_name}} · {{a.activity_at | date:'dd.MM HH:mm'}}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
  `,
  styles: [`
    .dash-page { padding:20px; overflow:auto; }
    .dash-header { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
    .dash-header h1 { font-size:20px; font-weight:800; margin:0; flex:1; }
    .period-sel { border:1px solid #d1d5db; border-radius:8px; padding:7px 12px; font-size:13px; outline:none; }
    .kpi-row { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px; }
    .kpi-card { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:14px 18px; min-width:140px; }
    .kpi-card.accent { border-color:#fed7aa; background:#fff7ed; }
    .kv { font-size:20px; font-weight:800; }
    .kpi-card.accent .kv { color:#f97316; }
    .kl { font-size:10px; color:#9ca3af; text-transform:uppercase; margin-top:2px; }
    .dash-body { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .dash-panel { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:16px; }
    .dash-panel.wide { grid-column:1/-1; }
    .dash-panel h3 { font-size:13px; font-weight:700; margin:0 0 12px; color:#374151; }
    .empty { color:#9ca3af; font-size:12px; }
    /* Pipeline */
    .pipeline-bars { display:flex; flex-direction:column; gap:8px; }
    .pipe-row { display:flex; align-items:center; gap:8px; }
    .pipe-label { font-size:11px; color:#6b7280; min-width:90px; }
    .pipe-bar-wrap { flex:1; height:8px; background:#f3f4f6; border-radius:4px; overflow:hidden; }
    .pipe-bar { height:100%; background:#f97316; border-radius:4px; transition:width .3s; }
    .pipe-count { font-size:11px; font-weight:700; min-width:22px; text-align:right; }
    .pipe-value { font-size:10px; color:#9ca3af; min-width:80px; text-align:right; }
    /* Mix */
    .mix-list { display:flex; flex-direction:column; gap:7px; }
    .mix-row { display:flex; align-items:center; gap:8px; }
    .mix-icon { font-size:16px; }
    .mix-name { font-size:11px; min-width:100px; }
    .mix-bar-wrap { flex:1; height:6px; background:#f3f4f6; border-radius:4px; overflow:hidden; }
    .mix-bar { height:100%; background:#f97316; border-radius:4px; }
    .mix-val { font-size:10px; color:#6b7280; min-width:80px; text-align:right; }
    /* Renewals */
    .mini-table { width:100%; border-collapse:collapse; font-size:12px; }
    .mini-table th { color:#9ca3af; padding:4px 6px; font-weight:600; font-size:10px; border-bottom:1px solid #f3f4f6; text-align:left; }
    .mini-table td { padding:5px 6px; border-bottom:1px solid #f9fafb; }
    .muted { color:#9ca3af; }
    .urgent { color:#dc2626; font-weight:700; }
    /* Score table */
    .score-table { width:100%; border-collapse:collapse; font-size:12px; }
    .score-table th { color:#9ca3af; padding:6px 10px; font-size:10px; font-weight:600; border-bottom:1px solid #f3f4f6; text-align:left; }
    .score-table td { padding:7px 10px; border-bottom:1px solid #f9fafb; vertical-align:middle; }
    .num { text-align:right; }
    .link { color:#f97316; text-decoration:none; font-weight:600; }
    .link:hover { text-decoration:underline; }
    .sbadge { padding:1px 7px; border-radius:8px; font-size:10px; font-weight:700; }
    .sbadge-active { background:#dcfce7; color:#166534; }
    .sbadge-onboarding { background:#dbeafe; color:#1e40af; }
    .sbadge-inactive { background:#f3f4f6; color:#374151; }
    .sbadge-churned { background:#fee2e2; color:#991b1b; }
    .low-adoption { color:#dc2626; font-weight:700; }
    /* Activity feed */
    .activity-feed { display:flex; flex-direction:column; gap:10px; }
    .act-item { display:flex; gap:8px; align-items:flex-start; }
    .act-icon { font-size:16px; }
    .act-body { flex:1; }
    .act-title { font-size:12px; font-weight:600; }
    .act-sub { font-size:10px; color:#9ca3af; }
  `],
})
export class CrmDashboardComponent implements OnInit {
  private api = inject(CrmApiService);
  private cdr = inject(ChangeDetectorRef);
  private auth = inject(AuthService);

  pipelineData: any[] = [];
  recentActivities: any[] = [];
  perf: any = null;
  renewals: any[] = [];
  period = '12m';
  repFilter = '';
  persistRepName = '';
  crmUsers: CrmUser[] = [];
  private readonly REP_FILTER_KEY = 'crm_rep_filter';

  get isManager() { const u = this.auth.user(); return u?.is_admin || u?.crm_role === 'sales_manager'; }

  ngOnInit() {
    if (this.isManager) {
      this.api.getCrmUsers().subscribe({ next: u => { this.crmUsers = u; this.cdr.markForCheck(); }, error: () => {} });
    }
    // Persistowany filtr handlowca
    try {
      const saved = sessionStorage.getItem(this.REP_FILTER_KEY);
      if (saved) {
        const { userId, displayName } = JSON.parse(saved);
        this.repFilter     = userId;
        this.persistRepName = displayName;
      }
    } catch { }
    this.load();
  }

  onRepFilterChange(userId: string): void {
    const user = this.crmUsers.find(u => u.id === userId);
    const displayName = user?.display_name || '';
    this.persistRepName = userId ? displayName : '';
    try {
      if (userId) sessionStorage.setItem(this.REP_FILTER_KEY, JSON.stringify({ userId, displayName }));
      else        sessionStorage.removeItem(this.REP_FILTER_KEY);
    } catch { }
    this.load();
  }

  clearRepFilter(): void {
    this.repFilter      = '';
    this.persistRepName = '';
    try { sessionStorage.removeItem(this.REP_FILTER_KEY); } catch { }
    this.load();
  }

  load() {
    this.api.getDashboard().subscribe({
      next: d => { this.pipelineData = d.pipeline || []; this.recentActivities = d.recent_activities || []; this.cdr.markForCheck(); },
      error: () => { this.cdr.markForCheck(); },
    });
    this.loadPerformance();
    this.api.getRenewals().subscribe({ next: r => { this.renewals = r; this.cdr.markForCheck(); }, error: () => {} });
  }

  loadPerformance() {
    this.api.getPartnerPerformance(this.period).subscribe({ next: r => { this.perf = r; this.cdr.markForCheck(); }, error: () => {} });
  }

  barWidth(count: number) {
    const max = Math.max(...this.pipelineData.map(s => s.count), 1);
    return Math.round((count / max) * 100);
  }
  mixBarWidth(gross: number) {
    const max = Math.max(...((this.perf?.product_mix || []).map((m: any) => m.total_gross)), 1);
    return Math.round((gross / max) * 100);
  }

  productLabel(t: string) { return PRODUCT_TYPE_LABELS[t as ProductType] || t; }
  productIcon(t: string)  { return PRODUCT_TYPE_ICONS[t as ProductType] || '📦'; }
  statusLabel(s: string) {
    return { onboarding:'Wdrożenie', active:'Aktywny', inactive:'Nieaktywny', churned:'Utracony' }[s] || s;
  }
  stageName(s: string) {
    return { new:'Nowy', qualification:'Kwalifikacja', presentation:'Prezentacja',
             offer:'Oferta', negotiation:'Negocjacje', closed_won:'Wygrany', closed_lost:'Przegrany' }[s] || s;
  }
  actIcon(type: string) {
    return { call:'📞', email:'📧', meeting:'🤝', note:'📝', doc_sent:'📄', training:'🎓', qbr:'📊' }[type] || '💬';
  }
}

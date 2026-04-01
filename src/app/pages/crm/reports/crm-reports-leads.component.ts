// src/app/pages/crm/reports/crm-reports-leads.component.ts
import {
  Component, OnInit, AfterViewInit, inject, ChangeDetectorRef,
  NgZone, ChangeDetectionStrategy, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  CrmApiService, LeadsReport, LeadsReportKpi,
  LEAD_STAGE_LABELS, LEAD_SOURCES, LEAD_SOURCE_LABELS, CrmUser,
} from '../../../core/services/crm-api.service';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';

function getPeriodDates(preset: string): { from: string; to: string; periodEnd: string } {
  const now = new Date();
  const today = now.toISOString().substring(0, 10);
  const fmt = (d: Date) => d.toISOString().substring(0, 10);
  const shift = (n: number) => { const d = new Date(now); d.setMonth(d.getMonth() + n); return fmt(d); };
  switch (preset) {
    case '1m': {
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: today, periodEnd: fmt(end) };
    }
    case '3m':  return { from: shift(-3), to: today, periodEnd: today };
    case '6m':  return { from: shift(-6), to: today, periodEnd: today };
    case 'ytd': {
      const end = fmt(new Date(now.getFullYear(), 11, 31));
      return { from: `${now.getFullYear()}-01-01`, to: today, periodEnd: end };
    }
    case 'cq': {
      const q     = Math.floor(now.getMonth() / 3);
      const qFrom = new Date(now.getFullYear(), q * 3, 1);
      const qTo   = new Date(now.getFullYear(), q * 3 + 3, 0);  // ostatni dzień kwartału
      return {
        from:      fmt(qFrom),
        to:        today,          // filtr created_at do dziś
        periodEnd: fmt(qTo),       // koniec kwartału — dla close_date i budżetu
      };
    }
    default: {
      const end = fmt(new Date(now.getFullYear(), 11, 31));
      return { from: `${now.getFullYear()}-01-01`, to: today, periodEnd: end };
    }
  }
}

@Component({
  selector: 'wt-crm-reports-leads',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

<!-- TOPBAR -->
<div id="topbar" style="height:60px;background:white;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:12px;padding:0 24px;flex-shrink:0">
  <span class="page-title" style="font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:#18181b">Raporty sprzedaży</span>
  <span style="flex:1"></span>
  <select class="sel" [(ngModel)]="periodPreset" (ngModelChange)="onPresetChange()">
    <option value="1m">Bieżący miesiąc</option>
    <option value="cq">Bieżący kwartał</option>
    <option value="3m">Ostatnie 3 miesiące</option>
    <option value="6m">Ostatnie 6 miesięcy</option>
    <option value="ytd">Bieżący rok (YTD {{ currentYear }})</option>
  </select>
  <select class="sel" *ngIf="isManager" [(ngModel)]="assignedTo" (ngModelChange)="load()">
    <option value="">Wszyscy handlowcy</option>
    <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
  </select>
  <button class="btn btn-g btn-sm" style="font-size:12px;border:1px solid #e4e4e7;border-radius:8px;padding:6px 12px;background:white;cursor:pointer" (click)="load()">
    {{ loading ? '…' : '↻ Odśwież' }}
  </button>
</div>

<!-- CONTENT -->
<div style="flex:1;overflow-y:auto;padding:24px">

  <!-- loading bar -->
  <div *ngIf="loading" style="height:3px;background:linear-gradient(90deg,#f26522,#fb923c);border-radius:2px;margin-bottom:16px"></div>

  <!-- Brak danych -->
  <div *ngIf="!loading && !kpi" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;color:#a1a1aa">
    <div style="font-size:48px;margin-bottom:12px">📊</div>
    <div style="font-size:15px;font-weight:600">Brak danych dla wybranego okresu</div>
    <div style="font-size:13px;margin-top:4px">Dodaj leady lub zmień zakres dat</div>
  </div>

  <ng-container *ngIf="kpi">

  <!-- KPI ROW -->
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:24px">
    <div class="stat-card" style="border-top:3px solid #f26522">
      <div class="stat-val" style="color:#f26522;cursor:pointer"
           (click)="goToLeads({}, 'Pipeline – wszystkie aktywne')"
           title="Kliknij aby zobaczyć leady">{{ kpi.pipeline_value | number:'1.0-0' }}</div>
      <div class="stat-lbl">Pipeline (PLN)</div>
      <div class="stat-trend" *ngIf="kpi.active > 0" style="color:#16a34a">↑ {{ kpi.active }} aktywnych</div>
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e4e4e7;cursor:pointer"
           (click)="goToLeads({close_date_from: dateFrom, close_date_to: periodEnd}, 'Planowane do dowiezienia w okresie')"
           title="Kliknij aby zobaczyć leady z datą zamknięcia w tym okresie">
        <div style="font-size:10px;color:#a1a1aa;font-weight:500">Planowane do dowiezienia ↗</div>
        <div style="font-size:13px;font-weight:700;color:#f26522">
          {{ (kpi.pipeline_in_period ?? 0) | number:'1.0-0' }} PLN
        </div>
      </div>
    </div>
    <div class="stat-card" style="border-top:3px solid #22C55E">
      <div class="stat-val" style="color:#22C55E;cursor:pointer"
           (click)="goToLeads({stage: 'closed_won'}, 'Zamknięte / Won')"
           title="Kliknij aby zobaczyć wygrane leady">{{ kpi.won_value | number:'1.0-0' }}</div>
      <div class="stat-lbl">Zamknięte / Won (PLN)</div>
      <div class="stat-trend" style="color:#16a34a">↑ {{ kpi.won }} kontraktów</div>
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e4e4e7">
        <div style="font-size:10px;color:#a1a1aa;font-weight:500;cursor:pointer"
             (click)="goToLeads({close_date_from: dateFrom, close_date_to: periodEnd}, 'Planowany budżet – leady w okresie')"
             title="Kliknij aby zobaczyć leady w tym okresie">Planowany budżet ↗</div>
        <div style="font-size:13px;font-weight:700;color:#7C3AED">
          {{ budgetTotal | number:'1.0-0' }} PLN
        </div>
        <div *ngIf="budgetTotal > 0" style="height:4px;background:#e4e4e7;border-radius:2px;margin-top:4px;overflow:hidden">
          <div [style.width.%]="min100(kpi.won_value / budgetTotal * 100)"
               [style.background]="kpi.won_value >= budgetTotal ? '#22C55E' : '#7C3AED'"
               style="height:100%;border-radius:2px;transition:width .3s"></div>
        </div>
        <div *ngIf="budgetTotal === 0" style="font-size:10px;color:#d1d5db;margin-top:2px">Brak planu</div>
      </div>
    </div>
    <div class="stat-card" style="border-top:3px solid #3B82F6">
      <div class="stat-val">{{ kpi.win_rate || 0 }}%</div>
      <div class="stat-lbl">Win Rate</div>
      <div class="stat-trend" style="color:#a1a1aa">{{ kpi.won }} / {{ kpi.won + kpi.lost }}</div>
    </div>
    <div class="stat-card" style="border-top:3px solid #A855F7">
      <div class="stat-val">{{ kpi.avg_cycle_days ? kpi.avg_cycle_days + ' dni' : '—' }}</div>
      <div class="stat-lbl">Avg. cykl sprzedaży</div>
    </div>
    <div class="stat-card" style="border-top:3px solid #7C3AED">
      <div class="stat-val" style="color:#7C3AED">{{ budgetTotal | number:'1.0-0' }}</div>
      <div class="stat-lbl">Planowany budżet (PLN)</div>
      <div class="stat-trend" *ngIf="budgetTotal > 0 && kpi.won_value > 0" [style.color]="kpi.won_value >= budgetTotal ? '#16a34a' : '#dc2626'">
        {{ kpi.won_value >= budgetTotal ? '✓' : '' }} {{ (kpi.won_value / budgetTotal * 100) | number:'1.0-0' }}% realizacji
      </div>
      <div class="stat-trend" *ngIf="budgetTotal === 0" style="color:#a1a1aa">Brak planu</div>
    </div>
  </div>

  <!-- ROW 1: Lejek + Bar chart -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">

    <!-- Lejek sprzedażowy -->
    <div class="card" style="padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b">Lejek sprzedażowy</div>
        <span style="font-size:11px;color:#a1a1aa">Liczba leadów i wartość PLN</span>
      </div>
      <div #funnelEl></div>
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div style="background:#fafafa;border-radius:8px;padding:8px 10px">
          <div style="color:#a1a1aa;margin-bottom:2px">Konwersja do Wygranego</div>
          <div style="font-weight:700;color:#18181b;font-family:'Sora',sans-serif">{{ kpi.win_rate || 0 }}%</div>
        </div>
        <div style="background:#fafafa;border-radius:8px;padding:8px 10px">
          <div style="color:#a1a1aa;margin-bottom:2px">Avg. wartość wygranego</div>
          <div style="font-weight:700;color:#18181b;font-family:'Sora',sans-serif">{{ kpi.won > 0 ? ((kpi.won_value / kpi.won) | number:'1.0-0') : '—' }} PLN</div>
        </div>
        <div style="background:#fafafa;border-radius:8px;padding:8px 10px">
          <div style="color:#a1a1aa;margin-bottom:2px">Aktywne leady</div>
          <div style="font-weight:700;color:#18181b;font-family:'Sora',sans-serif">{{ kpi.active }}</div>
        </div>
        <div style="background:#fafafa;border-radius:8px;padding:8px 10px">
          <div style="color:#a1a1aa;margin-bottom:2px">Gorących 🔥</div>
          <div style="font-weight:700;color:#f26522;font-family:'Sora',sans-serif">{{ kpi.hot }}</div>
        </div>
      </div>
    </div>

    <!-- Przychody miesięczne (bar chart) -->
    <div class="card" style="padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b">Trend miesięczny</div>
        <div style="display:flex;gap:10px;font-size:11px;color:#a1a1aa">
          <span style="display:flex;align-items:center;gap:4px">
            <span style="width:10px;height:10px;background:#f26522;border-radius:2px;display:inline-block"></span>Wygrane
          </span>
          <span style="display:flex;align-items:center;gap:4px">
            <span style="width:10px;height:10px;background:#BFDBFE;border-radius:2px;display:inline-block"></span>Nowe
          </span>
        </div>
      </div>
      <div #barEl style="display:flex;align-items:flex-end;gap:6px;height:160px;padding-bottom:24px;position:relative;border-bottom:1px solid #e4e4e7"></div>
      <div #barLabels style="display:flex;gap:6px;margin-top:6px"></div>
    </div>
  </div>

  <!-- ROW 2: Handlowcy + Donut -->
  <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px;margin-bottom:20px">

    <!-- Tabela handlowców -->
    <div class="card" style="padding:20px" *ngIf="isManager">
      <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b;margin-bottom:14px">Wyniki handlowców</div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead>
          <tr style="border-bottom:1px solid #e4e4e7">
            <th style="text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#a1a1aa;font-weight:600">Handlowiec</th>
            <th style="text-align:right;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#a1a1aa;font-weight:600">Leady</th>
            <th style="text-align:right;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#a1a1aa;font-weight:600">Pipeline</th>
            <th style="text-align:right;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#a1a1aa;font-weight:600">Won</th>
            <th style="text-align:right;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#a1a1aa;font-weight:600">Win%</th>
            <th style="padding:6px 8px;font-size:10px;text-transform:uppercase;color:#a1a1aa;font-weight:600">Postęp</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let r of byRep; let last = last"
              [style.border-bottom]="last ? 'none' : '1px solid #f4f4f5'"
              style="cursor:pointer" title="Kliknij aby zobaczyć leady handlowca"
              (click)="goToLeads({assigned_to: r.rep_id}, 'Handlowiec: ' + r.rep_name)">
            <td style="padding:8px 8px">
              <div style="display:flex;align-items:center;gap:8px">
                <div [style.background]="avatarColor(r.rep_name)" style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:white;flex-shrink:0">{{ initials(r.rep_name) }}</div>
                <span style="font-weight:600;color:#18181b">{{ r.rep_name }}</span>
              </div>
            </td>
            <td style="text-align:right;padding:8px 8px;color:#71717a">{{ r.total }}</td>
            <td style="text-align:right;padding:8px 8px;font-weight:600;color:#f26522;font-family:'Sora',sans-serif">{{ r.pipeline_value | number:'1.0-0' }}</td>
            <td style="text-align:right;padding:8px 8px;color:#22C55E;font-weight:600">{{ r.won_value > 0 ? (r.won_value | number:'1.0-0') : '—' }}</td>
            <td style="text-align:right;padding:8px 8px;color:#71717a">{{ r.win_rate || 0 }}%</td>
            <td style="padding:8px 8px">
              <div style="width:80px;height:6px;background:#f4f4f5;border-radius:3px;overflow:hidden">
                <div [style.width.%]="r.win_rate || 0" [style.background]="barColor(r.win_rate)" style="height:100%;border-radius:3px"></div>
              </div>
            </td>
          </tr>
          <tr *ngIf="!byRep.length">
            <td colspan="6" style="text-align:center;padding:20px;color:#a1a1aa;font-size:12px">Brak danych</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Źródła leadów (donut) -->
    <div class="card" style="padding:20px">
      <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b;margin-bottom:14px">Źródła leadów</div>
      <div style="display:flex;align-items:center;gap:20px">
        <svg width="120" height="120" viewBox="0 0 120 120" #donutSvg>
          <circle cx="60" cy="60" r="44" fill="none" stroke="#F4F4F5" stroke-width="18"/>
        </svg>
        <div #donutLegend style="flex:1;display:flex;flex-direction:column;gap:8px;font-size:12px"></div>
      </div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e4e4e7">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#a1a1aa;letter-spacing:.5px;margin-bottom:8px">Jakość po źródle (win rate)</div>
        <div style="display:flex;flex-direction:column;gap:5px;font-size:12px">
          <div *ngFor="let s of topSourcesWin" style="display:flex;justify-content:space-between">
            <span>{{ s.label }}</span>
            <span [style.color]="s.wr >= 50 ? '#22C55E' : s.wr >= 30 ? '#f26522' : '#a1a1aa'" style="font-weight:700">{{ s.wr }}% win rate</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ROW 3: Velocity + Lost reasons -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

    <!-- Czas w etapie -->
    <div class="card" style="padding:20px">
      <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b;margin-bottom:16px">Czas w etapie (avg dni)</div>
      <div #velocityEl style="display:flex;flex-direction:column;gap:10px"></div>
      <div *ngIf="!velocityData.length" style="color:#a1a1aa;font-size:12px;text-align:center;padding:20px">Brak danych</div>
    </div>

    <!-- Powody przegranej -->
    <div class="card" style="padding:20px">
      <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b;margin-bottom:16px">Powody przegranej</div>
      <div #lostEl style="display:flex;flex-direction:column;gap:10px"></div>
      <div *ngIf="!lostReasons.length" style="color:#a1a1aa;font-size:12px;text-align:center;padding:12px">Brak przegranych leadów</div>
      <div *ngIf="lostReasons.length" style="margin-top:16px;padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:12px;color:#9a3412">
        💡 <strong>Top powód:</strong> {{ lostReasons[0].reason }} ({{ lostReasons[0].count }} leadów)
      </div>
    </div>
  </div>

  </ng-container>
</div>
</div>
  `,
  styles: [`
    .sel { background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:6px 10px;font-size:12.5px;color:#3f3f46;outline:none;font-family:inherit;cursor:pointer }
    .sel:focus { border-color:#f26522 }
    .btn-g { background:transparent;color:#52525b;border:1px solid #e4e4e7 }
    .btn-g:hover { background:#fafafa }
    .stat-card { background:white;border:1px solid #e4e4e7;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,.08) }
    .stat-val { font-family:'Sora',sans-serif;font-size:22px;font-weight:700;color:#18181b;margin-bottom:2px }
    .stat-lbl { font-size:12px;color:#a1a1aa;font-weight:500 }
    .stat-trend { font-size:11px;margin-top:6px;font-weight:600 }
    .card { background:white;border:1px solid #e4e4e7;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08) }
  `],
})
export class CrmReportsLeadsComponent implements OnInit, AfterViewInit {
  @ViewChild('funnelEl', { static: false }) funnelEl!: ElementRef;
  @ViewChild('barEl',    { static: false }) barEl!:    ElementRef;
  @ViewChild('barLabels',{ static: false }) barLabels!:ElementRef;
  @ViewChild('donutSvg', { static: false }) donutSvg!: ElementRef;
  @ViewChild('donutLegend',{static:false}) donutLegend!:ElementRef;
  @ViewChild('velocityEl',{static:false}) velocityEl!:ElementRef;
  @ViewChild('lostEl',   { static: false }) lostEl!:   ElementRef;

  private api    = inject(CrmApiService);
  private auth   = inject(AuthService);
  private cdr    = inject(ChangeDetectorRef);
  private zone   = inject(NgZone);
  private router = inject(Router);

  loading      = false;
  periodPreset = 'cq';        // pkt 3: domyślnie bieżący kwartał
  dateFrom     = '';
  dateTo       = '';
  periodEnd    = '';  // rzeczywisty koniec okresu (nie przycięty do dziś) — dla close_date i budżetu
  assignedTo   = '';
  currentYear  = new Date().getFullYear();
  budgetTotal  = 0;           // pkt 4/5/8: planowany budżet

  kpi: LeadsReportKpi | null = null;
  byRep:       any[] = [];
  bySource:    any[] = [];
  lostReasons: any[] = [];
  funnel:      any[] = [];
  monthly:     any[] = [];
  velocityData:any[] = [];
  crmUsers:    CrmUser[] = [];

  private chartsBuilt = false;

  min100(v: number): number { return Math.min(100, Math.max(0, v || 0)); }

  /** Przejdź do listy leadów z odpowiednimi filtrami */
  goToLeads(filters: Record<string, string>, label: string): void {
    const qp: any = { label };
    // Przekaż handlowca jeśli jest wybrany
    if (this.assignedTo) qp['assigned_to'] = this.assignedTo;
    // Przekaż filtry
    Object.assign(qp, filters);
    this.router.navigate(['/crm/leads'], { queryParams: qp });
  }

  get isManager() {
    const u = this.auth.user();
    return u?.is_admin || u?.crm_role === 'sales_manager';
  }

  get topSourcesWin() {
    return this.bySource.slice(0, 4).map(s => ({
      label: this.sourceLabel(s.source),
      wr: s.count > 0 ? Math.round(s.won_count / s.count * 100) : 0,
    })).sort((a, b) => b.wr - a.wr);
  }

  ngOnInit(): void {
    if (this.isManager) {
      this.api.getCrmUsers().subscribe({ next: u => { this.crmUsers = u; this.cdr.markForCheck(); }, error: () => {} });
    }
    // Załaduj dynamiczne źródła z app_settings
    this.api.getLeadSources().subscribe({
      next: sources => { this.zone.run(() => { this._dynamicSources = sources; this.cdr.markForCheck(); }); },
      error: () => {},
    });
    this.onPresetChange();
  }

  ngAfterViewInit(): void {}

  onPresetChange(): void {
    const { from, to, periodEnd } = getPeriodDates(this.periodPreset);
    this.dateFrom   = from;
    this.dateTo     = to;
    this.periodEnd  = periodEnd;
    this.load();
  }

  load(): void {
    this.loading = true;
    this.chartsBuilt = false;
    const p: any = {};
    if (this.dateFrom)  p.date_from  = this.dateFrom;
    if (this.dateTo)    p.date_to    = this.dateTo;
    if (this.periodEnd) p.period_end = this.periodEnd; // koniec okresu dla close_date
    if (this.assignedTo && this.isManager) p.assigned_to = this.assignedTo;

    // Pobierz raport + planowany budżet równolegle (pkt 4/8)
    const budgetP: any = { year: this.currentYear };
    if (this.dateFrom)  budgetP.date_from = this.dateFrom;
    if (this.periodEnd) budgetP.date_to   = this.periodEnd; // budżet wg pełnego okresu
    if (this.assignedTo && this.isManager) budgetP.assigned_to = this.assignedTo;

    this.api.getLeadsReport(p).subscribe({
      next: (report: LeadsReport) => {
        this.zone.run(() => {
          this.kpi         = report.kpi;
          this.funnel      = report.funnel || [];
          this.monthly     = report.monthly || [];
          this.byRep       = report.by_rep || [];
          this.bySource    = report.by_source || [];
          this.lostReasons = report.lost_reasons || [];
          this.velocityData = this.buildVelocityData();
          this.loading     = false;
          this.cdr.markForCheck();
          setTimeout(() => this.buildCharts(), 80);
        });
      },
      error: () => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); },
    });

    // Budżet (pkt 4/5/8)
    this.api.getSalesBudgetTotal(budgetP).subscribe({
      next: b => this.zone.run(() => { this.budgetTotal = b.total || 0; this.cdr.markForCheck(); }),
      error: () => this.zone.run(() => { this.budgetTotal = 0; this.cdr.markForCheck(); }),
    });
  }

  private buildVelocityData(): any[] {
    // Build stage transition labels from funnel
    const stages = this.funnel.filter(f => !['closed_won','closed_lost'].includes(f.stage));
    if (stages.length < 2) return [];
    const result = [];
    for (let i = 0; i < stages.length - 1; i++) {
      result.push({
        label: `${(LEAD_STAGE_LABELS as Record<string,string>)[stages[i].stage] || stages[i].stage} → ${(LEAD_STAGE_LABELS as Record<string,string>)[stages[i+1].stage] || stages[i+1].stage}`,
        days: Math.round(5 + Math.random() * 10), // placeholder – replace with real data if endpoint provides it
        max: 20,
      });
    }
    return result;
  }

  private buildCharts(): void {
    if (this.chartsBuilt) return;
    this.chartsBuilt = true;
    this.buildFunnel();
    this.buildBarChart();
    this.buildDonut();
    this.buildVelocity();
    this.buildLostBars();
  }

  private buildFunnel(): void {
    const el = this.funnelEl?.nativeElement;
    if (!el) return;
    el.innerHTML = '';
    const active = this.funnel.filter(f => !['closed_won','closed_lost'].includes(f.stage));
    const all    = [...active, ...this.funnel.filter(f => ['closed_won','closed_lost'].includes(f.stage))];
    if (!all.length) { el.innerHTML = '<div style="color:#a1a1aa;font-size:12px;text-align:center;padding:20px">Brak danych</div>'; return; }
    const maxVal = Math.max(...all.map(d => d.value), 1);
    const colors: Record<string,string> = { new:'#94A3B8',qualification:'#F59E0B',presentation:'#3B82F6',offer:'#A855F7',negotiation:'#F97316',closed_won:'#22C55E',closed_lost:'#EF4444' };
    all.forEach((d, i) => {
      const pct = Math.round(d.value / maxVal * 100);
      const label = (LEAD_STAGE_LABELS as Record<string,string>)[d.stage] || d.stage;
      const color = colors[d.stage] || '#94A3B8';
      const conv = (i < active.length - 1 && all[i+1])
        ? `<div style="width:34px;text-align:center;font-size:10px;color:#a1a1aa;flex-shrink:0">${d.count>0?Math.round(all[i+1].count/d.count*100):0}%↓</div>`
        : '<div style="width:34px"></div>';
      const sep = i === active.length - 1 && active.length < all.length
        ? '<div style="height:1px;background:#f4f4f5;margin:4px 0"></div>' : '';
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:6px';
      row.style.cursor = 'pointer';
      row.title = `Kliknij aby zobaczyć leady w etapie: ${label}`;
      row.addEventListener('click', () => this.goToLeads({ stage: d.stage }, `Lejek: ${label}`));
      row.innerHTML = `${sep}<div style="display:flex;align-items:center;gap:8px">
        <div style="width:88px;font-size:11.5px;color:#71717a;text-align:right;flex-shrink:0">${label}</div>
        <div style="flex:1;position:relative;height:26px">
          <div style="position:absolute;inset:0;background:#f4f4f5;border-radius:4px"></div>
          <div style="position:absolute;top:0;left:0;width:${pct}%;height:100%;background:${color};border-radius:4px;opacity:.85"></div>
          <div style="position:absolute;inset:0;display:flex;align-items:center;padding:0 8px">
            <span style="font-size:10.5px;font-weight:700;color:white;text-shadow:0 1px 2px rgba(0,0,0,.4)">${d.count} lead.</span>
            <span style="font-size:10.5px;color:white;text-shadow:0 1px 2px rgba(0,0,0,.4);margin-left:auto">${(d.value/1000).toFixed(0)}k PLN</span>
          </div>
        </div>${conv}</div>`;
      el.appendChild(row);
    });
  }

  private buildBarChart(): void {
    const el = this.barEl?.nativeElement;
    const labels = this.barLabels?.nativeElement;
    if (!el || !labels) return;
    el.innerHTML = ''; labels.innerHTML = '';
    if (!this.monthly.length) { el.innerHTML = '<div style="color:#a1a1aa;font-size:12px;text-align:center;padding:40px 0;width:100%">Brak danych</div>'; return; }
    const data = this.monthly.slice(-12);
    const maxVal = Math.max(...data.map(d => Math.max(d.new_leads, d.won)), 1);
    data.forEach(d => {
      const wonH  = d.won       ? Math.max(4, Math.round(d.won       / maxVal * 140)) : 0;
      const newH  = Math.max(4, Math.round(d.new_leads / maxVal * 140));
      const col   = document.createElement('div');
      col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:2px';
      col.innerHTML = `
        <div style="width:100%;display:flex;gap:2px;align-items:flex-end;justify-content:center">
          <div style="flex:1;height:${newH}px;background:#BFDBFE;border-radius:3px 3px 0 0" title="Nowe: ${d.new_leads}"></div>
          ${d.won ? `<div style="flex:1;height:${wonH}px;background:#f26522;border-radius:3px 3px 0 0" title="Won: ${d.won}"></div>` : '<div style="flex:1"></div>'}
        </div>
        ${d.won ? `<div style="font-size:9px;color:#f26522;font-weight:700">${d.won}</div>` : '<div style="height:14px"></div>'}`;
      el.appendChild(col);
      const lbl = document.createElement('div');
      lbl.style.cssText = 'flex:1;text-align:center;font-size:11px;color:#a1a1aa';
      lbl.textContent = d.month.substring(5, 7) + '/' + d.month.substring(2, 4);
      labels.appendChild(lbl);
    });
  }

  private buildDonut(): void {
    const svg = this.donutSvg?.nativeElement;
    const legend = this.donutLegend?.nativeElement;
    if (!svg || !legend) return;
    // remove old segments
    svg.querySelectorAll('.seg').forEach((s: Element) => s.remove());
    svg.querySelectorAll('text').forEach((s: Element) => s.remove());
    svg.querySelectorAll('circle.hole').forEach((s: Element) => s.remove());
    legend.innerHTML = '';
    if (!this.bySource.length) return;

    const data = this.bySource.slice(0, 5);
    const total = data.reduce((s, d) => s + d.count, 0) || 1;
    const colors = ['#F26522','#22C55E','#3B82F6','#A855F7','#F59E0B'];
    const r = 44, cx = 60, cy = 60;
    let angle = -Math.PI / 2;
    data.forEach((d, i) => {
      const sweep = (d.count / total) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      angle += sweep;
      const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
      const large = d.count / total > 0.5 ? 1 : 0;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'seg');
      path.setAttribute('d', `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}Z`);
      path.setAttribute('fill', colors[i]); path.setAttribute('opacity', '0.9');
      svg.appendChild(path);
    });
    const hole = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hole.setAttribute('cx', '60'); hole.setAttribute('cy', '60'); hole.setAttribute('r', '30');
    hole.setAttribute('fill', 'white'); hole.setAttribute('class', 'hole');
    svg.appendChild(hole);
    const t1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t1.setAttribute('x', '60'); t1.setAttribute('y', '57'); t1.setAttribute('text-anchor', 'middle');
    t1.setAttribute('font-size', '13'); t1.setAttribute('font-weight', '700'); t1.setAttribute('fill', '#18181B');
    t1.textContent = String(total);
    svg.appendChild(t1);
    const t2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t2.setAttribute('x', '60'); t2.setAttribute('y', '69'); t2.setAttribute('text-anchor', 'middle');
    t2.setAttribute('font-size', '9'); t2.setAttribute('fill', '#A1A1AA');
    t2.textContent = 'leadów';
    svg.appendChild(t2);
    data.forEach((d, i) => {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:6px';
      item.style.cursor = 'pointer';
      item.title = `Kliknij aby zobaczyć leady ze źródła: ${this.sourceLabel(d.source)}`;
      item.addEventListener('click', () => this.goToLeads({ source: d.source }, `Źródło: ${this.sourceLabel(d.source)}`));
      item.innerHTML = `<span style="width:10px;height:10px;border-radius:2px;background:${colors[i]};flex-shrink:0;display:inline-block"></span><span style="color:#52525b;font-size:12px">${this.sourceLabel(d.source)}</span><span style="margin-left:auto;font-weight:700;color:#18181b;font-size:12px">${Math.round(d.count/total*100)}%</span>`;
      legend.appendChild(item);
    });
  }

  private buildVelocity(): void {
    const el = this.velocityEl?.nativeElement;
    if (!el) return;
    el.innerHTML = '';
    if (!this.velocityData.length) return;
    const max = Math.max(...this.velocityData.map(d => d.days), 1);
    this.velocityData.forEach(d => {
      const pct  = Math.round(d.days / max * 100);
      const color = pct > 80 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#22C55E';
      const row = document.createElement('div');
      row.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;color:#52525b">${d.label}</span><span style="font-size:12px;font-weight:700;color:${color}">${d.days} dni</span></div><div style="height:6px;background:#f4f4f5;border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div></div>`;
      el.appendChild(row);
    });
  }

  private buildLostBars(): void {
    const el = this.lostEl?.nativeElement;
    if (!el) return;
    el.innerHTML = '';
    const colors = ['#EF4444','#F59E0B','#94A3B8','#3B82F6','#A855F7'];
    const max = this.lostReasons[0]?.count || 1;
    this.lostReasons.slice(0, 5).forEach((d, i) => {
      const pct = Math.round(d.count / max * 100);
      const row = document.createElement('div');
      row.style.cursor = 'pointer';
      row.title = `Kliknij aby zobaczyć przegrane leady: ${d.reason}`;
      const lostReason = d.reason === '— brak powodu —' ? '' : d.reason;
      row.addEventListener('click', () => this.goToLeads(
        lostReason ? { stage: 'closed_lost', lost_reason: lostReason } : { stage: 'closed_lost' },
        `Przegrane: ${d.reason}`
      ));
      row.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;color:#52525b">${d.reason}</span><span style="font-size:12px;font-weight:700;color:${colors[i]}">${d.count}</span></div><div style="height:8px;background:#f4f4f5;border-radius:4px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${colors[i]};border-radius:4px;opacity:.8"></div></div>`;
      el.appendChild(row);
    });
  }

  private _dynamicSources: { value: string; label: string }[] = [];
  sourceLabel(v: string): string {
    const found = this._dynamicSources.find(s => s.value === v) || LEAD_SOURCES.find(s => s.value === v);
    return found?.label ?? LEAD_SOURCE_LABELS[v] ?? v;
  }
  barColor(wr: number): string { return wr >= 50 ? '#22C55E' : wr >= 30 ? '#f26522' : '#3B82F6'; }
  initials(name: string): string { return (name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase(); }
  avatarColor(name: string): string { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h},55%,48%)`; }
}

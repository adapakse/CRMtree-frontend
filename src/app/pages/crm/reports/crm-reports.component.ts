// src/app/pages/crm/reports/crm-reports.component.ts
import {
  Component, OnInit, AfterViewInit, inject, ChangeDetectorRef,
  NgZone, ChangeDetectionStrategy, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CrmApiService, SalesSummaryRow, SalesByPerson, SalesByPartner, SalesPartnerMeta } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';

// ─── Typy lokalne ────────────────────────────────────────────────────────────
interface FunnelRow   { label: string; n: number; val: number; color: string; }
interface MonthlyRow  { m: string; won: number; pipe: number; }
interface SourceRow   { label: string; pct: number; color: string; }
interface VeloRow     { label: string; days: number; max: number; }
interface LostRow     { label: string; pct: number; color: string; }
interface SalesRow    { name: string; initials: string; color: string; leads: number; pipeline: number; won: number; winPct: number; progress: number; }

interface KpiData {
  pipeline:  number;
  won:       number;
  winRate:   number;
  avgCycle:  number;
  active:    number;
  hot:       number;
}

const STAGE_COLORS: Record<string, string> = {
  new: '#94A3B8', qualification: '#F59E0B', presentation: '#3B82F6',
  offer: '#A855F7', negotiation: '#F97316', closed_won: '#22C55E', closed_lost: '#EF4444',
};

@Component({
  selector: 'wt-crm-reports',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
<!-- Topbar -->
<div id="topbar">
  <span class="page-title">Raporty sprzedaży</span>
  <span class="tsp"></span>
  <div style="display:flex;align-items:center;gap:8px">
    <select class="sel" [(ngModel)]="period" (ngModelChange)="onFilterChange()">
      <option value="q1">Q1 2025</option>
      <option value="q2">Q2 2025</option>
      <option value="ytd">YTD 2025</option>
      <option value="2024">Rok 2024</option>
    </select>
    <select class="sel" [(ngModel)]="ownerFilter" (ngModelChange)="onFilterChange()" *ngIf="isManager">
      <option value="">Wszyscy handlowcy</option>
      <option *ngFor="let u of salesReps" [value]="u.id">{{ u.display_name }}</option>
    </select>
    <!-- Filtry dostępne gdy są dane zewnętrzne -->
    <ng-container *ngIf="partnersMeta.length > 0">
      <select class="sel" [(ngModel)]="filterPartner" (ngModelChange)="onSalesFilterChange()" style="max-width:180px">
        <option value="">Wszyscy partnerzy</option>
        <option *ngFor="let p of partnersMeta" [value]="p.partner_name">{{ p.partner_name }}</option>
      </select>
      <select class="sel" [(ngModel)]="filterProduct" (ngModelChange)="onSalesFilterChange()">
        <option value="">Wszystkie produkty</option>
        <option value="hotel">Hotel</option>
        <option value="transport_flight">Lot</option>
        <option value="transport_train">Pociąg</option>
        <option value="transport_bus">Autobus</option>
        <option value="transport_ferry">Prom</option>
        <option value="car_rental">Wynajem auta</option>
        <option value="transfer">Transfer</option>
        <option value="travel_insurance">Ubezpieczenie</option>
        <option value="visa">Wiza</option>
        <option value="other">Inne</option>
      </select>
    </ng-container>
    <button class="btn btn-g btn-sm" (click)="exportPDF()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Eksport PDF
    </button>
  </div>
</div>

<div id="content">

  <!-- Baner: dane ze źródła zewnętrznego -->
  <div class="data-source-banner" *ngIf="salesSummary.length > 0">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    Wykresy bazują na <strong>{{ salesSummary.length }} miesiącach</strong> zaimportowanych danych
    <ng-container *ngIf="filterPartner"> · partner: <strong>{{ filterPartner }}</strong></ng-container>
    <ng-container *ngIf="filterProduct"> · produkt: <strong>{{ filterProduct }}</strong></ng-container>
    <a class="btn-link" routerLink="/crm/import">Zarządzaj importem →</a>
  </div>

  <!-- Loading -->
  <div *ngIf="loading" class="loading-state">
    <div class="spinner"></div>Wczytywanie raportów…
  </div>

  <ng-container *ngIf="!loading">

    <!-- ── KPI row — dane CRM (leady) ── -->
    <div class="stats-row">
      <div class="stat-card" style="border-top:3px solid var(--orange)">
        <div class="stat-val" style="color:var(--orange)">{{ formatPLN(kpi.pipeline) }}</div>
        <div class="stat-lbl">Pipeline (PLN)</div>
        <div class="stat-trend trend-up">Aktywny pipeline</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #22C55E">
        <div class="stat-val" style="color:#22C55E">{{ formatPLN(kpi.won) }}</div>
        <div class="stat-lbl">Zamknięte / Won (PLN)</div>
        <div class="stat-trend trend-up" *ngIf="kpi.won > 0">✓ Wygrane kontrakty</div>
        <div class="stat-trend" *ngIf="kpi.won === 0" style="color:var(--gray-400)">Brak w tym okresie</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #3B82F6">
        <div class="stat-val">{{ kpi.winRate }}%</div>
        <div class="stat-lbl">Win Rate</div>
        <div class="stat-trend" [class.trend-up]="kpi.winRate >= 40" [class.trend-dn]="kpi.winRate < 40">
          {{ kpi.winRate >= 40 ? '↑ Powyżej celu' : '↓ Poniżej celu' }}
        </div>
      </div>
      <div class="stat-card" style="border-top:3px solid #A855F7">
        <div class="stat-val">{{ kpi.avgCycle }} dni</div>
        <div class="stat-lbl">Avg. cykl sprzedaży</div>
        <div class="stat-trend trend-up">Średni czas zamknięcia</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #F59E0B">
        <div class="stat-val">{{ kpi.active }}</div>
        <div class="stat-lbl">Aktywne leady</div>
        <div class="stat-trend">{{ kpi.hot }} gorących 🔥</div>
      </div>
    </div>

    <!-- ── KPI row — dane zewnętrzne (obrót) — widoczne gdy są dane ── -->
    <div class="stats-row" *ngIf="salesSummary.length > 0" style="margin-top:-4px">
      <div class="stat-card" style="border-top:3px solid #0EA5E9">
        <div class="stat-val" style="color:#0EA5E9">{{ formatPLN(extKpi.grossTurnover) }}</div>
        <div class="stat-lbl">Obrót brutto (PLN)</div>
        <div class="stat-trend" style="color:#64748B">Dane zewnętrzne</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #0284C7">
        <div class="stat-val" style="color:#0284C7">{{ formatPLN(extKpi.netTurnover) }}</div>
        <div class="stat-lbl">Obrót netto (PLN)</div>
        <div class="stat-trend" style="color:#64748B">{{ extKpi.grossTurnover > 0 ? 'Marża: ' + (extKpi.netTurnover/extKpi.grossTurnover*100|number:'1.0-1') + '%' : '—' }}</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #7C3AED">
        <div class="stat-val" style="color:#7C3AED">{{ formatPLN(extKpi.fees) }}</div>
        <div class="stat-lbl">Fees (PLN)</div>
        <div class="stat-trend" style="color:#64748B">{{ extKpi.grossTurnover > 0 ? 'Fee rate: ' + (extKpi.fees/extKpi.grossTurnover*100|number:'1.0-1') + '%' : '—' }}</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #059669">
        <div class="stat-val" style="color:#059669">{{ formatPLN(extKpi.revenue) }}</div>
        <div class="stat-lbl">Przychód (PLN)</div>
        <div class="stat-trend" style="color:#64748B">{{ extKpi.grossTurnover > 0 ? 'Udział: ' + (extKpi.revenue/extKpi.grossTurnover*100|number:'1.0-1') + '%' : '—' }}</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #64748B">
        <div class="stat-val">{{ extKpi.transactions | number }}</div>
        <div class="stat-lbl">Transakcji</div>
        <div class="stat-trend" style="color:#64748B">{{ extKpi.pax | number }} pasażerów</div>
      </div>
    </div>

    <!-- ── Row 1: Funnel + Bar chart ── -->
    <div class="chart-row-2">

      <!-- Funnel -->
      <div class="card" style="padding:20px">
        <div class="card-head">
          <div class="card-title">Lejek sprzedażowy</div>
          <span class="card-sub">Liczba leadów i wartość PLN</span>
        </div>
        <div class="funnel">
          <div *ngFor="let row of funnel; let i = index" class="funnel-row">
            <div class="funnel-label">{{ row.label }}</div>
            <div class="funnel-bar-wrap">
              <div class="funnel-bg"></div>
              <div class="funnel-fill" [style.width.%]="funnelPct(row.val)" [style.background]="row.color"></div>
              <div class="funnel-txt">
                <span class="funnel-n">{{ row.n }} lead.</span>
                <span class="funnel-v">{{ (row.val/1000).toFixed(0) }}k PLN</span>
              </div>
            </div>
            <div class="funnel-conv" *ngIf="i < funnel.length - 1">
              {{ convPct(i) }}%↓
            </div>
            <div class="funnel-conv" *ngIf="i === funnel.length - 1"></div>
          </div>
        </div>
        <!-- Mini stats -->
        <div class="mini-stats">
          <div class="mini-stat" *ngFor="let s of miniStats">
            <div class="mini-lbl">{{ s.label }}</div>
            <div class="mini-val" [style.color]="s.color || null">{{ s.value }}</div>
          </div>
        </div>
      </div>

      <!-- Monthly bar chart -->
      <div class="card" style="padding:20px">
        <div class="card-head">
          <div class="card-title">Przychody miesięczne</div>
          <div class="chart-legend">
            <span><span class="leg-dot" style="background:var(--orange)"></span>Won</span>
            <span><span class="leg-dot" style="background:#BFDBFE"></span>Pipeline</span>
          </div>
        </div>
        <div class="bar-chart">
          <div *ngFor="let d of monthly" class="bar-col">
            <div class="bar-won-lbl" *ngIf="d.won > 0" style="color:var(--orange)">{{ (d.won/1000).toFixed(0) }}k</div>
            <div class="bar-won-lbl" *ngIf="!d.won"></div>
            <div class="bar-bars">
              <div class="bar-pipe" [style.height.px]="barH(d.pipe)" title="Pipeline: {{ (d.pipe/1000).toFixed(0) }}k PLN"></div>
              <div class="bar-win" *ngIf="d.won" [style.height.px]="barH(d.won)" title="Won: {{ (d.won/1000).toFixed(0) }}k PLN"></div>
              <div class="bar-win empty" *ngIf="!d.won"></div>
            </div>
          </div>
        </div>
        <div class="bar-labels">
          <div *ngFor="let d of monthly" class="bar-lbl-item">{{ d.m }}</div>
        </div>
        <!-- Projected -->
        <div class="proj-box" *ngIf="projected > 0">
          <span>📈 Wartość prognozowana (ważona):</span>
          <strong style="color:var(--orange)">{{ formatPLN(projected) }} PLN</strong>
        </div>
      </div>
    </div>

    <!-- ── Row 2: Sales reps + Sources ── -->
    <div class="chart-row-2" style="grid-template-columns:1.4fr 1fr">

      <!-- Sales table -->
      <div class="card" style="padding:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="card-title">Wyniki handlowców</div>
          <span class="mini-lbl" *ngIf="salesByPerson.length > 0" style="color:#0EA5E9">📥 Dane zewnętrzne</span>
        </div>

        <!-- Tabela z danych zewnętrznych (gdy dostępne) -->
        <ng-container *ngIf="salesByPerson.length > 0; else crmSalesTable">
          <table class="sales-tbl">
            <thead>
              <tr>
                <th>Handlowiec</th>
                <th class="tr">Partnerzy</th>
                <th class="tr">Obrót brutto</th>
                <th class="tr">Netto</th>
                <th class="tr">Fees</th>
                <th class="tr">Przychód</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of salesByPerson">
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div class="avatar-sm" [style.background]="initColor(s.salesperson_name)">{{ initials(s.salesperson_name) }}</div>
                    <span style="font-weight:600;color:var(--gray-900)">{{ s.salesperson_name }}</span>
                  </div>
                </td>
                <td class="tr" style="color:var(--gray-600)">{{ s.partners_count }}</td>
                <td class="tr" style="font-weight:600;color:#0EA5E9;font-family:'Sora',sans-serif">
                  {{ s.gross_turnover_pln ? (s.gross_turnover_pln/1000|number:'1.0-0')+'k' : '—' }}
                </td>
                <td class="tr" style="color:var(--gray-600)">
                  {{ s.net_turnover_pln ? (s.net_turnover_pln/1000|number:'1.0-0')+'k' : '—' }}
                </td>
                <td class="tr" style="color:#7C3AED">
                  {{ s.fees_pln ? (s.fees_pln/1000|number:'1.0-0')+'k' : '—' }}
                </td>
                <td class="tr" style="color:#059669;font-weight:600">
                  {{ s.revenue_pln ? (s.revenue_pln/1000|number:'1.0-0')+'k' : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </ng-container>

        <!-- Fallback: dane z leadów CRM -->
        <ng-template #crmSalesTable>
          <table class="sales-tbl">
            <thead>
              <tr>
                <th>Handlowiec</th>
                <th class="tr">Leady</th>
                <th class="tr">Pipeline</th>
                <th class="tr">Won</th>
                <th class="tr">Win%</th>
                <th>Postęp</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of salesRows">
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div class="avatar-sm" [style.background]="s.color">{{ s.initials }}</div>
                    <span style="font-weight:600;color:var(--gray-900)">{{ s.name }}</span>
                  </div>
                </td>
                <td class="tr" style="color:var(--gray-600)">{{ s.leads }}</td>
                <td class="tr" style="font-weight:600;color:var(--orange);font-family:'Sora',sans-serif">
                  {{ s.pipeline ? (s.pipeline/1000).toFixed(0)+'k' : '—' }}
                </td>
                <td class="tr" [style.color]="s.won > 0 ? '#22C55E' : 'var(--gray-300)'" style="font-weight:600">
                  {{ s.won > 0 ? (s.won/1000).toFixed(0)+'k' : '—' }}
                </td>
                <td class="tr" [style.color]="s.winPct >= 40 ? '#22C55E' : 'var(--gray-500)'">{{ s.winPct }}%</td>
                <td>
                  <div class="prog-bar">
                    <div class="prog-fill" [style.width.%]="s.progress"
                         [style.background]="s.winPct >= 40 ? '#22C55E' : s.winPct >= 30 ? 'var(--orange)' : '#3B82F6'">
                    </div>
                  </div>
                </td>
              </tr>
              <tr *ngIf="salesRows.length === 0">
                <td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">Brak danych</td>
              </tr>
            </tbody>
          </table>
        </ng-template>
      </div>

      <!-- Sources donut -->
      <div class="card" style="padding:20px">
        <div class="card-title" style="margin-bottom:14px">Źródła leadów</div>
        <div style="display:flex;align-items:center;gap:20px">
          <svg width="120" height="120" viewBox="0 0 120 120" style="flex-shrink:0">
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F4F4F5" stroke-width="18"/>
            <ng-container *ngFor="let seg of donutSegs">
              <path [attr.d]="seg.d" [attr.fill]="seg.color" opacity="0.9"/>
            </ng-container>
            <circle cx="60" cy="60" r="30" fill="white"/>
            <text x="60" y="57" text-anchor="middle" font-size="14" font-weight="700" fill="#18181B">{{ totalLeads }}</text>
            <text x="60" y="69" text-anchor="middle" font-size="8" font-weight="600" fill="#A1A1AA">leadów</text>
          </svg>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px">
            <div *ngFor="let s of sources" style="display:flex;align-items:center;gap:6px;font-size:12px">
              <span class="leg-dot" [style.background]="s.color" style="width:10px;height:10px;border-radius:2px;flex-shrink:0;display:inline-block"></span>
              <span style="color:var(--gray-600);flex:1">{{ s.label }}</span>
              <span style="font-weight:700;color:var(--gray-900)">{{ s.pct }}%</span>
            </div>
          </div>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--gray-200)">
          <div class="mini-lbl" style="margin-bottom:8px">Jakość po źródle</div>
          <div style="display:flex;flex-direction:column;gap:5px;font-size:12px">
            <div *ngFor="let s of sourceQuality" style="display:flex;justify-content:space-between">
              <span>{{ s.label }}</span>
              <span style="font-weight:700" [style.color]="s.color">{{ s.wr }}% win rate</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Row 3: Velocity + Lost reasons ── -->
    <div class="chart-row-2">

      <!-- Velocity -->
      <div class="card" style="padding:20px">
        <div class="card-title" style="margin-bottom:16px">Czas w etapie (średnia dni)</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div *ngFor="let v of velocity">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--gray-600)">{{ v.label }}</span>
              <span style="font-size:12px;font-weight:700" [style.color]="veloColor(v.days, v.max)">{{ v.days }} dni</span>
            </div>
            <div class="prog-bar" style="height:6px">
              <div class="prog-fill" [style.width.%]="v.days/v.max*100" [style.background]="veloColor(v.days, v.max)"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Lost reasons -->
      <div class="card" style="padding:20px">
        <div class="card-title" style="margin-bottom:16px">Powody przegranej</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div *ngFor="let l of lostReasons">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--gray-600)">{{ l.label }}</span>
              <span style="font-size:12px;font-weight:700" [style.color]="l.color">{{ l.pct }}%</span>
            </div>
            <div class="prog-bar" style="height:8px">
              <div class="prog-fill" [style.width.%]="l.pct" [style.background]="l.color" style="opacity:.8"></div>
            </div>
          </div>
        </div>
        <div class="insight-box" *ngIf="topLostReason">
          💡 <strong>Insight:</strong> {{ topLostReason.pct }}% przegranych wynika z „{{ topLostReason.label }}".
        </div>
      </div>
    </div>

  </ng-container>
</div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    #topbar { height:60px; background:white; border-bottom:1px solid var(--gray-200); display:flex; align-items:center; gap:12px; padding:0 24px; flex-shrink:0; }
    .page-title { font-family:'Sora',sans-serif; font-size:17px; font-weight:700; color:var(--gray-900); }
    .tsp { flex:1; }
    .sel { background:var(--gray-100); border:1px solid var(--gray-200); border-radius:8px; padding:6px 10px; font-size:12.5px; color:var(--gray-700); outline:none; font-family:inherit; }
    .btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:none; font-family:inherit; transition:all .15s; }
    .btn-g { background:white; color:var(--gray-600); border:1px solid var(--gray-200); } .btn-g:hover { background:var(--gray-50); }
    .btn-sm { padding:5px 10px; font-size:12px; }

    #content { flex:1; overflow-y:auto; padding:20px 24px 28px; display:flex; flex-direction:column; gap:16px; }

    /* KPI */
    .stats-row { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; flex-shrink:0; }
    .stat-card { background:white; border:1px solid var(--gray-200); border-radius:10px; padding:14px 18px; }
    .stat-val { font-family:'Sora',sans-serif; font-size:22px; font-weight:700; color:var(--gray-900); }
    .stat-lbl { font-size:12px; color:var(--gray-400); font-weight:500; margin-top:2px; }
    .stat-trend { font-size:11px; margin-top:5px; font-weight:600; }
    .trend-up { color:#16A34A; } .trend-dn { color:#DC2626; }

    /* Layout */
    .chart-row-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .card { background:white; border:1px solid var(--gray-200); border-radius:10px; }
    .card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
    .card-title { font-family:'Sora',sans-serif; font-size:13px; font-weight:700; color:var(--gray-900); }
    .card-sub { font-size:11px; color:var(--gray-400); }
    .chart-legend { display:flex; gap:10px; font-size:11px; color:var(--gray-400); }
    .chart-legend span { display:flex; align-items:center; gap:4px; }
    .leg-dot { width:10px; height:10px; border-radius:2px; display:inline-block; flex-shrink:0; }

    /* Funnel */
    .funnel { display:flex; flex-direction:column; gap:7px; }
    .funnel-row { display:flex; align-items:center; gap:8px; }
    .funnel-label { width:96px; font-size:11.5px; color:var(--gray-500); text-align:right; flex-shrink:0; }
    .funnel-bar-wrap { flex:1; position:relative; height:28px; }
    .funnel-bg { position:absolute; inset:0; background:var(--gray-100); border-radius:4px; }
    .funnel-fill { position:absolute; top:0; left:0; height:100%; border-radius:4px; opacity:.85; transition:width .5s ease; }
    .funnel-txt { position:absolute; inset:0; display:flex; align-items:center; padding:0 8px; }
    .funnel-n { font-size:10.5px; font-weight:700; color:white; text-shadow:0 1px 2px rgba(0,0,0,.4); }
    .funnel-v { font-size:10.5px; color:white; text-shadow:0 1px 2px rgba(0,0,0,.4); margin-left:auto; }
    .funnel-conv { width:36px; text-align:center; font-size:10px; color:var(--gray-400); flex-shrink:0; }

    /* Mini stats */
    .mini-stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:14px; }
    .mini-stat { background:var(--gray-50); border-radius:8px; padding:8px 10px; }
    .mini-lbl { font-size:11px; color:var(--gray-400); font-weight:500; text-transform:uppercase; letter-spacing:.4px; margin-bottom:2px; }
    .mini-val { font-weight:700; color:var(--gray-900); font-family:'Sora',sans-serif; font-size:13px; }

    /* Bar chart */
    .bar-chart { display:flex; align-items:flex-end; gap:6px; height:150px; padding-bottom:0; border-bottom:1px solid var(--gray-200); }
    .bar-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:2px; }
    .bar-won-lbl { font-size:9px; font-weight:700; min-height:14px; display:flex; align-items:flex-end; }
    .bar-bars { display:flex; gap:2px; align-items:flex-end; justify-content:center; width:100%; }
    .bar-pipe { flex:1; background:#BFDBFE; border-radius:3px 3px 0 0; min-height:4px; }
    .bar-win  { flex:1; background:var(--orange); border-radius:3px 3px 0 0; min-height:4px; }
    .bar-win.empty { flex:1; }
    .bar-labels { display:flex; gap:6px; margin-top:6px; }
    .bar-lbl-item { flex:1; text-align:center; font-size:11px; color:var(--gray-400); }
    .proj-box { margin-top:12px; padding:8px 12px; background:var(--orange-pale); border:1px solid var(--orange-muted); border-radius:8px; font-size:12px; color:var(--orange-dark); display:flex; gap:6px; align-items:center; flex-wrap:wrap; }

    /* Sales table */
    .sales-tbl { width:100%; border-collapse:collapse; font-size:12.5px; }
    .sales-tbl thead tr { border-bottom:1px solid var(--gray-200); }
    .sales-tbl th { text-align:left; padding:6px 8px; font-size:10px; text-transform:uppercase; color:var(--gray-400); font-weight:600; }
    .sales-tbl th.tr { text-align:right; }
    .sales-tbl tbody tr { border-bottom:1px solid var(--gray-100); }
    .sales-tbl td { padding:8px 8px; }
    .sales-tbl td.tr { text-align:right; }
    .avatar-sm { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:white; flex-shrink:0; }

    /* Progress bars */
    .prog-bar { height:6px; background:var(--gray-100); border-radius:3px; overflow:hidden; width:80px; }
    .prog-fill { height:100%; border-radius:3px; transition:width .4s ease; }

    /* Insight */
    .insight-box { margin-top:14px; padding:12px; background:var(--orange-pale); border:1px solid var(--orange-muted); border-radius:8px; font-size:12px; color:var(--orange-dark); line-height:1.5; }

    /* Loading */
    .loading-state { display:flex; align-items:center; justify-content:center; gap:10px; padding:60px; color:var(--gray-400); font-size:13px; }
    .spinner { width:20px; height:20px; border:2px solid var(--gray-200); border-top-color:var(--orange); border-radius:50%; animation:spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }

    /* Data source banner */
    .data-source-banner { background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px; padding:9px 14px; font-size:12px; color:#1E40AF; display:flex; align-items:center; gap:8px; flex-shrink:0; }
    .btn-link { background:none; border:none; color:#2563EB; font-size:12px; font-weight:600; cursor:pointer; text-decoration:underline; padding:0; font-family:inherit; margin-left:auto; }
  `],
})
export class CrmReportsComponent implements OnInit {
  private api  = inject(CrmApiService);
  private auth = inject(AuthService);
  private zone = inject(NgZone);
  private cdr  = inject(ChangeDetectorRef);

  loading     = true;
  period      = 'ytd';
  ownerFilter = '';

  // ── Filtry danych zewnętrznych ──────────────────────────────
  filterPartner = '';
  filterProduct = '';

  // ── Dane zewnętrzne ─────────────────────────────────────────
  salesSummary:  SalesSummaryRow[]  = [];
  salesByPerson: SalesByPerson[]    = [];
  partnersMeta:  SalesPartnerMeta[] = [];

  extKpi = { grossTurnover: 0, netTurnover: 0, fees: 0, revenue: 0, transactions: 0, pax: 0 };

  kpi: KpiData = { pipeline: 0, won: 0, winRate: 0, avgCycle: 38, active: 0, hot: 0 };

  funnel:       FunnelRow[]  = [];
  monthly:      MonthlyRow[] = [];
  sources:      SourceRow[]  = [];
  velocity:     VeloRow[]    = [];
  lostReasons:  LostRow[]    = [];
  salesRows:    SalesRow[]   = [];
  salesReps:    any[]        = [];

  donutSegs:  { d: string; color: string }[] = [];
  miniStats:  { label: string; value: string; color?: string }[] = [];
  sourceQuality = [
    { label: 'Polecenia',    wr: 68, color: '#22C55E' },
    { label: 'Targi',        wr: 45, color: 'var(--orange)' },
    { label: 'Strona www',   wr: 28, color: 'var(--gray-600)' },
    { label: 'Cold outreach',wr: 15, color: 'var(--gray-400)' },
  ];

  totalLeads  = 0;
  projected   = 0;

  get isManager() {
    const u = this.auth.user();
    return u?.is_admin || (u as any)?.crm_role === 'sales_manager';
  }

  get topLostReason() {
    return this.lostReasons.length ? this.lostReasons[0] : null;
  }

  ngOnInit() {
    this.reload();
    this.api.getCrmUsers().subscribe({
      next: u => this.zone.run(() => { this.salesReps = u; this.cdr.markForCheck(); }),
      error: () => {},
    });
    this.loadPartnersMeta();
    this.loadExternalData();
  }

  onFilterChange() { this.reload(); }

  onSalesFilterChange() { this.loadExternalData(); }

  reload() {
    this.loading = true;
    const params: any = { limit: 500 };
    if (this.ownerFilter) params['assigned_to'] = this.ownerFilter;

    this.api.getLeads(params).subscribe({
      next: res => this.zone.run(() => {
        this.compute(res.data);
        this.loading = false;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }),
    });
  }

  // ── Dane zewnętrzne ───────────────────────────────────────────

  private loadPartnersMeta() {
    this.api.getSalesPartnersMeta().subscribe({
      next: data => this.zone.run(() => { this.partnersMeta = data; this.cdr.markForCheck(); }),
      error: () => {},
    });
  }

  private loadExternalData() {
    const params = {
      partner_name: this.filterPartner || undefined,
      product_type: this.filterProduct || undefined,
    };
    this.api.getSalesSummary(params).subscribe({
      next: summary => this.zone.run(() => {
        this.salesSummary = summary;
        this.applyExternalSummary(summary);
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
    this.api.getSalesBySalesperson(params).subscribe({
      next: data => this.zone.run(() => {
        this.salesByPerson = data;
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  private applyExternalSummary(data: SalesSummaryRow[]) {
    const sorted = [...data].sort((a, b) => a.period.localeCompare(b.period));
    const last6  = sorted.slice(-6);

    // Wykres miesięczny: obrót brutto jako "pipe", przychód jako "won"
    const MONTHS: Record<string, string> = {
      '01':'Sty','02':'Lut','03':'Mar','04':'Kwi','05':'Maj','06':'Cze',
      '07':'Lip','08':'Sie','09':'Wrz','10':'Paź','11':'Lis','12':'Gru',
    };
    if (last6.length > 0) {
      this.monthly = last6.map(row => ({
        m:    MONTHS[row.period.slice(5, 7)] ?? row.period.slice(5, 7),
        won:  Number(row.revenue_pln),
        pipe: Number(row.gross_turnover_pln),
      }));
    }

    // Zewnętrzne KPI (suma całego zakresu)
    this.extKpi = {
      grossTurnover: data.reduce((s, r) => s + Number(r.gross_turnover_pln), 0),
      netTurnover:   data.reduce((s, r) => s + Number(r.net_turnover_pln),   0),
      fees:          data.reduce((s, r) => s + Number(r.fees_pln),           0),
      revenue:       data.reduce((s, r) => s + Number(r.revenue_pln),        0),
      transactions:  data.reduce((s, r) => s + Number(r.transactions_count), 0),
      pax:           data.reduce((s, r) => s + Number(r.pax_count),          0),
    };
  }

  private compute(leads: any[]) {
    const active = leads.filter(l => !l.converted_at);
    const probMap: Record<string, number> = {
      new: 10, qualification: 25, presentation: 50, offer: 70, negotiation: 85,
      closed_won: 100, closed_lost: 0,
    };

    // KPI
    const won   = active.filter(l => l.stage === 'closed_won');
    const lost  = active.filter(l => l.stage === 'closed_lost');
    const open  = active.filter(l => !['closed_won','closed_lost'].includes(l.stage));
    const total = won.length + lost.length;

    this.kpi = {
      pipeline: open.reduce((s, l) => s + (l.value_pln || 0), 0),
      won:      won.reduce((s, l) => s + (l.value_pln || 0), 0),
      winRate:  total > 0 ? Math.round(won.length / total * 100) : 0,
      avgCycle: 38, // TODO: oblicz z dat
      active:   open.length,
      hot:      open.filter(l => l.hot).length,
    };

    this.totalLeads = active.length;

    this.projected = active.reduce((s, l) => {
      const p = probMap[l.stage] ?? 0;
      return s + (l.value_pln || 0) * p / 100;
    }, 0);

    // Funnel
    const stageOrder = ['new','qualification','presentation','offer','negotiation'];
    const stageLabels: Record<string,string> = {
      new:'Nowy', qualification:'Kwalifikacja', presentation:'Prezentacja',
      offer:'Oferta', negotiation:'Negocjacje',
    };
    this.funnel = stageOrder.map(s => ({
      label: stageLabels[s],
      n:     active.filter(l => l.stage === s).length,
      val:   active.filter(l => l.stage === s).reduce((x, l) => x + (l.value_pln || 0), 0),
      color: STAGE_COLORS[s],
    }));
    // Dodaj zamknięte
    this.funnel.push({
      label: 'Zamknięty',
      n:     won.length,
      val:   won.reduce((x, l) => x + (l.value_pln || 0), 0),
      color: '#22C55E',
    });

    // Mini stats
    const maxWon = won.length > 0 ? Math.max(...won.map(l => l.value_pln || 0)) : 0;
    this.miniStats = [
      { label: 'Konwersja Nowy→Kwalif.', value: this.convPctStr(0) },
      { label: 'Konwersja Oferta→Zamkn.', value: this.convPctStr(3) },
      { label: 'Avg. wartość wygranego', value: won.length > 0 ? this.formatPLN(won.reduce((s,l)=>s+(l.value_pln||0),0)/won.length)+' PLN' : '—' },
      { label: 'Wartość prognozowana', value: this.formatPLN(this.projected)+' PLN', color: 'var(--orange)' },
    ];

    // Monthly — generujemy ostatnie 6 miesięcy
    const months = this.last6Months();
    this.monthly = months.map(m => {
      const inMonth = active.filter(l => {
        const d = l.created_at ? new Date(l.created_at) : null;
        return d && d.getMonth() === m.month && d.getFullYear() === m.year;
      });
      return {
        m: m.label,
        pipe: inMonth.filter(l => !['closed_won','closed_lost'].includes(l.stage))
                     .reduce((s, l) => s + (l.value_pln || 0), 0),
        won:  inMonth.filter(l => l.stage === 'closed_won')
                     .reduce((s, l) => s + (l.value_pln || 0), 0),
      };
    });
    // Zapewnij minimum danych statycznych jeśli brak
    if (this.monthly.every(m => m.pipe === 0 && m.won === 0)) {
      this.monthly = [
        {m:'Sty',won:0,pipe:320000},{m:'Lut',won:0,pipe:580000},
        {m:'Mar',won:670000,pipe:890000},{m:'Kwi',won:0,pipe:1200000},
        {m:'Maj',won:0,pipe:520000},{m:'Cze',won:0,pipe:380000},
      ];
    }

    // Sources
    const srcCount: Record<string, number> = {};
    active.forEach(l => { if (l.source) srcCount[l.source] = (srcCount[l.source]||0)+1; });
    const srcTotal = Object.values(srcCount).reduce((s, n) => s + n, 0) || 1;
    const srcColors: Record<string,string> = {
      targi:'#F26522', polecenie:'#22C55E', strona_www:'#3B82F6',
      cold_call:'#A855F7', linkedin:'#F59E0B', partner:'#10B981',
      kampania:'#6366F1', inbound:'#14B8A6', inne:'#94A3B8',
    };
    const srcLabels: Record<string,string> = {
      targi:'Targi', polecenie:'Polecenia', strona_www:'Strona www',
      cold_call:'Cold outreach', linkedin:'LinkedIn', partner:'Partner',
      kampania:'Kampania', inbound:'Inbound', inne:'Inne',
    };
    this.sources = Object.entries(srcCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, n]) => ({
        label: srcLabels[k] ?? k,
        pct:   Math.round(n / srcTotal * 100),
        color: srcColors[k] ?? '#94A3B8',
      }));
    if (this.sources.length === 0) {
      this.sources = [
        {label:'Targi',pct:35,color:'#F26522'},
        {label:'Polecenia',pct:28,color:'#22C55E'},
        {label:'Strona www',pct:20,color:'#3B82F6'},
        {label:'Cold outreach',pct:12,color:'#A855F7'},
        {label:'Social media',pct:5,color:'#F59E0B'},
      ];
    }
    this.buildDonut();

    // Velocity (statyczny — wymagałby timestampów etapów)
    this.velocity = [
      {label:'Nowy → Kwalifikacja',      days:5,  max:15},
      {label:'Kwalifikacja → Demo',      days:9,  max:15},
      {label:'Demo → Oferta',            days:8,  max:15},
      {label:'Oferta → Negocjacje',      days:11, max:15},
      {label:'Negocjacje → Zamknięcie',  days:5,  max:15},
    ];

    // Lost reasons (statyczny — wymagałby pola lost_reason)
    this.lostReasons = [
      {label:'Cena zbyt wysoka',    pct:60, color:'#EF4444'},
      {label:'Wybrał konkurencję',  pct:25, color:'#F59E0B'},
      {label:'Brak budżetu',        pct:10, color:'#94A3B8'},
      {label:'Projekt odłożony',    pct:5,  color:'#3B82F6'},
    ];

    // Sales rows
    const repMap: Record<string, { leads: number; pipeline: number; won: number; wonCount: number; lostCount: number; name: string }> = {};
    active.forEach(l => {
      const id   = l.assigned_to;
      const name = l.assigned_to_name;
      if (!id || !name) return;
      if (!repMap[id]) repMap[id] = { leads:0, pipeline:0, won:0, wonCount:0, lostCount:0, name };
      repMap[id].leads++;
      if (l.stage === 'closed_won')   { repMap[id].won += (l.value_pln||0); repMap[id].wonCount++; }
      else if (l.stage === 'closed_lost') repMap[id].lostCount++;
      else repMap[id].pipeline += (l.value_pln||0);
    });
    const colors = ['var(--orange)','#22C55E','#3B82F6','#A855F7','#F59E0B'];
    const maxPipe = Math.max(...Object.values(repMap).map(r => r.pipeline), 1);
    this.salesRows = Object.entries(repMap).map(([id, r], i) => {
      const totalClosed = r.wonCount + r.lostCount;
      const winPct = totalClosed > 0 ? Math.round(r.wonCount / totalClosed * 100) : 0;
      return {
        name:     r.name,
        initials: r.name.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase(),
        color:    colors[i % colors.length],
        leads:    r.leads,
        pipeline: r.pipeline,
        won:      r.won,
        winPct,
        progress: Math.round(r.pipeline / maxPipe * 100),
      };
    }).sort((a, b) => b.pipeline - a.pipeline);
  }

  // ── Chart helpers ──

  private buildDonut() {
    const cx = 60, cy = 60, r = 44;
    let angle = -Math.PI / 2;
    this.donutSegs = this.sources.map(s => {
      const sweep = (s.pct / 100) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += sweep;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const large = s.pct > 50 ? 1 : 0;
      return {
        d: `M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z`,
        color: s.color,
      };
    });
  }

  private last6Months(): { label: string; month: number; year: number }[] {
    const names = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
    const now = new Date();
    return Array.from({length: 6}, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { label: names[d.getMonth()], month: d.getMonth(), year: d.getFullYear() };
    });
  }

  funnelPct(val: number): number {
    const max = Math.max(...this.funnel.map(f => f.val), 1);
    return Math.round(val / max * 100);
  }

  convPct(i: number): number {
    if (!this.funnel[i] || !this.funnel[i+1]) return 0;
    const a = this.funnel[i].n;
    const b = this.funnel[i+1].n;
    return a > 0 ? Math.round(b / a * 100) : 0;
  }

  private convPctStr(i: number): string {
    const v = this.convPct(i);
    return v > 0 ? v + '%' : '—';
  }

  barMaxVal(): number {
    return Math.max(...this.monthly.map(d => Math.max(d.won, d.pipe)), 1);
  }

  barH(val: number): number {
    return Math.max(4, Math.round(val / this.barMaxVal() * 140));
  }

  veloColor(days: number, max: number): string {
    const pct = days / max * 100;
    return pct > 80 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#22C55E';
  }

  formatPLN(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000)     return Math.round(v / 1_000) + 'k';
    return String(Math.round(v));
  }

  initials(name: string | null): string {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  initColor(name: string | null): string {
    if (!name) return '#94A3B8';
    const COLORS = ['#F97316','#3B82F6','#22C55E','#A855F7','#EF4444','#0EA5E9','#14B8A6'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % COLORS.length;
    return COLORS[Math.abs(h)];
  }

  exportPDF() {
    window.print();
  }
}

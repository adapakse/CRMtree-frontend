import {
  Component, OnInit, AfterViewInit, inject, ChangeDetectorRef,
  NgZone, ChangeDetectionStrategy, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  CrmApiService, AnalyticsPeriod, PartnersAnalytics, CrmUser,
  PRODUCT_TYPE_LABELS, PRODUCT_TYPE_ICONS,
} from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PeriodFilterComponent, PeriodChangeEvent } from '../../../shared/components/period-filter/period-filter.component';
import { getPresetDates } from '../../../shared/utils/period-dates';

const MONTH_NAMES_PL = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];

type CompareMode = 'yoy' | 'qoq' | 'mom' | 'custom';

@Component({
  selector: 'crm-partners-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule, PeriodFilterComponent],
  template: `
<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

<!-- TOPBAR -->
<div style="min-height:60px;background:white;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:8px 24px;flex-shrink:0">
  <span style="font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:#18181b">
    Dashboard Analityczny — Partnerzy
  </span>
  <span style="flex:1"></span>

  <div style="display:flex;background:#f4f4f5;border-radius:8px;padding:2px;gap:2px">
    <button *ngFor="let y of availableYears" class="mode-btn"
            [class.mode-active]="isYearA(y)"
            [class.mode-year-b]="isYearB(y)"
            (click)="toggleYear(y)">
      {{y}}
    </button>
    <button class="mode-btn"
            [class.mode-active]="selectedYears.length===0"
            (click)="clearYears()">
      Filtr
    </button>
  </div>

  <div style="display:flex;background:#f4f4f5;border-radius:8px;padding:2px;gap:2px">
    <button *ngFor="let m of modes" [class.mode-active]="mode===m.v" class="mode-btn" (click)="setMode(m.v)">
      {{m.l}}
    </button>
  </div>

  <period-filter [preset]="periodPreset"
                 (periodChange)="onPeriodChange($event)"></period-filter>

  <select *ngIf="isManager" class="sel" [(ngModel)]="repId" (ngModelChange)="load()">
    <option value="">Wszyscy handlowcy</option>
    <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
  </select>

  <button class="btn-refresh" (click)="load()">{{loading ? '…' : '↻ Odśwież'}}</button>
</div>

<!-- PERIOD BAR -->
<div style="background:white;border-bottom:1px solid #e4e4e7;padding:8px 24px;display:flex;align-items:center;gap:10px;flex-shrink:0">
  <span style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600">
    <span style="width:10px;height:10px;border-radius:50%;background:#3BAA5D;display:inline-block"></span>
    Okres A: <span style="color:#3BAA5D">{{labelA}}</span>
  </span>
  <span style="font-size:11px;font-weight:700;color:#a1a1aa;padding:2px 8px;background:#f4f4f5;border-radius:6px">VS</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600">
    <span style="width:10px;height:10px;border-radius:50%;background:#3b82f6;display:inline-block"></span>
    Okres B: <span style="color:#3b82f6">{{labelB || '—'}}</span>
  </span>

  <ng-container *ngIf="mode==='custom'">
    <span style="font-size:11px;color:#a1a1aa;margin-left:8px">Własny Okres B:</span>
    <input type="month" class="sel" [(ngModel)]="customFromB" style="width:140px" (change)="onCustomB()">
    <span style="font-size:11px;color:#a1a1aa">do</span>
    <input type="month" class="sel" [(ngModel)]="customToB"   style="width:140px" (change)="onCustomB()">
  </ng-container>

  <span style="flex:1"></span>
  <span *ngIf="data" style="font-size:11px;color:#a1a1aa">
    {{data.a.kpi.partners_count}} partnerów · {{data.a.kpi.transactions_count | number}} produktów
  </span>
</div>

<!-- CONTENT -->
<div style="flex:1;overflow-y:auto;padding:20px 24px">

  <div *ngIf="loading" style="height:3px;background:linear-gradient(90deg,#3BAA5D,#86efac);border-radius:2px;margin-bottom:16px"></div>

  <div *ngIf="!loading && !data" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;color:#a1a1aa">
    <div style="font-size:48px;margin-bottom:12px">📊</div>
    <div style="font-size:15px;font-weight:600">Brak danych dla wybranego okresu</div>
  </div>

  <ng-container *ngIf="data">

  <!-- KPI CARDS -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px">

    <div class="kpi-card">
      <div class="kpi-lbl">Obrót Brutto (PLN)</div>
      <div class="kpi-val">{{data.a.kpi.gross_turnover_pln | number:'1.0-0'}}</div>
      <div *ngIf="data.b" class="kpi-compare">
        <span class="kpi-b">{{labelB}}: {{data.b.kpi.gross_turnover_pln | number:'1.0-0'}}</span>
        <span class="delta-pill" [class.up]="deltaSign(data.a.kpi.gross_turnover_pln, data.b.kpi.gross_turnover_pln)>0"
              [class.down]="deltaSign(data.a.kpi.gross_turnover_pln, data.b.kpi.gross_turnover_pln)<0"
              [class.flat]="deltaSign(data.a.kpi.gross_turnover_pln, data.b.kpi.gross_turnover_pln)===0">
          {{fmtDelta(data.a.kpi.gross_turnover_pln, data.b.kpi.gross_turnover_pln)}}
        </span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-lbl">Obrót Netto (PLN)</div>
      <div class="kpi-val">{{data.a.kpi.net_turnover_pln | number:'1.0-0'}}</div>
      <div *ngIf="data.b" class="kpi-compare">
        <span class="kpi-b">{{labelB}}: {{data.b.kpi.net_turnover_pln | number:'1.0-0'}}</span>
        <span class="delta-pill" [class.up]="deltaSign(data.a.kpi.net_turnover_pln, data.b.kpi.net_turnover_pln)>0"
              [class.down]="deltaSign(data.a.kpi.net_turnover_pln, data.b.kpi.net_turnover_pln)<0"
              [class.flat]="deltaSign(data.a.kpi.net_turnover_pln, data.b.kpi.net_turnover_pln)===0">
          {{fmtDelta(data.a.kpi.net_turnover_pln, data.b.kpi.net_turnover_pln)}}
        </span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-lbl">Marża</div>
      <div class="kpi-val">{{data.a.kpi.margin_pct || 0 | number:'1.1-1'}}%</div>
      <div *ngIf="data.b" class="kpi-compare">
        <span class="kpi-b">{{labelB}}: {{data.b.kpi.margin_pct || 0 | number:'1.1-1'}}%</span>
        <span class="delta-pill"
              [class.up]="(data.a.kpi.margin_pct||0) > (data.b.kpi.margin_pct||0)"
              [class.down]="(data.a.kpi.margin_pct||0) < (data.b.kpi.margin_pct||0)"
              [class.flat]="(data.a.kpi.margin_pct||0) === (data.b.kpi.margin_pct||0)">
          {{fmtDeltaPp(data.a.kpi.margin_pct||0, data.b.kpi.margin_pct||0)}}
        </span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-lbl">Ilość Produktów</div>
      <div class="kpi-val">{{data.a.kpi.transactions_count | number}}</div>
      <div *ngIf="data.b" class="kpi-compare">
        <span class="kpi-b">{{labelB}}: {{data.b.kpi.transactions_count | number}}</span>
        <span class="delta-pill" [class.up]="deltaSign(data.a.kpi.transactions_count, data.b.kpi.transactions_count)>0"
              [class.down]="deltaSign(data.a.kpi.transactions_count, data.b.kpi.transactions_count)<0"
              [class.flat]="deltaSign(data.a.kpi.transactions_count, data.b.kpi.transactions_count)===0">
          {{fmtDelta(data.a.kpi.transactions_count, data.b.kpi.transactions_count)}}
        </span>
      </div>
    </div>
  </div>

  <!-- ROW 2: Trend + Produkty -->
  <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-bottom:16px">

    <div class="card" style="padding:18px 20px">
      <div class="card-title">
        <span>Trend miesięczny — {{trendMetricLabel}}</span>
        <div style="display:flex;align-items:center;gap:12px">
          <select class="sel" [(ngModel)]="trendMetric" (ngModelChange)="onTrendMetricChange()"
                  style="font-size:11px;padding:3px 7px;border-radius:6px;font-weight:400">
            <option *ngFor="let m of trendMetrics" [value]="m.v">{{m.l}}</option>
          </select>
          <div style="display:flex;gap:12px;font-size:11px">
            <span style="display:flex;align-items:center;gap:4px">
              <span style="width:9px;height:9px;background:#3BAA5D;border-radius:2px;display:inline-block"></span>
              {{labelA}}
            </span>
            <span *ngIf="data.b" style="display:flex;align-items:center;gap:4px">
              <span style="width:9px;height:9px;background:#93c5fd;border-radius:2px;display:inline-block"></span>
              {{labelB}}
            </span>
          </div>
        </div>
      </div>
      <div #trendEl style="display:flex;align-items:flex-end;gap:6px;height:150px;padding-bottom:24px;border-bottom:1px solid #e4e4e7;position:relative"></div>
      <div #trendLabels style="display:flex;gap:6px;margin-top:6px"></div>
    </div>

    <div class="card" style="padding:18px 20px">
      <div class="card-title">Struktura wg Produktu</div>
      <div #byProductEl style="display:flex;flex-direction:column;gap:8px"></div>
    </div>
  </div>

  <!-- ROW 3: Tabela handlowców (manager only) -->
  <div class="card" style="padding:18px 20px;margin-bottom:16px" *ngIf="isManager && data.a.by_rep.length">
    <div class="card-title">
      Wyniki wg Handlowca
      <span class="card-subtitle">Okres A vs Okres B</span>
    </div>
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>Handlowiec</th>
          <th class="r">Part.</th>
          <th class="r">Brutto A</th>
          <th class="r" *ngIf="data.b">Brutto B</th>
          <th class="r" *ngIf="data.b">Δ Brutto</th>
          <th class="r">Netto A</th>
          <th class="r" *ngIf="data.b">Netto B</th>
          <th class="r">Marża A</th>
          <th class="r" *ngIf="data.b">Marża B</th>
          <th class="r">Prod. A</th>
          <th class="r" *ngIf="data.b">Prod. B</th>
          <th class="r" *ngIf="data.b">Δ Prod.</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let r of data.a.by_rep; let last=last" [style.border-bottom]="last?'none':'1px solid #f4f4f5'">
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:white;background:#9ca3af;flex-shrink:0">
                {{initials(r.salesperson_name||'?')}}
              </div>
              <span style="font-weight:600;white-space:nowrap">{{r.salesperson_name || '— brak —'}}</span>
            </div>
          </td>
          <td class="r num">{{r.partners_count}}</td>
          <td class="r num-a">{{r.gross_turnover_pln | number:'1.0-0'}}</td>
          <td class="r num-b" *ngIf="data.b">
            {{getRepB(r.salesperson_id)?.gross_turnover_pln | number:'1.0-0'}}
          </td>
          <td class="r" *ngIf="data.b">
            <span class="delta-pill"
                  [class.up]="deltaSign(r.gross_turnover_pln, getRepB(r.salesperson_id)?.gross_turnover_pln||0)>0"
                  [class.down]="deltaSign(r.gross_turnover_pln, getRepB(r.salesperson_id)?.gross_turnover_pln||0)<0"
                  [class.flat]="!getRepB(r.salesperson_id)">
              {{getRepB(r.salesperson_id) ? fmtDelta(r.gross_turnover_pln, getRepB(r.salesperson_id)!.gross_turnover_pln) : '—'}}
            </span>
          </td>
          <td class="r num-a">{{r.net_turnover_pln | number:'1.0-0'}}</td>
          <td class="r num-b" *ngIf="data.b">
            {{getRepB(r.salesperson_id)?.net_turnover_pln | number:'1.0-0'}}
          </td>
          <td class="r num-a">
            {{r.gross_turnover_pln > 0 ? (r.revenue_pln / r.gross_turnover_pln * 100 | number:'1.1-1') : '—'}}%
          </td>
          <td class="r num-b" *ngIf="data.b">
            <ng-container *ngIf="getRepB(r.salesperson_id) as rb">
              {{rb.gross_turnover_pln > 0 ? (rb.revenue_pln / rb.gross_turnover_pln * 100 | number:'1.1-1') : '—'}}%
            </ng-container>
            <ng-container *ngIf="!getRepB(r.salesperson_id)">—</ng-container>
          </td>
          <td class="r num-a">{{r.transactions_count | number}}</td>
          <td class="r num-b" *ngIf="data.b">
            {{getRepB(r.salesperson_id)?.transactions_count | number}}
          </td>
          <td class="r" *ngIf="data.b">
            <span class="delta-pill"
                  [class.up]="deltaSign(r.transactions_count, getRepB(r.salesperson_id)?.transactions_count||0)>0"
                  [class.down]="deltaSign(r.transactions_count, getRepB(r.salesperson_id)?.transactions_count||0)<0"
                  [class.flat]="!getRepB(r.salesperson_id)">
              {{getRepB(r.salesperson_id) ? fmtDelta(r.transactions_count, getRepB(r.salesperson_id)!.transactions_count) : '—'}}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
    </div>
  </div>

  <!-- ROW 4: Partnerzy — filtry + tabela + paginacja -->
  <div class="card" style="padding:18px 20px">

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div class="card-title" style="margin-bottom:0;flex:1;min-width:200px">
        Partnerzy — Obrót Brutto
        <span class="card-subtitle">{{labelA}}{{data.b ? ' vs ' + labelB : ''}}</span>
      </div>
      <input type="text" class="sel" [(ngModel)]="partnerFilter" (ngModelChange)="onFilterChange()"
             placeholder="🔍 Szukaj partnera…" style="width:190px;cursor:text">
      <select class="sel" [(ngModel)]="groupFilter" (ngModelChange)="onFilterChange()" style="min-width:150px">
        <option value="">Wszystkie Grupy</option>
        <option *ngFor="let g of availableGroups" [value]="g">{{g}}</option>
      </select>
      <select class="sel" [(ngModel)]="industryFilter" (ngModelChange)="onFilterChange()" style="min-width:150px">
        <option value="">Wszystkie Branże</option>
        <option *ngFor="let ind of availableIndustries" [value]="ind">{{ind}}</option>
      </select>
      <span style="font-size:11px;color:#a1a1aa;white-space:nowrap">
        {{filteredPartners.length}} partnerów
      </span>
    </div>

    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Partner</th>
          <th>Segment</th>
          <th>Handlowiec</th>
          <th class="r">Prod. A</th>
          <th class="r" *ngIf="data.b">Prod. B</th>
          <th class="r" *ngIf="data.b">Δ Prod.</th>
          <th class="r">Brutto A</th>
          <th class="r" *ngIf="data.b">Brutto B</th>
          <th class="r" *ngIf="data.b">Δ Brutto</th>
          <th class="r">Netto A</th>
          <th class="r" *ngIf="data.b">Netto B</th>
          <th class="r">Marża A</th>
          <th class="r" *ngIf="data.b">Marża B</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let p of displayedPartners; let i=index; let last=last"
            [style.border-bottom]="last?'none':'1px solid #f4f4f5'">
          <td class="idx">{{i+1}}</td>
          <td style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            {{p.partner_name}}
          </td>
          <td class="muted" style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            {{p.group_name || '—'}}
          </td>
          <td class="muted">{{p.salesperson_name || '—'}}</td>
          <td class="r num-a">{{p.transactions_count | number}}</td>
          <td class="r num-b" *ngIf="data.b">
            {{getPartnerB(p.partner_name)?.transactions_count | number}}
          </td>
          <td class="r" *ngIf="data.b">
            <span class="delta-pill"
                  [class.up]="deltaSign(p.transactions_count, getPartnerB(p.partner_name)?.transactions_count||0)>0"
                  [class.down]="deltaSign(p.transactions_count, getPartnerB(p.partner_name)?.transactions_count||0)<0"
                  [class.flat]="!getPartnerB(p.partner_name)">
              {{getPartnerB(p.partner_name) ? fmtDelta(p.transactions_count, getPartnerB(p.partner_name)!.transactions_count) : '—'}}
            </span>
          </td>
          <td class="r num-a">{{p.gross_turnover_pln | number:'1.0-0'}}</td>
          <td class="r num-b" *ngIf="data.b">
            {{getPartnerB(p.partner_name)?.gross_turnover_pln | number:'1.0-0'}}
          </td>
          <td class="r" *ngIf="data.b">
            <span class="delta-pill"
                  [class.up]="deltaSign(p.gross_turnover_pln, getPartnerB(p.partner_name)?.gross_turnover_pln||0)>0"
                  [class.down]="deltaSign(p.gross_turnover_pln, getPartnerB(p.partner_name)?.gross_turnover_pln||0)<0"
                  [class.flat]="!getPartnerB(p.partner_name)">
              {{getPartnerB(p.partner_name) ? fmtDelta(p.gross_turnover_pln, getPartnerB(p.partner_name)!.gross_turnover_pln) : '—'}}
            </span>
          </td>
          <td class="r num-a">{{p.net_turnover_pln | number:'1.0-0'}}</td>
          <td class="r num-b" *ngIf="data.b">
            {{getPartnerB(p.partner_name)?.net_turnover_pln | number:'1.0-0'}}
          </td>
          <td class="r num-a">
            {{p.gross_turnover_pln > 0 ? (p.revenue_pln / p.gross_turnover_pln * 100 | number:'1.1-1') : '—'}}%
          </td>
          <td class="r num-b" *ngIf="data.b">
            <ng-container *ngIf="getPartnerB(p.partner_name) as pb">
              {{pb.gross_turnover_pln > 0 ? (pb.revenue_pln / pb.gross_turnover_pln * 100 | number:'1.1-1') : '—'}}%
            </ng-container>
            <ng-container *ngIf="!getPartnerB(p.partner_name)">—</ng-container>
          </td>
        </tr>
        <tr *ngIf="!filteredPartners.length">
          <td [attr.colspan]="data.b ? 14 : 8" style="text-align:center;padding:20px;color:#a1a1aa">Brak danych</td>
        </tr>
      </tbody>
    </table>
    </div>

    <div *ngIf="filteredPartners.length > displayLimit"
         style="text-align:center;margin-top:14px;padding-top:12px;border-top:1px solid #f4f4f5">
      <button class="btn-more" (click)="showMore()">
        Pokaż więcej ({{filteredPartners.length - displayLimit}} pozostało)
      </button>
    </div>

  </div>

  </ng-container>
</div>
</div>
  `,
  styles: [`
    .sel { background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:6px 10px;font-size:12.5px;color:#3f3f46;outline:none;font-family:inherit;cursor:pointer }
    .sel:focus { border-color:#3BAA5D }
    .mode-btn { background:none;border:none;padding:4px 10px;border-radius:6px;font-size:11.5px;font-weight:600;color:#71717a;cursor:pointer;font-family:inherit }
    .mode-active  { background:white;color:#3BAA5D;box-shadow:0 1px 3px rgba(0,0,0,.1) }
    .mode-year-b  { background:white;color:#3b82f6;box-shadow:0 1px 3px rgba(0,0,0,.1) }
    .btn-refresh { background:white;border:1px solid #e4e4e7;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;font-family:inherit }
    .btn-refresh:hover { background:#fafafa }
    .btn-more { background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:7px 22px;font-size:12px;font-weight:600;cursor:pointer;color:#3f3f46;font-family:inherit }
    .btn-more:hover { background:#3BAA5D;border-color:#3BAA5D;color:white }
    .kpi-card { background:white;border:1px solid #e4e4e7;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,.06) }
    .kpi-lbl { font-size:11px;color:#a1a1aa;font-weight:500;margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px }
    .kpi-val { font-family:'Sora',sans-serif;font-size:22px;font-weight:700;color:#18181b }
    .kpi-compare { display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #f4f4f5 }
    .kpi-b { font-size:11px;color:#a1a1aa }
    .card { background:white;border:1px solid #e4e4e7;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06) }
    .card-title { font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between }
    .card-subtitle { font-size:11px;color:#a1a1aa;font-weight:400 }
    .delta-pill { display:inline-flex;align-items:center;gap:2px;font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:20px }
    .delta-pill.up   { background:#dcfce7;color:#16a34a }
    .delta-pill.down { background:#fee2e2;color:#dc2626 }
    .delta-pill.flat { background:#f4f4f5;color:#71717a }
    table { width:100%;border-collapse:collapse;font-size:12px }
    thead tr { border-bottom:1px solid #e4e4e7 }
    th { text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#a1a1aa;font-weight:600;letter-spacing:.3px;white-space:nowrap }
    th.r,td.r { text-align:right }
    tbody tr { cursor:default }
    td { padding:7px 8px;color:#374151 }
    td.num   { color:#374151;font-variant-numeric:tabular-nums }
    td.num-a { color:#18181b;font-weight:600;font-variant-numeric:tabular-nums }
    td.num-b { color:#a1a1aa;font-variant-numeric:tabular-nums }
    td.muted { color:#71717a;font-size:11.5px }
    td.idx   { color:#a1a1aa;font-size:11px;width:24px }
  `],
})
export class CrmPartnersAnalyticsComponent implements OnInit, AfterViewInit {
  @ViewChild('trendEl',    { static: false }) trendEl!:    ElementRef;
  @ViewChild('trendLabels',{ static: false }) trendLabels!:ElementRef;
  @ViewChild('byProductEl',{ static: false }) byProductEl!:ElementRef;

  private api  = inject(CrmApiService);
  private auth = inject(AuthService);
  private cdr  = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  loading      = false;
  mode: CompareMode = 'yoy';
  periodPreset = 'cq';

  selectedYears: number[] = [new Date().getFullYear()];
  readonly availableYears: number[] = (() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2];
  })();

  periodFromA = '';
  periodToA   = '';
  periodFromB = '';
  periodToB   = '';
  customFromB = '';
  customToB   = '';

  repId    = '';
  crmUsers: CrmUser[] = [];

  trendMetric: 'gross' | 'net' | 'margin' | 'count' = 'gross';
  readonly trendMetrics = [
    { v: 'gross'  as const, l: 'Obrót brutto'     },
    { v: 'net'    as const, l: 'Obrót netto'       },
    { v: 'margin' as const, l: 'Marża (wartość)'   },
    { v: 'count'  as const, l: 'Ilość transakcji'  },
  ];

  partnerFilter   = '';
  groupFilter     = '';
  industryFilter  = '';
  displayLimit    = 20;

  data: PartnersAnalytics | null = null;
  private chartsBuilt = false;

  readonly modes = [
    { v: 'yoy' as CompareMode, l: 'YoY' },
    { v: 'qoq' as CompareMode, l: 'QoQ' },
    { v: 'mom' as CompareMode, l: 'MoM' },
    { v: 'custom' as CompareMode, l: 'Własny' },
  ];

  get filteredPartners() {
    if (!this.data) return [];
    const q = this.partnerFilter.trim().toLowerCase();
    return this.data.a.by_partner.filter(p => {
      if (q && !p.partner_name.toLowerCase().includes(q)) return false;
      if (this.groupFilter    && p.group_name !== this.groupFilter)   return false;
      if (this.industryFilter && p.industry   !== this.industryFilter) return false;
      return true;
    });
  }

  get displayedPartners() {
    return this.filteredPartners.slice(0, this.displayLimit);
  }

  get availableGroups(): string[] {
    if (!this.data) return [];
    const set = new Set<string>();
    for (const p of this.data.a.by_partner) {
      if (p.group_name) set.add(p.group_name);
    }
    return Array.from(set).sort();
  }

  get availableIndustries(): string[] {
    if (!this.data) return [];
    const set = new Set<string>();
    for (const p of this.data.a.by_partner) {
      if (p.industry) set.add(p.industry);
    }
    return Array.from(set).sort();
  }

  onFilterChange(): void {
    this.displayLimit = 20;
    this.cdr.markForCheck();
  }

  showMore(): void {
    this.displayLimit += 20;
    this.cdr.markForCheck();
  }

  get trendMetricLabel(): string {
    return this.trendMetrics.find(m => m.v === this.trendMetric)?.l ?? 'Obrót brutto';
  }

  onTrendMetricChange(): void {
    this.buildTrend();
    this.cdr.markForCheck();
  }

  get isManager() {
    const u = this.auth.user();
    return !!(u?.is_admin || u?.crm_role === 'sales_manager');
  }

  get labelA(): string { return this.periodLabel(this.periodFromA, this.periodToA); }
  get labelB(): string { return this.periodLabel(this.periodFromB, this.periodToB); }

  periodLabel(from: string, to: string): string {
    if (!from || !to) return '';
    const [fY, fM] = from.split('-').map(Number);
    const [tY, tM] = to.split('-').map(Number);
    const months = (tY - fY) * 12 + (tM - fM) + 1;
    if (months === 1) return `${MONTH_NAMES_PL[fM - 1]} ${fY}`;
    if (months === 3 && fY === tY && Math.ceil(fM / 3) === Math.ceil(tM / 3) && (Math.ceil(fM / 3) - 1) * 3 + 1 === fM) {
      return `Q${Math.ceil(fM / 3)} ${fY}`;
    }
    if (months === 12 && fY === tY) return `${fY}`;
    if (months === 6  && fY === tY) return `H${fM <= 6 ? 1 : 2} ${fY}`;
    if (fM === 1 && fY === tY) return `${fY} YTD`;
    return `${from} – ${to}`;
  }

  private shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
    const t = (y - 1) * 12 + (m - 1) + delta;
    return { y: Math.floor(t / 12) + 1, m: (t % 12) + 1 };
  }

  private fmt(y: number, m: number): string {
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  computePeriodB(): void {
    if (this.mode === 'custom') return;
    if (!this.periodFromA || !this.periodToA) { this.periodFromB = ''; this.periodToB = ''; return; }
    const [fY, fM] = this.periodFromA.split('-').map(Number);
    const [tY, tM] = this.periodToA.split('-').map(Number);
    if (this.mode === 'yoy') {
      this.periodFromB = this.fmt(fY - 1, fM);
      this.periodToB   = this.fmt(tY - 1, tM);
    } else if (this.mode === 'qoq') {
      const f = this.shiftMonth(fY, fM, -3); const t = this.shiftMonth(tY, tM, -3);
      this.periodFromB = this.fmt(f.y, f.m); this.periodToB = this.fmt(t.y, t.m);
    } else {
      const d = (tY - fY) * 12 + (tM - fM) + 1;
      const f = this.shiftMonth(fY, fM, -d); const t = this.shiftMonth(tY, tM, -d);
      this.periodFromB = this.fmt(f.y, f.m); this.periodToB = this.fmt(t.y, t.m);
    }
  }

  deltaSign(a: number, b: number): number {
    if (!b) return 0;
    return a - b;
  }

  fmtDelta(a: number, b: number): string {
    if (!b) return '—';
    const d = Math.round((a - b) / b * 100);
    return (d > 0 ? '↑' : d < 0 ? '↓' : '=') + ' ' + Math.abs(d) + '%';
  }

  fmtDeltaPp(a: number, b: number): string {
    const d = +(a - b).toFixed(1);
    if (d === 0) return '= 0 pp';
    return (d > 0 ? '↑' : '↓') + ' ' + Math.abs(d) + ' pp';
  }

  getRepB(salesperson_id: string | null) {
    if (!this.data?.b || !salesperson_id) return null;
    return this.data.b.by_rep.find(r => r.salesperson_id === salesperson_id) || null;
  }

  getPartnerB(partner_name: string) {
    if (!this.data?.b) return null;
    return this.data.b.by_partner.find(p => p.partner_name === partner_name) || null;
  }

  initials(name: string): string {
    return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  ngOnInit(): void {
    if (this.isManager) {
      this.api.getCrmUsers().subscribe({ next: u => { this.crmUsers = u; this.cdr.markForCheck(); }, error: () => {} });
    }
    this.applyYearSelection();
  }

  ngAfterViewInit(): void {}

  onPeriodChange(ev: PeriodChangeEvent): void {
    this.selectedYears = [];
    this.periodPreset  = ev.preset;
    this.periodFromA   = ev.from.substring(0, 7);
    this.periodToA     = ev.periodEnd.substring(0, 7);
    this.computePeriodB();
    this.load();
  }

  get yearA(): number | null { return this.selectedYears.length ? Math.max(...this.selectedYears) : null; }
  get yearB(): number | null { return this.selectedYears.length === 2 ? Math.min(...this.selectedYears) : null; }
  isYearA(y: number): boolean { return this.yearA === y; }
  isYearB(y: number): boolean { return this.yearB === y; }

  toggleYear(year: number): void {
    if (this.selectedYears.includes(year)) {
      if (this.selectedYears.length === 1) return;
      this.selectedYears = this.selectedYears.filter(y => y !== year);
    } else {
      if (this.selectedYears.length < 2) {
        this.selectedYears = [...this.selectedYears, year];
      } else {
        const maxY = Math.max(...this.selectedYears);
        this.selectedYears = [maxY, year];
      }
    }
    this.applyYearSelection();
  }

  clearYears(): void {
    this.selectedYears = [];
    const init = getPresetDates(this.periodPreset);
    this.periodFromA = init.from.substring(0, 7);
    this.periodToA   = init.periodEnd.substring(0, 7);
    this.computePeriodB();
    this.load();
  }

  applyYearSelection(): void {
    if (!this.selectedYears.length) return;
    const now          = new Date();
    const currentYear  = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const yA = Math.max(...this.selectedYears);
    this.periodFromA = `${yA}-01`;
    this.periodToA   = yA === currentYear
      ? `${yA}-${String(currentMonth).padStart(2, '0')}`
      : `${yA}-12`;
    if (this.selectedYears.length === 2) {
      const yB = Math.min(...this.selectedYears);
      this.periodFromB = `${yB}-01`;
      this.periodToB   = yB === currentYear
        ? `${yB}-${String(currentMonth).padStart(2, '0')}`
        : `${yB}-12`;
    } else {
      this.periodFromB = '';
      this.periodToB   = '';
    }
    this.load();
  }

  setMode(m: CompareMode): void {
    this.mode = m;
    if (this.selectedYears.length > 0) return;
    if (m !== 'custom') {
      this.computePeriodB();
      this.load();
    } else {
      if (!this.customFromB) this.customFromB = this.periodFromB || '';
      if (!this.customToB)   this.customToB   = this.periodToB   || '';
    }
  }

  onCustomB(): void {
    if (!this.customFromB || !this.customToB) return;
    const fromYear = parseInt(this.customFromB.substring(0, 4), 10);
    const toYear   = parseInt(this.customToB.substring(0, 4), 10);
    if (fromYear < 2000 || fromYear > 2099 || toYear < 2000 || toYear > 2099) return;
    if (this.customFromB > this.customToB) return;
    this.periodFromB = this.customFromB;
    this.periodToB   = this.customToB;
    this.load();
  }

  load(): void {
    this.loading        = true;
    this.chartsBuilt    = false;
    this.displayLimit   = 20;
    this.industryFilter = '';
    this.groupFilter    = '';
    const p: any = {};
    if (this.periodFromA) p.period_from  = this.periodFromA;
    if (this.periodToA)   p.period_to    = this.periodToA;
    if (this.periodFromB) p.compare_from = this.periodFromB;
    if (this.periodToB)   p.compare_to   = this.periodToB;
    if (this.repId)       p.rep_id       = this.repId;

    this.api.getPartnersAnalytics(p).subscribe({
      next: (d: PartnersAnalytics) => {
        this.zone.run(() => {
          this.data    = d;
          this.loading = false;
          this.cdr.markForCheck();
          setTimeout(() => this.buildCharts(), 80);
        });
      },
      error: () => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); },
    });
  }

  private buildCharts(): void {
    if (this.chartsBuilt) return;
    this.chartsBuilt = true;
    this.buildTrend();
    this.buildByProduct();
  }

  private metricValue(row: any): number {
    switch (this.trendMetric) {
      case 'net':    return +row.net_turnover_pln    || 0;
      case 'margin': return +row.revenue_pln         || 0;
      case 'count':  return +row.transactions_count  || 0;
      default:       return +row.gross_turnover_pln  || 0;
    }
  }

  private metricTooltip(row: any): string {
    const v = this.metricValue(row);
    switch (this.trendMetric) {
      case 'count':  return `${row.period}: ${v.toLocaleString('pl-PL')} szt.`;
      default:       return `${row.period}: ${(v / 1000).toFixed(1)}k PLN`;
    }
  }

  private metricBarLabel(value: number): string {
    if (!value) return '';
    if (this.trendMetric === 'count') {
      return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`;
    }
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000)     return `${(value / 1_000).toFixed(0)}k`;
    return `${value.toFixed(0)}`;
  }

  private makeBarCol(h: number, bgColor: string, labelColor: string, tooltip: string, value: number): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;overflow:visible';

    if (h > 0) {
      const lbl = document.createElement('div');
      lbl.style.cssText = `font-size:8.5px;font-weight:600;color:${labelColor};margin-bottom:2px;white-space:nowrap;line-height:1`;
      lbl.textContent = this.metricBarLabel(value);

      const bar = document.createElement('div');
      bar.style.cssText = `width:100%;height:${h}px;background:${bgColor};border-radius:3px 3px 0 0;cursor:pointer`;
      bar.title = tooltip;

      wrap.appendChild(lbl);
      wrap.appendChild(bar);
    }
    return wrap;
  }

  private buildTrend(): void {
    const el     = this.trendEl?.nativeElement;
    const labels = this.trendLabels?.nativeElement;
    if (!el || !labels || !this.data) return;
    el.innerHTML = ''; labels.innerHTML = '';

    const trendA = this.data.a.trend;
    const trendB = this.data.b?.trend || [];
    const maxLen = Math.max(trendA.length, trendB.length, 1);
    const maxVal = Math.max(
      ...trendA.map(r => this.metricValue(r)),
      ...trendB.map(r => this.metricValue(r)),
      1
    );

    for (let i = 0; i < maxLen; i++) {
      const rowA = trendA[i];
      const rowB = trendB[i];
      const vA = rowA ? this.metricValue(rowA) : 0;
      const vB = rowB ? this.metricValue(rowB) : 0;
      const hA = vA ? Math.max(4, Math.round(vA / maxVal * 120)) : 0;
      const hB = vB ? Math.max(4, Math.round(vB / maxVal * 120)) : 0;

      const group = document.createElement('div');
      group.style.cssText = 'flex:1;display:flex;gap:2px;align-items:flex-end;justify-content:center;height:100%';

      if (rowA) {
        group.appendChild(this.makeBarCol(hA, '#3BAA5D', '#2F8F4D', this.metricTooltip(rowA), vA));
      } else {
        const ph = document.createElement('div'); ph.style.cssText = 'flex:1'; group.appendChild(ph);
      }

      if (this.data.b) {
        if (rowB) {
          group.appendChild(this.makeBarCol(hB, '#bfdbfe', '#60a5fa', this.metricTooltip(rowB), vB));
        } else {
          const ph = document.createElement('div'); ph.style.cssText = 'flex:1'; group.appendChild(ph);
        }
      }

      el.appendChild(group);

      const lbl = document.createElement('div');
      lbl.style.cssText = 'flex:1;text-align:center;font-size:10.5px;color:#a1a1aa';
      lbl.textContent = rowA
        ? MONTH_NAMES_PL[parseInt(rowA.period.substring(5, 7)) - 1]
        : (rowB ? MONTH_NAMES_PL[parseInt(rowB.period.substring(5, 7)) - 1] : '');
      labels.appendChild(lbl);
    }
  }

  private buildByProduct(): void {
    const el = this.byProductEl?.nativeElement;
    if (!el || !this.data) return;
    el.innerHTML = '';

    const products = this.data.a.by_product.slice(0, 7);
    if (!products.length) {
      el.innerHTML = '<div style="color:#a1a1aa;font-size:12px;text-align:center;padding:20px">Brak danych</div>';
      return;
    }
    const maxVal = Math.max(...products.map(p => +p.gross_turnover_pln), 1);

    products.forEach((p) => {
      const pctA  = Math.round(+p.gross_turnover_pln / maxVal * 100);
      const bRow  = this.data!.b?.by_product.find(b => b.product_type === p.product_type);
      const icon  = (PRODUCT_TYPE_ICONS as any)[p.product_type] || '📦';
      const label = (PRODUCT_TYPE_LABELS as any)[p.product_type] || p.product_type;
      const row = document.createElement('div');
      row.style.marginBottom = '8px';
      const delta = bRow ? +p.gross_turnover_pln - +bRow.gross_turnover_pln : null;
      const deltaHtml = bRow
        ? `<span style="margin-left:6px;font-size:10.5px;font-weight:700;padding:1px 5px;border-radius:10px;${delta! >= 0 ? 'background:#dcfce7;color:#16a34a' : 'background:#fee2e2;color:#dc2626'}">${this.fmtDelta(+p.gross_turnover_pln, +bRow.gross_turnover_pln)}</span>`
        : '';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:12px;color:#52525b">${icon} ${label}</span>
          <span style="display:flex;align-items:center;font-size:12px;font-weight:600;color:#374151">
            ${(+p.gross_turnover_pln/1000).toFixed(0)}k${deltaHtml}
          </span>
        </div>
        <div style="height:6px;background:#f4f4f5;border-radius:3px;overflow:hidden">
          <div style="width:${pctA}%;height:100%;background:#d1d5db;border-radius:3px"></div>
        </div>`;
      el.appendChild(row);
    });
  }
}

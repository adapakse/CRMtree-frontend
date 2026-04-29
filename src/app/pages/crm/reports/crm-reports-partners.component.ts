// src/app/pages/crm/reports/crm-reports-partners.component.ts
import {
  Component, OnInit, AfterViewInit, inject, ChangeDetectorRef,
  NgZone, ChangeDetectionStrategy, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import {
  CrmApiService, PartnersReport, PartnersReportKpi,
  PRODUCT_TYPE_LABELS, PRODUCT_TYPE_ICONS, CrmUser,
} from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { TooltipComponent } from '../../../shared/components/tooltip/tooltip.component';

function ym(d: Date): string { return d.toISOString().substring(0, 7); }

function getMonthRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const cur = ym(now);
  const shift = (n: number) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
  switch (preset) {
    case '1m':       return { from: cur, to: cur };
    case '3m':       return { from: shift(-3), to: cur };
    case '6m':       return { from: shift(-6), to: cur };
    case 'ytd':      return { from: `${now.getFullYear()}-01`, to: cur };
    case 'prev_1m': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const m = ym(d); return { from: m, to: m };
    }
    case 'prev_q': {
      const q = Math.ceil((now.getMonth() + 1) / 3);
      let pq = q - 1, py = now.getFullYear();
      if (pq === 0) { pq = 4; py--; }
      const qsm = String((pq - 1) * 3 + 1).padStart(2, '0');
      const qem = String(pq * 3).padStart(2, '0');
      return { from: `${py}-${qsm}`, to: `${py}-${qem}` };
    }
    case 'prev_year': {
      const py = now.getFullYear() - 1;
      return { from: `${py}-01`, to: `${py}-12` };
    }
    default: return { from: shift(-11), to: cur };
  }
}

function healthColor(engagement: number): string {
  return engagement >= 75 ? '#22C55E' : engagement >= 50 ? '#F59E0B' : '#EF4444';
}

@Component({
  selector: 'wt-crm-reports-partners',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule, TooltipComponent],
  template: `
<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

<!-- TOPBAR -->
<div id="topbar" style="min-height:60px;background:white;border-bottom:1px solid #e4e4e7;display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 24px;flex-shrink:0">
  <span style="font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:#18181b;flex-shrink:0">Partner Performance</span>
  <span style="flex:1;min-width:8px"></span>
  <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
    <select class="sel" style="max-width:150px" [(ngModel)]="groupFilter" (ngModelChange)="load()">
      <option value="">Wszystkie grupy</option>
      <option *ngFor="let g of groupNames" [value]="g">{{ g }}</option>
    </select>
    <select class="sel" style="max-width:190px" [(ngModel)]="partnerFilter" (ngModelChange)="onPartnerFilterChange()">
      <option value="">Wszyscy partnerzy</option>
      <option *ngFor="let p of partnerNames" [value]="p">{{ p }}</option>
    </select>
    <select class="sel" style="max-width:190px" [(ngModel)]="periodPreset" (ngModelChange)="onPresetChange()">
      <optgroup label="Bieżące">
        <option value="1m">Bieżący miesiąc</option>
        <option value="3m">Ostatnie 3 mies.</option>
        <option value="6m">Ostatnie 6 mies.</option>
        <option value="12m">Ostatnie 12 mies.</option>
        <option value="ytd">YTD {{ currentYear }}</option>
      </optgroup>
      <optgroup label="Poprzednie">
        <option value="prev_1m">Poprzedni miesiąc</option>
        <option value="prev_q">Poprzedni kwartał</option>
        <option value="prev_year">Poprzedni rok ({{ currentYear - 1 }})</option>
      </optgroup>
    </select>
    <select class="sel" style="max-width:160px" *ngIf="isManager" [(ngModel)]="repFilter" (ngModelChange)="onRepFilterChange($event)">
      <option value="">Wszyscy handlowcy</option>
      <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
    </select>
    <button *ngIf="persistRepName" style="font-size:11.5px;border:1px solid #BFDBFE;color:#1D4ED8;background:#EFF6FF;border-radius:8px;padding:6px 12px;cursor:pointer;white-space:nowrap" (click)="clearRepFilter()">
      × {{ persistRepName }}
    </button>
    <button class="btn-g" style="font-size:12px;border:1px solid #e4e4e7;border-radius:8px;padding:6px 12px;background:white;cursor:pointer;white-space:nowrap;flex-shrink:0" (click)="load()">{{ loading ? '…' : '↻ Odśwież' }}</button>
  </div>
</div>

<!-- CONTENT -->
<div style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:20px">

  <div *ngIf="loading" style="height:3px;background:linear-gradient(90deg,#f26522,#fb923c);border-radius:2px"></div>

  <div *ngIf="!loading && !kpi" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;color:#a1a1aa">
    <div style="font-size:48px;margin-bottom:12px">📈</div>
    <div style="font-size:15px;font-weight:600">Brak danych sprzedażowych</div>
    <div style="font-size:13px;margin-top:4px">Zaimportuj dane przez Import CSV</div>
  </div>

  <ng-container *ngIf="kpi">

  <!-- KPI ROW -->
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
    <div class="stat-card stat-clickable" style="border-top:3px solid #f26522" (click)="goToPartners()" title="Kliknij aby zobaczyć partnerów">
      <div class="stat-val" style="color:#f26522;font-size:20px">{{ kpi.gross_turnover_pln | number:'1.0-0' }}</div>
      <div class="stat-lbl">Obrót brutto (PLN)<wt-tooltip key="crm.partners.kpi.gross_turnover"></wt-tooltip></div>
      <div class="stat-trend" *ngIf="prevKpi" [style.color]="kpi.gross_turnover_pln >= prevKpi.gross_turnover_pln ? '#16a34a' : '#dc2626'">
        {{ kpi.gross_turnover_pln >= (prevKpi?.gross_turnover_pln||0) ? '↑' : '↓' }} {{ deltaLabel(kpi.gross_turnover_pln, prevKpi?.gross_turnover_pln||0) }} vs poprzedni
      </div>
    </div>
    <div class="stat-card stat-clickable" style="border-top:3px solid #22C55E" (click)="goToPartners()" title="Kliknij aby zobaczyć partnerów">
      <div class="stat-val" style="color:#22C55E;font-size:20px">{{ kpi.revenue_pln | number:'1.0-0' }}</div>
      <div class="stat-lbl">Przychód / Marża (PLN)<wt-tooltip key="crm.partners.kpi.revenue"></wt-tooltip></div>
      <div class="stat-trend" style="color:#a1a1aa">{{ kpi.margin_pct | number:'1.0-1' }}% marży</div>
    </div>
    <div class="stat-card stat-clickable" style="border-top:3px solid #3B82F6" (click)="goToPartners()" title="Kliknij aby zobaczyć partnerów">
      <div class="stat-val" style="color:#3B82F6;font-size:20px">{{ kpi.fees_pln | number:'1.0-0' }}</div>
      <div class="stat-lbl">Fees (PLN)<wt-tooltip key="crm.partners.kpi.fees"></wt-tooltip></div>
      <div class="stat-trend" style="color:#a1a1aa">{{ kpi.fee_rate_pct | number:'1.0-1' }}% fee rate</div>
    </div>
    <div class="stat-card stat-clickable" style="border-top:3px solid #A855F7" (click)="goToPartners()" title="Kliknij aby zobaczyć partnerów">
      <div class="stat-val" style="color:#A855F7;font-size:20px">{{ kpi.transactions_count | number }}</div>
      <div class="stat-lbl">Transakcje<wt-tooltip key="crm.partners.kpi.transactions"></wt-tooltip></div>
      <div class="stat-trend" style="color:#a1a1aa">{{ kpi.pax_count | number }} PAX</div>
    </div>
    <div class="stat-card stat-clickable" style="border-top:3px solid #F59E0B" (click)="goToPartners()" title="Kliknij aby zobaczyć partnerów">
      <div class="stat-val" style="color:#F59E0B;font-size:20px">{{ kpi.partners_count }}</div>
      <div class="stat-lbl">Aktywnych partnerów<wt-tooltip key="crm.partners.kpi.active_partners"></wt-tooltip></div>
      <div class="stat-trend" *ngIf="prevKpi" [style.color]="kpi.gross_turnover_pln >= (prevKpi?.gross_turnover_pln||0) ? '#16a34a' : '#dc2626'">
        {{ kpi.gross_turnover_pln >= (prevKpi?.gross_turnover_pln||0) ? '↑' : '↓' }} trend przychodów
      </div>
    </div>
  </div>

  <!-- ROW 2: Scorecard + Upsell -->
  <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px">

    <!-- Partner scorecard table -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:14px 18px;border-bottom:1px solid #e4e4e7;display:flex;align-items:center;justify-content:space-between">
        <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b">Scorecard Partnerów</div>
        <div style="display:flex;gap:6px;font-size:11px">
          <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:2px;background:#22C55E;display:inline-block"></span>Zdrowy</span>
          <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:2px;background:#F59E0B;display:inline-block"></span>Uwaga</span>
          <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:2px;background:#EF4444;display:inline-block"></span>Ryzyko</span>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead>
            <tr style="background:#fafafa;border-bottom:1px solid #e4e4e7">
              <th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.4px">Partner</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.4px" *ngIf="isManager">Handlowiec</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.4px">Obrót brutto</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.4px">Marża</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.4px">Transakcje</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.4px">Health<wt-tooltip key="crm.partners.scorecard.health"></wt-tooltip></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of topPartners" style="border-bottom:1px solid #f4f4f5" class="tbl-row"
                [style.cursor]="p.partner_id ? 'pointer' : 'default'"
                (click)="p.partner_id && goToPartner(p.partner_id)"
                (mouseenter)="$any($event.currentTarget).style.background='#fff7ed'"
                (mouseleave)="$any($event.currentTarget).style.background=''"
                [title]="p.partner_id ? 'Kliknij aby przejść do karty partnera' : ''">
              <td style="padding:10px 14px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div [style.background]="avatarColor(p.partner_name)" style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;flex-shrink:0">{{ initials(p.partner_name) }}</div>
                  <div>
                    <span style="font-weight:600;color:#18181b">{{ p.partner_name }}</span>
                    <div *ngIf="p.partner_number" style="font-size:10.5px;color:#a1a1aa;font-family:monospace">{{ p.partner_number }}</div>
                  </div>
                </div>
              </td>
              <td *ngIf="isManager" style="padding:10px;text-align:center;font-size:11px;color:#71717a">{{ p.salesperson_name || '—' }}</td>
              <td style="padding:10px;text-align:center;font-family:'Sora',sans-serif;font-weight:700;color:#f26522">{{ p.gross_turnover_pln | number:'1.0-0' }}</td>
              <td style="padding:10px;text-align:center">
                <div style="height:6px;background:#f4f4f5;border-radius:3px;overflow:hidden;width:60px;margin:0 auto">
                  <div [style.width.%]="marginPct(p.gross_turnover_pln, p.revenue_pln)" [style.background]="marginColor(p.gross_turnover_pln, p.revenue_pln)" style="height:100%;border-radius:3px"></div>
                </div>
                <div style="font-size:10px;margin-top:2px" [style.color]="marginColor(p.gross_turnover_pln, p.revenue_pln)">{{ calcMargin(p.gross_turnover_pln, p.revenue_pln) }}%</div>
              </td>
              <td style="padding:10px;text-align:center;font-weight:600;color:#3f3f46">{{ p.transactions_count | number }}</td>
              <td style="padding:10px;text-align:center"><span style="display:inline-block;width:12px;height:12px;border-radius:50%" [style.background]="healthDot(p.gross_turnover_pln)"></span></td>
            </tr>
            <tr *ngIf="!topPartners.length">
              <td [attr.colspan]="isManager ? 6 : 5" style="text-align:center;padding:20px;color:#a1a1aa;font-size:12px">Brak danych partnerów</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Produkty -->
    <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
      <div style="padding:14px 18px;border-bottom:1px solid #e4e4e7">
        <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b">Podział na produkty</div>
      </div>
      <div style="padding:14px;display:flex;flex-direction:column;gap:10px;flex:1">
        <div *ngFor="let p of byProduct; let i = index">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:12px">
            <span style="color:#3f3f46">{{ productIcon(p.product_type) }} {{ productLabel(p.product_type) }}</span>
            <span style="font-weight:700;color:#f26522">{{ (p.gross_turnover_pln/1000).toFixed(0) }}k PLN</span>
          </div>
          <div style="height:6px;background:#f4f4f5;border-radius:3px;overflow:hidden">
            <div [style.width.%]="barPct(p.gross_turnover_pln, byProduct[0]?.gross_turnover_pln)" [style.background]="PROD_COLORS[i % PROD_COLORS.length]" style="height:100%;border-radius:3px;opacity:.85"></div>
          </div>
          <div style="font-size:10px;color:#a1a1aa;margin-top:1px;text-align:right">{{ calcMargin(p.gross_turnover_pln, p.revenue_pln) }}% marży</div>
        </div>
        <div *ngIf="!byProduct.length" style="color:#a1a1aa;font-size:12px;text-align:center;padding:20px">Brak danych</div>
      </div>
    </div>
  </div>

  <!-- ROW 3: Revenue trend + Handlowcy + Podsumowanie -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">

    <!-- Revenue trend chart -->
    <div class="card" style="padding:18px">
      <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b;margin-bottom:4px">Trend przychodów</div>
      <div style="font-size:11px;color:#a1a1aa;margin-bottom:16px">Obrót brutto (PLN)</div>
      <div #revenueEl style="display:flex;align-items:flex-end;gap:4px;height:100px"></div>
      <div #revLabels style="display:flex;gap:4px;margin-top:4px"></div>
      <div style="margin-top:14px;padding-top:10px;border-top:1px solid #f4f4f5;display:flex;justify-content:space-between;font-size:12px">
        <span style="color:#71717a">Łącznie obrót</span>
        <span style="font-weight:700;color:#f26522;font-family:'Sora',sans-serif">{{ kpi.gross_turnover_pln | number:'1.0-0' }} PLN</span>
      </div>
    </div>

    <!-- Handlowcy (manager) -->
    <div class="card" style="padding:18px" *ngIf="isManager">
      <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b;margin-bottom:14px">Wyniki handlowców</div>
      <div *ngFor="let r of byRep" style="margin-bottom:12px;cursor:pointer;border-radius:8px;padding:6px 8px;transition:background .12s"
           (mouseenter)="$any($event.currentTarget).style.background='#fff7ed'"
           (mouseleave)="$any($event.currentTarget).style.background=''"
           (click)="goToPartnersByRep(r.salesperson_id, r.salesperson_name)"
           title="Kliknij aby zobaczyć partnerów tego handlowca">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div [style.background]="avatarColor(r.salesperson_name)" style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;flex-shrink:0">{{ initials(r.salesperson_name) }}</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;color:#3f3f46">{{ r.salesperson_name }}</div>
            <div style="font-size:10px;color:#a1a1aa">{{ r.partners_count }} partnerów</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;font-weight:700;color:#f26522">{{ (r.gross_turnover_pln/1000).toFixed(0) }}k</div>
            <div style="font-size:10px;color:#22C55E">{{ calcMargin(r.gross_turnover_pln, r.revenue_pln) }}% marży</div>
          </div>
        </div>
        <div style="height:5px;background:#f4f4f5;border-radius:3px;overflow:hidden">
          <div [style.width.%]="barPct(r.gross_turnover_pln, byRep[0]?.gross_turnover_pln)" style="height:100%;background:#f26522;border-radius:3px"></div>
        </div>
      </div>
      <div *ngIf="!byRep.length" style="color:#a1a1aa;font-size:12px;text-align:center;padding:20px">Brak danych</div>
    </div>

    <!-- Podsumowanie finansowe -->
    <div class="card" style="padding:18px">
      <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b;margin-bottom:14px">Podsumowanie finansowe</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
          <span style="font-size:12px;color:#9a3412">Obrót brutto</span>
          <span style="font-family:'Sora',sans-serif;font-weight:700;color:#f26522">{{ kpi.gross_turnover_pln | number:'1.0-0' }}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
          <span style="font-size:12px;color:#166534">Przychód (marża)</span>
          <span style="font-family:'Sora',sans-serif;font-weight:700;color:#22C55E">{{ kpi.revenue_pln | number:'1.0-0' }}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px">
          <span style="font-size:12px;color:#1d4ed8">Fees / Prowizje</span>
          <span style="font-family:'Sora',sans-serif;font-weight:700;color:#3B82F6">{{ kpi.fees_pln | number:'1.0-0' }}</span>
        </div>
        <div style="margin-top:4px;padding:12px;background:#fafafa;border-radius:8px;display:flex;flex-direction:column;gap:5px;font-size:12px">
          <div style="display:flex;justify-content:space-between"><span style="color:#71717a">% marży</span><span style="font-weight:700">{{ kpi.margin_pct | number:'1.0-1' }}%</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#71717a">Fee rate</span><span style="font-weight:700">{{ kpi.fee_rate_pct | number:'1.0-1' }}%</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#71717a">Transakcje</span><span style="font-weight:700">{{ kpi.transactions_count | number }}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#71717a">PAX</span><span style="font-weight:700">{{ kpi.pax_count | number }}</span></div>
        </div>
      </div>
    </div>
  </div>

  <!-- ROW 4: Pełna tabela partnerów -->
  <div class="card" style="padding:0;overflow:hidden">
    <div style="padding:14px 18px;border-bottom:1px solid #e4e4e7;display:flex;align-items:center;justify-content:space-between">
      <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#18181b">Wyniki wszystkich partnerów</div>
      <span style="font-size:11px;color:#a1a1aa">{{ filteredByPartner.length }} partnerów</span>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead>
          <tr style="background:#fafafa;border-bottom:1px solid #e4e4e7">
            <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#71717a;text-transform:uppercase">Partner</th>
            <th *ngIf="isManager" style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:#71717a;text-transform:uppercase">Handlowiec</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;color:#71717a;text-transform:uppercase">Obrót brutto</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;color:#71717a;text-transform:uppercase">Obrót netto</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;color:#71717a;text-transform:uppercase">Fees</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;color:#71717a;text-transform:uppercase">Przychód</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;color:#71717a;text-transform:uppercase">Marża</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;color:#71717a;text-transform:uppercase">Trans.</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let p of filteredByPartner" style="border-bottom:1px solid #f4f4f5"
              [style.cursor]="p.partner_id ? 'pointer' : 'default'"
              (click)="p.partner_id && goToPartner(p.partner_id)"
              (mouseenter)="$any($event.currentTarget).style.background='#fff7ed'"
              (mouseleave)="$any($event.currentTarget).style.background=''"
              [title]="p.partner_id ? 'Kliknij aby przejść do karty partnera' : ''">
            <td style="padding:9px 14px">
              <span *ngIf="p.partner_id" style="font-weight:600;color:#f26522">{{ p.partner_name }}</span>
              <span *ngIf="!p.partner_id" style="color:#71717a">{{ p.partner_name }}</span>
            </td>
            <td *ngIf="isManager" style="padding:9px 10px;color:#a1a1aa;font-size:12px">{{ p.salesperson_name || '—' }}</td>
            <td style="padding:9px 10px;text-align:right;font-weight:700;color:#f26522;font-family:'Sora',sans-serif">{{ p.gross_turnover_pln | number:'1.0-0' }}</td>
            <td style="padding:9px 10px;text-align:right;color:#3f3f46">{{ p.net_turnover_pln | number:'1.0-0' }}</td>
            <td style="padding:9px 10px;text-align:right;color:#3b82f6">{{ p.fees_pln | number:'1.0-0' }}</td>
            <td style="padding:9px 10px;text-align:right;color:#22C55E;font-weight:600">{{ p.revenue_pln | number:'1.0-0' }}</td>
            <td style="padding:9px 10px;text-align:right">
              <span [style.background]="calcMarginN(p.gross_turnover_pln,p.revenue_pln) >= 10 ? '#dcfce7' : '#f4f4f5'" [style.color]="calcMarginN(p.gross_turnover_pln,p.revenue_pln) >= 10 ? '#166534' : '#71717a'" style="border-radius:4px;padding:1px 6px;font-size:11px">{{ calcMargin(p.gross_turnover_pln, p.revenue_pln) }}%</span>
            </td>
            <td style="padding:9px 10px;text-align:right;color:#71717a">{{ p.transactions_count }}</td>
          </tr>
          <tr *ngIf="!filteredByPartner.length">
            <td [attr.colspan]="isManager ? 8 : 7" style="text-align:center;padding:24px;color:#a1a1aa;font-size:12px">Brak danych dla wybranego okresu</td>
          </tr>
        </tbody>
        <tfoot *ngIf="kpi && filteredByPartner.length">
          <tr style="background:#fafafa;border-top:2px solid #e4e4e7;font-weight:700">
            <td style="padding:9px 14px">RAZEM</td>
            <td *ngIf="isManager"></td>
            <td style="padding:9px 10px;text-align:right;color:#f26522;font-family:'Sora',sans-serif">{{ kpi.gross_turnover_pln | number:'1.0-0' }}</td>
            <td style="padding:9px 10px;text-align:right">{{ kpi.net_turnover_pln | number:'1.0-0' }}</td>
            <td style="padding:9px 10px;text-align:right;color:#3b82f6">{{ kpi.fees_pln | number:'1.0-0' }}</td>
            <td style="padding:9px 10px;text-align:right;color:#22C55E">{{ kpi.revenue_pln | number:'1.0-0' }}</td>
            <td style="padding:9px 10px;text-align:right">{{ kpi.margin_pct | number:'1.0-1' }}%</td>
            <td style="padding:9px 10px;text-align:right">{{ kpi.transactions_count | number }}</td>
          </tr>
        </tfoot>
      </table>
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
    .stat-clickable { cursor:pointer;transition:box-shadow .12s,border-color .12s,transform .1s }
    .stat-clickable:hover { box-shadow:0 4px 12px rgba(0,0,0,.12);border-color:#f26522;transform:translateY(-1px) }
    .stat-val { font-family:'Sora',sans-serif;font-size:22px;font-weight:700;color:#18181b;margin-bottom:2px }
    .stat-lbl { font-size:12px;color:#a1a1aa;font-weight:500 }
    .stat-trend { font-size:11px;margin-top:6px;font-weight:600 }
    .card { background:white;border:1px solid #e4e4e7;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08) }
  `],
})
export class CrmReportsPartnersComponent implements OnInit, AfterViewInit {
  @ViewChild('revenueEl', { static: false }) revenueEl!: ElementRef;
  @ViewChild('revLabels', { static: false }) revLabels!: ElementRef;

  readonly PROD_COLORS = ['#f26522','#3B82F6','#22C55E','#A855F7','#F59E0B','#06B6D4','#EC4899','#84CC16','#EF4444','#6B7280'];

  private api    = inject(CrmApiService);
  private auth   = inject(AuthService);
  private cdr    = inject(ChangeDetectorRef);
  private zone   = inject(NgZone);
  private router = inject(Router);

  loading       = false;
  periodPreset  = '12m';
  periodFrom    = '';
  periodTo      = '';
  repFilter     = '';
  persistRepName = '';
  private readonly REP_FILTER_KEY = 'crm_rep_filter';
  private loadSub: any = null;
  partnerFilter = '';
  groupFilter   = '';
  groupNames:  string[] = [];
  currentYear   = new Date().getFullYear();

  kpi:       PartnersReportKpi | null = null;
  prevKpi:   PartnersReportKpi | null = null;
  trend:     any[] = [];
  byPartner: any[] = [];
  byProduct: any[] = [];
  byRep:     any[] = [];
  crmUsers:  CrmUser[] = [];

  private chartsBuilt = false;

  get isManager() { const u = this.auth.user(); return u?.is_admin || u?.crm_role === 'sales_manager'; }
  get topPartners() { return this.filteredByPartner.slice(0, 8); }
  get partnerNames() { return [...new Set(this.byPartner.map(p => p.partner_name))]; }

  /** Backend filtruje dane — getter jest już tylko aliasem */
  get filteredByPartner(): any[] { return this.byPartner; }

  onPartnerFilterChange(): void { this.load(); }

  ngOnInit(): void {
    if (this.isManager) {
      this.api.getCrmUsers().subscribe({ next: u => { this.crmUsers = u; this.cdr.markForCheck(); }, error: () => {} });
    }
    this.api.getPartnerGroupNames().subscribe({ next: g => { this.groupNames = g; this.cdr.markForCheck(); }, error: () => {} });
    // Persistowany filtr handlowca
    try {
      const saved = sessionStorage.getItem(this.REP_FILTER_KEY);
      if (saved) {
        const { userId, displayName } = JSON.parse(saved);
        this.repFilter     = userId;
        this.persistRepName = displayName;
      }
    } catch { }
    this.onPresetChange();
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

  ngAfterViewInit(): void {}

  onPresetChange(): void {
    const { from, to } = getMonthRange(this.periodPreset);
    this.periodFrom = from; this.periodTo = to;
    this.load();
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.chartsBuilt = false;
    this.cdr.markForCheck();
    const p: any = {};
    if (this.periodFrom)  p.period_from  = this.periodFrom;
    if (this.periodTo)    p.period_to    = this.periodTo;
    if (this.repFilter && this.isManager)     p.rep_id       = this.repFilter;
    if (this.partnerFilter)                   p.partner_name = this.partnerFilter;
    if (this.groupFilter)                     p.group_name   = this.groupFilter;

    this.loadSub = this.api.getPartnersReport(p).subscribe({
      next: (report: PartnersReport) => {
        this.zone.run(() => {
          this.kpi       = report.kpi;
          this.prevKpi   = report.prev_kpi;
          this.trend     = report.trend || [];
          this.byPartner = report.by_partner || [];
          this.byProduct = report.by_product || [];
          this.byRep     = report.by_rep || [];
          this.loading   = false;
          this.cdr.markForCheck();
          setTimeout(() => this.buildCharts(), 80);
        });
      },
      error: () => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); },
    });
  }

  private buildCharts(): void {
    if (this.chartsBuilt) return;
    this.buildRevenueChart();
  }

  private buildRevenueChart(): void {
    const el = this.revenueEl?.nativeElement;
    const lb = this.revLabels?.nativeElement;
    if (!el || !lb) return;
    this.chartsBuilt = true;
    el.innerHTML = ''; lb.innerHTML = '';
    if (!this.trend.length) return;
    const data = this.trend.slice(-12);
    const max = Math.max(...data.map(d => d.gross_turnover_pln), 1);
    data.forEach(d => {
      const h = Math.max(4, Math.round(d.gross_turnover_pln / max * 100));
      const isLast = d === data[data.length - 1];
      const col = document.createElement('div');
      col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px';
      col.innerHTML = `
        <div style="font-size:9px;font-weight:700;color:${isLast?'#f26522':'#a1a1aa'}">${d.gross_turnover_pln>0?(d.gross_turnover_pln/1000).toFixed(0)+'k':''}</div>
        <div style="width:100%;height:${h}px;background:${isLast?'#f26522':'#FED7AA'};border-radius:3px 3px 0 0"></div>`;
      el.appendChild(col);
      const lbl = document.createElement('div');
      lbl.style.cssText = 'flex:1;text-align:center;font-size:10px;color:#a1a1aa';
      lbl.textContent = d.period.substring(5, 7) + '/' + d.period.substring(2, 4);
      lb.appendChild(lbl);
    });
  }

  goToPartners(extra: Record<string, string> = {}): void {
    const qp: any = { ...extra };
    // Przekaż aktywne filtry raportu jako kontekst
    if (this.repFilter && this.isManager) qp['manager_id'] = this.repFilter;
    if (this.groupFilter)   qp['group']  = this.groupFilter;
    if (this.partnerFilter) qp['search'] = this.partnerFilter;
    this.router.navigate(['/crm/partners'], { queryParams: qp });
  }

  goToPartner(partnerId: number | string): void {
    this.router.navigate(['/crm/partners', partnerId]);
  }

  goToPartnersByRep(salespersonId: string | null, salespersonName: string): void {
    if (!salespersonId) return;
    this.router.navigate(['/crm/partners'], { queryParams: { manager_id: salespersonId, label: 'Handlowiec: ' + salespersonName } });
  }

  barPct(val: number, max: number): number { return max > 0 ? Math.max(2, Math.round(val / max * 100)) : 0; }
  calcMargin(gross: number, rev: number): string { return gross > 0 ? (rev / gross * 100).toFixed(1) : '0.0'; }
  calcMarginN(gross: number, rev: number): number { return gross > 0 ? rev / gross * 100 : 0; }
  marginPct(gross: number, rev: number): number { return Math.min(100, Math.max(0, this.calcMarginN(gross, rev) * 5)); }
  marginColor(gross: number, rev: number): string { const m = this.calcMarginN(gross, rev); return m >= 15 ? '#22C55E' : m >= 8 ? '#F59E0B' : '#EF4444'; }
  healthDot(gross: number): string { return gross > 500000 ? '#22C55E' : gross > 100000 ? '#F59E0B' : '#EF4444'; }
  productLabel(pt: string): string { return (PRODUCT_TYPE_LABELS as Record<string,string>)[pt] || pt; }
  productIcon(pt: string): string  { return (PRODUCT_TYPE_ICONS as Record<string,string>)[pt] || '📦'; }
  deltaLabel(a: number, b: number): string { if (!b) return '—'; return (Math.abs((a-b)/b*100)).toFixed(0) + '%'; }
  initials(name: string): string { return (name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase(); }
  avatarColor(name: string): string { if (!name) return '#94A3B8'; let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h},55%,48%)`; }
}

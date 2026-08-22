import {
  Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CrmApiService,
  ProspectDashLeadRow, ProspectDashScoreRow, ProspectDashAiTagRow,
  ProspectDashEnrichedRow, ProspectDashCallRow,
} from '../../../core/services/crm-api.service';
import { forkJoin } from 'rxjs';

// ─── Typy pomocnicze ────────────────────────────────────────────────

interface BarSegment { label: string; value: number; pct: number; color: string; }
interface BarRow     { label: string; total: number; segments: BarSegment[]; }

// Paleta: zimne barwy (błękit) dla niskich scorów → ciepłe → czerwony dla najwyższych
const SCORE_PALETTE = [
  '#93c5fd', '#60a5fa', '#38bdf8',
  '#2dd4bf', '#34d399', '#a3e635',
  '#facc15', '#fb923c', '#ef4444',
];

function scoreSortKey(range: string): number {
  if (range === 'brak') return -Infinity;
  const m = range.match(/\d+/);
  const num = m ? parseInt(m[0], 10) : 0;
  if (range.startsWith('<'))  return num - 0.5;
  if (range.startsWith('≥')) return num + 100.5; // po wszystkich przedziałach
  return num;
}

function buildScoreColorMap(ranges: string[]): Map<string, string> {
  const map = new Map<string, string>([['brak', '#9ca3af']]);
  const sorted = [...ranges].filter(r => r !== 'brak')
    .sort((a, b) => scoreSortKey(a) - scoreSortKey(b));
  sorted.forEach((r, i) => {
    const n = sorted.length;
    const idx = n <= 1 ? SCORE_PALETTE.length - 1
      : Math.round((i / (n - 1)) * (SCORE_PALETTE.length - 1));
    map.set(r, SCORE_PALETTE[idx]);
  });
  return map;
}

const CALL_STATUS_COLORS: Record<string, string> = {
  answered:     '#4ade80',
  missed:       '#f87171',
  not_answered: '#fb923c',
  rejected:     '#a78bfa',
  error:        '#9ca3af',
};

const CALL_STATUS_LABELS: Record<string, string> = {
  answered:     'Odebrane',
  missed:       'Przychodzące nieodebrane',
  not_answered: 'Wychodzące nieodebrane',
  rejected:     'Odrzucone',
  error:        'Błąd połączenia',
};

const AI_TAG_COLORS: Record<string, string> = {
  'AI70%': '#4ade80',
  'AI50%': '#60a5fa',
  'AI30%': '#fdba74',
  'AI0%':  '#9ca3af',
  'bez taga AI': '#c4b5fd',
};

const STAGE_COLORS: Record<string, string> = {
  new:           '#94a3b8',
  qualification: '#f59e0b',
  presentation:  '#3b82f6',
  offer:         '#a855f7',
  negotiation:   '#f97316',
  closed_won:    '#22c55e',
  closed_lost:   '#ef4444',
  onboarding:    '#06b6d4',
  onboarded:     '#10b981',
};

const STAGE_LABELS: Record<string, string> = {
  new:           'Nowy',
  qualification: 'Kwalifikacja',
  presentation:  'Prezentacja',
  offer:         'Oferta',
  negotiation:   'Negocjacje',
  closed_won:    'Wygrany',
  closed_lost:   'Przegrany',
  onboarding:    'Onboarding',
  onboarded:     'Klient',
};

function aiPct(tag: string): number { return parseInt(tag.match(/\d+/)?.[0] ?? '0', 10); }

type Period = 'this_week' | 'this_month' | 'this_quarter' | 'ytd' | 'prev_week' | 'prev_month' | 'prev_quarter' | 'prev_year' | 'custom';
const PERIOD_LABELS: Record<Period, string> = {
  this_week:    'Ten tydzień',
  this_month:   'Ten miesiąc',
  this_quarter: 'Ten kwartał',
  ytd:          'Ten rok (YTD)',
  prev_week:    'Poprzedni tydzień',
  prev_month:   'Poprzedni miesiąc',
  prev_quarter: 'Poprzedni kwartał',
  prev_year:    'Poprzedni rok',
  custom:       'Własny…',
};

function maxOf(rows: BarRow[]): number {
  return Math.max(1, ...rows.map(r => r.total));
}

@Component({
  selector: 'wt-crm-prospects-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

<!-- TOPBAR -->
<div style="height:60px;background:white;border-bottom:1px solid var(--gray-200,#e5e7eb);display:flex;align-items:center;gap:10px;padding:0 24px;flex-shrink:0">
  <span style="font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:#18181b">Dashboard Prospekty</span>
  <span style="font-size:12px;color:#a1a1aa">Statystyki leadów, prospektów i połączeń PBX</span>
</div>

<!-- CONTENT -->
<div style="flex:1;overflow-y:auto;padding:24px;min-width:0">
<div class="pd-content">

  <!-- ══════════════════════════════════════════════════════
       #1 Leady per handlowiec / przedział score
  ══════════════════════════════════════════════════════ -->
  <div class="pd-panel">
    <div class="pd-panel-head">
      <h2>Leady per handlowiec (wg score prospektu)</h2>
      <div class="pd-filters">
        <select class="pd-sel" [(ngModel)]="period1" (ngModelChange)="onPeriod1Change()">
          <option *ngFor="let p of periods" [value]="p.value">{{ p.label }}</option>
        </select>
        <ng-container *ngIf="period1 === 'custom'">
          <input type="date" class="pd-sel" [(ngModel)]="customFrom1" (ngModelChange)="loadChart1()">
          <span style="font-size:11px;color:var(--gray-400,#9ca3af);flex-shrink:0">–</span>
          <input type="date" class="pd-sel" [(ngModel)]="customTo1" (ngModelChange)="loadChart1()">
        </ng-container>
        <select class="pd-sel" [(ngModel)]="filter1Stage" (ngModelChange)="loadChart1()">
          <option value="">Wszystkie etapy</option>
          <option value="new">Nowy</option>
          <option value="qualification">Kwalifikacja</option>
          <option value="presentation">Prezentacja</option>
          <option value="offer">Oferta</option>
          <option value="negotiation">Negocjacje</option>
          <option value="closed_won">Wygrany</option>
          <option value="closed_lost">Przegrany</option>
        </select>
      </div>
    </div>

    <div *ngIf="loading1" class="pd-loading">Ładowanie…</div>
    <div *ngIf="!loading1 && chart1Rows.length === 0" class="pd-empty">Brak danych dla wybranego okresu</div>

    <div *ngIf="!loading1 && chart1Rows.length > 0" class="pd-chart-wrap">
      <!-- Słupki per handlowiec -->
      <div class="pd-bars">
        <div class="pd-bar-row" *ngFor="let row of chart1Rows">
          <span class="pd-bar-label">{{ row.label }}</span>
          <div class="pd-bar-track">
            <div class="pd-bar-stacked" [style.width.%]="(row.total / chart1Max) * 100">
              <div
                *ngFor="let seg of row.segments"
                class="pd-seg"
                [style.flex]="seg.value"
                [style.background]="seg.color"
                [title]="seg.label + ': ' + seg.value">
              </div>
            </div>
            <span class="pd-bar-val">{{ row.total }}</span>
          </div>
        </div>
      </div>

      <!-- Legenda score -->
      <div class="pd-legend">
        <div *ngFor="let s of chart1ScoreRanges" class="pd-leg-item">
          <span class="pd-leg-dot" [style.background]="scoreColor(s)"></span>
          <span>{{ s }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════
       #2 Prospekty wg punktów i statusu
  ══════════════════════════════════════════════════════ -->
  <div class="pd-panel">
    <div class="pd-panel-head">
      <h2>Prospekty w bazie (wg punktów i statusu)</h2>
      <div class="pd-filters">
        <select class="pd-sel" [(ngModel)]="filter2Status" (ngModelChange)="loadChart2()">
          <option value="">Wszystkie statusy</option>
          <option value="prospect">Prospekt</option>
          <option value="lead">Lead</option>
          <option value="hold">Hold</option>
          <option value="archive">Archiwum</option>
        </select>
        <label class="pd-chk">
          <input type="checkbox" [(ngModel)]="show2NullScore" (ngModelChange)="buildChart2(); cdr.markForCheck()">
          <span>Pokaż score=NULL</span>
        </label>
        <label class="pd-chk">
          <input type="checkbox" [(ngModel)]="show2BelowThreshold" (ngModelChange)="buildChart2(); cdr.markForCheck()">
          <span>{{ belowThresholdLabel }}</span>
        </label>
        <!-- Multi-select bazy -->
        <div class="pd-ms-wrap">
          <div *ngIf="filter2DbDropdownOpen" class="pd-ms-overlay" (click)="filter2DbDropdownOpen = false"></div>
          <button type="button" class="pd-ms-trigger" (click)="filter2DbDropdownOpen = !filter2DbDropdownOpen">
            <span>{{ dbFilterLabel }}</span>
            <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path d="M5.5 8l4.5 4.5L14.5 8"/></svg>
          </button>
          <div *ngIf="filter2DbDropdownOpen" class="pd-ms-dropdown" (click)="$event.stopPropagation()">
            <input
              type="text"
              class="pd-ms-search"
              [(ngModel)]="filter2DbSearch"
              placeholder="Szukaj bazy…"
              (click)="$event.stopPropagation()">
            <div class="pd-ms-actions">
              <button type="button" (click)="selectAllDbs()">Wszystkie</button>
              <button type="button" (click)="clearDbs()">Wyczyść</button>
            </div>
            <div class="pd-ms-list">
              <label *ngFor="let db of filteredDbOptions" class="pd-ms-item">
                <input type="checkbox"
                  [checked]="isDbSelected(db)"
                  (change)="toggleDb(db)">
                <span>{{ db }}</span>
              </label>
              <div *ngIf="filteredDbOptions.length === 0" class="pd-ms-empty">Brak wyników</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div *ngIf="loading2" class="pd-loading">Ładowanie…</div>
    <div *ngIf="!loading2 && chart2Bars.length === 0" class="pd-empty">Brak danych</div>

    <div *ngIf="!loading2 && chart2Bars.length > 0" class="pd-bars">
      <div class="pd-bar-row" *ngFor="let row of chart2Bars">
        <span class="pd-bar-label">{{ statusLabel(row.label) }}</span>
        <div class="pd-bar-track">
          <div class="pd-bar-stacked" [style.width.%]="(row.total / chart2Max) * 100">
            <div
              *ngFor="let seg of row.segments"
              class="pd-seg"
              [style.flex]="seg.value"
              [style.background]="seg.color"
              [title]="seg.label + ': ' + seg.value">
            </div>
          </div>
          <span class="pd-bar-val">{{ row.total }}</span>
        </div>
      </div>
      <div class="pd-legend">
        <div *ngFor="let s of chart2ScoreRanges" class="pd-leg-item">
          <span class="pd-leg-dot" [style.background]="scoreColor(s)"></span>
          <span>{{ s }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════
       #3 Leady wg tagu AI
  ══════════════════════════════════════════════════════ -->
  <div class="pd-panel pd-panel-sm">
    <div class="pd-panel-head">
      <h2>Leady wg tagu AI</h2>
      <div class="pd-filters">
        <select class="pd-sel" [(ngModel)]="filter3Stage" (ngModelChange)="loadChart3()">
          <option value="">Wszystkie etapy</option>
          <option value="new">Nowy</option>
          <option value="qualification">Kwalifikacja</option>
          <option value="presentation">Prezentacja</option>
          <option value="offer">Oferta</option>
          <option value="negotiation">Negocjacje</option>
          <option value="closed_won">Wygrany</option>
          <option value="closed_lost">Przegrany</option>
          <option value="onboarding">Onboarding</option>
          <option value="onboarded">Klient</option>
        </select>
      </div>
    </div>

    <div *ngIf="loading3" class="pd-loading">Ładowanie…</div>
    <div *ngIf="!loading3 && chart3Rows.length === 0" class="pd-empty">Brak danych</div>

    <div *ngIf="!loading3 && chart3Rows.length > 0">
      <div class="pd-bars">
        <div class="pd-bar-row" *ngFor="let row of chart3Rows">
          <span class="pd-bar-label pd-bar-label-tag" [style.color]="aiTagColor(row.label)">{{ row.label }}</span>
          <div class="pd-bar-track">
            <div class="pd-bar-stacked" [style.width.%]="(row.total / chart3Max) * 100">
              <div
                *ngFor="let seg of row.segments"
                class="pd-seg"
                [style.flex]="seg.value"
                [style.background]="seg.color"
                [title]="seg.label + ': ' + seg.value">
              </div>
            </div>
            <span class="pd-bar-val">{{ row.total }}</span>
          </div>
        </div>
      </div>
      <div *ngIf="chart3StageList.length > 1 && !filter3Stage" class="pd-legend">
        <div *ngFor="let s of chart3StageList" class="pd-leg-item">
          <span class="pd-leg-dot" [style.background]="stageColor(s)"></span>
          <span>{{ stageLabel(s) }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════
       #4 Wzbogacone prospekty per baza
  ══════════════════════════════════════════════════════ -->
  <div class="pd-panel">
    <div class="pd-panel-head">
      <h2>Wzbogacone prospekty per baza (score po grupach)</h2>
      <div class="pd-filters">
        <label class="pd-chk">
          <input type="checkbox" [(ngModel)]="show4BelowThreshold" (ngModelChange)="cdr.markForCheck()">
          <span>{{ belowThresholdLabel }}</span>
        </label>
        <div class="pd-search-wrap">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13" class="pd-search-icon"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13.5 13.5l3 3"/></svg>
          <input
            type="text"
            class="pd-search-input"
            [(ngModel)]="filter4DbSearch"
            placeholder="Szukaj bazy…"
            (ngModelChange)="cdr.markForCheck()">
          <button *ngIf="filter4DbSearch" type="button" class="pd-search-clear" (click)="filter4DbSearch=''">✕</button>
        </div>
      </div>
    </div>

    <div *ngIf="loading4" class="pd-loading">Ładowanie…</div>
    <div *ngIf="!loading4 && chart4Bars.length === 0" class="pd-empty">Brak danych</div>
    <div *ngIf="!loading4 && chart4Bars.length > 0 && displayedChart4Bars.length === 0" class="pd-empty">Brak baz pasujących do frazy „{{ filter4DbSearch }}"</div>

    <div *ngIf="!loading4 && displayedChart4Bars.length > 0" class="pd-bars">
      <div class="pd-bar-row" *ngFor="let row of displayedChart4Bars">
        <span class="pd-bar-label">{{ row.label }}</span>
        <div class="pd-bar-track">
          <div class="pd-bar-stacked" [style.width.%]="(row.total / chart4MaxFiltered) * 100">
            <div
              *ngFor="let seg of row.segments"
              class="pd-seg"
              [style.flex]="seg.value"
              [style.background]="seg.color"
              [title]="seg.label + ': ' + seg.value">
            </div>
          </div>
          <span class="pd-bar-val">{{ row.total }}</span>
        </div>
      </div>
      <div class="pd-legend">
        <div *ngFor="let s of displayedChart4ScoreRanges" class="pd-leg-item">
          <span class="pd-leg-dot" [style.background]="scoreColor(s)"></span>
          <span>{{ s }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════
       #5 Połączenia per handlowiec
  ══════════════════════════════════════════════════════ -->
  <div class="pd-panel">
    <div class="pd-panel-head">
      <h2>Połączenia PBX per handlowiec</h2>
      <div class="pd-filters">
        <select class="pd-sel" [(ngModel)]="period5" (ngModelChange)="onPeriod5Change()">
          <option *ngFor="let p of periods" [value]="p.value">{{ p.label }}</option>
        </select>
        <ng-container *ngIf="period5 === 'custom'">
          <input type="date" class="pd-sel" [(ngModel)]="customFrom5" (ngModelChange)="loadChart5()">
          <span style="font-size:11px;color:var(--gray-400,#9ca3af);flex-shrink:0">–</span>
          <input type="date" class="pd-sel" [(ngModel)]="customTo5" (ngModelChange)="loadChart5()">
        </ng-container>
        <select class="pd-sel" [(ngModel)]="filter5Direction" (ngModelChange)="loadChart5()">
          <option value="">Oba kierunki</option>
          <option value="inbound">Przychodzące</option>
          <option value="outbound">Wychodzące</option>
        </select>
        <select class="pd-sel" [(ngModel)]="filter5Status" (ngModelChange)="loadChart5()">
          <option value="">Wszystkie statusy</option>
          <option value="answered">Odebrane</option>
          <option value="missed">Przych. nieodebrane</option>
          <option value="not_answered">Wych. nieodebrane</option>
          <option value="rejected">Odrzucone</option>
          <option value="error">Błąd</option>
        </select>
      </div>
    </div>

    <div *ngIf="loading5" class="pd-loading">Ładowanie…</div>
    <div *ngIf="!loading5 && chart5Rows.length === 0" class="pd-empty">Brak danych dla wybranego okresu i filtrów</div>

    <div *ngIf="!loading5 && chart5Rows.length > 0" class="pd-bars">
      <div class="pd-bar-row" *ngFor="let row of chart5Rows">
        <span class="pd-bar-label">{{ row.label }}</span>
        <div class="pd-bar-track">
          <div class="pd-bar-stacked" [style.width.%]="(row.total / chart5Max) * 100">
            <div
              *ngFor="let seg of row.segments"
              class="pd-seg"
              [style.flex]="seg.value"
              [style.background]="seg.color"
              [title]="seg.label + ': ' + seg.value">
            </div>
          </div>
          <span class="pd-bar-val">{{ row.total }}</span>
        </div>
      </div>

      <div class="pd-legend">
        <div *ngFor="let s of chart5StatusList" class="pd-leg-item">
          <span class="pd-leg-dot" [style.background]="callStatusColor(s)"></span>
          <span>{{ callStatusLabel(s) }}</span>
        </div>
      </div>
    </div>
  </div>

</div>
</div>
</div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }

    .pd-content { max-width: 1100px; }

    /* ── Panel ─────────────────────────────────────────────────── */
    .pd-panel {
      box-sizing: border-box; width: 100%;
      background: var(--white, #fff);
      border: 1px solid var(--gray-200, #e5e7eb);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .pd-panel-sm { max-width: 600px; }

    /* ── Panel head ────────────────────────────────────────────── */
    .pd-panel-head {
      display: flex; align-items: flex-start; gap: 10px;
      flex-wrap: wrap; margin-bottom: 18px; min-width: 0;
    }
    .pd-panel-head h2 {
      font-size: 13px; font-weight: 600;
      color: var(--gray-800, #1f2937);
      flex: 1; min-width: 120px; margin: 0; line-height: 1.5;
    }
    .pd-filters { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }

    /* ── Selects / inputs ──────────────────────────────────────── */
    .pd-sel {
      font-size: 12px; padding: 4px 8px; border-radius: 6px;
      border: 1px solid var(--gray-300, #d1d5db);
      background: var(--white, #fff); cursor: pointer;
      color: var(--gray-700, #374151); max-width: 150px;
    }

    /* ── Multi-select dropdown ─────────────────────────────────── */
    .pd-ms-wrap { position: relative; }
    .pd-ms-overlay { position: fixed; inset: 0; z-index: 10; }
    .pd-ms-trigger {
      display: flex; align-items: center; gap: 5px;
      font-size: 12px; padding: 4px 8px; border-radius: 6px;
      border: 1px solid var(--gray-300, #d1d5db);
      background: var(--white, #fff); cursor: pointer;
      color: var(--gray-700, #374151); max-width: 150px;
    }
    .pd-ms-trigger span {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
    }
    .pd-ms-trigger svg { flex-shrink: 0; }
    /* Otwiera się w LEWĄ stronę — nie wychodzi poza prawą krawędź */
    .pd-ms-dropdown {
      position: absolute; top: calc(100% + 4px); right: 0; z-index: 20;
      background: var(--white, #fff);
      border: 1px solid var(--gray-200, #e5e7eb);
      border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.12);
      width: 220px; padding: 8px 0;
    }
    .pd-ms-search {
      display: block; box-sizing: border-box;
      width: calc(100% - 16px); margin: 0 8px 6px;
      font-size: 12px; padding: 5px 8px; border-radius: 6px;
      border: 1px solid var(--gray-300, #d1d5db);
      background: var(--white, #fff); color: var(--gray-700, #374151); outline: none;
    }
    .pd-ms-search:focus { border-color: var(--orange, #3BAA5D); }
    .pd-ms-actions {
      display: flex; gap: 4px; padding: 0 8px 6px;
      border-bottom: 1px solid var(--gray-100, #f3f4f6);
    }
    .pd-ms-actions button {
      font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;
      border: 1px solid var(--gray-200, #e5e7eb);
      background: transparent; color: var(--gray-500, #6b7280);
    }
    .pd-ms-actions button:hover { background: var(--gray-100, #f3f4f6); }
    .pd-ms-list { min-height: 0; max-height: 242px; overflow-y: auto; padding: 4px 0; }
    .pd-ms-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 12px; cursor: pointer; font-size: 12px;
      color: var(--gray-700, #374151);
    }
    .pd-ms-item:hover { background: var(--gray-50, #f9fafb); }
    .pd-ms-item input[type="checkbox"] { accent-color: var(--orange, #3BAA5D); flex-shrink: 0; }
    .pd-ms-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pd-ms-empty { font-size: 12px; color: var(--gray-400, #9ca3af); padding: 8px 12px; }

    /* ── Stany ─────────────────────────────────────────────────── */
    .pd-loading { color: var(--gray-400, #9ca3af); font-size: 13px; padding: 16px 0; }
    .pd-empty   { color: var(--gray-400, #9ca3af); font-size: 13px; padding: 16px 0; }

    /* ── Period tabs ───────────────────────────────────────────── */
    .pd-period-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 14px; }
    .pd-ptab {
      font-size: 11px; padding: 3px 10px; border-radius: 20px;
      border: 1px solid var(--gray-300, #d1d5db);
      background: transparent; cursor: pointer;
      color: var(--gray-600, #4b5563); white-space: nowrap;
    }
    .pd-ptab.active {
      background: var(--orange, #3BAA5D); color: #fff; border-color: var(--orange, #3BAA5D);
    }

    /* ── Słupki ────────────────────────────────────────────────── */
    .pd-chart-wrap { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .pd-bars { display: flex; flex-direction: column; gap: 7px; min-width: 0; }

    .pd-bar-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .pd-bar-label {
      width: 130px; min-width: 70px; max-width: 130px;
      font-size: 11px; color: var(--gray-700, #374151); text-align: right;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;
    }
    .pd-bar-track {
      flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0;
    }
    .pd-bar-stacked {
      display: flex; height: 18px; border-radius: 4px; overflow: hidden;
      min-width: 4px; transition: width .3s; flex-shrink: 0;
      max-width: calc(100% - 44px);
    }
    .pd-seg { transition: flex .3s; min-width: 2px; }
    .pd-bar-single { height: 18px; border-radius: 4px; min-width: 4px; transition: width .3s; }
    .pd-bar-val {
      font-size: 11px; font-weight: 600; color: var(--gray-600, #4b5563);
      min-width: 26px; flex-shrink: 0;
    }

    /* ── Legenda ───────────────────────────────────────────────── */
    .pd-legend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .pd-leg-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--gray-600, #4b5563); }
    .pd-leg-dot  { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

    /* ── Checkbox filter ──────────────────────────────────────────── */
    .pd-chk {
      display: flex; align-items: center; gap: 5px; cursor: pointer;
      font-size: 12px; color: var(--gray-800, #1f2937); white-space: nowrap;
      user-select: none;
    }
    .pd-chk input[type="checkbox"] { accent-color: var(--orange, #3BAA5D); margin: 0; cursor: pointer; }

    /* AI tag label — kolorowy tekst */
    .pd-bar-label-tag { font-weight: 600; }

    /* ── Search input (chart #4) ──────────────────────────────────── */
    .pd-search-wrap {
      position: relative; display: flex; align-items: center;
    }
    .pd-search-icon {
      position: absolute; left: 7px; color: var(--gray-400, #9ca3af); pointer-events: none; flex-shrink: 0;
    }
    .pd-search-input {
      font-size: 12px; padding: 4px 24px 4px 24px; border-radius: 6px;
      border: 1px solid var(--gray-300, #d1d5db);
      background: var(--white, #fff); color: var(--gray-700, #374151);
      width: 180px; outline: none;
    }
    .pd-search-input:focus { border-color: var(--orange, #3BAA5D); }
    .pd-search-clear {
      position: absolute; right: 6px; background: none; border: none;
      font-size: 11px; color: var(--gray-400, #9ca3af); cursor: pointer; line-height: 1; padding: 0;
    }
    .pd-search-clear:hover { color: var(--gray-600, #4b5563); }

    /* ── Dark mode ─────────────────────────────────────────────── */
    @media (prefers-color-scheme: dark) {
      .pd-header h1 { color: #f9fafb; }
      .pd-panel { background: #1f2937; border-color: #374151; }
      .pd-panel-head h2 { color: #f3f4f6; }
      .pd-sel { background: #374151; border-color: #4b5563; color: #f3f4f6; }
      .pd-ms-trigger { background: #374151; border-color: #4b5563; color: #f3f4f6; }
      .pd-ms-dropdown { background: #1f2937; border-color: #374151; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
      .pd-ms-search { background: #374151; border-color: #4b5563; color: #f3f4f6; }
      .pd-ms-actions { border-color: #374151; }
      .pd-ms-actions button { border-color: #4b5563; color: #9ca3af; }
      .pd-ms-actions button:hover { background: #374151; }
      .pd-ms-item { color: #d1d5db; }
      .pd-ms-item:hover { background: #374151; }
      .pd-search-input { background: #374151; border-color: #4b5563; color: #f3f4f6; }
      .pd-chk { color: #f3f4f6; }
      .pd-bar-label, .pd-bar-val, .pd-leg-item { color: #d1d5db; }
      .pd-ptab { border-color: #4b5563; color: #d1d5db; }
    }
  `],
})
export class CrmProspectsDashboardComponent implements OnInit {
  private api = inject(CrmApiService);
  readonly cdr = inject(ChangeDetectorRef);

  // Dynamiczna mapa kolorów score: budowana na podstawie rzeczywistych zakresów z API
  private knownScoreRanges = new Set<string>();
  private scoreColorMap    = new Map<string, string>([['brak', '#9ca3af']]);

  private addScoreRanges(ranges: string[]): void {
    const before = this.knownScoreRanges.size;
    ranges.forEach(r => this.knownScoreRanges.add(r));
    if (this.knownScoreRanges.size !== before) {
      this.scoreColorMap = buildScoreColorMap([...this.knownScoreRanges]);
    }
  }

  // Filtry
  period1: Period = 'this_week';
  customFrom1 = '';
  customTo1   = '';
  filter1Stage         = '';
  period5: Period = 'this_week';
  customFrom5 = '';
  customTo5   = '';
  filter2Status        = '';
  filter2Dbs:  string[] = [];
  filter2DbSearch      = '';
  filter2DbDropdownOpen = false;
  filter3Stage         = '';
  filter4DbSearch      = '';
  show2BelowThreshold  = false;
  show2NullScore       = false;
  show4BelowThreshold  = false;
  filter5Direction     = '';
  filter5Status        = '';

  // Stany ładowania
  loading1 = true; loading2 = true; loading3 = true; loading4 = true; loading5 = true;

  // Dane surowe
  private raw1: ProspectDashLeadRow[]   = [];
  private raw2: ProspectDashScoreRow[]  = [];
  private raw5: ProspectDashCallRow[]   = [];

  // Tablice wykresu
  chart1Rows:        BarRow[] = [];
  chart1ScoreRanges: string[] = [];
  chart1Max = 1;

  chart2Bars:        BarRow[] = [];
  chart2ScoreRanges: string[] = [];
  chart2Databases:   string[] = [];
  chart2Max = 1;

  chart3Rows:       BarRow[] = [];
  chart3StageList:  string[] = [];
  chart3Max = 1;

  chart4Bars:        BarRow[] = [];
  chart4ScoreRanges: string[] = [];
  chart4Max = 1;

  chart5Rows:       BarRow[] = [];
  chart5StatusList: string[] = [];
  chart5Max = 1;

  readonly periods = Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label })) as { value: Period; label: string }[];

  ngOnInit(): void {
    this.loadChart1();
    this.loadChart2();
    this.loadChart3();
    this.loadChart4();
    this.loadChart5();
  }

  // ── #1 ──────────────────────────────────────────────────────────

  onPeriod1Change(): void {
    if (this.period1 !== 'custom') this.loadChart1();
  }

  loadChart1(): void {
    if (this.period1 === 'custom' && (!this.customFrom1 || !this.customTo1)) return;
    this.loading1 = true;
    this.api.getProspectDashLeadsBySalesperson({
      period:   this.period1,
      fromDate: this.customFrom1 || undefined,
      toDate:   this.customTo1   || undefined,
      stage:    this.filter1Stage || undefined,
    }).subscribe({
      next: rows => {
        this.raw1 = rows.map(r => ({ ...r, count: Number(r.count) }));
        const ranges = [...new Set(rows.map(r => r.score_range))];
        this.addScoreRanges(ranges);
        this.chart1ScoreRanges = ranges.sort((a, b) => scoreSortKey(a) - scoreSortKey(b));
        this.buildChart1Rows();
        this.loading1 = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading1 = false; this.cdr.markForCheck(); },
    });
  }

  private buildChart1Rows(): void {
    const byUser = new Map<string, { display_name: string; byScore: Map<string, number> }>();
    for (const r of this.raw1) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, { display_name: r.display_name, byScore: new Map() });
      byUser.get(r.user_id)!.byScore.set(r.score_range, (byUser.get(r.user_id)!.byScore.get(r.score_range) ?? 0) + r.count);
    }
    const rows: BarRow[] = [];
    for (const [, u] of byUser) {
      const total = [...u.byScore.values()].reduce((a, b) => a + b, 0);
      rows.push({
        label: u.display_name,
        total,
        segments: this.chart1ScoreRanges
          .filter(s => u.byScore.has(s))
          .map(s => ({ label: s, value: u.byScore.get(s) ?? 0, pct: 0, color: this.scoreColor(s) })),
      });
    }
    this.chart1Rows = rows.sort((a, b) => b.total - a.total);
    this.chart1Max  = maxOf(this.chart1Rows);
  }

  // ── #2 ──────────────────────────────────────────────────────────

  loadChart2(): void {
    this.loading2 = true;
    this.api.getProspectDashProspectsByScore({ status: this.filter2Status }).subscribe({
      next: res => {
        if (res.databases.length) this.chart2Databases = res.databases;
        this.raw2 = res.data.map(r => ({ ...r, count: Number(r.count) }));
        this.buildChart2();
        this.loading2 = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading2 = false; this.cdr.markForCheck(); },
    });
  }

  buildChart2(): void {
    const data = (this.filter2Dbs.length
      ? this.raw2.filter(r => this.filter2Dbs.includes(r.source_database))
      : this.raw2)
      .filter(r => this.show2BelowThreshold || !r.score_range.startsWith('<'))
      .filter(r => this.show2NullScore || r.score_range !== 'brak');
    const scoreRanges = [...new Set(data.map(r => r.score_range))]
      .sort((a, b) => scoreSortKey(a) - scoreSortKey(b));
    this.addScoreRanges(scoreRanges);
    this.chart2ScoreRanges = scoreRanges;
    const byStatus = new Map<string, Map<string, number>>();
    for (const r of data) {
      if (!byStatus.has(r.status)) byStatus.set(r.status, new Map());
      byStatus.get(r.status)!.set(r.score_range, (byStatus.get(r.status)!.get(r.score_range) ?? 0) + r.count);
    }
    this.chart2Bars = [...byStatus.entries()].map(([st, scoreMap]) => {
      const total = [...scoreMap.values()].reduce((a, b) => a + b, 0);
      return {
        label: st, total,
        segments: scoreRanges.filter(s => scoreMap.has(s)).map(s => ({
          label: s, value: scoreMap.get(s) ?? 0, pct: 0, color: this.scoreColor(s),
        })),
      };
    });
    this.chart2Max = maxOf(this.chart2Bars);
  }

  get dbFilterLabel(): string {
    if (this.filter2Dbs.length === 0) return 'Wszystkie bazy';
    if (this.filter2Dbs.length === 1) return this.filter2Dbs[0];
    return `${this.filter2Dbs.length} baz`;
  }

  get filteredDbOptions(): string[] {
    const q = this.filter2DbSearch.trim().toLowerCase();
    if (!q) return this.chart2Databases;
    return this.chart2Databases.filter(db => db.toLowerCase().includes(q));
  }

  isDbSelected(db: string): boolean { return this.filter2Dbs.includes(db); }

  toggleDb(db: string): void {
    const idx = this.filter2Dbs.indexOf(db);
    if (idx === -1) this.filter2Dbs = [...this.filter2Dbs, db];
    else            this.filter2Dbs = this.filter2Dbs.filter(d => d !== db);
    this.buildChart2();
    this.cdr.markForCheck();
  }

  selectAllDbs(): void {
    this.filter2Dbs = [...this.chart2Databases];
    this.buildChart2();
    this.cdr.markForCheck();
  }

  clearDbs(): void {
    this.filter2Dbs = [];
    this.buildChart2();
    this.cdr.markForCheck();
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      prospect: 'Prospekt', lead: 'Lead', hold: 'Hold', archive: 'Archiwum',
    };
    return map[s] ?? s;
  }

  // ── #3 ──────────────────────────────────────────────────────────

  loadChart3(): void {
    this.loading3 = true;
    this.api.getProspectDashLeadsByAiTag(this.filter3Stage || undefined).subscribe({
      next: rows => {
        this.chart3StageList = [...new Set(rows.map(r => r.stage))];
        const byTag = new Map<string, Map<string, number>>();
        for (const r of rows) {
          if (!byTag.has(r.tag)) byTag.set(r.tag, new Map());
          byTag.get(r.tag)!.set(r.stage, (byTag.get(r.tag)!.get(r.stage) ?? 0) + r.count);
        }
        const aiTags = [...byTag.keys()]
          .filter(t => t !== 'bez taga AI')
          .sort((a, b) => aiPct(b) - aiPct(a));
        const tagOrder = byTag.has('bez taga AI') ? [...aiTags, 'bez taga AI'] : aiTags;

        this.chart3Rows = tagOrder.map(tag => {
            const stageMap = byTag.get(tag)!;
            const total = [...stageMap.values()].reduce((a, b) => a + b, 0);
            return {
              label: tag, total,
              segments: this.chart3StageList
                .filter(s => stageMap.has(s))
                .map(s => ({
                  label: STAGE_LABELS[s] ?? s,
                  value: stageMap.get(s) ?? 0,
                  pct: 0,
                  color: STAGE_COLORS[s] ?? '#9ca3af',
                })),
            };
          });
        this.chart3Max = Math.max(1, ...this.chart3Rows.map(r => r.total));
        this.loading3 = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading3 = false; this.cdr.markForCheck(); },
    });
  }

  aiTagColor(tag: string): string {
    if (tag === 'bez taga AI') return AI_TAG_COLORS['bez taga AI'];
    const pct = aiPct(tag);
    if (pct >= 70) return '#4ade80';
    if (pct >= 50) return '#60a5fa';
    if (pct >= 30) return '#fdba74';
    if (pct >  0)  return '#fca5a5';
    return '#9ca3af';
  }
  stageColor(s: string): string   { return STAGE_COLORS[s]   ?? '#9ca3af'; }
  stageLabel(s: string): string   { return STAGE_LABELS[s]   ?? s; }

  get belowThresholdLabel(): string {
    const s = this.raw2.find(r => r.score_range.startsWith('<'))?.score_range
      ?? this.chart4Bars.flatMap(b => b.segments.map(seg => seg.label)).find(l => l.startsWith('<'));
    return s ? `Pokaż ${s}` : 'Pokaż < próg';
  }

  // ── #4 ──────────────────────────────────────────────────────────

  get displayedChart4Bars(): BarRow[] {
    let bars = this.chart4Bars;
    if (!this.show4BelowThreshold) {
      bars = bars.map(row => {
        const segs = row.segments.filter(s => !s.label.startsWith('<'));
        return { ...row, segments: segs, total: segs.reduce((a, s) => a + s.value, 0) };
      }).filter(row => row.total > 0);
    }
    const q = this.filter4DbSearch.trim().toLowerCase();
    if (q) bars = bars.filter(r => r.label.toLowerCase().includes(q));
    return bars;
  }

  get displayedChart4ScoreRanges(): string[] {
    if (this.show4BelowThreshold) return this.chart4ScoreRanges;
    return this.chart4ScoreRanges.filter(s => !s.startsWith('<'));
  }

  get chart4MaxFiltered(): number { return maxOf(this.displayedChart4Bars); }

  loadChart4(): void {
    this.loading4 = true;
    this.api.getProspectDashEnrichedByDatabase().subscribe({
      next: rows => {
        const data  = rows.map(r => ({ ...r, count: Number(r.count) }));
        const scoreRanges = [...new Set(data.map(r => r.score_range))]
          .sort((a, b) => scoreSortKey(a) - scoreSortKey(b));
        this.addScoreRanges(scoreRanges);
        this.chart4ScoreRanges = scoreRanges;
        const byDb = new Map<string, Map<string, number>>();
        for (const r of data) {
          if (!byDb.has(r.source_database)) byDb.set(r.source_database, new Map());
          byDb.get(r.source_database)!.set(r.score_range, (byDb.get(r.source_database)!.get(r.score_range) ?? 0) + r.count);
        }
        this.chart4Bars = [...byDb.entries()].map(([db, scoreMap]) => {
          const total = [...scoreMap.values()].reduce((a, b) => a + b, 0);
          return {
            label: db, total,
            segments: scoreRanges.filter(s => scoreMap.has(s)).map(s => ({
              label: s, value: scoreMap.get(s) ?? 0, pct: 0, color: this.scoreColor(s),
            })),
          };
        });
        this.chart4Max = maxOf(this.chart4Bars);
        this.loading4 = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading4 = false; this.cdr.markForCheck(); },
    });
  }

  // ── #5 ──────────────────────────────────────────────────────────

  onPeriod5Change(): void {
    if (this.period5 !== 'custom') this.loadChart5();
  }

  loadChart5(): void {
    if (this.period5 === 'custom' && (!this.customFrom5 || !this.customTo5)) return;
    this.loading5 = true;
    this.api.getProspectDashCallsBySalesperson({
      period:    this.period5,
      direction: this.filter5Direction || undefined,
      status:    this.filter5Status    || undefined,
      fromDate:  this.customFrom5 || undefined,
      toDate:    this.customTo5   || undefined,
    }).subscribe({
      next: rows => {
        this.raw5 = rows.map(r => ({ ...r, count: Number(r.count) }));
        this.chart5StatusList = [...new Set(rows.map(r => r.status))];
        this.buildChart5Rows();
        this.loading5 = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading5 = false; this.cdr.markForCheck(); },
    });
  }

  private buildChart5Rows(): void {
    const byUser = new Map<string, { display_name: string; byStatus: Map<string, number> }>();
    for (const r of this.raw5) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, { display_name: r.display_name, byStatus: new Map() });
      const key = `${r.direction}/${r.status}`;
      byUser.get(r.user_id)!.byStatus.set(key, (byUser.get(r.user_id)!.byStatus.get(key) ?? 0) + r.count);
    }
    const rows: BarRow[] = [];
    for (const [, u] of byUser) {
      const total = [...u.byStatus.values()].reduce((a, b) => a + b, 0);
      rows.push({
        label: u.display_name, total,
        segments: [...u.byStatus.entries()].map(([key, val]) => {
          const status = key.split('/')[1];
          return { label: CALL_STATUS_LABELS[status] ?? status, value: val, pct: 0, color: CALL_STATUS_COLORS[status] ?? '#9ca3af' };
        }),
      });
    }
    this.chart5Rows = rows.sort((a, b) => b.total - a.total);
    this.chart5Max  = maxOf(this.chart5Rows);
  }

  callStatusColor(s: string): string { return CALL_STATUS_COLORS[s] ?? '#9ca3af'; }
  callStatusLabel(s: string): string { return CALL_STATUS_LABELS[s] ?? s; }

  scoreColor(s: string): string { return this.scoreColorMap.get(s) ?? '#e5e7eb'; }
}

import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, Observable } from 'rxjs';
import { CrmApiService, ActivityTask, Lead, ChurnPartner, ChurnSettings } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { TooltipComponent } from '../../../shared/components/tooltip/tooltip.component';

interface PipelineRow {
  stage: string;
  label: string;
  count: number;
  value: number;
  color: string;
  barPct: number;
}

@Component({
  selector: 'wt-crm-sales-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TooltipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="crm-dash" *ngIf="!loading; else loadingTpl">

  <!-- ── TABS ── -->
  <div class="dash-tabs">
    <button class="dash-tab" [class.active]="activeTab === 'dashboard'" (click)="activeTab = 'dashboard'">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
      Dashboard
    </button>
    <button class="dash-tab" [class.active]="activeTab === 'churn'"
            (click)="activeTab = 'churn'; loadChurn()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polyline points="22,7 13.5,15.5 8.5,10.5 2,17"/>
        <polyline points="16,7 22,7 22,13"/>
      </svg>
      Ryzyko Churn
      <span class="tab-badge-red" *ngIf="churnCriticalCount > 0">{{ churnCriticalCount }}</span>
    </button>
  </div>

  <!-- ── CHURN TAB ── -->
  <ng-container *ngIf="activeTab === 'churn'">
    <div class="churn-section">

      <!-- Filtry -->
      <div class="churn-filters">
        <input class="churn-filter-inp" [(ngModel)]="churnFilterName"
               (ngModelChange)="onChurnFilter()" placeholder="Szukaj partnera…"/>
        <select class="churn-filter-sel" [(ngModel)]="churnFilterRisk" (ngModelChange)="onChurnFilter()">
          <option value="">Wszystkie poziomy</option>
          <option value="critical">Krytyczne</option>
          <option value="high">Wysokie</option>
          <option value="medium">Średnie</option>
          <option value="low">Niskie</option>
        </select>
        <select class="churn-filter-sel" *ngIf="isCrmManager"
                [(ngModel)]="churnFilterSalesperson" (ngModelChange)="onChurnFilter()">
          <option value="">Wszyscy handlowcy</option>
          <option *ngFor="let u of churnSalespersons" [value]="u.id">{{ u.name }}</option>
        </select>
        <div class="churn-filter-spacer"></div>
        <button class="churn-gen-btn" *ngIf="isCrmManager"
                [disabled]="churnGenerating"
                (click)="generateChurnTasks()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          {{ churnGenerating ? 'Generowanie…' : 'Generuj zadania' }}
        </button>
      </div>

      <!-- Wynik generowania -->
      <div class="churn-gen-result" *ngIf="churnGenResult">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <polyline points="20,6 9,17 4,12"/>
        </svg>
        Utworzono {{ churnGenResult.created }} zadań,
        pominięto {{ churnGenResult.skipped }} (już istnieją).
        <button class="churn-gen-close" (click)="churnGenResult = null">✕</button>
      </div>

      <!-- Lista -->
      <div class="churn-list" *ngIf="!churnLoading; else churnLoadingTpl">
        <div class="churn-empty" *ngIf="churnFiltered.length === 0">
          Brak partnerów z ryzykiem churn spełniających kryteria filtrów.
        </div>

        <div class="churn-item" *ngFor="let p of churnFiltered" (click)="goToPartner(p.partner_id)">
          <div class="churn-risk-bar" [class]="'risk-' + p.risk_level"></div>

          <div class="churn-main">
            <div class="churn-name">{{ p.display_name }}</div>
            <div class="churn-meta" *ngIf="p.salesperson_name">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {{ p.salesperson_name }}
            </div>
          </div>

          <div class="churn-stats">
            <div class="churn-stat" *ngIf="p.days_since_order !== null">
              <span class="churn-stat-val">{{ p.days_since_order }}</span>
              <span class="churn-stat-lbl">dni bez zamówienia</span>
            </div>
            <div class="churn-stat" *ngIf="p.sales_drop_pct > 0">
              <span class="churn-stat-val churn-drop">−{{ p.sales_drop_pct }}%</span>
              <span class="churn-stat-lbl">spadek M-2→M-1</span>
            </div>
          </div>

          <div class="churn-score-wrap">
            <div class="churn-badge" [class]="'risk-badge-' + p.risk_level">
              {{ riskLabel(p.risk_level) }}
            </div>
            <div class="churn-score">{{ p.total_score }} pkt</div>
          </div>

          <svg class="churn-chevron" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="9,18 15,12 9,6"/>
          </svg>
        </div>
      </div>

      <ng-template #churnLoadingTpl>
        <div class="churn-loading"><div class="spinner"></div></div>
      </ng-template>
    </div>
  </ng-container>

  <!-- ── DASHBOARD TAB ── -->
  <ng-container *ngIf="activeTab === 'dashboard'">

  <!-- ── HEADER ── -->
  <div class="dash-top">
    <div class="dash-greeting">
      <h1>Dzień dobry, {{ firstName }}!</h1>
      <p>Oto podsumowanie Twoich działań i wyników.</p>
    </div>
    <div class="date-chip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      {{ weekRange }}
    </div>
  </div>

  <!-- ── KPI ── -->
  <div class="kpi-row">

    <div class="kpi-card clickable" (click)="goToLeads({ stage: 'new', label: 'Nowe kontakty' })">
      <div class="kpi-icon" style="background:#E6F4EA">
        <svg viewBox="0 0 24 24" fill="none" stroke="#3BAA5D" stroke-width="2" width="22" height="22">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>
      <div class="kpi-info">
        <div class="kpi-label">Nowe kontakty <wt-tooltip key="crm.sales.kpi.new_contacts"></wt-tooltip></div>
        <div class="kpi-value">{{ kpiNewLeads }}</div>
        <div class="kpi-trend" *ngIf="kpiNewLeadsChange !== null"
             [class.pos]="kpiNewLeadsChange >= 0" [class.neg]="kpiNewLeadsChange < 0">
          {{ kpiNewLeadsChange >= 0 ? '↑' : '↓' }} {{ kpiNewLeadsChange | number:'1.0-0' }}%
          <span>vs poprzedni tydzień</span>
        </div>
      </div>
    </div>

    <div class="kpi-card clickable" (click)="goToLeads({ stage: 'new', label: 'Nowe firmy' })">
      <div class="kpi-icon" style="background:#DBEAFE">
        <svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" width="22" height="22">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
      </div>
      <div class="kpi-info">
        <div class="kpi-label">Nowe firmy <wt-tooltip key="crm.sales.kpi.new_companies"></wt-tooltip></div>
        <div class="kpi-value">{{ kpiNewCompanies }}</div>
        <div class="kpi-trend" *ngIf="kpiNewCompaniesChange !== null"
             [class.pos]="kpiNewCompaniesChange >= 0" [class.neg]="kpiNewCompaniesChange < 0">
          {{ kpiNewCompaniesChange >= 0 ? '↑' : '↓' }} {{ kpiNewCompaniesChange | number:'1.0-0' }}%
          <span>vs poprzedni tydzień</span>
        </div>
      </div>
    </div>

    <div class="kpi-card clickable" (click)="goToLeads({ label: 'Szanse aktywne w pipeline' })">
      <div class="kpi-icon" style="background:#EDE9FE">
        <svg viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" width="22" height="22">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      </div>
      <div class="kpi-info">
        <div class="kpi-label">Nowe szanse <wt-tooltip key="crm.sales.kpi.new_leads"></wt-tooltip></div>
        <div class="kpi-value">{{ kpiActiveLeads }}</div>
        <div class="kpi-trend pos" *ngIf="kpiActiveLeads > 0">
          <span>w pipeline</span>
        </div>
      </div>
    </div>

    <div class="kpi-card clickable" (click)="goToLeads({ label: 'Wartość pipeline' })">
      <div class="kpi-icon" style="background:#FEF3C7">
        <svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" width="22" height="22">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26 12,2"/>
        </svg>
      </div>
      <div class="kpi-info">
        <div class="kpi-label">Wartość szans <wt-tooltip key="crm.sales.kpi.pipeline_value"></wt-tooltip></div>
        <div class="kpi-value kpi-value-sm">{{ fmtValue(kpiPipelineValue) }}</div>
        <div class="kpi-trend pos" *ngIf="chartChangePercent !== null && chartChangePercent > 0">
          ↑ {{ chartChangePercent }}% <span>vs poprzedni miesiąc</span>
        </div>
      </div>
    </div>

    <div class="kpi-card clickable" (click)="goToLeads({ stage: 'closed_won', label: 'Wygrane szanse' })">
      <div class="kpi-icon" style="background:#E6F4EA">
        <svg viewBox="0 0 24 24" fill="none" stroke="#3BAA5D" stroke-width="2" width="22" height="22">
          <polyline points="22,7 13.5,15.5 8.5,10.5 2,17"/>
          <polyline points="16,7 22,7 22,13"/>
        </svg>
      </div>
      <div class="kpi-info">
        <div class="kpi-label">Wygrane szanse <wt-tooltip key="crm.sales.kpi.won"></wt-tooltip></div>
        <div class="kpi-value">{{ kpiWonCount }}</div>
        <div class="kpi-trend pos" *ngIf="kpiWonCount > 0">
          <span>w tym miesiącu</span>
        </div>
      </div>
    </div>

  </div>

  <!-- ── ŚRODKOWY RZĄD ── -->
  <div class="mid-row">

    <!-- Pipeline -->
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">Pipeline sprzedaży <wt-tooltip key="crm.sales.pipeline"></wt-tooltip></span>
        <select class="mini-sel" [(ngModel)]="pipelineMode" (ngModelChange)="onPipelineModeChange()">
          <option value="value">Wartość</option>
          <option value="count">Ilość</option>
        </select>
      </div>

      <div class="pipeline-list" *ngIf="pipeline.length; else emptyPipe">
        <div class="pipe-row clickable" *ngFor="let row of pipeline" (click)="goToPipelineStage(row)">
          <div class="pipe-meta">
            <span class="pipe-label">{{ row.label }}</span>
            <span class="pipe-sub">{{ row.count }} szans</span>
          </div>
          <div class="pipe-bar-wrap">
            <div class="pipe-bar" [style.width.%]="row.barPct" [style.background]="row.color"></div>
          </div>
          <span class="pipe-val">
            {{ pipelineMode === 'value' ? (row.value | number:'1.0-0') + ' zł' : row.count }}
          </span>
        </div>
      </div>
      <ng-template #emptyPipe><div class="empty-msg">Brak danych pipeline</div></ng-template>

      <div class="pipe-total">
        Łączna wartość pipeline: <strong>{{ pipelineTotal | number:'1.0-0' }} zł</strong>
      </div>
    </div>

    <!-- Wykres sprzedaży -->
    <div class="panel chart-panel">
      <div class="panel-head">
        <span class="panel-title">Wyniki sprzedażowe <wt-tooltip key="crm.sales.chart"></wt-tooltip></span>
        <select class="mini-sel" [(ngModel)]="chartPeriod" (ngModelChange)="onChartPeriodChange()">
          <option value="7d">Tydzień</option>
          <option value="30d">Miesiąc</option>
          <option value="90d">Kwartał</option>
        </select>
      </div>

      <div class="chart-summary">
        <div class="chart-main-val">{{ fmtValueShort(chartCurrentValue) }}</div>
        <div class="chart-change pos" *ngIf="chartChangePercent !== null && chartChangePercent > 0">
          ↑ {{ chartChangePercent }}%
          <span class="chart-change-label">vs poprzedni okres</span>
        </div>
        <div class="chart-change neg" *ngIf="chartChangePercent !== null && chartChangePercent <= 0">
          ↓ {{ chartChangePercent | number:'1.0-0' }}%
          <span class="chart-change-label">vs poprzedni okres</span>
        </div>
      </div>

      <svg *ngIf="chartAreaPath" viewBox="0 0 400 110" preserveAspectRatio="none" class="chart-svg">
        <defs>
          <linearGradient id="sdGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3BAA5D" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#3BAA5D" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <path [attr.d]="chartAreaPath" fill="url(#sdGrad)"/>
        <polyline [attr.points]="chartPolyline" fill="none" stroke="#3BAA5D"
                  stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      <div class="chart-empty" *ngIf="!chartAreaPath">Brak danych sprzedażowych</div>

      <div class="chart-x" *ngIf="chartXLabels.length">
        <span *ngFor="let lbl of chartXLabels">{{ lbl }}</span>
      </div>
    </div>

    <!-- Zadania na dziś -->
    <div class="panel tasks-panel">
      <div class="panel-head">
        <span class="panel-title">Zadania na dziś <wt-tooltip key="crm.sales.tasks"></wt-tooltip></span>
        <span class="count-badge" *ngIf="todayTasks.length">{{ todayTasks.length }}</span>
        <a routerLink="/crm/calendar" class="icon-btn" title="Kalendarz">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </a>
      </div>

      <div class="task-list" *ngIf="todayTasks.length; else emptyTasks">
        <div *ngFor="let t of todayTasks; trackBy: trackById">
          <div class="task-item" [class.task-done]="t.status === 'closed'">
            <label class="task-check" (click)="$event.stopPropagation(); toggleTask(t)">
              <span class="check-box" [class.checked]="t.status === 'closed'">
                <svg *ngIf="t.status === 'closed'" viewBox="0 0 24 24" fill="none"
                     stroke="white" stroke-width="3" width="11" height="11">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
              </span>
            </label>
            <div class="task-body clickable" (click)="goToTaskSource(t)">
              <div class="task-title">{{ t.title }}</div>
              <div class="task-sub">{{ t.source_name }}</div>
            </div>
            <span class="task-time" [class.task-overdue]="isOverdue(t)">{{ taskTime(t) }}</span>
          </div>
          <div *ngIf="closingTask?.uid === t.uid" class="task-close-form" (click)="$event.stopPropagation()">
            <textarea class="task-close-ta" [(ngModel)]="taskCloseComment"
                      placeholder="Komentarz zamknięcia *" rows="2" autoFocus></textarea>
            <div class="task-close-btns">
              <button class="task-close-cancel" (click)="cancelCloseTask()">Anuluj</button>
              <button class="task-close-confirm" [disabled]="!taskCloseComment.trim()"
                      (click)="confirmCloseTaskDash()">Zamknij</button>
            </div>
          </div>
        </div>
      </div>
      <ng-template #emptyTasks>
        <div class="empty-msg">Brak zadań na dziś</div>
      </ng-template>

      <a routerLink="/crm/calendar" class="panel-link">Zobacz wszystkie zadania →</a>
    </div>

  </div>

  <!-- ── DOLNY RZĄD ── -->
  <div class="bot-row">

    <!-- Tabela szans -->
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">Najnowsze szanse <wt-tooltip key="crm.sales.recent_leads"></wt-tooltip></span>
      </div>

      <table class="leads-table" *ngIf="recentLeads.length; else emptyLeads">
        <thead>
          <tr>
            <th>Nazwa szansy</th>
            <th>Firma</th>
            <th>Wartość</th>
            <th>Etap</th>
            <th>Data zamknięcia</th>
            <th>Prawdopodobieństwo</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let lead of recentLeads; trackBy: trackById" class="clickable" (click)="goToLead(lead.id)">
            <td>
              <span class="lead-link">{{ lead.company }}</span>
            </td>
            <td class="text-muted">{{ lead.contact_name || lead.company }}</td>
            <td class="text-muted">
              {{ lead.value_pln ? (lead.value_pln | number:'1.0-0') + ' zł' : '—' }}
            </td>
            <td>
              <span class="stage-badge" [class]="stageClass(lead.stage)">
                {{ stageLabel(lead.stage) }}
              </span>
            </td>
            <td class="text-muted">
              {{ lead.close_date ? (lead.close_date | date:'dd.MM.yyyy') : '—' }}
            </td>
            <td>
              <div class="prob-wrap" *ngIf="lead.probability !== null && lead.probability !== undefined">
                <div class="prob-bar">
                  <div class="prob-fill"
                       [style.width.%]="lead.probability"
                       [class.high]="(lead.probability || 0) >= 70"
                       [class.med]="(lead.probability || 0) >= 40 && (lead.probability || 0) < 70">
                  </div>
                </div>
                <span class="prob-label">{{ lead.probability }}%</span>
              </div>
              <span *ngIf="lead.probability === null || lead.probability === undefined" class="text-muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
      <ng-template #emptyLeads><div class="empty-msg">Brak szans</div></ng-template>

      <a routerLink="/crm/leads" class="panel-link">Zobacz wszystkie szanse →</a>
    </div>

    <!-- Feed aktywności -->
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">Ostatnia aktywność <wt-tooltip key="crm.sales.activity"></wt-tooltip></span>
        <button class="panel-refresh-btn" (click)="refreshActivities()" title="Odśwież">↺</button>
      </div>

      <div class="activity-feed" *ngIf="recentActivities.length; else emptyAct"
           (scroll)="onActivityScroll($event)">
        <div class="act-item clickable" *ngFor="let a of recentActivities" (click)="goToSource(a)">
          <div class="act-icon-wrap" [style.background]="actBg(a.type)">
            {{ actIcon(a.type) }}
          </div>
          <div class="act-body">
            <div class="act-title">{{ a.title }}</div>
            <div class="act-sub">{{ a.source_name }}</div>
          </div>
          <span class="act-time">{{ actTime(a) }}</span>
        </div>
        <div *ngIf="activitiesLoading" class="act-loading">
          <div class="act-spinner"></div>
        </div>
        <div *ngIf="!activitiesHasMore && recentActivities.length > 0" class="act-end">
          Wszystkie aktywności załadowane
        </div>
      </div>
      <ng-template #emptyAct><div class="empty-msg">Brak aktywności</div></ng-template>
    </div>

    <!-- Widget: Ryzyko Churn -->
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">Ryzyko Churn</span>
        <span class="count-badge" *ngIf="churnCriticalCount > 0">{{ churnCriticalCount }}</span>
      </div>
      <div *ngIf="churnLoading" class="empty-msg">Ładowanie…</div>
      <div *ngIf="!churnLoading && churnRows.length === 0" class="empty-msg">Brak ryzyka churn</div>
      <div *ngIf="!churnLoading && churnRows.length > 0"
           style="display:flex;flex-direction:column;gap:6px;flex:1">
        <div *ngFor="let p of churnRows.slice(0, 5)"
             (click)="goToPartner(p.partner_id)"
             style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:7px 8px;border-radius:8px;transition:background .12s"
             (mouseenter)="$any($event.currentTarget).style.background='#F9FAFB'"
             (mouseleave)="$any($event.currentTarget).style.background=''">
          <span class="churn-badge" [class]="'risk-badge-' + p.risk_level">{{ riskLabel(p.risk_level) }}</span>
          <span style="flex:1;font-size:13px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.display_name }}</span>
          <span style="font-size:12px;font-weight:700;color:#6B7280;flex-shrink:0">{{ p.total_score }} pkt</span>
        </div>
      </div>
      <button class="panel-link" style="background:none;border:none;cursor:pointer;font-family:inherit;width:100%;text-align:left;padding:0"
              (click)="activeTab = 'churn'">Pokaż wszystkich partnerów z ryzykiem churn →</button>
    </div>

  </div>

  </ng-container><!-- end dashboard tab -->
</div>

<ng-template #loadingTpl>
  <div class="dash-loading"><div class="spinner"></div></div>
</ng-template>
  `,
  styles: [`
    .crm-dash { padding: 24px; overflow: auto; display: flex; flex-direction: column; gap: 20px; min-height: 100%; box-sizing: border-box; }

    /* Header */
    .dash-top { display: flex; align-items: flex-start; justify-content: space-between; }
    .dash-greeting h1 { font-size: 22px; font-weight: 800; margin: 0 0 4px; color: #111827; }
    .dash-greeting p { margin: 0; font-size: 13.5px; color: #6B7280; }
    .date-chip { display: flex; align-items: center; gap: 6px; border: 1px solid #E5E7EB; border-radius: 8px; padding: 7px 14px; font-size: 13px; color: #374151; background: white; white-space: nowrap; }

    /* KPI */
    .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
    .kpi-card { background: white; border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px 18px; display: flex; align-items: flex-start; gap: 14px; }
    .kpi-icon { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .kpi-info { flex: 1; min-width: 0; }
    .kpi-label { font-size: 11px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 4px; }
    .kpi-value { font-size: 28px; font-weight: 800; color: #111827; line-height: 1.1; }
    .kpi-value-sm { font-size: 18px; }
    .kpi-trend { display: flex; align-items: center; gap: 5px; margin-top: 5px; font-size: 12px; font-weight: 600; }
    .kpi-trend.pos { color: #3BAA5D; }
    .kpi-trend.neg { color: #EF4444; }
    .kpi-trend span { font-weight: 400; color: #9CA3AF; }

    /* Grid layout */
    .mid-row { display: grid; grid-template-columns: 1fr 1.05fr 0.85fr; gap: 16px; }
    .bot-row { display: grid; grid-template-columns: 1.7fr 1fr 1fr; gap: 16px; }

    /* Panel */
    .panel { background: white; border: 1px solid #E5E7EB; border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; }
    .panel-head { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .panel-title { font-size: 14px; font-weight: 700; color: #1F2937; flex: 1; }
    .mini-sel { border: 1px solid #E5E7EB; border-radius: 7px; padding: 5px 10px; font-size: 12px; color: #374151; outline: none; cursor: pointer; background: white; }
    .panel-refresh-btn { background: none; border: none; cursor: pointer; color: #9CA3AF; font-size: 16px; padding: 2px 4px; border-radius: 4px; line-height: 1; transition: color .15s; }
    .panel-refresh-btn:hover { color: #3BAA5D; }
    .count-badge { background: var(--orange, #3BAA5D); color: white; font-size: 11px; font-weight: 700; border-radius: 10px; padding: 2px 8px; }
    .icon-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: 1px solid #E5E7EB; border-radius: 6px; color: #6B7280; text-decoration: none; }
    .icon-btn:hover { background: #F9FAFB; color: var(--orange, #3BAA5D); }
    .empty-msg { color: #9CA3AF; font-size: 13px; padding: 16px 0; text-align: center; flex: 1; }
    .panel-link { display: block; margin-top: auto; padding-top: 14px; font-size: 12.5px; color: var(--orange, #3BAA5D); text-decoration: none; font-weight: 600; }
    .panel-link:hover { text-decoration: underline; }

    /* Pipeline */
    .pipeline-list { display: flex; flex-direction: column; gap: 11px; flex: 1; }
    .pipe-row { display: flex; align-items: center; gap: 10px; }
    .pipe-meta { width: 90px; flex-shrink: 0; }
    .pipe-label { display: block; font-size: 12.5px; font-weight: 600; color: #374151; }
    .pipe-sub { font-size: 10.5px; color: #9CA3AF; }
    .pipe-bar-wrap { flex: 1; height: 10px; background: #F3F4F6; border-radius: 5px; overflow: hidden; }
    .pipe-bar { height: 100%; border-radius: 5px; transition: width .4s ease; }
    .pipe-val { font-size: 12px; font-weight: 600; color: #374151; min-width: 76px; text-align: right; white-space: nowrap; }
    .pipe-total { margin-top: 14px; padding-top: 12px; border-top: 1px solid #F3F4F6; font-size: 12px; color: #6B7280; }
    .pipe-total strong { color: #111827; }

    /* Chart */
    .chart-panel { }
    .chart-summary { margin-bottom: 10px; }
    .chart-main-val { font-size: 24px; font-weight: 800; color: #111827; }
    .chart-change { font-size: 13px; font-weight: 600; margin-top: 3px; }
    .chart-change.pos { color: #3BAA5D; }
    .chart-change.neg { color: #EF4444; }
    .chart-change-label { font-weight: 400; color: #9CA3AF; margin-left: 4px; }
    .chart-svg { width: 100%; height: 120px; display: block; flex: 1; }
    .chart-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #9CA3AF; font-size: 13px; min-height: 100px; }
    .chart-x { display: flex; justify-content: space-between; padding-top: 6px; }
    .chart-x span { font-size: 10.5px; color: #9CA3AF; }

    /* Tasks */
    .tasks-panel { }
    .task-list { display: flex; flex-direction: column; height: 288px; overflow-y: auto; overflow-x: hidden; flex-shrink: 0; scrollbar-width: none; }
    .task-list::-webkit-scrollbar { display: none; }
    .task-item { display: flex; align-items: center; gap: 10px; height: 48px; box-sizing: border-box; border-bottom: 1px solid #F9FAFB; flex-shrink: 0; overflow: hidden; }
    .task-item:last-child { border-bottom: none; }
    .task-done .task-title { text-decoration: line-through; color: #9CA3AF; }
    .task-check { display: flex; align-items: center; cursor: pointer; flex-shrink: 0; }
    .check-box { width: 18px; height: 18px; border: 2px solid #D1D5DB; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: all .15s; flex-shrink: 0; }
    .check-box.checked { background: var(--orange, #3BAA5D); border-color: var(--orange, #3BAA5D); }
    .task-body { flex: 1; min-width: 0; }
    .task-title { font-size: 12.5px; font-weight: 600; color: #1F2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .task-sub { font-size: 11px; color: #9CA3AF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .task-time { font-size: 12px; font-weight: 600; color: #3B82F6; flex-shrink: 0; }
    .task-overdue { color: #EF4444; }

    /* Leads table */
    .leads-table { width: 100%; border-collapse: collapse; font-size: 12.5px; flex: 1; }
    .leads-table th { text-align: left; padding: 6px 10px; color: #9CA3AF; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid #F3F4F6; }
    .leads-table td { padding: 10px 10px; border-bottom: 1px solid #F9FAFB; vertical-align: middle; }
    .leads-table tr:last-child td { border-bottom: none; }
    .lead-link { color: #1F2937; font-weight: 600; text-decoration: none; }
    .lead-link:hover { color: var(--orange, #3BAA5D); }
    .text-muted { color: #9CA3AF; }

    /* Stage badges */
    .stage-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
    .stage-lead   { background: #F3F4F6; color: #374151; }
    .stage-qual   { background: #DBEAFE; color: #1D4ED8; }
    .stage-offer  { background: white; color: #2563EB; border: 1.5px solid #BFDBFE; }
    .stage-neg    { background: #FEF3C7; color: #D97706; }
    .stage-won    { background: #D1FAE5; color: #065F46; }
    .stage-lost   { background: #FEE2E2; color: #991B1B; }

    /* Probability */
    .prob-wrap { display: flex; align-items: center; gap: 8px; }
    .prob-bar { flex: 1; height: 6px; background: #F3F4F6; border-radius: 3px; overflow: hidden; min-width: 50px; }
    .prob-fill { height: 100%; background: #D1D5DB; border-radius: 3px; }
    .prob-fill.high { background: #3BAA5D; }
    .prob-fill.med  { background: #F59E0B; }
    .prob-label { font-size: 11.5px; color: #6B7280; min-width: 30px; }

    /* Activity */
    .activity-feed { display: flex; flex-direction: column; gap: 14px; height: 300px; overflow-y: auto; overflow-x: hidden; flex-shrink: 0; scrollbar-width: thin; scrollbar-color: #E5E7EB transparent; }
    .activity-feed::-webkit-scrollbar { width: 4px; }
    .activity-feed::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 2px; }
    .activity-feed::-webkit-scrollbar-track { background: transparent; }
    .act-item { display: flex; align-items: flex-start; gap: 12px; flex-shrink: 0; min-width: 0; }
    .act-icon-wrap { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 16px; }
    .act-body { flex: 1; min-width: 0; overflow: hidden; }
    .act-title { font-size: 13px; font-weight: 600; color: #1F2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .act-sub { font-size: 11.5px; color: #9CA3AF; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .act-time { font-size: 11.5px; color: #9CA3AF; flex-shrink: 0; }
    .act-loading { display: flex; justify-content: center; padding: 10px 0; flex-shrink: 0; }
    .act-spinner { width: 16px; height: 16px; border: 2px solid #E5E7EB; border-top-color: #3BAA5D; border-radius: 50%; animation: spin .7s linear infinite; }
    .act-end { font-size: 11px; color: #D1D5DB; text-align: center; padding: 8px 0; flex-shrink: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Clickable */
    .clickable { cursor: pointer; }
    .kpi-card.clickable:hover { border-color: var(--orange, #3BAA5D); box-shadow: 0 2px 12px rgba(59,170,93,.12); transform: translateY(-1px); transition: all .15s; }
    .pipe-row.clickable:hover { background: #F9FAFB; border-radius: 8px; margin: 0 -6px; padding: 0 6px; }
    .act-item.clickable:hover { background: #F9FAFB; border-radius: 8px; margin: 0 -8px; padding: 4px 8px; }
    .task-body.clickable:hover .task-title { color: var(--orange, #3BAA5D); }
    .leads-table tr.clickable:hover td { background: #F9FAFB; }
    .leads-table tr.clickable:hover .lead-link { color: var(--orange, #3BAA5D); }

    /* Task close form */
    .task-close-form { padding: 6px 0 8px 28px; display: flex; flex-direction: column; gap: 6px; }
    .task-close-ta { width: 100%; border: 1px solid #D1D5DB; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-family: inherit; resize: vertical; box-sizing: border-box; outline: none; }
    .task-close-ta:focus { border-color: var(--orange, #3BAA5D); box-shadow: 0 0 0 2px rgba(59,170,93,.1); }
    .task-close-btns { display: flex; gap: 6px; justify-content: flex-end; }
    .task-close-cancel { background: white; border: 1px solid #E5E7EB; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer; font-family: inherit; }
    .task-close-cancel:hover { background: #F9FAFB; }
    .task-close-confirm { background: var(--orange, #3BAA5D); color: white; border: none; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .task-close-confirm:disabled { background: #D1D5DB; cursor: not-allowed; }
    .task-close-confirm:not(:disabled):hover { background: #2F8F4D; }

    /* Loading */
    .dash-loading { display: flex; align-items: center; justify-content: center; height: 50vh; }

    /* Tabs */
    .dash-tabs { display: flex; gap: 4px; border-bottom: 1px solid #E5E7EB; padding-bottom: 0; margin-bottom: 4px; }
    .dash-tab { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border: none; background: none; font-size: 13.5px; font-weight: 600; color: #6B7280; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; border-radius: 0; transition: color .15s; }
    .dash-tab:hover { color: #374151; }
    .dash-tab.active { color: var(--orange, #3BAA5D); border-bottom-color: var(--orange, #3BAA5D); }
    .tab-badge-red { background: #EF4444; color: white; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 1px 6px; }

    /* Churn Section */
    .churn-section { display: flex; flex-direction: column; gap: 14px; }
    .churn-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .churn-filter-inp { border: 1px solid #E5E7EB; border-radius: 8px; padding: 7px 12px; font-size: 13px; font-family: inherit; outline: none; min-width: 200px; }
    .churn-filter-inp:focus { border-color: var(--orange, #3BAA5D); box-shadow: 0 0 0 2px rgba(59,170,93,.1); }
    .churn-filter-sel { border: 1px solid #E5E7EB; border-radius: 8px; padding: 7px 12px; font-size: 13px; font-family: inherit; outline: none; cursor: pointer; background: white; }
    .churn-filter-spacer { flex: 1; }
    .churn-gen-btn { display: flex; align-items: center; gap: 6px; background: var(--orange, #3BAA5D); color: white; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; transition: background .15s; white-space: nowrap; }
    .churn-gen-btn:hover:not(:disabled) { background: var(--orange-dark, #2F8F4D); }
    .churn-gen-btn:disabled { background: #D1D5DB; cursor: not-allowed; }
    .churn-gen-result { display: flex; align-items: center; gap: 8px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #166534; }
    .churn-gen-close { background: none; border: none; cursor: pointer; color: #166534; font-size: 14px; padding: 0 0 0 8px; margin-left: auto; }
    .churn-list { display: flex; flex-direction: column; gap: 8px; }
    .churn-empty { text-align: center; color: #9CA3AF; font-size: 13.5px; padding: 40px 0; }
    .churn-loading { display: flex; align-items: center; justify-content: center; padding: 40px; }
    .churn-item { display: flex; align-items: center; gap: 14px; background: white; border: 1px solid #E5E7EB; border-radius: 10px; padding: 14px 18px 14px 0; cursor: pointer; transition: box-shadow .15s, border-color .15s; overflow: hidden; }
    .churn-item:hover { border-color: #D1D5DB; box-shadow: 0 2px 8px rgba(0,0,0,.07); }
    .churn-risk-bar { width: 4px; height: 56px; border-radius: 0 2px 2px 0; flex-shrink: 0; }
    .risk-critical .churn-risk-bar, .churn-risk-bar.risk-critical { background: #EF4444; }
    .risk-high     .churn-risk-bar, .churn-risk-bar.risk-high     { background: #F97316; }
    .risk-medium   .churn-risk-bar, .churn-risk-bar.risk-medium   { background: #F59E0B; }
    .risk-low      .churn-risk-bar, .churn-risk-bar.risk-low      { background: #3B82F6; }
    .churn-main { flex: 1; min-width: 0; }
    .churn-name { font-size: 14px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .churn-meta { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #9CA3AF; margin-top: 3px; }
    .churn-stats { display: flex; gap: 20px; flex-shrink: 0; }
    .churn-stat { display: flex; flex-direction: column; align-items: flex-end; }
    .churn-stat-val { font-size: 16px; font-weight: 700; color: #111827; }
    .churn-drop { color: #EF4444; }
    .churn-stat-lbl { font-size: 10.5px; color: #9CA3AF; white-space: nowrap; }
    .churn-score-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 90px; flex-shrink: 0; }
    .churn-badge { padding: 3px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
    .risk-badge-critical { background: #FEE2E2; color: #991B1B; }
    .risk-badge-high     { background: #FED7AA; color: #9A3412; }
    .risk-badge-medium   { background: #FEF3C7; color: #92400E; }
    .risk-badge-low      { background: #DBEAFE; color: #1E40AF; }
    .churn-score { font-size: 11.5px; color: #6B7280; }
    .churn-chevron { color: #D1D5DB; flex-shrink: 0; }
  `],
})
export class CrmSalesDashboardComponent implements OnInit, OnDestroy {
  private api      = inject(CrmApiService);
  private auth     = inject(AuthService);
  private cdr      = inject(ChangeDetectorRef);
  private router   = inject(Router);
  private route    = inject(ActivatedRoute);
  private settings = inject(AppSettingsService);

  private trainingRefreshInterval: ReturnType<typeof setInterval> | null = null;

  loading = true;

  // Tabs
  activeTab: 'dashboard' | 'churn' = 'dashboard';

  // Churn
  churnRows:       ChurnPartner[] = [];
  churnFiltered:   ChurnPartner[] = [];
  churnSettings:   ChurnSettings | null = null;
  churnLoading     = false;
  churnLoaded      = false;
  churnFilterName  = '';
  churnFilterRisk  = '';
  churnFilterSalesperson = '';
  churnGenerating  = false;
  churnGenResult:  { created: number; skipped: number; total: number } | null = null;
  churnSalespersons: { id: string; name: string }[] = [];

  get isCrmManager(): boolean {
    const u = this.auth.user();
    return !!(u?.is_admin || (u as any)?.crm_role === 'sales_manager');
  }

  get churnCriticalCount(): number {
    return this.churnRows.filter(r => r.risk_level === 'critical').length;
  }

// KPI
  kpiNewLeads          = 0;
  kpiNewLeadsChange:   number | null = null;
  kpiNewCompanies      = 0;
  kpiNewCompaniesChange: number | null = null;
  kpiActiveLeads       = 0;
  kpiPipelineValue     = 0;
  kpiWonCount          = 0;

  // Pipeline
  pipelineMode: 'value' | 'count' = 'value';
  pipeline: PipelineRow[] = [];
  pipelineTotal = 0;

  // Chart
  chartPeriod: '7d' | '30d' | '90d' = '30d';
  chartPolyline  = '';
  chartAreaPath  = '';
  chartCurrentValue = 0;
  chartPrevValue    = 0;
  chartXLabels: string[] = [];

  todayTasks:       ActivityTask[] = [];
  recentLeads:      Lead[] = [];
  recentActivities: any[]  = [];

  activitiesOffset  = 0;
  activitiesLoading = false;
  activitiesHasMore = true;

  closingTask:       ActivityTask | null = null;
  taskCloseComment = '';

  private allLeads: Lead[] = [];

  get firstName(): string {
    const name = this.auth.user()?.display_name || this.auth.user()?.email || '';
    return name.split(' ')[0] || 'użytkowniku';
  }

  get weekRange(): string {
    const now = new Date();
    const day = now.getDay() || 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - day + 1);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return `${mon.getDate()} – ${sun.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }

  get chartChangePercent(): number | null {
    if (!this.chartPrevValue) return null;
    return Math.round((this.chartCurrentValue - this.chartPrevValue) / this.chartPrevValue * 100);
  }

  ngOnInit() {
    this.route.queryParams.subscribe(p => {
      if (p['tab'] === 'churn') {
        this.activeTab = 'churn';
        this.cdr.markForCheck();
      }
    });
    forkJoin({
      dashboard: this.api.getDashboard(),
      leads:     this.api.getLeads({ limit: 100, page: 1 }),
      tasks:     this.api.getCrmTasks(),
    }).subscribe({
      next: ({ dashboard, leads, tasks }) => {
        this.allLeads = (leads as any).data || [];
        this.processPipeline(dashboard.pipeline || []);
        this.processLeads(this.allLeads);
        this.processTasks(tasks);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
    this.refreshActivities();
    this.loadChurn();
    this.trainingRefreshInterval = setInterval(() => {
      if (this.settings.settings().crm_training_mode) {
        this.api.getCrmTasks().subscribe({ next: tasks => { this.processTasks(tasks); this.cdr.markForCheck(); } });
        this.refreshActivities();
      }
    }, 30_000);
  }

  ngOnDestroy() {
    if (this.trainingRefreshInterval) clearInterval(this.trainingRefreshInterval);
  }

  refreshActivities() {
    this.activitiesOffset  = 0;
    this.activitiesHasMore = true;
    this.activitiesLoading = true;
    this.cdr.markForCheck();
    this.api.getDashboardActivities(0, 20).subscribe({
      next: rows => {
        this.recentActivities  = rows;
        this.activitiesOffset  = rows.length;
        this.activitiesHasMore = rows.length === 20;
        this.activitiesLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.activitiesLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  onActivityScroll(event: Event) {
    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      this.loadMoreActivities();
    }
  }

  loadMoreActivities() {
    if (this.activitiesLoading || !this.activitiesHasMore) return;
    this.activitiesLoading = true;
    this.cdr.markForCheck();
    this.api.getDashboardActivities(this.activitiesOffset, 20).subscribe({
      next: rows => {
        this.recentActivities  = [...this.recentActivities, ...rows];
        this.activitiesOffset += rows.length;
        this.activitiesHasMore = rows.length === 20;
        this.activitiesLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.activitiesLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadChurn() {
    if (this.churnLoaded) return;
    this.churnLoading = true;
    this.cdr.markForCheck();
    this.api.getChurnData().subscribe({
      next: ({ rows, settings }) => {
        this.churnRows     = rows;
        this.churnSettings = settings;
        this.churnLoaded   = true;
        this.buildChurnSalespersons();
        this.applyChurnFilters();
        this.churnLoading  = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.churnLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private buildChurnSalespersons() {
    const seen = new Map<string, string>();
    for (const r of this.churnRows) {
      if (r.salesperson_id && r.salesperson_name && !seen.has(r.salesperson_id)) {
        seen.set(r.salesperson_id, r.salesperson_name);
      }
    }
    this.churnSalespersons = [...seen.entries()].map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }

  onChurnFilter() {
    this.applyChurnFilters();
    this.cdr.markForCheck();
  }

  private applyChurnFilters() {
    let rows = this.churnRows;
    if (this.churnFilterName.trim()) {
      const q = this.churnFilterName.trim().toLowerCase();
      rows = rows.filter(r => r.display_name.toLowerCase().includes(q));
    }
    if (this.churnFilterRisk) {
      rows = rows.filter(r => r.risk_level === this.churnFilterRisk);
    }
    if (this.churnFilterSalesperson) {
      rows = rows.filter(r => r.salesperson_id === this.churnFilterSalesperson);
    }
    this.churnFiltered = rows;
  }

  generateChurnTasks() {
    if (this.churnGenerating) return;
    this.churnGenerating = true;
    this.churnGenResult  = null;
    this.cdr.markForCheck();
    this.api.generateChurnTasks().subscribe({
      next: result => {
        this.churnGenerating = false;
        this.churnGenResult  = result;
        // Odśwież listę
        this.churnLoaded = false;
        this.loadChurn();
        this.cdr.markForCheck();
      },
      error: () => {
        this.churnGenerating = false;
        this.cdr.markForCheck();
      },
    });
  }

  riskLabel(level: string): string {
    return ({ critical: 'Krytyczne', high: 'Wysokie', medium: 'Średnie', low: 'Niskie' } as Record<string,string>)[level] || level;
  }

  private processPipeline(raw: any[]) {
    const STAGES = [
      { stage: 'new',           label: 'Lead',        color: '#3B82F6' },
      { stage: 'qualification', label: 'Kwalifikacja', color: '#2563EB' },
      { stage: 'offer',         label: 'Oferta',       color: '#7C3AED' },
      { stage: 'negotiation',   label: 'Negocjacje',   color: '#F97316' },
      { stage: 'closed_won',    label: 'Wygrane',      color: '#3BAA5D' },
    ];
    const ACTIVE = ['new', 'qualification', 'presentation', 'offer', 'negotiation', 'onboarding', 'onboarded'];

    const map = new Map(raw.map(r => [r.stage, r]));

    this.pipeline = STAGES.map(s => ({
      ...s,
      count:  Number(map.get(s.stage)?.count)          || 0,
      value:  Number(map.get(s.stage)?.weighted_value) || 0,
      barPct: 0,
    }));

    this.kpiPipelineValue = raw.filter(r => ACTIVE.includes(r.stage))
      .reduce((s, r) => s + (Number(r.weighted_value) || 0), 0);
    this.kpiActiveLeads = raw.filter(r => ACTIVE.includes(r.stage))
      .reduce((s, r) => s + (Number(r.count) || 0), 0);
    this.kpiWonCount = Number(map.get('closed_won')?.count) || 0;
    this.pipelineTotal = this.pipeline.reduce((s, r) => s + r.value, 0);

    this.refreshBars();
  }

  private refreshBars() {
    const vals = this.pipeline.map(r => this.pipelineMode === 'value' ? r.value : r.count);
    const max  = Math.max(...vals, 1);
    this.pipeline = this.pipeline.map(r => ({
      ...r,
      barPct: Math.round((this.pipelineMode === 'value' ? r.value : r.count) / max * 100),
    }));
  }

  private processLeads(leads: Lead[]) {
    this.recentLeads = leads.slice(0, 5);

    const now     = new Date();
    const day     = now.getDay() || 7;
    const thisMon = new Date(now);
    thisMon.setDate(now.getDate() - day + 1);
    thisMon.setHours(0, 0, 0, 0);
    const lastMon = new Date(thisMon);
    lastMon.setDate(thisMon.getDate() - 7);

    const thisW = leads.filter(l => new Date(l.created_at) >= thisMon);
    const lastW = leads.filter(l => {
      const d = new Date(l.created_at);
      return d >= lastMon && d < thisMon;
    });

    this.kpiNewLeads       = thisW.length;
    this.kpiNewLeadsChange = lastW.length > 0
      ? Math.round((thisW.length - lastW.length) / lastW.length * 100) : null;

    const thisCo = new Set(thisW.map(l => l.company?.toLowerCase() || '')).size;
    const lastCo = new Set(lastW.map(l => l.company?.toLowerCase() || '')).size;
    this.kpiNewCompanies       = thisCo;
    this.kpiNewCompaniesChange = lastCo > 0
      ? Math.round((thisCo - lastCo) / lastCo * 100) : null;

    this.buildChart(leads, this.chartPeriod);
  }

  private processTasks(tasks: ActivityTask[]) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tmrw  = new Date(today); tmrw.setDate(today.getDate() + 1);
    this.todayTasks = tasks
      .filter(t => { if (!t.activity_at) return false; const d = new Date(t.activity_at); return d >= today && d < tmrw; })
      .sort((a, b) => new Date(a.activity_at!).getTime() - new Date(b.activity_at!).getTime())
      .slice(0, 6);
  }


  private buildChart(leads: Lead[], period: string) {
    const DAYS  = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const today = new Date();
    const daily = new Map<number, number>();

    leads.forEach(l => {
      if (!l.value_pln || !l.created_at) return;
      const da = Math.floor((today.getTime() - new Date(l.created_at).getTime()) / 86_400_000);
      if (da >= 0 && da < DAYS) daily.set(DAYS - 1 - da, (daily.get(DAYS - 1 - da) || 0) + l.value_pln);
    });

    let cum = 0;
    const cumVals: number[] = [];
    for (let i = 0; i < DAYS; i++) { cum += (daily.get(i) || 0); cumVals.push(cum); }
    this.chartCurrentValue = cum;

    let prev = 0;
    leads.forEach(l => {
      if (!l.value_pln || !l.created_at) return;
      const da = Math.floor((today.getTime() - new Date(l.created_at).getTime()) / 86_400_000);
      if (da >= DAYS && da < DAYS * 2) prev += l.value_pln;
    });
    this.chartPrevValue = prev;

    const W = 400, H = 110, PAD = 8;
    const maxV = Math.max(...cumVals, 1);
    const pts  = cumVals.map((v, i) => ({
      x: (i / Math.max(DAYS - 1, 1)) * W,
      y: H - PAD - (v / maxV) * (H - 2 * PAD),
    }));

    this.chartPolyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    this.chartAreaPath = `M0,${H} ` + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ` L${W},${H} Z`;

    this.chartXLabels = [0, 1, 2, 3, 4].map(i => {
      const da = DAYS - 1 - Math.round(i * (DAYS - 1) / 4);
      const d  = new Date(today);
      d.setDate(today.getDate() - da);
      return d.getDate() + ' ' + d.toLocaleDateString('pl-PL', { month: 'short' });
    });
  }

  onPipelineModeChange() { this.refreshBars(); }

  onChartPeriodChange() {
    this.buildChart(this.allLeads, this.chartPeriod);
    this.cdr.markForCheck();
  }

  toggleTask(task: ActivityTask) {
    if (task.source_type !== 'lead' && task.source_type !== 'partner') return;
    if (task.status === 'closed') {
      const prev = task.status;
      task.status = 'open';
      const call: Observable<any> = task.source_type === 'lead'
        ? this.api.updateLeadActivity(+task.source_id, task.id, { status: 'open' })
        : this.api.updatePartnerActivity(+task.source_id, task.id, { status: 'open' });
      call.subscribe({ error: () => { task.status = prev; this.cdr.markForCheck(); } });
    } else {
      this.closingTask = task;
      this.taskCloseComment = '';
    }
    this.cdr.markForCheck();
  }

  cancelCloseTask() {
    this.closingTask = null;
    this.taskCloseComment = '';
    this.cdr.markForCheck();
  }

  confirmCloseTaskDash() {
    const t = this.closingTask;
    if (!t || !this.taskCloseComment.trim()) return;
    if (t.source_type !== 'lead' && t.source_type !== 'partner') return;
    const comment = this.taskCloseComment.trim();
    const stamp = new Date().toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const newBody = t.body?.trim() ? `[Zamknięto ${stamp}]: ${comment}\n\n${t.body}` : `[Zamknięto ${stamp}]: ${comment}`;
    const prev = t.status;
    t.status = 'closed';
    const call: Observable<any> = t.source_type === 'lead'
      ? this.api.updateLeadActivity(+t.source_id, t.id, { status: 'closed', close_comment: comment, body: newBody })
      : this.api.updatePartnerActivity(+t.source_id, t.id, { status: 'closed', close_comment: comment, body: newBody });
    call.subscribe({
      next: () => {
        t.close_comment = comment;
        t.body = newBody;
        this.closingTask = null;
        this.taskCloseComment = '';
        this.cdr.markForCheck();
      },
      error: () => {
        t.status = prev;
        this.closingTask = null;
        this.taskCloseComment = '';
        this.cdr.markForCheck();
      },
    });
    this.cdr.markForCheck();
  }

  isOverdue(t: ActivityTask): boolean {
    return !!t.activity_at && new Date(t.activity_at) < new Date();
  }

  fmtValue(v: number): string {
    if (!v) return '0 zł';
    if (v >= 1_000) return Math.round(v / 1_000).toLocaleString('pl-PL') + ' tys. zł';
    return v.toLocaleString('pl-PL') + ' zł';
  }

  fmtValueShort(v: number): string {
    if (!v) return '0 zł';
    if (v >= 1_000) return Math.round(v / 1_000).toLocaleString('pl-PL') + ' tys. zł';
    return Math.round(v).toLocaleString('pl-PL') + ' zł';
  }

  taskTime(t: ActivityTask): string {
    return t.activity_at
      ? new Date(t.activity_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
      : '';
  }

  actTime(a: any): string {
    if (!a.activity_at) return '';
    const d   = new Date(a.activity_at);
    const tod = new Date(); tod.setHours(0, 0, 0, 0);
    const yes = new Date(tod); yes.setDate(tod.getDate() - 1);
    if (d >= tod) return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    if (d >= yes) return 'Wczoraj';
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  }

  actIcon(type: string): string {
    return ({ task:'✅', call:'📞', email:'📧', meeting:'🤝', note:'📝', doc_sent:'📄', training:'🎓', qbr:'📊' } as Record<string,string>)[type] || '💬';
  }

  actBg(type: string): string {
    return ({ task:'#D1FAE5', call:'#DCFCE7', email:'#DBEAFE', meeting:'#EDE9FE', note:'#FEF3C7', doc_sent:'#CFFAFE', training:'#F3E8FF' } as Record<string,string>)[type] || '#F3F4F6';
  }

  stageLabel(stage: string): string {
    return ({ new:'Lead', qualification:'Kwalifikacja', presentation:'Prezentacja', offer:'Oferta',
              negotiation:'Negocjacje', closed_won:'Wygrane', closed_lost:'Przegrane',
              onboarding:'Onboarding', onboarded:'Onboarded' } as Record<string,string>)[stage] || stage;
  }

  stageClass(stage: string): string {
    return ({ new:'stage-lead', qualification:'stage-qual', presentation:'stage-qual',
              offer:'stage-offer', negotiation:'stage-neg', closed_won:'stage-won',
              closed_lost:'stage-lost', onboarding:'stage-qual', onboarded:'stage-won' } as Record<string,string>)[stage] || 'stage-lead';
  }

  goToLeads(queryParams: Record<string, string> = {}) {
    this.router.navigate(['/crm/leads'], { queryParams: { view: 'table', mine: 'true', ...queryParams } });
  }

  goToLead(id: number) {
    this.router.navigate(['/crm/leads', id]);
  }

  goToPartner(id: string | number) {
    this.router.navigate(['/crm/partners', id]);
  }

  goToSource(a: any) {
    if (a.source_type === 'lead')       this.router.navigate(['/crm/leads',    a.source_id]);
    if (a.source_type === 'partner')    this.router.navigate(['/crm/partners', a.source_id]);
    if (a.source_type === 'onboarding') this.router.navigate(['/crm/onboarding'], { queryParams: { partner: a.source_id } });
    if (a.source_type === 'document')   this.router.navigate(['/documents', a.source_id]);
  }

  goToTaskSource(t: ActivityTask) {
    if (t.source_type === 'lead')       this.router.navigate(['/crm/leads',    t.source_id]);
    if (t.source_type === 'partner')    this.router.navigate(['/crm/partners', t.source_id]);
    if (t.source_type === 'onboarding') this.router.navigate(['/crm/onboarding'], { queryParams: { partner: t.source_id } });
    if (t.source_type === 'document')   this.router.navigate(['/documents', t.source_id]);
  }

  goToPipelineStage(row: PipelineRow) {
    this.router.navigate(['/crm/leads'], { queryParams: { stage: row.stage, label: row.label } });
  }

  trackById(_: number, item: { uid?: string; id?: any }) { return item.uid ?? item.id; }

  actTypeName(type: string): string {
    return ({ call:'Połączenie', email:'← Email', meeting:'Spotkanie',
              note:'Notatka', training:'Szkolenie', qbr:'QBR',
              doc_sent:'Dokument', task:'Zadanie' } as Record<string,string>)[type] || type;
  }

  actStatusLabel(s: string): string {
    return s === 'closed' ? 'zamknięta' : s === 'open' ? 'otwarta' : 'nowa';
  }

  stripHtml(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

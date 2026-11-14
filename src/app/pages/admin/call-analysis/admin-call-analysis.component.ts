// src/app/pages/admin/call-analysis/admin-call-analysis.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute, NavigationStart } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { CrmApiService, CrmUser } from '../../../core/services/crm-api.service';
import { NavBackService } from '../../../core/services/nav-back.service';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { localizedApiErrorMessage } from '../../../core/services/api-error.util';

const API = `${environment.apiUrl}/admin/call-analysis`;
const ROW_POLL_TIMEOUT_MS = 120000;

interface CallAnalysisRow {
  nip: string;
  company_name: string | null;
  city: string | null;
  calls_count: number;
  last_call_date: string | null;
  score: number | null;
  ai_summary: string | null;
  ai_signals: string[];
  ai_objections: string[];
  follow_up_required: boolean;
  follow_up_done: boolean;
  follow_up_date: string | null;
  salesperson: string | null;
  first_call_date: string | null;
  last_call_end_date: string | null;
  analysis_status: 'pending' | 'analyzing' | 'done' | 'error' | 'hold' | 'archived';
  analysis_error: string | null;
  analyzed_at: string | null;
  imported_at: string;
  crm_lead_id: number | null;
  notes_text: string | null;
  has_prospect: boolean;
  has_lead: boolean;
  lead_id: number | null;
  has_partner: boolean;
  partner_nav_id: string | null;
}

@Component({
  selector: 'wt-admin-call-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('crm')],
  template: `
<ng-container *transloco="let t; prefix: 'crm'">
<div style="display:flex;flex-direction:column;height:100%;background:var(--gray-50)" (click)="closeMenu()">

  <!-- HEADER -->
  <div style="background:var(--surface);border-bottom:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));padding:14px 24px;display:flex;align-items:center;gap:12px;flex-shrink:0">
    <div style="flex:1">
      <div style="font-size:18px;font-weight:700;color:var(--gray-800)">{{ t('callAnalysis.title') }}</div>
      <div style="font-size:12px;color:var(--gray-500);margin-top:1px">{{ t('callAnalysis.subtitle') }}</div>
    </div>

    <button *ngIf="rows.length && !batchProgress.running && pendingCount > 0"
            (click)="startBatch()"
            class="btn btn-p">
      ▶ {{ t('callAnalysis.header.analyze', { count: pendingCount }) }}
    </button>
    <button *ngIf="batchProgress.running" disabled
            class="btn btn-p">
      ⏳ {{ t('callAnalysis.header.analyzing') }}
    </button>
    <label class="btn btn-g">
      ⬆ {{ t('callAnalysis.header.importCsv') }}
      <input type="file" accept=".csv" (change)="onFileChange($event)" style="display:none">
    </label>
  </div>

  <!-- BACK LINK -->
  @if (navBack.ctx(); as ctx) {
    <div style="padding:4px 24px;background:var(--gray-50);border-bottom:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));flex-shrink:0">
      <button (click)="navigateBack()" class="btn btn-g btn-sm">
        ← {{ctx.label}}
      </button>
    </div>
  }

  <!-- PROGRESS BAR -->
  <div *ngIf="batchProgress.running || (batchProgress.total > 0 && !batchProgress.running)"
       style="background:var(--surface);border-bottom:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));padding:10px 24px;flex-shrink:0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:12px;color:var(--gray-700);font-weight:500">
        <ng-container *ngIf="batchProgress.running && batchStartedHere">{{ t('callAnalysis.progress.running') }}</ng-container>
        <ng-container *ngIf="batchProgress.running && !batchStartedHere">⚠ {{ t('callAnalysis.progress.runningOtherUser') }}</ng-container>
        <ng-container *ngIf="!batchProgress.running">{{ t('callAnalysis.progress.finished') }}</ng-container>
        &nbsp;{{ t('callAnalysis.progress.companies', { done: batchProgress.done, total: batchProgress.total }) }}
      </span>
      <span *ngIf="batchProgress.errors > 0" style="font-size:12px;color:oklch(from #ef4444 max(l, var(--text-min-l)) c h)">
        {{ t('callAnalysis.progress.errors', { count: batchProgress.errors }) }}
      </span>
    </div>
    <div style="height:6px;background:color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));border-radius:3px;overflow:hidden">
      <div [style.width.%]="batchProgress.total ? ((batchProgress.done + batchProgress.errors) / batchProgress.total * 100) : 0"
           style="height:100%;background:#3BAA5D;border-radius:3px;transition:width 0.3s ease"></div>
    </div>
  </div>

  <!-- BULK ACTION BAR -->
  <div *ngIf="selectedCount > 0"
       style="background:#1e3a5f;color:white;padding:8px 24px;display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap">
    <span style="font-size:14px;font-weight:600;margin-right:4px">{{ t('callAnalysis.bulk.selected', { count: selectedCount }) }}</span>
    <button (click)="bulkAction('set-status', 'hold')"
            class="ca-bulk-btn">
      ⏸ {{ t('callAnalysis.bulk.hold') }}
    </button>
    <button (click)="bulkAction('set-status', 'archived')"
            class="ca-bulk-btn">
      📦 {{ t('callAnalysis.actions.archive') }}
    </button>
    <button (click)="bulkAction('set-status', 'pending')"
            class="ca-bulk-btn">
      ▶ {{ t('callAnalysis.bulk.restore') }}
    </button>
    <button (click)="bulkAction('re-analyze')"
            class="ca-bulk-btn">
      🔄 {{ t('callAnalysis.actions.reanalyze') }}
    </button>
    <button (click)="bulkAction('delete')"
            class="ca-bulk-btn ca-bulk-del">
      🗑 {{ t('callAnalysis.bulk.deleteSelected') }}
    </button>
    <button (click)="cancelSelection()"
            class="ca-bulk-btn" style="margin-left:auto">
      ✕ {{ 'actions.cancel' | transloco }}
    </button>
  </div>

  <!-- FILTRY -->
  <div class="toolbar ca-filters">
    <input type="search" [placeholder]="t('callAnalysis.filters.searchPlaceholder')" [(ngModel)]="filters.search"
           (ngModelChange)="onFilterChange()" style="width:220px">
    <select class="sel" [(ngModel)]="filters.status" (ngModelChange)="onFilterChange()">
      <option value="">{{ t('callAnalysis.filters.allStatuses') }}</option>
      <option value="pending">{{ t('callAnalysis.statuses.pending') }}</option>
      <option value="analyzing">{{ t('callAnalysis.filters.statusAnalyzing') }}</option>
      <option value="done">{{ t('callAnalysis.statuses.done') }}</option>
      <option value="error">{{ t('callAnalysis.statuses.error') }}</option>
      <option value="hold">{{ t('callAnalysis.statuses.hold') }}</option>
      <option value="archived">{{ t('callAnalysis.statuses.archived') }}</option>
    </select>
    <div class="ca-grp">
      <span class="ca-lbl">{{ t('callAnalysis.filters.score') }}</span>
      <input type="number" [placeholder]="t('callAnalysis.filters.scoreMin')" [(ngModel)]="filters.score_min" (ngModelChange)="onFilterChange()" min="0" max="100" class="ca-num">
      <span class="ca-sep">–</span>
      <input type="number" [placeholder]="t('callAnalysis.filters.scoreMax')" [(ngModel)]="filters.score_max" (ngModelChange)="onFilterChange()" min="0" max="100" class="ca-num">
    </div>
    <select class="sel" [(ngModel)]="filters.follow_up" (ngModelChange)="onFilterChange()">
      <option value="">{{ t('callAnalysis.filters.allFollowUps') }}</option>
      <option value="required">📞 {{ t('callAnalysis.filters.followUpRequired') }}</option>
      <option value="done">✓ {{ t('callAnalysis.filters.followUpDone') }}</option>
    </select>
    <select class="sel" [(ngModel)]="filters.salesperson" (ngModelChange)="onFilterChange()">
      <option value="">{{ t('callAnalysis.filters.allSalespeople') }}</option>
      <option *ngFor="let u of crmUsers" [value]="u.display_name">{{u.display_name}}</option>
    </select>
    <select class="sel" [(ngModel)]="filters.link" (ngModelChange)="onFilterChange()">
      <option value="">{{ t('callAnalysis.filters.allLinks') }}</option>
      <option value="lead">🏷 {{ t('labels.sourceTypes.lead') }}</option>
      <option value="partner">🤝 {{ t('labels.sourceTypes.partner') }}</option>
      <option value="prospect">👁 {{ t('callAnalysis.links.prospect') }}</option>
      <option value="none">{{ t('callAnalysis.filters.noLinks') }}</option>
    </select>
    <span class="ca-lbl">{{ t('callAnalysis.filters.firstCall') }}</span>
    <input type="date" class="sel" [(ngModel)]="filters.first_call_from" (ngModelChange)="onFilterChange()">
    <span class="ca-sep">–</span>
    <input type="date" class="sel" [(ngModel)]="filters.first_call_to" (ngModelChange)="onFilterChange()">
    <span class="ca-lbl">{{ t('callAnalysis.filters.lastCall') }}</span>
    <input type="date" class="sel" [(ngModel)]="filters.last_call_from" (ngModelChange)="onFilterChange()">
    <span class="ca-sep">–</span>
    <input type="date" class="sel" [(ngModel)]="filters.last_call_to" (ngModelChange)="onFilterChange()">

    <!-- Follow-up date preset filter -->
    <div class="ca-grp">
      <span class="ca-lbl">{{ t('callAnalysis.filters.followUpDate') }}</span>
      <button *ngFor="let p of followUpDatePresets" class="fchip"
              (click)="setFollowUpDatePreset(p.value)"
              [class.on]="filters.follow_up_date_preset===p.value">
        {{ t(p.labelKey) }}
      </button>
      <ng-container *ngIf="filters.follow_up_date_preset==='custom'">
        <input type="date" class="sel" [(ngModel)]="filters.follow_up_date_from" (ngModelChange)="onFilterChange()">
        <span class="ca-sep">–</span>
        <input type="date" class="sel" [(ngModel)]="filters.follow_up_date_to" (ngModelChange)="onFilterChange()">
      </ng-container>
    </div>

    <span *ngIf="total > 0" class="ca-lbl ca-total">
      {{ t('callAnalysis.filters.total', { count: total }) }}
    </span>
  </div>

  <!-- IMPORT FEEDBACK -->
  <div *ngIf="importResult" [style.background]="importResult.error ? 'color-mix(in srgb, #fef2f2 var(--tint-mix), var(--surface))' : 'color-mix(in srgb, #f0fdf4 var(--tint-mix), var(--surface))'"
       style="border-bottom:1px solid;padding:10px 24px;font-size:14px;flex-shrink:0"
       [style.border-color]="importResult.error ? '#fca5a5' : '#86efac'"
       [style.color]="importResult.error ? 'oklch(from #dc2626 max(l, var(--text-min-l)) c h)' : 'oklch(from #15803d max(l, var(--text-min-l)) c h)'">
    <span *ngIf="importResult.error">⚠ {{importResult.error}}</span>
    <span *ngIf="!importResult.error">
      ✓ {{ t(importResult.created !== undefined ? 'callAnalysis.import.resultCreated' : 'callAnalysis.import.resultUpserted', {
          created: importResult.created, appended: importResult.appended, upserted: importResult.upserted,
          totalRows: importResult.total_rows,
          note1: importResult.note1_column_detected || '—', note2: importResult.note2_column_detected || '—'
        }) }}
    </span>
  </div>

  <!-- TABELA -->
  <div class="ca-table-card">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:var(--gray-100);border-bottom:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));position:sticky;top:0;z-index:1">
          <th style="padding:10px 12px;width:36px">
            <input type="checkbox" [checked]="allSelected && rows.length > 0" (change)="toggleSelectAll()"
                   style="cursor:pointer">
          </th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('company_name')">
            {{ t('callAnalysis.table.company') }} {{sortIcon('company_name')}}
          </th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;white-space:nowrap">
            {{ t('callAnalysis.table.taxId') }}
          </th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('salesperson')">
            {{ t('callAnalysis.table.salesperson') }} {{sortIcon('salesperson')}}
          </th>
          <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('calls_count')">
            {{ t('callAnalysis.table.calls') }} {{sortIcon('calls_count')}}
          </th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('first_call_date')">
            {{ t('callAnalysis.table.firstCall') }} {{sortIcon('first_call_date')}}
          </th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('last_call_end_date')">
            {{ t('callAnalysis.table.lastCall') }} {{sortIcon('last_call_end_date')}}
          </th>
          <th style="padding:10px 16px;text-align:center;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('score')">
            {{ t('callAnalysis.table.potential') }} {{sortIcon('score')}}
            <div class="ca-info-wrap" (click)="$event.stopPropagation()">
              <button class="ca-info">?</button>
              <div class="ca-info-tip">
                <div class="ca-info-tip-title">{{ t('callAnalysis.potentialHelp.title') }}</div>
                {{ t('callAnalysis.potentialHelp.description') }}<br><br>
                0–20 ✗ {{ t('callAnalysis.scoreLabels.notInterested') }}<br>
                21–40 ↓ {{ t('callAnalysis.scoreLabels.lowInterest') }}<br>
                41–60 → {{ t('callAnalysis.scoreLabels.moderateInterest') }}<br>
                61–80 ↑ {{ t('callAnalysis.scoreLabels.strongInterest') }}<br>
                81–100 ✓ {{ t('callAnalysis.scoreLabels.readyToBuy') }}<br><br>
                {{ t('callAnalysis.potentialHelp.footer') }}
              </div>
            </div>
          </th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;white-space:nowrap">
            {{ t('callAnalysis.table.status') }}
          </th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('analyzed_at')">
            {{ t('callAnalysis.table.analyzedAt') }} {{sortIcon('analyzed_at')}}
          </th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;white-space:nowrap;width:120px">{{ t('callAnalysis.table.links') }}</th>
          <th style="padding:10px 8px;text-align:center;width:44px"></th>
        </tr>
      </thead>
      <tbody>
        <ng-container *ngFor="let r of rows">
          <!-- Wiersz główny -->
          <tr (click)="toggleExpand(r.nip)"
              style="border-bottom:1px solid var(--gray-100);cursor:pointer;transition:background .1s"
              [style.background]="expandedNip === r.nip ? 'var(--gray-50)' : (isSelected(r.nip) ? 'color-mix(in srgb, #eff6ff var(--tint-mix), var(--surface))' : 'var(--surface)')"
              onmouseenter="this.style.background=this.getAttribute('data-expanded')==='true'?'#F0FDF4':this.getAttribute('data-selected')==='true'?'#dbeafe':'#f9fafb'"
              onmouseleave="this.style.background=this.getAttribute('data-expanded')==='true'?'#F0FDF4':this.getAttribute('data-selected')==='true'?'#eff6ff':'white'"
              [attr.data-expanded]="expandedNip === r.nip"
              [attr.data-selected]="isSelected(r.nip)">
            <td style="padding:10px 12px" (click)="$event.stopPropagation()">
              <input type="checkbox" [checked]="isSelected(r.nip)" (change)="toggleSelect(r.nip)"
                     style="cursor:pointer">
            </td>
            <td style="padding:10px 16px;font-weight:600;color:var(--gray-800)">
              {{r.company_name || '—'}}
            </td>
            <td style="padding:10px 16px;font-family:monospace;color:var(--gray-700)">
              {{r.nip}}
            </td>
            <td style="padding:10px 16px;color:var(--gray-700);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              {{r.salesperson || '—'}}
            </td>
            <td style="padding:10px 8px;text-align:right;color:var(--gray-700)">
              {{r.calls_count}}
            </td>
            <td style="padding:10px 8px;text-align:center;color:var(--gray-500);font-size:12px;white-space:nowrap">
              {{r.first_call_date ? (r.first_call_date | date:'dd.MM.yyyy') : '—'}}
            </td>
            <td style="padding:10px 8px;text-align:center;color:var(--gray-500);font-size:12px;white-space:nowrap">
              {{r.last_call_end_date ? (r.last_call_end_date | date:'dd.MM.yyyy') : '—'}}
            </td>
            <td style="padding:10px 16px;text-align:center">
              <span *ngIf="r.score !== null"
                    [style.background]="scoreBg(r.score)"
                    [style.color]="scoreColor(r.score)"
                    style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:26px;border-radius:16px;font-size:14px;font-weight:700">
                {{r.score}}
              </span>
              <span *ngIf="r.score === null" style="color:#d1d5db">—</span>
            </td>
            <td style="padding:10px 16px">
              <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px">
              <span [class]="statusClass(r.analysis_status)" style="font-size:12px;padding:2px 8px;border-radius:10px;font-weight:600">
                {{statusLabel(r.analysis_status)}}
              </span>
              <button *ngIf="r.follow_up_required && !r.follow_up_done"
                      (click)="toggleFollowUpDone(r, $event)"
                      [title]="t('callAnalysis.followUp.markDoneTitle')"
                      style="font-size:12px;padding:2px 8px;border-radius:10px;font-weight:600;background:color-mix(in srgb, #fef3c7 var(--tint-mix), var(--surface));color:oklch(from #92400e max(l, var(--text-min-l)) c h);border:1px solid #fde68a;white-space:nowrap;cursor:pointer">
                <svg viewBox="0 0 24 24" aria-hidden="true" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-1px;margin-right:4px"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>{{ t('callAnalysis.followUp.label') }}<span *ngIf="r.follow_up_date"> · {{r.follow_up_date | date:'dd.MM'}}</span>
              </button>
              <button *ngIf="r.follow_up_done"
                      (click)="toggleFollowUpDone(r, $event)"
                      [title]="t('callAnalysis.followUp.undoTitle')"
                      style="font-size:12px;padding:2px 8px;border-radius:10px;font-weight:600;background:var(--gray-100);color:var(--gray-400);border:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));white-space:nowrap;cursor:pointer;text-decoration:line-through">
                <svg viewBox="0 0 24 24" aria-hidden="true" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-1px;margin-right:4px"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>{{ t('callAnalysis.followUp.label') }}<span *ngIf="r.follow_up_date"> · {{r.follow_up_date | date:'dd.MM'}}</span>
              </button>
              </div>
            </td>
            <td style="padding:10px 16px;color:var(--gray-400);font-size:12px">
              {{r.analyzed_at ? (r.analyzed_at | date:'dd.MM.yyyy HH:mm') : '—'}}
            </td>
            <td style="padding:6px 8px;text-align:center">
              <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
                <button *ngIf="r.has_prospect"
                        (click)="goToProspect(r.nip, $event)"
                        [title]="t('callAnalysis.links.goToProspect')"
                        style="padding:2px 8px;background:var(--gray-50);border:1px solid color-mix(in srgb, #bbf7d0 var(--tint-mix), var(--surface));color:oklch(from #166534 max(l, var(--text-min-l)) c h);border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap">
                  ↗ {{ t('callAnalysis.links.prospect') }}
                </button>
                <button *ngIf="r.has_lead"
                        (click)="goToLead(r.lead_id, r.nip, $event)"
                        [title]="t('callAnalysis.links.goToLead')"
                        style="padding:2px 8px;background:color-mix(in srgb, #eff6ff var(--tint-mix), var(--surface));border:1px solid color-mix(in srgb, #bfdbfe var(--tint-mix), var(--surface));color:oklch(from #1d4ed8 max(l, var(--text-min-l)) c h);border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap">
                  ↗ {{ t('labels.sourceTypes.lead') }}
                </button>
                <button *ngIf="r.has_partner"
                        (click)="goToPartner(r.partner_nav_id, r.nip, $event)"
                        [title]="t('callAnalysis.links.goToPartner')"
                        style="padding:2px 8px;background:var(--gray-50);border:1px solid color-mix(in srgb, #bbf7d0 var(--tint-mix), var(--surface));color:oklch(from #15803d max(l, var(--text-min-l)) c h);border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap">
                  ↗ {{ t('labels.sourceTypes.partner') }}
                </button>
              </div>
            </td>
            <td style="padding:6px 8px;text-align:center" (click)="$event.stopPropagation()">
              <button (click)="openMenu(r.nip, $event)"
                      style="background:none;border:none;color:var(--gray-400);cursor:pointer;font-size:16px;padding:2px 8px;border-radius:4px;line-height:1"
                      onmouseenter="this.style.color='var(--gray-700)';this.style.background='var(--gray-100)'"
                      onmouseleave="this.style.color='var(--gray-400)';this.style.background='none'"
                      [title]="t('callAnalysis.table.actions')">⋮</button>
            </td>
          </tr>

          <!-- Rozwinięty panel szczegółów -->
          <tr *ngIf="expandedNip === r.nip">
            <td colspan="12" style="padding:0;background:color-mix(in srgb, #F0FDF4 var(--tint-mix), var(--surface));border-bottom:2px solid #3BAA5D">
              <div style="padding:16px 24px">
                <div *ngIf="r.analysis_status === 'error' && r.analysis_error"
                     style="color:oklch(from #dc2626 max(l, var(--text-min-l)) c h);font-size:12px;margin-bottom:8px">
                  ⚠ {{r.analysis_error}}
                </div>
                <div *ngIf="r.ai_summary" style="color:var(--gray-700);font-size:14px;margin-bottom:12px;line-height:1.5">
                  {{r.ai_summary}}
                </div>
                <div style="display:flex;gap:24px;flex-wrap:wrap">
                  <div *ngIf="r.ai_signals?.length">
                    <div style="font-size:12px;font-weight:700;color:oklch(from #15803d max(l, var(--text-min-l)) c h);text-transform:uppercase;margin-bottom:6px">✓ {{ t('callAnalysis.details.positiveSignals') }}</div>
                    <ul style="margin:0;padding:0 0 0 16px;list-style:none">
                      <li *ngFor="let s of r.ai_signals" style="font-size:12px;color:var(--gray-700);margin-bottom:4px;padding-left:4px">
                        <span style="color:oklch(from #22c55e max(l, var(--text-min-l)) c h);margin-right:6px">●</span>{{s}}
                      </li>
                    </ul>
                  </div>
                  <div *ngIf="r.ai_objections?.length">
                    <div style="font-size:12px;font-weight:700;color:oklch(from #dc2626 max(l, var(--text-min-l)) c h);text-transform:uppercase;margin-bottom:6px">✗ {{ t('callAnalysis.details.objections') }}</div>
                    <ul style="margin:0;padding:0 0 0 16px;list-style:none">
                      <li *ngFor="let o of r.ai_objections" style="font-size:12px;color:var(--gray-700);margin-bottom:4px;padding-left:4px">
                        <span style="color:oklch(from #ef4444 max(l, var(--text-min-l)) c h);margin-right:6px">●</span>{{o}}
                      </li>
                    </ul>
                  </div>
                </div>
                <div style="margin-top:10px;font-size:12px;color:var(--gray-400);display:flex;gap:16px">
                  <span>{{ t('callAnalysis.details.callsLabel') }} {{r.calls_count}}</span>
                  <span *ngIf="r.last_call_date">{{ t('callAnalysis.details.lastCallLabel') }} {{r.last_call_date | date:'dd.MM.yyyy'}}</span>
                  <span *ngIf="r.imported_at">{{ t('callAnalysis.details.importedLabel') }} {{r.imported_at | date:'dd.MM.yyyy HH:mm'}}</span>
                </div>

                <!-- Transkrypcja rozmów -->
                <div *ngIf="r.notes_text" style="margin-top:16px">
                  <div (click)="toggleTranscript(r.nip, $event)" class="transcript-toggle">
                    <span style="font-size:10px;margin-right:4px">{{ transcriptExpanded.has(r.nip) ? '▼' : '▶' }}</span>
                    📋 {{ t('callAnalysis.transcript.title', { count: getTranscripts(r).length }) }}
                  </div>
                  <div *ngIf="transcriptExpanded.has(r.nip)">
                    <div *ngFor="let chunk of getTranscripts(r); let i = index"
                         style="margin-bottom:12px;background:var(--surface);border:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));border-radius:8px;overflow:hidden">
                      <div style="background:var(--gray-50);border-bottom:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));padding:6px 12px;font-size:12px;font-weight:600;color:var(--gray-500)">
                        {{ chunk.label || t('callAnalysis.transcript.callNumber', { number: i + 1 }) }}
                      </div>
                      <div class="transcript-body">{{ chunk.text }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </ng-container>

        <tr *ngIf="!loading && rows.length === 0">
          <td colspan="12" style="padding:60px 24px;text-align:center;color:var(--gray-400)">
            <div style="font-size:32px;margin-bottom:8px">{{ hasActiveFilters ? '🔍' : '📞' }}</div>
            <div style="font-size:14px;font-weight:500">{{ hasActiveFilters ? t('callAnalysis.empty.noResults') : t('callAnalysis.empty.noNotes') }}</div>
            <div *ngIf="!hasActiveFilters" style="font-size:12px;margin-top:4px">{{ t('callAnalysis.empty.hint') }}</div>
          </td>
        </tr>

        <tr *ngIf="loading">
          <td colspan="12" style="padding:40px 24px;text-align:center;color:var(--gray-400);font-size:14px">
            {{ 'states.loading' | transloco }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- PAGINACJA -->
  <div *ngIf="pages > 1" style="background:var(--surface);border-top:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));padding:10px 24px;display:flex;align-items:center;justify-content:center;gap:8px;flex-shrink:0">
    <button class="nav-btn" [disabled]="page <= 1" (click)="goPage(page - 1)">‹</button>
    <span style="font-size:14px;color:var(--gray-700)">{{page}} / {{pages}}</span>
    <button class="nav-btn" [disabled]="page >= pages" (click)="goPage(page + 1)">›</button>
  </div>

  <!-- MENU KONTEKSTOWE (⋮) -->
  <div *ngIf="openMenuNip"
       (click)="$event.stopPropagation()"
       [style.top.px]="menuPos.top"
       [style.left.px]="menuPos.left"
       style="position:fixed;z-index:9999;background:var(--surface);border:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:190px;padding:4px 0">
    <ng-container *ngFor="let r of rows">
      <ng-container *ngIf="r.nip === openMenuNip">
        <button (click)="setStatus(r.nip, r.analysis_status === 'hold' ? 'pending' : 'hold', $event)"
                style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;font-size:14px;color:var(--gray-700);cursor:pointer"
                onmouseenter="this.style.background='color-mix(in srgb, #fef2f2 var(--tint-mix), var(--surface))'"
                onmouseleave="this.style.background='none'">
          {{r.analysis_status === 'hold' ? '▶ ' + t('callAnalysis.menu.restoreFromHold') : '⏸ ' + t('callAnalysis.menu.putOnHold')}}
        </button>
        <button (click)="setStatus(r.nip, r.analysis_status === 'archived' ? 'pending' : 'archived', $event)"
                style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;font-size:14px;color:var(--gray-700);cursor:pointer"
                onmouseenter="this.style.background='var(--gray-50)'"
                onmouseleave="this.style.background='none'">
          {{r.analysis_status === 'archived' ? '📤 ' + t('callAnalysis.menu.restoreFromArchive') : '📦 ' + t('callAnalysis.actions.archive')}}
        </button>
        <button (click)="reAnalyze(r.nip, $event)"
                style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;font-size:14px;color:var(--gray-700);cursor:pointer"
                onmouseenter="this.style.background='var(--gray-50)'"
                onmouseleave="this.style.background='none'">
          🔄 {{ t('callAnalysis.actions.reanalyze') }}
        </button>
        <button (click)="openInspect(r, $event)"
                style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;font-size:14px;color:var(--gray-700);cursor:pointer"
                onmouseenter="this.style.background='var(--gray-50)'"
                onmouseleave="this.style.background='none'">
          🔍 {{ t('callAnalysis.menu.inspect') }}
        </button>
        <div style="height:1px;background:color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));margin:4px 0"></div>
        <button (click)="deleteRow(r, $event)"
                style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;font-size:14px;color:oklch(from #dc2626 max(l, var(--text-min-l)) c h);cursor:pointer"
                onmouseenter="this.style.background='var(--gray-50)'"
                onmouseleave="this.style.background='none'">
          🗑 {{ t('callAnalysis.menu.delete') }}
        </button>
      </ng-container>
    </ng-container>
  </div>

  <!-- INSPEKCJA — overlay -->
  <div *ngIf="inspectRow"
       style="position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.45)"
       (click)="closeInspect()">
  </div>

  <!-- INSPEKCJA — modal -->
  <div *ngIf="inspectRow"
       (click)="$event.stopPropagation()"
       style="position:fixed;z-index:2001;top:4vh;left:50%;transform:translateX(-50%);
              width:min(960px,calc(100vw - 32px));max-height:92vh;background:var(--surface);
              border-radius:12px;box-shadow:0 14px 43px rgba(0,0,0,0.252);
              display:flex;flex-direction:column;overflow:hidden">

    <!-- Header -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:14px 18px 12px;border-bottom:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));flex-shrink:0">
      <div style="display:flex;flex-direction:column;gap:4px">
        <span style="font-size:10px;color:var(--gray-400);font-weight:700;text-transform:uppercase;letter-spacing:.6px">🔍 {{ t('callAnalysis.inspect.title') }}</span>
        <span style="font-size:16px;font-weight:700;color:oklch(from #3baa5d max(l, var(--text-min-l)) c h)">
          {{inspectRow.company_name || '—'}}
          <span style="font-size:12px;font-weight:400;color:var(--gray-400);font-family:monospace"> · {{inspectRow.nip}}</span>
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="display:flex;gap:2px;background:var(--gray-100);padding:4px;border-radius:8px">
          <button (click)="inspectView='analysis'"
                  [style.background]="inspectView==='analysis'?'var(--surface)':'transparent'"
                  [style.box-shadow]="inspectView==='analysis'?'0 1px 3px rgba(0,0,0,.1)':'none'"
                  [style.color]="inspectView==='analysis'?'var(--ink-strong)':'var(--gray-500)'"
                  style="padding:4px 14px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:500">
            {{ t('callAnalysis.inspect.tabAnalysis') }}
          </button>
          <button (click)="switchInspectToPrompt()"
                  [style.background]="inspectView==='prompt'?'var(--surface)':'transparent'"
                  [style.box-shadow]="inspectView==='prompt'?'0 1px 3px rgba(0,0,0,.1)':'none'"
                  [style.color]="inspectView==='prompt'?'var(--ink-strong)':'var(--gray-500)'"
                  style="padding:4px 14px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:500">
            {{ t('callAnalysis.inspect.tabPrompt') }}
          </button>
        </div>
        <button (click)="closeInspect()"
                style="width:28px;height:28px;border:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));border-radius:6px;background:none;cursor:pointer;font-size:14px;color:var(--gray-500);line-height:1">
          ✕
        </button>
      </div>
    </div>

    <!-- TAB: Analiza AI -->
    <ng-container *ngIf="inspectView==='analysis'">
      <div style="display:grid;grid-template-columns:210px 1fr;flex:1;min-height:0;overflow:hidden">

        <!-- Lewa kolumna: score + follow-up + status -->
        <div style="padding:14px;border-right:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));overflow-y:auto;display:flex;flex-direction:column;gap:12px">

          <div style="background:var(--gray-50);border:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">{{ t('callAnalysis.inspect.purchasePotential') }}</div>
            <ng-container *ngIf="inspectRow.score !== null">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="flex:1;height:8px;background:color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));border-radius:4px;overflow:hidden">
                  <div [style.width.%]="inspectRow.score" [style.background]="scoreColor(inspectRow.score)"
                       style="height:100%;border-radius:4px"></div>
                </div>
                <span [style.color]="scoreColor(inspectRow.score)" style="font-size:22px;font-weight:800;min-width:32px;text-align:right">
                  {{inspectRow.score}}
                </span>
              </div>
              <div style="font-size:12px;color:var(--gray-500);margin-top:4px">{{scoreLabel(inspectRow.score)}}</div>
            </ng-container>
            <div *ngIf="inspectRow.score === null" style="color:var(--gray-400);font-size:14px">{{ t('callAnalysis.inspect.noScore') }}</div>
          </div>

          <div style="background:var(--gray-50);border:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">{{ t('callAnalysis.followUp.label') }}</div>
            <div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
              <span [style.color]="inspectRow.follow_up_required?'oklch(from #15803d max(l, var(--text-min-l)) c h)':'var(--gray-500)'" style="font-weight:600">
                {{inspectRow.follow_up_required ? '✓ ' + t('callAnalysis.followUp.required') : '— ' + t('callAnalysis.followUp.notRequired')}}
              </span>
              <span *ngIf="inspectRow.follow_up_date" style="color:var(--gray-700)">
                📅 {{inspectRow.follow_up_date | date:'dd.MM.yyyy'}}
              </span>
              <span *ngIf="inspectRow.follow_up_done" style="color:var(--gray-400);text-decoration:line-through;font-size:12px">✓ {{ t('callAnalysis.followUp.done') }}</span>
            </div>
          </div>

          <div style="background:var(--gray-50);border:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">{{ t('callAnalysis.inspect.analysisStatus') }}</div>
            <div style="display:flex;flex-direction:column;gap:4px">
              <span [class]="statusClass(inspectRow.analysis_status)" style="font-size:12px;padding:2px 8px;border-radius:10px;font-weight:600;align-self:flex-start">
                {{statusLabel(inspectRow.analysis_status)}}
              </span>
              <span *ngIf="inspectRow.analyzed_at" style="font-size:12px;color:var(--gray-400)">
                {{inspectRow.analyzed_at | date:'dd.MM.yyyy HH:mm'}}
              </span>
            </div>
          </div>
        </div>

        <!-- Prawa kolumna: summary + sygnały + obiekcje -->
        <div style="padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:14px">
          <div *ngIf="inspectRow.ai_summary">
            <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">{{ t('callAnalysis.inspect.aiSummary') }}</div>
            <div style="font-size:14px;line-height:1.6;color:var(--gray-700);background:var(--gray-50);border:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));border-radius:8px;padding:10px 12px">
              {{inspectRow.ai_summary}}
            </div>
          </div>

          <div *ngIf="inspectRow.ai_signals?.length">
            <div style="font-size:10px;font-weight:700;color:oklch(from #15803d max(l, var(--text-min-l)) c h);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">
              ✓ {{ t('callAnalysis.details.positiveSignals') }} ({{inspectRow.ai_signals.length}})
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              <div *ngFor="let s of inspectRow.ai_signals"
                   style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;background:var(--gray-50);border:1px solid color-mix(in srgb, #bbf7d0 var(--tint-mix), var(--surface));border-radius:6px;font-size:12px;color:var(--gray-700)">
                <span style="color:oklch(from #22c55e max(l, var(--text-min-l)) c h);font-weight:700;flex-shrink:0;margin-top:1px">●</span>{{s}}
              </div>
            </div>
          </div>

          <div *ngIf="inspectRow.ai_objections?.length">
            <div style="font-size:10px;font-weight:700;color:oklch(from #991b1b max(l, var(--text-min-l)) c h);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">
              ✗ {{ t('callAnalysis.details.objections') }} ({{inspectRow.ai_objections.length}})
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              <div *ngFor="let o of inspectRow.ai_objections"
                   style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;background:var(--gray-50);border:1px solid color-mix(in srgb, #fecaca var(--tint-mix), var(--surface));border-radius:6px;font-size:12px;color:var(--gray-700)">
                <span style="color:oklch(from #ef4444 max(l, var(--text-min-l)) c h);font-weight:700;flex-shrink:0;margin-top:1px">●</span>{{o}}
              </div>
            </div>
          </div>

          <div *ngIf="!inspectRow.ai_summary && !inspectRow.ai_signals?.length && !inspectRow.ai_objections?.length"
               style="text-align:center;color:var(--gray-400);font-size:14px;padding:32px">
            {{ t('callAnalysis.inspect.noResults') }}
          </div>
        </div>
      </div>

      <!-- Stopka: notatki z rozmów -->
      <div *ngIf="inspectRow.notes_text"
           style="border-top:1px solid color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));background:var(--gray-50);flex-shrink:0;max-height:200px;overflow-y:auto">
        <div style="padding:10px 14px">
          <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">
            {{ t('callAnalysis.inspect.basis', { chars: inspectRow.notes_text.length, calls: getTranscripts(inspectRow).length }) }}
          </div>
          <pre style="margin:0;font-family:monospace;font-size:12px;line-height:1.6;color:var(--gray-700);white-space:pre-wrap;word-break:break-word">{{inspectRow.notes_text}}</pre>
        </div>
      </div>
    </ng-container>

    <!-- TAB: Prompt DeepSeek -->
    <ng-container *ngIf="inspectView==='prompt'">
      <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column">
        <div *ngIf="inspectPromptLoading"
             style="display:flex;align-items:center;justify-content:center;height:200px;gap:10px;color:var(--gray-400);font-size:14px">
          <span class="ca-spin"></span> {{ t('callAnalysis.inspect.promptLoading') }}
        </div>
        <pre *ngIf="!inspectPromptLoading && inspectPromptText"
             style="flex:1;overflow:auto;margin:0;padding:16px 20px;font-family:monospace;font-size:12px;line-height:1.6;color:var(--gray-800);white-space:pre-wrap;word-break:break-word;background:var(--gray-50)">{{inspectPromptText}}</pre>
      </div>
    </ng-container>

  </div>

</div>
</ng-container>
  `,
  styles: [`
    /* Filter bar = same white shadow card as the leads list (border/shadow/padding from global .toolbar) */
    .toolbar { background:var(--surface); display:flex; align-items:center; gap:8px 12px; flex-wrap:wrap; flex-shrink:0; margin:16px 24px 0; }
    /* Same gutter as the filter card above, with a gap between them, as on Leads. */
    .ca-table-card { flex:1; min-height:0; overflow:auto; margin:16px 24px 24px; background:var(--surface); border-radius:var(--radius); box-shadow:var(--shadow-sm); }
    /* Selects and date fields use the global .sel / select look (36px, chevron, 12px radius) — only the number fields are local. */
    .ca-grp { display:flex; align-items:center; gap:8px; white-space:nowrap; }
    .ca-lbl { font-size:12px; font-weight:500; color:var(--gray-500); white-space:nowrap; }
    .ca-sep { font-size:12px; color:var(--gray-400); }
    .ca-total { margin-left:auto; }
    .ca-grp .fchip { font-family:inherit; }
    .ca-num { width:64px; height:36px; box-sizing:border-box; padding:0 12px; font-family:inherit; font-size:12px; border:1px solid var(--gray-200); border-radius:12px; background:var(--surface); box-shadow:0 1px 2px rgba(0,0,0,.05); color:var(--gray-800); }
    .ca-num:focus { outline:none; border-color:var(--orange); box-shadow:0 0 0 3px rgba(59,170,93,.2); }
    .ca-bulk-btn { display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 14px; background:rgba(255,255,255,0.15); color:white; border:1px solid rgba(255,255,255,0.3); border-radius:10px; font-size:12px; font-weight:500; font-family:inherit; cursor:pointer; }
    .ca-bulk-btn:hover { background:rgba(255,255,255,0.25); }
    .ca-bulk-del { background:rgba(239,68,68,0.3); color:#fca5a5; border-color:rgba(239,68,68,0.4); }

    .status-pending   { background:color-mix(in srgb, #fef3c7 var(--tint-mix), var(--surface));color:oklch(from #92400e max(l, var(--text-min-l)) c h) }
    .status-analyzing { background:color-mix(in srgb, #dbeafe var(--tint-mix), var(--surface));color:oklch(from #1e40af max(l, var(--text-min-l)) c h) }
    .status-done      { background:color-mix(in srgb, #dcfce7 var(--tint-mix), var(--surface));color:oklch(from #15803d max(l, var(--text-min-l)) c h) }
    .status-error     { background:color-mix(in srgb, #fee2e2 var(--tint-mix), var(--surface));color:oklch(from #991b1b max(l, var(--text-min-l)) c h) }
    .status-hold      { background:var(--gray-100);color:var(--gray-700) }
    .status-archived  { background:color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface));color:var(--gray-500) }

    /* Tooltip "?" dla kolumny Potencjał */
    .ca-info-wrap {
      position: relative;
      display: inline-flex;
      justify-content: center;
      margin-left: 4px;
      vertical-align: middle;
    }
    .ca-info {
      width: 16px; height: 16px;
      border-radius: 50%;
      border: 1px solid var(--gray-300);
      background: var(--gray-50);
      color: var(--gray-400);
      font-size: 10px; font-weight: 700;
      cursor: help;
      display: inline-flex; align-items: center; justify-content: center;
      padding: 0; line-height: 1;
    }
    .ca-info:hover { background: color-mix(in srgb, #f0f9ff var(--tint-mix), var(--surface)); border-color: #3BAA5D; color: oklch(from #3baa5d max(l, var(--text-min-l)) c h); }
    .ca-info-tip {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: #1f2937;
      color: #f9fafb;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 12px;
      min-width: 240px;
      max-width: 300px;
      z-index: 9999;
      line-height: 1.6;
      white-space: normal;
      text-align: left;
      font-weight: normal;
      text-transform: none;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      pointer-events: none;
    }
    .ca-info-tip-title {
      font-weight: 700;
      margin-bottom: 6px;
      color: #fff;
      font-size: 14px;
    }
    .ca-info-wrap:hover .ca-info-tip { display: block; }

    /* Transkrypcja rozmów */
    .transcript-toggle {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 700;
      color: var(--gray-500);
      text-transform: uppercase;
      letter-spacing: .5px;
      padding: 6px 0;
      margin-bottom: 8px;
      user-select: none;
    }
    .transcript-toggle:hover { color: oklch(from #3baa5d max(l, var(--text-min-l)) c h); }
    .transcript-body {
      padding: 12px 14px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--gray-700);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 320px;
      overflow-y: auto;
    }

    /* Spinner inspekcji */
    @keyframes ca-spin-kf { to { transform: rotate(360deg); } }
    .ca-spin {
      display: inline-block;
      width: 16px; height: 16px;
      border: 2px solid color-mix(in srgb, #bbf7d0 var(--tint-mix), var(--surface));
      border-top-color: #3BAA5D;
      border-radius: 50%;
      animation: ca-spin-kf 0.75s linear infinite;
      vertical-align: middle;
    }
  `],
})
export class AdminCallAnalysisComponent implements OnInit, OnDestroy {
  private http    = inject(HttpClient);
  private cdr     = inject(ChangeDetectorRef);
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);
  private crmApi  = inject(CrmApiService);
  navBack         = inject(NavBackService);
  private transloco = inject(TranslocoService);

  crmUsers: CrmUser[] = [];

  rows: CallAnalysisRow[] = [];
  total = 0;
  page  = 1;
  pages = 1;
  loading = false;
  expandedNip: string | null = null;
  transcriptExpanded = new Set<string>();
  importResult: any = null;

  filters = {
    search: '', status: '', score_min: '', score_max: '', follow_up: '',
    salesperson: '', link: '',
    first_call_from: '', first_call_to: '',
    last_call_from: '',  last_call_to: '',
    follow_up_date_preset: '',
    follow_up_date_from:   '',
    follow_up_date_to:     '',
  };

  readonly followUpDatePresets = [
    { value: 'today',          labelKey: 'callAnalysis.filters.presets.today' },
    { value: 'today_tomorrow', labelKey: 'callAnalysis.filters.presets.todayTomorrow' },
    { value: 'next_2_days',    labelKey: 'callAnalysis.filters.presets.nextTwoDays' },
    { value: 'this_week',      labelKey: 'callAnalysis.filters.presets.thisWeek' },
    { value: 'custom',         labelKey: 'callAnalysis.filters.presets.custom' },
  ];

  get hasActiveFilters(): boolean {
    const f = this.filters;
    return !!(f.search || f.status || f.score_min || f.score_max || f.follow_up ||
              f.salesperson || f.link || f.first_call_from || f.first_call_to ||
              f.last_call_from || f.last_call_to || f.follow_up_date_from || f.follow_up_date_to);
  }

  sortField = 'imported_at';
  sortDir: 'asc' | 'desc' = 'desc';

  batchProgress = { total: 0, done: 0, errors: 0, analyzing: 0, pending: 0, running: false };
  batchStartedHere = false;
  private pollTimer: any;
  private rowPollTimer: any;
  private filterTimer: any;
  private routerSub: any;

  selectedNips = new Set<string>();
  openMenuNip: string | null = null;
  menuPos = { top: 0, left: 0 };

  inspectRow: CallAnalysisRow | null = null;
  inspectView: 'analysis' | 'prompt' = 'analysis';
  inspectPromptText: string | null = null;
  inspectPromptLoading = false;

  get pendingCount(): number {
    return this.rows.filter(r => r.analysis_status === 'pending' || r.analysis_status === 'error').length;
  }

  get selectedCount(): number {
    return this.selectedNips.size;
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every(r => this.selectedNips.has(r.nip));
  }

  ngOnInit() {
    const searchParam = this.route.snapshot.queryParamMap.get('search');
    if (searchParam) this.filters.search = searchParam;
    this.crmApi.getCrmUsers().subscribe({ next: u => { this.crmUsers = u; this.cdr.markForCheck(); } });
    this.loadBatchStatus();
    this.load();
    this.routerSub = this.router.events.subscribe(e => {
      if (e instanceof NavigationStart) this.transcriptExpanded.clear();
    });
  }

  ngOnDestroy() {
    clearInterval(this.pollTimer);
    clearInterval(this.rowPollTimer);
    clearTimeout(this.filterTimer);
    this.routerSub?.unsubscribe();
  }

  load() {
    this.loading = true;
    const params: any = {
      page: this.page, limit: 50,
      sort: this.sortField, dir: this.sortDir,
    };
    if (this.filters.search)           params.search           = this.filters.search;
    if (this.filters.status)           params.status           = this.filters.status;
    if (this.filters.score_min)        params.score_min        = this.filters.score_min;
    if (this.filters.score_max)        params.score_max        = this.filters.score_max;
    if (this.filters.follow_up)        params.follow_up        = this.filters.follow_up;
    if (this.filters.salesperson)      params.salesperson      = this.filters.salesperson;
    if (this.filters.link)             params.link             = this.filters.link;
    if (this.filters.first_call_from)  params.first_call_from  = this.filters.first_call_from;
    if (this.filters.first_call_to)    params.first_call_to    = this.filters.first_call_to;
    if (this.filters.last_call_from)       params.last_call_from       = this.filters.last_call_from;
    if (this.filters.last_call_to)         params.last_call_to         = this.filters.last_call_to;
    if (this.filters.follow_up_date_from)  params.follow_up_date_from  = this.filters.follow_up_date_from;
    if (this.filters.follow_up_date_to)    params.follow_up_date_to    = this.filters.follow_up_date_to;

    this.http.get<any>(API, { params }).subscribe({
      next: d => {
        this.rows   = d.rows;
        this.total  = d.total;
        this.pages  = d.pages;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; },
    });
  }

  onFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';

    const fd = new FormData();
    fd.append('file', file);

    this.importResult = null;
    this.http.post<any>(`${API}/import`, fd).subscribe({
      next: r => {
        this.importResult = r;
        this.load();
        this.loadBatchStatus();
      },
      error: e => {
        this.importResult = { error: localizedApiErrorMessage(e.error?.error, this.transloco) || this.transloco.translate('crm.callAnalysis.import.failed') };
      },
    });
  }

  startBatch() {
    this.http.post<any>(`${API}/analyze-batch`, {}).subscribe({
      next: r => {
        if (!r.alreadyRunning) this.batchStartedHere = true;
        this.startPolling();
      },
      error: e => console.error('Batch start error', e),
    });
  }

  loadBatchStatus() {
    this.http.get<any>(`${API}/batch-status`).subscribe({
      next: p => {
        this.batchProgress = p;
        if (p.running) this.startPolling();
        this.cdr.markForCheck();
      },
    });
  }

  goToProspect(nip: string, event: Event) {
    event.stopPropagation();
    this.navBack.set({ label: this.transloco.translate('crm.callAnalysis.title'), route: ['/admin/call-analysis'], queryParams: { search: nip }, targetUrlPrefix: '/admin/prospects' });
    this.router.navigate(['/admin/prospects'], { queryParams: { search: nip } });
  }

  goToLead(id: number | null, nip: string, event: Event) {
    event.stopPropagation();
    if (id) {
      this.navBack.set({ label: this.transloco.translate('crm.callAnalysis.title'), route: ['/admin/call-analysis'], queryParams: { search: nip }, targetUrlPrefix: '/crm/leads' });
      this.router.navigate(['/crm/leads', id]);
    }
  }

  goToPartner(navId: string | null, nip: string, event: Event) {
    event.stopPropagation();
    if (navId) {
      this.navBack.set({ label: this.transloco.translate('crm.callAnalysis.title'), route: ['/admin/call-analysis'], queryParams: { search: nip }, targetUrlPrefix: '/crm/partners' });
      this.router.navigate(['/crm/partners', navId]);
    }
  }

  navigateBack() {
    const ctx = this.navBack.ctx();
    if (!ctx) return;
    this.navBack.clear();
    this.router.navigate(ctx.route, { queryParams: ctx.queryParams });
  }

  private startPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.http.get<any>(`${API}/batch-status`).subscribe(p => {
        this.batchProgress = p;
        if (!p.running) {
          clearInterval(this.pollTimer);
          this.load();
        }
        this.cdr.markForCheck();
      });
    }, 2000);
  }

  setFollowUpDatePreset(preset: string) {
    if (this.filters.follow_up_date_preset === preset && preset !== 'custom') {
      // toggle off
      this.filters.follow_up_date_preset = '';
      this.filters.follow_up_date_from   = '';
      this.filters.follow_up_date_to     = '';
      this.onFilterChange();
      return;
    }
    this.filters.follow_up_date_preset = preset;
    const today = new Date();
    const fmt   = (d: Date) => d.toISOString().slice(0, 10);
    const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

    if (preset === 'today') {
      this.filters.follow_up_date_from = fmt(today);
      this.filters.follow_up_date_to   = fmt(today);
    } else if (preset === 'today_tomorrow') {
      this.filters.follow_up_date_from = fmt(today);
      this.filters.follow_up_date_to   = fmt(addDays(today, 1));
    } else if (preset === 'next_2_days') {
      this.filters.follow_up_date_from = fmt(today);
      this.filters.follow_up_date_to   = fmt(addDays(today, 2));
    } else if (preset === 'this_week') {
      const dow = today.getDay(); // 0=Sun
      const mon = addDays(today, dow === 0 ? -6 : 1 - dow);
      this.filters.follow_up_date_from = fmt(mon);
      this.filters.follow_up_date_to   = fmt(addDays(mon, 6));
    } else if (preset === 'custom') {
      // leave from/to for user to fill
    }

    if (preset !== 'custom') this.onFilterChange();
  }

  onFilterChange() {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => { this.page = 1; this.load(); }, 400);
  }

  setSort(field: string) {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'desc';
    }
    this.page = 1;
    this.load();
  }

  sortIcon(field: string): string {
    if (this.sortField !== field) return '';
    return this.sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  toggleTranscript(nip: string, event: Event) {
    event.stopPropagation();
    if (this.transcriptExpanded.has(nip)) {
      this.transcriptExpanded.delete(nip);
    } else {
      this.transcriptExpanded.add(nip);
    }
  }

  getTranscripts(r: CallAnalysisRow): { label: string; date: Date | null; text: string }[] {
    if (!r.notes_text) return [];
    const chunks = r.notes_text.split(/\n\n---\n\n|\n---\n/).filter(s => s.trim().length > 0);
    const parsed = chunks.map(chunk => {
      const m = chunk.match(/^\[CALL_DATE:([^\]]+)\]\n?/);
      let label = '';
      let date: Date | null = null;
      let text = chunk;
      if (m) {
        label = m[1].trim();
        text = chunk.slice(m[0].length);
        const iso = label.replace(/^(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1');
        const d = new Date(iso);
        if (!isNaN(d.getTime())) date = d;
      }
      return { label, date, text: this.cleanTranscriptText(text) };
    });
    const hasDates = parsed.some(c => c.date !== null);
    if (hasDates) {
      return parsed.sort((a, b) => {
        if (a.date && b.date) return b.date.getTime() - a.date.getTime();
        return a.date ? -1 : b.date ? 1 : 0;
      });
    }
    return [...parsed].reverse();
  }

  private cleanTranscriptText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')       // strip HTML tags
      .replace(/^---+\s*$/gm, '')    // remove stray --- lines
      .replace(/\n{3,}/g, '\n\n')    // collapse triple+ blank lines
      .trim();
  }

  toggleExpand(nip: string) {
    this.expandedNip = this.expandedNip === nip ? null : nip;
  }

  goPage(p: number) { this.page = p; this.load(); }

  // ── Selekcja ────────────────────────────────────────────────────────

  isSelected(nip: string): boolean {
    return this.selectedNips.has(nip);
  }

  toggleSelect(nip: string) {
    if (this.selectedNips.has(nip)) this.selectedNips.delete(nip);
    else this.selectedNips.add(nip);
    this.cdr.markForCheck();
  }

  toggleSelectAll() {
    if (this.allSelected) {
      this.selectedNips.clear();
    } else {
      this.rows.forEach(r => this.selectedNips.add(r.nip));
    }
    this.cdr.markForCheck();
  }

  cancelSelection() {
    this.selectedNips.clear();
    this.cdr.markForCheck();
  }

  bulkAction(action: string, status?: string) {
    const nips = Array.from(this.selectedNips);
    if (!nips.length) return;
    if (action === 'delete' && !confirm(this.transloco.translate('crm.callAnalysis.confirm.deleteSelected', { count: nips.length }))) return;

    const body: any = { action, nips };
    if (status) body.status = status;

    this.http.post<any>(`${API}/bulk`, body).subscribe({
      next: r => {
        this.selectedNips.clear();
        this.load();
        if (action === 're-analyze' && r?.started) {
          if (r.nips?.length === 1) {
            this.startRowPolling(r.nips[0]);
          } else {
            this.batchStartedHere = true;
            this.startPolling();
          }
        }
        this.cdr.markForCheck();
      },
      error: e => alert(localizedApiErrorMessage(e.error?.error, this.transloco) || this.transloco.translate('crm.callAnalysis.errors.bulkFailed')),
    });
  }

  // ── Menu kontekstowe ─────────────────────────────────────────────────

  openMenu(nip: string, event: Event) {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    this.openMenuNip = nip;
    this.menuPos = { top: rect.bottom + 4, left: rect.right - 190 };
    this.cdr.markForCheck();
  }

  closeMenu() {
    if (this.openMenuNip) {
      this.openMenuNip = null;
      this.cdr.markForCheck();
    }
  }

  openInspect(r: CallAnalysisRow, event: Event) {
    event.stopPropagation();
    this.openMenuNip = null;
    this.inspectRow = r;
    this.inspectView = 'analysis';
    this.inspectPromptText = null;
    this.inspectPromptLoading = false;
    this.cdr.markForCheck();
  }

  closeInspect() {
    this.inspectRow = null;
    this.cdr.markForCheck();
  }

  switchInspectToPrompt() {
    this.inspectView = 'prompt';
    if (this.inspectPromptText !== null || this.inspectPromptLoading) return;
    const r = this.inspectRow;
    if (!r) return;
    this.inspectPromptLoading = true;
    this.cdr.markForCheck();
    this.http.get<{ promptText: string }>(`${API}/${r.nip}/inspect`).subscribe({
      next: d => { this.inspectPromptText = d.promptText; this.inspectPromptLoading = false; this.cdr.markForCheck(); },
      error: () => { this.inspectPromptText = this.transloco.translate('crm.callAnalysis.inspect.promptFailed'); this.inspectPromptLoading = false; this.cdr.markForCheck(); },
    });
  }

  toggleFollowUpDone(r: CallAnalysisRow, event: Event) {
    event.stopPropagation();
    const newDone = !r.follow_up_done;
    this.http.patch<any>(`${API}/${r.nip}/follow-up-done`, { done: newDone }).subscribe({
      next: () => {
        r.follow_up_done = newDone;
        this.cdr.markForCheck();
      },
      error: e => alert(localizedApiErrorMessage(e.error?.error, this.transloco) || this.transloco.translate('crm.callAnalysis.errors.followUpUpdateFailed')),
    });
  }

  setStatus(nip: string, status: string, event: Event) {
    event.stopPropagation();
    this.openMenuNip = null;
    this.http.patch<any>(`${API}/${nip}/status`, { status }).subscribe({
      next: () => {
        const row = this.rows.find(r => r.nip === nip);
        if (row) (row as any).analysis_status = status;
        this.cdr.markForCheck();
      },
      error: e => alert(localizedApiErrorMessage(e.error?.error, this.transloco) || this.transloco.translate('crm.callAnalysis.errors.statusChangeFailed')),
    });
  }

  reAnalyze(nip: string, event: Event) {
    event.stopPropagation();
    this.openMenuNip = null;
    this.http.post<any>(`${API}/${nip}/re-analyze`, {}).subscribe({
      next: () => {
        const row = this.rows.find(r => r.nip === nip);
        if (row) (row as any).analysis_status = 'analyzing';
        this.startRowPolling(nip);
        this.cdr.markForCheck();
      },
      error: e => alert(localizedApiErrorMessage(e.error?.error, this.transloco) || this.transloco.translate('crm.callAnalysis.errors.reanalyzeFailed')),
    });
  }

  // Re-analiza jednej firmy nie jest batchem — pasek postępu batcha pokazywałby
  // tu cudze liczby ("2 / 50 firm"), więc odpytujemy tylko o ten jeden wiersz.
  private startRowPolling(nip: string) {
    clearInterval(this.rowPollTimer);
    const startedAt = Date.now();
    this.rowPollTimer = setInterval(() => {
      if (Date.now() - startedAt > ROW_POLL_TIMEOUT_MS) {
        clearInterval(this.rowPollTimer);
        this.load();
        return;
      }
      this.http.get<any>(API, { params: { search: nip, limit: 1, page: 1 } }).subscribe(d => {
        const fresh = (d.rows || []).find((r: any) => r.nip === nip);
        if (!fresh || fresh.analysis_status === 'pending' || fresh.analysis_status === 'analyzing') return;
        clearInterval(this.rowPollTimer);
        this.load();
      });
    }, 2000);
  }

  deleteRow(r: CallAnalysisRow, event: Event) {
    event.stopPropagation();
    this.openMenuNip = null;
    if (!confirm(this.transloco.translate('crm.callAnalysis.confirm.deleteRow', { name: r.company_name || r.nip }))) return;
    this.http.delete(`${API}/${r.nip}`).subscribe({
      next: () => {
        this.rows = this.rows.filter(x => x.nip !== r.nip);
        this.total--;
        this.cdr.markForCheck();
      },
      error: e => alert(localizedApiErrorMessage(e.error?.error, this.transloco) || this.transloco.translate('crm.callAnalysis.errors.deleteFailed')),
    });
  }

  scoreBg(score: number): string {
    if (score >= 81) return '#dcfce7';
    if (score >= 61) return '#fef9c3';
    if (score >= 41) return '#ffedd5';
    return '#fee2e2';
  }

  scoreColor(score: number): string {
    if (score >= 81) return '#15803d';
    if (score >= 61) return '#a16207';
    if (score >= 41) return '#166534';
    return '#b91c1c';
  }

  statusLabel(s: string): string {
    return this.statusClass(s) ? this.transloco.translate('crm.callAnalysis.statuses.' + s) : s;
  }

  statusClass(s: string): string {
    const m: Record<string, string> = {
      pending:   'status-pending',
      analyzing: 'status-analyzing',
      done:      'status-done',
      error:     'status-error',
      hold:      'status-hold',
      archived:  'status-archived',
    };
    return m[s] || '';
  }

  scoreLabel(score: number): string {
    if (score >= 81) return '✓ ' + this.transloco.translate('crm.callAnalysis.scoreLabels.readyToBuy');
    if (score >= 61) return '↑ ' + this.transloco.translate('crm.callAnalysis.scoreLabels.strongInterest');
    if (score >= 41) return '→ ' + this.transloco.translate('crm.callAnalysis.scoreLabels.moderateInterest');
    if (score >= 21) return '↓ ' + this.transloco.translate('crm.callAnalysis.scoreLabels.lowInterest');
    return '✗ ' + this.transloco.translate('crm.callAnalysis.scoreLabels.notInterested');
  }
}

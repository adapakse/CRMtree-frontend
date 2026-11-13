// src/app/pages/crm/leads/crm-leads-list.component.ts
import {
  Component, OnInit, OnDestroy, inject, ChangeDetectorRef, NgZone, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActTypeIconComponent } from './act-type-icon.component';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  CrmApiService, Lead, LEAD_SOURCES, LeadSource, CrmUser, CrmGroup, CalendarMeeting,
} from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ProjectTaskNavigationService } from '../../../core/services/project-task-navigation.service';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { LeadStagesService } from '../../../core/services/lead-stages.service';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { LocaleService } from '../../../core/i18n/locale.service';
import { leadSourceLabelKey } from '../../../core/i18n/crm-label-keys';
import { PhoneInputComponent } from '../../../shared/components/phone-input/phone-input.component';
import { describeHttpError } from '../../../core/services/http-error-message';
import { amountError, scrollToFirstFieldError } from '../../../shared/utils/field-error.util';

const ACTIVITY_TYPES_WITH_LABEL = ['task', 'call', 'email', 'meeting', 'note', 'training', 'qbr', 'doc_sent', 'opportunity'];
const DEFAULT_SOURCE_GROUP_KEYS: Record<string, string> = { Marketing: 'marketing' };

@Component({
  selector: 'wt-crm-leads-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule, ActTypeIconComponent, PhoneInputComponent, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('crm')],
  template: `
<ng-container *transloco="let t; prefix: 'crm'">
<div id="topbar">
  <span class="page-title">{{ t('leadsList.title') }}</span>
  <span class="tsp"></span>
  <div class="srch-wrap">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    <input class="srch" type="search" [placeholder]="t('leadsList.searchPlaceholder')"
           [(ngModel)]="search" (ngModelChange)="onSearch()">
  </div>
  <button class="btn btn-g" routerLink="/crm/import">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    {{ t('leadsList.importCsv') }}
  </button>
  <button class="btn btn-p" (click)="openNew()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    {{ t('leadsList.newLead.title') }}
  </button>
</div>

<div id="content">

  <!-- ── Stat cards ── -->
  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-val">{{ stats.total }}</div>
      <div class="stat-lbl">{{ t('leadsList.stats.opportunities') }}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:oklch(from #f59e0b max(l, var(--text-min-l)) c h)">{{ stats.hot }}</div>
      <div class="stat-lbl">🔥 {{ t('leadsList.stats.hot') }}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color: var(--orange-text)">{{ formatPLN(stats.pipeline) }}</div>
      <div class="stat-lbl">{{ t('leadsList.stats.pipeline') }}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:oklch(from #16a34a max(l, var(--text-min-l)) c h)">{{ stats.won }}</div>
      <div class="stat-lbl">✓ {{ t('leadsList.stats.won') }}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:oklch(from #dc2626 max(l, var(--text-min-l)) c h)">{{ stats.lost }}</div>
      <div class="stat-lbl"><svg class="ic ic-red" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg> {{ t('leadsList.stats.lost') }}</div>
    </div>
  </div>

  <!-- ── Toolbar ── -->
  <div *ngIf="reportFilterLabel" style="display:flex;align-items:center;gap:8px;padding:6px 0 0 0;margin-bottom:-4px">
    <span style="background:color-mix(in srgb, #fff7ed var(--tint-mix), var(--surface));border:1px solid color-mix(in srgb, #fed7aa var(--tint-mix), var(--surface));border-radius:16px;padding:4px 12px;font-size:12px;font-weight:600;color:oklch(from #9a3412 max(l, var(--text-min-l)) c h);display:flex;align-items:center;gap:6px">
      📊 {{ t('leadsList.filters.reportFilter', { label: reportFilterLabel }) }}
      <span style="cursor:pointer;font-size:14px;color:oklch(from #9a3412 max(l, var(--text-min-l)) c h);line-height:1" (click)="clearReportFilter()">×</span>
    </span>
  </div>
  <!-- Persistent rep filter chip -->
  <div *ngIf="persistRepName" style="display:flex;align-items:center;gap:8px;padding:4px 0 0 0;margin-bottom:-4px">
    <span style="background:color-mix(in srgb, #eff6ff var(--tint-mix), var(--surface));border:1px solid color-mix(in srgb, #bfdbfe var(--tint-mix), var(--surface));border-radius:16px;padding:4px 12px;font-size:12px;font-weight:600;color:oklch(from #1d4ed8 max(l, var(--text-min-l)) c h);display:flex;align-items:center;gap:6px">
      👤 {{ t('leadsList.filters.repChip', { name: persistRepName }) }}
      <span style="cursor:pointer;font-size:14px;line-height:1" (click)="clearPersistRepFilter()">×</span>
    </span>
  </div>
  <div class="toolbar">
    <span class="fchip" [class.on]="scopeFilter==='all'"  (click)="setScope('all')">{{ t('leadsList.filters.all') }}</span>
    <span class="fchip" [class.on]="scopeFilter==='mine'" (click)="setScope('mine')">{{ t('leadsList.filters.mine') }}</span>
    <span class="fchip" [class.on]="filterHot"            (click)="filterHot=!filterHot; load()">🔥 {{ t('leadsList.filters.hot') }}</span>
    <span class="fchip" [class.on]="filterHoldOnly"       (click)="filterHoldOnly=!filterHoldOnly; load()" [title]="t('leadsList.filters.holdOnlyTitle')">⏸️ {{ t('leadsList.filters.holdOnly') }}</span>
    <span style="flex:1"></span>
    <select class="sel" [(ngModel)]="filterStageUI" (ngModelChange)="onStageFilterChange()">
      <option value="">{{ t('leadsList.filters.allStages') }}</option>
      @for (s of stages.selectable(); track s.key) {
        <option [value]="s.key">{{ stageOptionPrefix(s.kind) }}{{ stages.label(s.key) }}</option>
      }
      <option value="archived">🗄️ {{ stages.label('archived') }}</option>
    </select>
    <select class="sel" [(ngModel)]="filterSource" (ngModelChange)="onSourceFilterChange()">
      <option value="">{{ t('leadsList.filters.allSources') }}</option>
      @for (s of sourcesWithoutGroup(); track s.value) {
        <option [value]="s.value">{{ sourceOptionLabel(s) }}</option>
      }
      @for (g of sourceGroups(); track g) {
        <optgroup [label]="sourceGroupLabel(g)">
          <option [value]="'__group__' + g">📂 {{ t('leadsList.filters.wholeGroup', { group: sourceGroupLabel(g) }) }}</option>
        </optgroup>
        @for (s of sourcesInGroup(g); track s.value) {
          <option [value]="s.value">{{ sourceOptionLabel(s) }}</option>
        }
      }
    </select>
    <select class="sel" [(ngModel)]="filterUser" (ngModelChange)="onRepFilterChange($event)" *ngIf="isManager">
      <option value="">{{ t('leadsList.filters.allReps') }}</option>
      <optgroup [label]="t('leadsList.filters.repsGroup')" *ngIf="crmUsers.length > 0">
        <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
      </optgroup>
      <optgroup [label]="t('leadsList.filters.groupsGroup')" *ngIf="crmGroups.length > 0">
        <option *ngFor="let g of crmGroups" [value]="'__group__' + g.id">👥 {{ g.name }}</option>
      </optgroup>
    </select>
    <!-- Views sit on their own row, bottom-right of the filter card (same on every list). -->
    <div class="view-row">
      <div class="date-range view-row-start" [class.on]="filterCreatedFrom || filterCreatedTo" [title]="t('leadsList.filters.addedRangeTitle')">
        <span class="date-range-lbl">{{ t('leadsList.fields.addedOn') }}</span>
        <input type="date" class="sel" [(ngModel)]="filterCreatedFrom" (ngModelChange)="load()" [max]="filterCreatedTo || null">
        <span class="date-range-sep">–</span>
        <input type="date" class="sel" [(ngModel)]="filterCreatedTo" (ngModelChange)="load()" [min]="filterCreatedFrom || null">
        <span *ngIf="filterCreatedFrom || filterCreatedTo" class="date-range-x" (click)="filterCreatedFrom=''; filterCreatedTo=''; load()" [title]="t('leadsList.filters.clearDates')">×</span>
      </div>
      <button class="btn btn-g btn-sm" (click)="openTimeline()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        {{ t('leadsList.view.timeline') }}
      </button>
      <span class="fchip" [class.on]="isKanbanView" (click)="setViewMode('kanban')">{{ t('leadsList.view.kanban') }}</span>
      <span class="fchip" [class.on]="!isKanbanView" (click)="setViewMode('table')">{{ t('leadsList.view.table') }}</span>
    </div>
  </div>

  <!-- Loading -->
  <div *ngIf="loading" class="loading-state">
    <div class="spinner"></div>{{ t('leadsList.loading') }}
  </div>

  <!-- ════ KANBAN ════ -->
  <div *ngIf="!loading && isKanbanView" class="kanban-wrap">

    <div class="kanban">
      <!-- Kolumny aktywne -->
      <div *ngFor="let col of kanbanColumns()" class="kol">
        <div class="kol-head">
          <div class="kol-dot" [style.background]="stages.color(col.key)"></div>
          <span class="kol-title">{{ stages.label(col.key) }}</span>
          <span class="kol-cnt">{{ leadsFor(col.key).length }}</span>
          <span class="kol-val" *ngIf="valueFor(col.key)>0">{{ valueFor(col.key) }}k</span>
        </div>
        <div class="kol-cards">
          <div *ngFor="let lead of leadsFor(col.key); trackBy:trackById"
               class="lead-card" [class.selected]="selected?.id===lead.id" [class.lead-card-held]="lead.hold_active"
               (click)="selectLead(lead)">
            <div class="lead-company" style="display:flex;align-items:center;gap:6px">
              <span *ngIf="hasLogo(lead)" class="logo-circle" [style.background-image]="logoSasMap[lead.id] || ''"></span>
              {{ lead.company }}<span *ngIf="lead.hot" class="hot-dot">🔥</span><span *ngIf="lead.hold_active" class="hold-badge" [title]="lead.hold_reason">⏸️ {{ t('leadsList.kanban.holdBadge') }}</span><span *ngIf="lead.stage==='onboarded'" [title]="t('leadsList.kanban.onboardedTitle')" style="font-size:10px;background:color-mix(in srgb, #dcfce7 var(--tint-mix), var(--surface));color:oklch(from #15803d max(l, var(--text-min-l)) c h);border-radius:6px;padding:1px 4px;margin-left:4px;font-weight:700;vertical-align:middle">✓ {{ t('leadsList.kanban.partnerBadge') }}</span>
            </div>
            <div class="lead-contact" *ngIf="lead.contact_name">
              {{ lead.contact_name }}<span *ngIf="lead.contact_title" style="color:var(--gray-400)"> · {{ lead.contact_title }}</span>
            </div>
            <div class="lead-value" *ngIf="lead.value_pln || lead.probability != null">
              <span *ngIf="lead.value_pln">{{ lead.value_pln | number:'1.0-0' }} {{ lead.annual_turnover_currency || 'PLN' }}</span>
              <span *ngIf="lead.value_pln && lead.probability != null" class="lv-dot"></span>
              <span *ngIf="lead.probability != null" class="lv-pct" [title]="t('leadsList.table.chance')">{{lead.probability}}%</span>
            </div>
            <div class="lead-chips" *ngIf="lead.online_pct != null">
              <span class="lchip lchip-online">🌐 {{lead.online_pct}}%</span>
            </div>
            <div class="lead-meta">
              <span *ngIf="lead.source" class="tag tag-src">{{ srcLabel(lead.source) }}</span>
              <span class="avatar-sm" *ngIf="lead.assigned_to_name" style="margin-left:auto" [title]="lead.assigned_to_name">
                {{ initials(lead.assigned_to_name) }}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:2px;flex-wrap:wrap">
              <span *ngIf="hasPbxFeature && (lead.missed_call_count ?? 0) > 0" style="background:#DC2626;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;line-height:16px;display:inline-flex;align-items:center;gap:2px"><svg width="10" height="10" viewBox="0 0 24 24" fill="white" style="flex-shrink:0"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"/></svg>{{lead.missed_call_count}}</span>
              <span *ngIf="hasPbxFeature && (lead.unread_sms_count ?? 0) > 0" style="background:#DC2626;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;line-height:16px">💬 {{lead.unread_sms_count}}</span>
              <span *ngIf="hasWhatsappFeature && (lead.unread_whatsapp_count ?? 0) > 0" style="background:#DC2626;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;line-height:16px;display:inline-flex;align-items:center;gap:2px"><svg width="10" height="10" viewBox="0 0 24 24" fill="#25D366" style="flex-shrink:0"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.9.53 3.68 1.44 5.2L2 22l4.94-1.3A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>{{lead.unread_whatsapp_count}}</span>
              <span *ngIf="hasUnreadReply(lead)" style="background:#DC2626;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;line-height:16px">✉️ {{unreadReplyCount(lead)}}</span>
              <span *ngIf="lead.created_at" class="lead-added">{{ t('leadsList.fields.addedOn') }} {{ lead.created_at | date:'dd.MM.yy' }}</span>
            </div>
          </div>
          <div *ngIf="leadsFor(col.key).length===0" class="kol-empty">{{ t('leadsList.kanban.empty') }}</div>
        </div>
      </div>

      <!-- Zamknięte — tylko gdy tenant w ogóle rozlicza wygrane/przegrane -->
      <div class="kol" *ngIf="showsClosedColumn()">
        <div class="kol-head">
          <div class="kol-dot" style="background:#22C55E"></div>
          <span class="kol-title">{{ t('leadsList.kanban.closed') }}</span>
          <span class="kol-cnt">{{ t('leadsList.kanban.closedCount', { won: leadsFor(stages.wonKey()).length, lost: leadsFor(stages.lostKey()).length }) }}</span>
        </div>
        <div class="kol-cards">
          <div *ngFor="let lead of closedLeads(); trackBy:trackById"
               class="lead-card" [class.selected]="selected?.id===lead.id"
               (click)="selectLead(lead)">
            <div class="lead-company">{{ lead.company }}</div>
            <div class="lead-contact" *ngIf="lead.contact_name">{{ lead.contact_name }}</div>
            <div class="lead-value" *ngIf="lead.value_pln">{{ lead.value_pln | number:'1.0-0' }} {{ lead.annual_turnover_currency || 'PLN' }}</div>
            <div class="lead-meta">
              <span class="tag" [class]="stages.isWon(lead.stage) ? 'tag-green' : 'tag-red'">
                {{ (stages.isWon(lead.stage) ? '✓ ' : '✗ ') + stages.label(lead.stage) }}
              </span>
              <span *ngIf="lead.created_at" class="lead-added">{{ t('leadsList.fields.addedOn') }} {{ lead.created_at | date:'dd.MM.yy' }}</span>
            </div>
          </div>
          <div *ngIf="closedLeads().length===0" class="kol-empty">{{ t('leadsList.kanban.closedEmpty') }}</div>
        </div>
      </div>
    </div>

    <!-- ── Detail overlay ── -->
    <div class="dp-overlay" *ngIf="selected" (click)="closeOnOverlay($event)">
    <div class="detail-panel">
      <div class="dp-head">
        <div class="dp-top-row">
          <div style="flex:1;min-width:0">
            <div class="dp-company">{{ selected.company }}</div>
            <div class="dp-sub">
              {{ selected.contact_name }}<span *ngIf="selected.contact_title"> · {{ selected.contact_title }}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            <span *ngIf="selected.hot" class="tag tag-orange" style="font-size:10px">🔥</span>
            <button class="dp-close" (click)="selected=null; cdr.markForCheck()">✕</button>
          </div>
        </div>
        <div class="dp-actions">
          <button class="btn btn-g btn-sm" *ngIf="selected.phone" (click)="callPhone(selected.phone)">📞</button>
          <button class="btn btn-g btn-sm" *ngIf="selected.email" (click)="mailTo(selected.email)">✉</button>
          <button class="btn btn-p btn-sm" [routerLink]="['/crm/leads',selected.id]" style="flex:1">{{ t('leadsList.detail.openDetails') }} →</button>
        </div>
      </div>

      <div class="dp-body">
        <div class="tabs">
          <button class="tab-btn" [class.active]="dpTab==='info'"     (click)="dpTab='info'">{{ t('leadsList.detail.tabs.info') }}</button>
          <button class="tab-btn" [class.active]="dpTab==='activity'" (click)="dpTab='activity'">
            {{ t('leadsList.detail.tabs.history') }}<span *ngIf="selected.activities?.length" class="tab-cnt">{{ selected.activities!.length }}</span>
          </button>
        </div>

        <!-- Info -->
        <div *ngIf="dpTab==='info'">
          <div class="sec-title">{{ t('leadsList.detail.details') }}</div>
          <div class="info-row"><span class="info-label">{{ t('leadsList.fields.company') }}</span><span class="info-val">{{ selected.company }}</span></div>
          <div class="info-row" *ngIf="selected.email">
            <span class="info-label">{{ t('leadsList.fields.email') }}</span>
            <a class="info-val link" href="mailto:{{ selected.email }}">{{ selected.email }}</a>
          </div>
          <div class="info-row" *ngIf="selected.phone">
            <span class="info-label">{{ t('leadsList.fields.phone') }}</span><span class="info-val">{{ selected.phone }}</span>
          </div>
          <div class="info-row" *ngIf="selected.source">
            <span class="info-label">{{ t('leadsList.fields.source') }}</span><span class="info-val">{{ srcLabel(selected.source) }}</span>
          </div>
          <div class="info-row" *ngIf="selected.industry">
            <span class="info-label">{{ t('leadsList.detail.industry') }}</span><span class="info-val">{{ selected.industry }}</span>
          </div>
          <div class="info-row" *ngIf="selected.created_at">
            <span class="info-label">{{ t('leadsList.fields.addedOn') }}</span><span class="info-val">{{ selected.created_at | date:'dd.MM.yyyy HH:mm' }}</span>
          </div>

          <div class="sec-title">{{ t('leadsList.detail.pipeline') }}</div>
          <div class="info-row">
            <span class="info-label">{{ t('leadsList.detail.value') }}</span>
            <span class="info-val" style="color: var(--orange-text);font-family:'Sora',sans-serif;font-size:16px;font-weight:700">
              {{ (selected.value_pln||0) | number:'1.0-0' }} {{ selected.annual_turnover_currency || 'PLN' }}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">{{ t('leadsList.detail.probability') }}</span>
            <span class="info-val">{{ selected.probability ?? stages.probability(selected.stage) }}%</span>
          </div>
          <div class="info-row">
            <span class="info-label">{{ t('leadsList.detail.weightedValue') }}</span>
            <span class="info-val">
              {{ ((selected.value_pln||0) * (selected.probability ?? stages.probability(selected.stage)) / 100) | number:'1.0-0' }} PLN
            </span>
          </div>
          <div class="info-row" *ngIf="selected.close_date">
            <span class="info-label">{{ t('leadsList.detail.closeDate') }}</span>
            <span class="info-val">{{ selected.close_date | date:'dd.MM.yyyy' }}</span>
          </div>
          <div class="pipe-bar" style="margin-top:6px">
            <div class="pipe-fill" [style.width.%]="stages.probability(selected.stage)"
                 [style.background]="stages.isClosed(selected.stage) ? stages.color(selected.stage) : null">
            </div>
          </div>
          <div style="font-size:10px;color:var(--gray-400);margin-top:4px">{{ t('leadsList.detail.stageValue', { stage: stages.label(selected.stage) }) }}</div>

          <div class="sec-title" *ngIf="selected.assigned_to_name">{{ t('leadsList.fields.salesRep') }}</div>
          <div *ngIf="selected.assigned_to_name" class="dp-user">
            <div class="avatar-sm" style="width:28px;height:28px;font-size:12px">{{ initials(selected.assigned_to_name) }}</div>
            <div style="font-size:14px;font-weight:600;color:var(--gray-900)">{{ selected.assigned_to_name }}</div>
          </div>

          <div class="sec-title" *ngIf="selected.tags?.length">{{ t('leadsList.detail.tags') }}</div>
          <div *ngIf="selected.tags?.length" style="display:flex;flex-wrap:wrap;gap:6px">
            <span *ngFor="let t of selected.tags" class="tag tag-blue">{{ t }}</span>
          </div>

          <div class="sec-title" *ngIf="selected.notes">{{ t('leadsList.detail.note') }}</div>
          <div *ngIf="selected.notes" class="dp-note">{{ selected.notes }}</div>
        </div>

        <!-- Aktywności -->
        <div *ngIf="dpTab==='activity'">
          <div *ngIf="loadingDetail" class="loading-state" style="padding:20px 0">
            <div class="spinner"></div>
          </div>
          <div *ngIf="!loadingDetail">
            <div *ngFor="let a of selected.activities||[]" class="act-item">
              <div class="act-dot" [class]="a.type"><wt-act-type-icon [type]="a.type"></wt-act-type-icon></div>
              <div class="act-text">
                <div class="act-title">{{ a.title }}</div>
                <div class="act-date">{{ a.activity_at | date:'dd.MM.yyyy HH:mm' }} · {{ a.created_by_name }}</div>
                <div class="act-body" *ngIf="a.body">{{ a.body }}</div>
              </div>
            </div>
            <div *ngIf="!(selected.activities?.length)" class="kol-empty" style="padding:20px 0">
              {{ t('leadsList.detail.noActivities') }} <a [routerLink]="['/crm/leads',selected.id]" style="color: var(--orange-text)">{{ t('leadsList.detail.addInDetails') }} →</a>
            </div>
          </div>
        </div>
      </div>

      <div class="dp-foot">
        <button class="btn btn-g btn-sm" (click)="selected=null; cdr.markForCheck()">{{ 'actions.close' | transloco }}</button>
        <button class="btn btn-p btn-sm" style="flex:1" [routerLink]="['/crm/leads',selected.id]">{{ t('leadsList.detail.openDetails') }} →</button>
      </div>
    </div>
    </div><!-- /dp-overlay -->
  </div>

  <!-- ════ TABLE ════ -->
  <div *ngIf="!loading && !isKanbanView" class="tw">
    <div class="thead" style="grid-template-columns:2fr 90px 110px 70px 130px 70px 110px 100px 90px">
      <div class="th sortable" (click)="sortBy('company')">{{ t('leadsList.table.companyContact') }} <span class="si">{{sortIcon('company')}}</span></div>
      <div class="th sortable" (click)="sortBy('first_contact_date')" style="text-align:center">{{ t('leadsList.table.firstContactShort') }} <span class="si">{{sortIcon('first_contact_date')}}</span></div>
      <div class="th sortable" (click)="sortBy('stage')">{{ t('leadsList.fields.stage') }} <span class="si">{{sortIcon('stage')}}</span></div>
      <div class="th sortable" (click)="sortBy('probability')" style="text-align:center">{{ t('leadsList.table.chance') }} <span class="si">{{sortIcon('probability')}}</span></div>
      <div class="th sortable" (click)="sortBy('value_pln')">{{ t('leadsList.fields.annualTurnover') }} <span class="si">{{sortIcon('value_pln')}}</span></div>
      <div class="th sortable" (click)="sortBy('online_pct')" style="text-align:center">{{ t('leadsList.table.online') }} <span class="si">{{sortIcon('online_pct')}}</span></div>
      <div class="th sortable" (click)="sortBy('assigned_to_name')">{{ t('leadsList.fields.salesRep') }} <span class="si">{{sortIcon('assigned_to_name')}}</span></div>
      <div class="th sortable" (click)="sortBy('source')">{{ t('leadsList.fields.source') }} <span class="si">{{sortIcon('source')}}</span></div>
      <div class="th sortable" (click)="sortBy('close_date')">{{ t('leadsList.table.closeDateShort') }} <span class="si">{{sortIcon('close_date')}}</span></div>
    </div>
    <div *ngFor="let lead of sortedLeads; trackBy:trackById"
         class="tr-row" [class.tr-row-held]="lead.hold_active" style="grid-template-columns:2fr 90px 110px 70px 130px 70px 110px 100px 90px"
         [routerLink]="['/crm/leads',lead.id]">
      <div class="td" style="display:flex;align-items:center;gap:8px">
        <span *ngIf="hasLogo(lead)" class="logo-circle" [style.background-image]="logoSasMap[lead.id] || ''"></span>
        <div>
          <div style="font-weight:650;color:var(--gray-900)">{{ lead.company }}<span *ngIf="lead.hot"> 🔥</span><span *ngIf="lead.hold_active" class="hold-badge" style="margin-left:4px" [title]="lead.hold_reason">⏸️ {{ t('leadsList.kanban.holdBadge') }}</span>
            <span *ngIf="hasPbxFeature && (lead.missed_call_count ?? 0) > 0"
                  style="background:#DC2626;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px;line-height:16px;display:inline-flex;align-items:center;gap:2px"><svg width="10" height="10" viewBox="0 0 24 24" fill="white" style="flex-shrink:0"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"/></svg>{{lead.missed_call_count}}</span>
            <span *ngIf="hasPbxFeature && (lead.unread_sms_count ?? 0) > 0"
                  style="background:#DC2626;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px;line-height:16px">💬 {{lead.unread_sms_count}}</span>
            <span *ngIf="hasWhatsappFeature && (lead.unread_whatsapp_count ?? 0) > 0"
                  style="background:#DC2626;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px;line-height:16px;display:inline-flex;align-items:center;gap:2px"><svg width="10" height="10" viewBox="0 0 24 24" fill="#25D366" style="flex-shrink:0"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.9.53 3.68 1.44 5.2L2 22l4.94-1.3A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>{{lead.unread_whatsapp_count}}</span>
            <span *ngIf="hasUnreadReply(lead)"
                  style="background:#DC2626;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px;line-height:16px">✉️ {{unreadReplyCount(lead)}}</span>
          </div>
          <div style="font-size:12px;color:var(--gray-400)">{{ lead.contact_name }}</div>
          <div *ngIf="lead.converted_at" style="font-size:10px;color:oklch(from #7c3aed max(l, var(--text-min-l)) c h);font-weight:600;margin-top:2px">
            ✦ {{ t('leadsList.table.migrated') }} →
            <a [routerLink]="['/crm/partners', lead.converted_partner_id]" style="color:oklch(from #7c3aed max(l, var(--text-min-l)) c h)" (click)="$event.stopPropagation()">{{ t('labels.sourceTypes.partner') }}</a>
          </div>
        </div>
      </div>
      <div class="td" style="font-size:12px;text-align:center;color:var(--gray-400)">{{ lead.first_contact_date ? (lead.first_contact_date | date:'dd.MM.yy') : '—' }}</div>
      <div class="td">
        <span class="stage-pill"
              [style.background]="stages.pillBackground(lead.stage)"
              [style.color]="stages.color(lead.stage)">{{ stages.label(lead.stage) }}</span>
      </div>
      <div class="td" style="font-size:12px;text-align:center;font-weight:500;color:var(--gray-600);font-variant-numeric:tabular-nums">{{ lead.probability != null ? lead.probability+'%' : '—' }}</div>
      <div class="td" style="font-size:13px;font-weight:650;color:var(--gray-900);font-variant-numeric:tabular-nums">
        {{ lead.value_pln ? (lead.value_pln | number:'1.0-0')+' '+(lead.annual_turnover_currency||'PLN') : '—' }}
      </div>
      <div class="td" style="font-size:12px;text-align:center">{{ lead.online_pct != null ? lead.online_pct+'%' : '—' }}</div>
      <div class="td" style="font-size:12px">{{ lead.assigned_to_name||'—' }}</div>
      <div class="td" style="font-size:12px">{{ lead.source ? srcLabel(lead.source) : '—' }}</div>
      <div class="td" style="font-size:12px;color:var(--gray-400)">
        {{ lead.close_date ? (lead.close_date | date:'dd.MM.yy') : '—' }}
      </div>
    </div>
    <div *ngIf="allLeads.length===0" class="empty-state">
      <div style="font-size:32px">📋</div>{{ t('leadsList.table.empty') }}
    </div>
    <div *ngIf="totalPages>1" class="pagination">
      <button class="btn btn-g btn-sm" [disabled]="page===1" (click)="setPage(page-1)">← {{ t('leadsList.table.previous') }}</button>
      <span style="font-size:12px;color:var(--gray-500)">{{ t('leadsList.table.pageOf', { page: page, pages: totalPages }) }}</span>
      <button class="btn btn-g btn-sm" [disabled]="page===totalPages" (click)="setPage(page+1)">{{ t('leadsList.table.next') }} →</button>
    </div>
  </div>

</div>

<!-- ══ Modal: Nowy lead ══ -->
<div class="overlay" *ngIf="showNew" (click)="showNew=false">
  <div class="modal" (click)="$event.stopPropagation()">
    <div class="modal-head">
      <div class="modal-icon" style="background:var(--orange-pale)">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/></svg>
      </div>
      <div>
        <div class="modal-title">{{ t('leadsList.newLead.title') }}</div>
        <div style="font-size:12px;color:var(--gray-400)">{{ t('leadsList.newLead.subtitle') }}</div>
      </div>
      <button class="dp-close" style="margin-left:auto" (click)="showNew=false">✕</button>
    </div>
    <div class="modal-body">
      <div class="fgrid2">
        <!-- WWW field + hot checkbox -->
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">{{ t('leadsList.fields.website') }} @if (newFormRequiresFull) { <span style="color: var(--orange-text)">*</span> } @else { <span style="font-size:10px;color:var(--gray-400)">{{ t('leadsList.newLead.optional') }}</span> }</label>
          <div class="www-row">
            <div style="position:relative;flex:1;min-width:0">
              <input class="fi" [(ngModel)]="newFormWebsite"
                     [placeholder]="t('leadsList.newLead.websitePlaceholder')"
                     (ngModelChange)="onWebsiteChange()"
                     [class.fi-err]="newMissing('website')"
                     style="padding-right:36px">
              <span *ngIf="enriching" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--gray-400)">⏳</span>
            </div>
            <button type="button" class="fchip hot-chip" [class.on]="newForm.hot" [attr.aria-pressed]="!!newForm.hot"
                    [title]="t('leadsList.newLead.hotHint')" (click)="newForm.hot = !newForm.hot">🔥 {{ t('leadsList.newLead.hot') }}</button>
          </div>
          @if (newMissing('website')) { <span class="ferr">{{ t('fieldErrors.website') }}</span> }
        </div>
        <div class="fg" style="grid-column:1/-1">
          <div>
          <!-- Enrich prompt banner -->
          <div *ngIf="enrichPrompt&&!enriching" style="margin-top:6px;background:var(--orange-pale);border:1px solid var(--orange-muted);border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:8px;font-size:12px">
            <span>🔍 {{ t('leadsList.newLead.enrichPrompt') }}</span>
            <button style="background:var(--orange-strong);color:white;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;font-weight:600" (click)="runEnrich()">{{ t('leadsList.newLead.enrichConfirm') }}</button>
            <button style="background:none;border:none;color:var(--gray-400);cursor:pointer;font-size:12px" (click)="enrichPrompt=false">{{ t('leadsList.newLead.enrichDecline') }}</button>
          </div>
          <!-- Enrich result badge -->
          <div *ngIf="enrichResult" style="margin-top:6px;background:var(--gray-50);border:1px solid color-mix(in srgb, #bbf7d0 var(--tint-mix), var(--surface));border-radius:8px;padding:6px 12px;font-size:12px;color:oklch(from #15803d max(l, var(--text-min-l)) c h)">
            ✓ {{ t('leadsList.newLead.enrichDone') }}
          </div>
          </div>
        </div>

        <div class="fg" style="grid-column:1/-1">
          <label class="fl">{{ t('leadsList.newLead.companyName') }} <span style="color: var(--orange-text)">*</span></label>
          <input class="fi" [(ngModel)]="newForm.company" [placeholder]="t('leadsList.newLead.companyPlaceholder')"
                 [class.fi-err]="submitted&&!newForm.company">
          @if (submitted&&!newForm.company) { <span class="ferr">{{ t('fieldErrors.company') }}</span> }
        </div>
        <div class="fg">
          <label class="fl" style="display:flex;align-items:center;gap:4px">{{ t('leadsList.newLead.contactName') }} <span *ngIf="newFormRequiresFull" style="color: var(--orange-text)">*</span></label>
          <input class="fi" [(ngModel)]="newForm.contact_name" [placeholder]="t('leadsList.newLead.namePlaceholder')"
                 [class.fi-err]="newMissing('contactName')">
          @if (newMissing('contactName')) { <span class="ferr">{{ t('fieldErrors.contactName') }}</span> }
        </div>
        <div class="fg">
          <label class="fl" style="display:flex;align-items:center;gap:4px">{{ t('leadsList.fields.companyRole') }} <span *ngIf="newFormRequiresFull" style="color: var(--orange-text)">*</span></label>
          <select class="fi" [(ngModel)]="newForm.contact_title"
                  [class.fi-err]="newMissing('contactTitle')">
            <option value="">{{ t('leadsList.newLead.select') }}</option>
            <option *ngFor="let t of dictTitles" [value]="t">{{ t }}</option>
          </select>
          @if (newMissing('contactTitle')) { <span class="ferr">{{ t('fieldErrors.contactTitle') }}</span> }
        </div>
        <div class="fg">
          <label class="fl">{{ t('leadsList.fields.email') }} <span *ngIf="newFormRequiresFull" style="color: var(--orange-text)">*</span></label>
          <input class="fi" type="email" [(ngModel)]="newForm.email" [placeholder]="t('leadsList.newLead.emailPlaceholder')" [class.fi-err]="newMissing('email')">
          @if (newMissing('email')) { <span class="ferr">{{ t('fieldErrors.email') }}</span> }
        </div>
        <div class="fg">
          <label class="fl">{{ t('leadsList.fields.phone') }} <span *ngIf="newFormRequiresFull" style="color: var(--orange-text)">*</span></label>
          <wt-phone-input [(ngModel)]="newForm.phone" [invalid]="newMissing('phone')" />
          @if (newMissing('phone')) { <span class="ferr">{{ t('fieldErrors.phone') }}</span> }
        </div>
        <div class="fg" style="grid-column:1/-1">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <label class="fl" style="margin:0">{{ t('leadsList.newLead.extraContacts') }}</label>
            <button type="button" style="background:none;border:1px solid var(--orange-muted);border-radius:6px;padding:2px 10px;font-size:12px;cursor:pointer;color: var(--orange-text)" (click)="addNewExtraContact()">+ {{ t('leadsList.newLead.addContact') }}</button>
          </div>
          @for (ec of newExtraContacts; track $index; let i = $index) {
            <div style="border:1px solid var(--gray-200);border-radius:8px;padding:10px 12px;margin-bottom:8px;position:relative">
              <button type="button" style="position:absolute;top:6px;right:8px;background:none;border:none;color:var(--gray-400);font-size:14px;cursor:pointer;line-height:1" (click)="removeNewExtraContact(i)">✕</button>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                <div class="fg"><label class="fl">{{ t('leadsList.newLead.fullName') }}</label><input class="fi" [(ngModel)]="ec.contact_name" [placeholder]="t('leadsList.newLead.namePlaceholder')"></div>
                <div class="fg"><label class="fl">{{ t('leadsList.fields.companyRole') }}</label>
                  <select class="fi" [(ngModel)]="ec.contact_title">
                    <option value="">{{ t('leadsList.newLead.select') }}</option>
                    <option *ngFor="let t of dictTitles" [value]="t">{{ t }}</option>
                  </select>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="fg"><label class="fl">{{ t('leadsList.fields.email') }}</label><input class="fi" type="email" [(ngModel)]="ec.email" [placeholder]="t('leadsList.newLead.emailPlaceholder')"></div>
                <div class="fg"><label class="fl">{{ t('leadsList.fields.phone') }}</label><wt-phone-input [(ngModel)]="ec.phone" /></div>
              </div>
            </div>
          }
          @if (newExtraContacts.length === 0) {
            <div style="font-size:12px;color:var(--gray-400);text-align:center;padding:8px 0">{{ t('leadsList.newLead.noExtraContacts') }}</div>
          }
        </div>
        <div class="fg">
          <label class="fl" style="display:flex;align-items:center;gap:4px">{{ t('leadsList.newLead.taxId') }} <span style="color: var(--orange-text)">*</span></label>
          <input class="fi" [(ngModel)]="newForm.nip"
                 placeholder="PL1234567890"
                 maxlength="14"
                 (ngModelChange)="onNipChange('lead')"
                 [class.fi-err]="nipError">
          @if (nipError) { <span class="ferr">{{ nipError }}</span> }
        </div>
        <div class="fg">
          <label class="fl">{{ t('leadsList.newLead.value') }} <span *ngIf="newFormRequiresFull" style="color: var(--orange-text)">*</span></label>
          <input class="fi" type="number" [(ngModel)]="newForm.value_pln" placeholder="0" min="0" [class.fi-err]="newMissing('value') || !!amountError(newForm.value_pln)">
          @if (amountError(newForm.value_pln); as amountKey) { <span class="ferr">{{ t('fieldErrors.' + amountKey) }}</span> }
          @if (newMissing('value')) { <span class="ferr">{{ t('fieldErrors.value') }}</span> }
        </div>
        <div class="fg">
          <label class="fl">{{ t('leadsList.fields.source') }} <span *ngIf="newFormRequiresFull" style="color: var(--orange-text)">*</span></label>
          <select class="fsel" [(ngModel)]="newForm.source" [class.fi-err]="newMissing('source')">
            <option value="">{{ t('leadsList.newLead.select') }}</option>
            @for (s of sourcesWithoutGroup(); track s.value) {
              <option [value]="s.value">{{ sourceOptionLabel(s) }}</option>
            }
            @for (g of sourceGroups(); track g) {
              <optgroup [label]="sourceGroupLabel(g)">
                @for (s of sourcesInGroup(g); track s.value) {
                  <option [value]="s.value">{{ sourceOptionLabel(s) }}</option>
                }
              </optgroup>
            }
          </select>
          @if (newMissing('source')) { <span class="ferr">{{ t('fieldErrors.source') }}</span> }
        </div>
        <div class="fg">
          <label class="fl">{{ t('leadsList.fields.firstContact') }} <span *ngIf="newFormRequiresFull" style="color: var(--orange-text)">*</span></label>
          <input class="fi" type="date" [(ngModel)]="newForm.first_contact_date" [class.fi-err]="newMissing('firstContact')">
          @if (newMissing('firstContact')) { <span class="ferr">{{ t('fieldErrors.firstContact') }}</span> }
        </div>
        <div class="fg">
          <label class="fl">{{ t('leadsList.fields.stage') }}</label>
          <select class="fsel" [(ngModel)]="newForm.stage">
            @for (s of stages.creatable(); track s.key) {
              <option [value]="s.key">{{ stages.label(s.key) }}</option>
            }
          </select>
        </div>
        <div class="fg" *ngIf="isManager">
          <label class="fl">{{ t('leadsList.fields.salesRep') }} <span *ngIf="newFormRequiresFull" style="color: var(--orange-text)">*</span></label>
          <select class="fsel" [(ngModel)]="newForm.assigned_to" [class.fi-err]="newMissing('salesperson')">
            <option value="">{{ t('leadsList.newLead.unassigned') }}</option>
            <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
          </select>
          @if (newMissing('salesperson')) { <span class="ferr">{{ t('fieldErrors.salesperson') }}</span> }
        </div>
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">{{ t('leadsList.newLead.notes') }}</label>
          <textarea class="fta" [(ngModel)]="newForm.notes" rows="2" [placeholder]="t('leadsList.newLead.notesPlaceholder')"></textarea>
        </div>
      </div>
    </div>
    @if (!isManager && newMissing('salesperson')) {
      <div class="ferr" style="margin:0 24px 8px">{{ t('fieldErrors.salesperson') }}</div>
    }
    @if (saveError) {
      <div class="ferr" role="alert" style="margin:0 24px 8px">{{ saveError }}</div>
    }
    <div class="modal-foot">
      <button class="btn btn-g" (click)="showNew=false">{{ 'actions.cancel' | transloco }}</button>
      <button class="btn btn-p" [disabled]="saving" (click)="createLead()">
        {{ saving ? t('leadsList.saving') : t('leadsList.newLead.create') }}
      </button>
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════════════ -->
<!-- ══ Timeline Panel (right-side modal) ══════════════════════════════ -->
<!-- ══════════════════════════════════════════════════════════════════ -->
<div class="tl-backdrop" *ngIf="showTimeline" (click)="showTimeline=false; cdr.markForCheck()">
  <div class="tl-panel" (click)="$event.stopPropagation()">

    <!-- Panel header -->
    <div class="tl-head">
      <div class="tl-head-left">
        <div class="tl-head-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <div>
          <div class="tl-head-title">{{ t('leadsList.timeline.title') }}</div>
          <div class="tl-head-sub">{{ t('leadsList.timeline.subtitle') }}</div>
        </div>
      </div>
      <button class="dp-close" style="font-size:18px;padding:4px" (click)="showTimeline=false; cdr.markForCheck()">✕</button>
    </div>

    <!-- Manager filter -->
    <div class="tl-filter" *ngIf="isManager">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="color:var(--gray-400);flex-shrink:0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      <select class="sel" style="flex:1;font-size:12px" [(ngModel)]="timelineUser" (ngModelChange)="loadTimeline()">
        <option value="">{{ t('leadsList.filters.allReps') }}</option>
        <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
      </select>
    </div>

    <!-- Body — scrollable meeting list -->
    <div class="tl-body" id="tlBody">

      <!-- Loading -->
      <div *ngIf="timelineLoading" class="loading-state" style="padding:48px 0">
        <div class="spinner"></div>{{ t('leadsList.timeline.loading') }}
      </div>

      <!-- Empty -->
      <div *ngIf="!timelineLoading && timelineMeetings.length===0" class="tl-empty">
        <div style="font-size:36px;margin-bottom:10px">📭</div>
        <div style="font-weight:600;color:var(--gray-700)">{{ t('leadsList.timeline.empty') }}</div>
        <div style="font-size:12px;color:var(--gray-400);margin-top:4px">{{ t('leadsList.timeline.emptyHint') }}</div>
      </div>

      <!-- Meeting groups -->
      <ng-container *ngIf="!timelineLoading && timelineMeetings.length > 0">

        <!-- Past hint (only when there are past meetings) -->
        <div *ngIf="hasPastMeetings" class="tl-past-hint">
          ↑ {{ t('leadsList.timeline.pastHint') }}
        </div>

        <ng-container *ngFor="let group of timelineGroups; let gi = index">

          <!-- Date separator -->
          <div class="tl-date-sep"
               [class.tl-sep-today]="group.isToday"
               [class.tl-sep-future]="group.isFuture"
               [class.tl-sep-past]="group.isPast"
               [id]="group.isToday ? 'tl-today' : (group.isFirstFuture ? 'tl-first-future' : null)">
            <span class="tl-sep-line"></span>
            <span class="tl-sep-badge">
              <span *ngIf="group.isToday" class="tl-today-dot"></span>
              {{ group.dateLabel }}
              <span *ngIf="group.isToday" class="tl-today-tag">{{ t('leadsList.timeline.todayTag') }}</span>
            </span>
            <span class="tl-sep-line"></span>
          </div>

          <!-- Meetings in this group -->
          <div *ngFor="let m of group.meetings"
               class="tl-item"
               [class.tl-item-past]="group.isPast"
               [class.tl-item-today]="group.isToday"
               (click)="openMeetingDetail(m)">

            <!-- Time column -->
            <div class="tl-item-time-col">
              <div class="tl-item-time">{{ m.all_day ? t('leadsList.timeline.allDay') : (m.activity_at | date:'HH:mm') }}</div>
              <div class="tl-item-dur" *ngIf="m.duration_min">{{ t('leadsList.timeline.durationShort', { minutes: m.duration_min }) }}</div>
            </div>

            <!-- Connector dot -->
            <div class="tl-item-dot-col">
              <div class="tl-item-line-top"></div>
              <div class="tl-item-dot" [class.tl-dot-today]="group.isToday" [class.tl-dot-past]="group.isPast"></div>
              <div class="tl-item-line-bot"></div>
            </div>

            <!-- Card -->
            <div class="tl-item-card" [class.tl-card-today]="group.isToday">
              <div class="tl-item-header">
                <span class="tl-src-badge" [class.tl-src-lead]="m.source_type==='lead'" [class.tl-src-partner]="m.source_type==='partner'">
                  {{ m.source_type === 'lead' ? t('labels.sourceTypes.lead') : m.source_type === 'project' ? t('labels.sourceTypes.project') : t('labels.sourceTypes.partner') }}
                </span>
                <span class="tl-item-company">{{ m.source_name }}</span>
              </div>
              <div class="tl-item-title"><span style="color:var(--gray-500);font-weight:500">{{tlTypeName(m.type)}}:</span> {{ m.title }}</div>
              <div class="tl-item-meta">
                <span *ngIf="m.meeting_location" class="tl-item-loc">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {{ m.meeting_location }}
                </span>
                <span *ngIf="isManager && m.assigned_to_name" class="tl-item-rep">
                  <span class="avatar-sm" style="width:14px;height:14px;font-size:6px;flex-shrink:0">{{ initials(m.assigned_to_name) }}</span>
                  {{ m.assigned_to_name }}
                </span>
              </div>
              <div *ngIf="m.body" class="tl-item-body">{{ m.body }}</div>
              <div class="tl-item-arrow">→</div>
            </div>
          </div>

        </ng-container>

        <!-- Future hint -->
        <div *ngIf="hasFutureMeetings" class="tl-future-hint">
          ↓ {{ t('leadsList.timeline.futureHint') }}
        </div>

      </ng-container>
    </div><!-- /tl-body -->

  </div><!-- /tl-panel -->
</div><!-- /tl-backdrop -->


<!-- ══════════════════════════════════════════════════════════════════ -->
<!-- ══ Meeting Detail / Edit Modal ════════════════════════════════════ -->
<!-- ══════════════════════════════════════════════════════════════════ -->
<div class="overlay" *ngIf="selectedMeeting" (click)="closeMeetingOnOverlay($event)" style="z-index:310">
  <div class="modal" (click)="$event.stopPropagation()" style="width:520px">
    <div class="modal-head">
      <div class="modal-icon" style="background:var(--gray-50);font-size:18px"><wt-act-type-icon [type]="selectedMeeting.type"></wt-act-type-icon></div>
      <div style="flex:1;min-width:0">
        <div class="modal-title">{{ meetingEditMode ? t('leadsList.meeting.editTitle') : t('leadsList.meeting.detailTitle') }}</div>
        <div style="font-size:12px;color:var(--gray-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          {{ selectedMeeting.source_type === 'lead' ? '📋 ' + t('labels.sourceTypes.lead') : '🤝 ' + t('labels.sourceTypes.partner') }} · {{ selectedMeeting.source_name }}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <a *ngIf="selectedMeeting.source_type==='lead'"
           [routerLink]="['/crm/leads', selectedMeeting.source_id]"
           class="btn btn-g btn-sm"
           (click)="selectedMeeting=null; meetingEditMode=false; cdr.markForCheck()">
          {{ t('leadsList.meeting.openLead') }} →
        </a>
        <a *ngIf="selectedMeeting.source_type==='partner'"
           [routerLink]="['/crm/partners', selectedMeeting.source_id]"
           class="btn btn-g btn-sm"
           (click)="selectedMeeting=null; meetingEditMode=false; cdr.markForCheck()">
          {{ t('leadsList.meeting.openPartner') }} →
        </a>
        <button class="dp-close" style="font-size:18px" (click)="selectedMeeting=null; meetingEditMode=false; cdr.markForCheck()">✕</button>
      </div>
    </div>

    <!-- ── View mode ── -->
    <div *ngIf="!meetingEditMode" class="modal-body">

      <div class="meet-detail-grid">
        <div class="meet-field">
          <div class="meet-field-label">{{ t('leadsList.meeting.meetingTitle') }}</div>
          <div class="meet-field-val">{{ selectedMeeting.title }}</div>
        </div>
        <div class="meet-field">
          <div class="meet-field-label">{{ t('leadsList.meeting.dateTime') }}</div>
          <div class="meet-field-val" style="font-weight:600;color:var(--gray-900)">
            {{ selectedMeeting.activity_at | date:'EEEE, dd MMMM yyyy' }}&nbsp;·&nbsp;{{ selectedMeeting.activity_at | date:'HH:mm' }}
          </div>
        </div>
        <div class="meet-field" *ngIf="selectedMeeting.duration_min">
          <div class="meet-field-label">{{ t('leadsList.meeting.duration') }}</div>
          <div class="meet-field-val">{{ t('leadsList.meeting.durationValue', { count: selectedMeeting.duration_min }) }}</div>
        </div>
        <div class="meet-field" *ngIf="selectedMeeting.meeting_location">
          <div class="meet-field-label">📍 {{ t('leadsList.meeting.location') }}</div>
          <div class="meet-field-val">{{ selectedMeeting.meeting_location }}</div>
        </div>
        <div class="meet-field" *ngIf="selectedMeeting.participants">
          <div class="meet-field-label">👥 {{ t('leadsList.meeting.participants') }}</div>
          <div class="meet-field-val" style="white-space:pre-line">{{ selectedMeeting.participants }}</div>
        </div>
        <div class="meet-field" *ngIf="selectedMeeting.assigned_to_name">
          <div class="meet-field-label">{{ t('leadsList.fields.salesRep') }}</div>
          <div class="meet-field-val" style="display:flex;align-items:center;gap:6px">
            <span class="avatar-sm" style="width:20px;height:20px;font-size:8px">{{ initials(selectedMeeting.assigned_to_name) }}</span>
            {{ selectedMeeting.assigned_to_name }}
          </div>
        </div>
        <div class="meet-field" *ngIf="selectedMeeting.created_by_name">
          <div class="meet-field-label">{{ t('leadsList.meeting.addedBy') }}</div>
          <div class="meet-field-val">{{ selectedMeeting.created_by_name }}</div>
        </div>
      </div>

      <div *ngIf="selectedMeeting.body" class="dp-note" style="margin-top:14px">{{ selectedMeeting.body }}</div>
    </div>

    <!-- ── Edit mode ── -->
    <div *ngIf="meetingEditMode" class="modal-body">
      <div class="fgrid2">
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">{{ t('leadsList.meeting.meetingTitle') }} <span style="color: var(--orange-text)">*</span></label>
          <input class="fi" [(ngModel)]="meetingForm.title" [placeholder]="t('leadsList.meeting.titlePlaceholder')">
        </div>
        <div class="fg">
          <label class="fl">{{ t('leadsList.meeting.dateTime') }}</label>
          <input class="fi" type="datetime-local" [(ngModel)]="meetingForm.activity_at">
        </div>
        <div class="fg">
          <label class="fl">{{ t('leadsList.meeting.durationMinutes') }}</label>
          <input class="fi" type="number" [(ngModel)]="meetingForm.duration_min" placeholder="60" min="0">
        </div>
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">{{ t('leadsList.meeting.location') }}</label>
          <input class="fi" [(ngModel)]="meetingForm.meeting_location" [placeholder]="t('leadsList.meeting.locationPlaceholder')">
        </div>
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">{{ t('leadsList.meeting.participants') }}</label>
          <input class="fi" [(ngModel)]="meetingForm.participants" [placeholder]="t('leadsList.meeting.participantsPlaceholder')">
        </div>
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">{{ t('leadsList.meeting.notes') }}</label>
          <textarea class="fta" [(ngModel)]="meetingForm.body" rows="3" [placeholder]="t('leadsList.meeting.notesPlaceholder')"></textarea>
        </div>
      </div>
    </div>

    <div class="modal-foot">
      <ng-container *ngIf="!meetingEditMode">
        <button class="btn btn-g" (click)="selectedMeeting=null; meetingEditMode=false; cdr.markForCheck()">{{ 'actions.close' | transloco }}</button>
        <button class="btn btn-p" style="margin-left:auto" (click)="meetingEditMode=true; cdr.markForCheck()">
          ✎ {{ t('leadsList.meeting.edit') }}
        </button>
      </ng-container>
      <ng-container *ngIf="meetingEditMode">
        <button class="btn btn-g" (click)="meetingEditMode=false; cdr.markForCheck()">{{ 'actions.cancel' | transloco }}</button>
        <button class="btn btn-p" style="margin-left:auto" [disabled]="savingMeeting" (click)="saveMeeting()">
          {{ savingMeeting ? t('leadsList.saving') : '✓ ' + t('leadsList.meeting.saveChanges') }}
        </button>
      </ng-container>
    </div>
  </div>
</div>
</ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    #topbar { height:60px; background:var(--surface); border-bottom:1px solid var(--gray-200); display:flex; align-items:center; gap:12px; padding:0 24px; flex-shrink:0; }
    .page-title { font-family:'Sora',sans-serif; font-size:18px; font-weight:700; color:var(--gray-900); }
    .tsp { flex:1; }
    .srch-wrap { position:relative; display:flex; align-items:center; }
    .srch-wrap svg { position:absolute; left:10px; width:15px; height:15px; color:var(--gray-400); pointer-events:none; }
    .srch { background:var(--gray-100); border:1px solid var(--gray-200); border-radius:8px; padding:8px 14px 8px 34px; font-size:14px; width:260px; outline:none; font-family:inherit; }
    .srch:focus { border-color:var(--orange); background:var(--surface); }
    #content { flex:1; overflow:hidden; padding:20px 24px 24px; display:flex; flex-direction:column; gap:0; min-height:0; }

    /* Stats */
    .stats-row { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:18px; flex-shrink:0; }
    .stat-card { background:var(--surface); border:1px solid var(--gray-200); border-radius:10px; padding:14px 18px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
    .stat-val { font-family:'Sora',sans-serif; font-size:22px; font-weight:700; color:var(--gray-900); }
    .stat-lbl { font-size:12px; color:var(--gray-400); font-weight:500; margin-top:2px; }

    /* Toolbar */
    .toolbar { background:var(--surface); border:1px solid var(--gray-200); border-radius:10px; padding:10px 16px; margin-bottom:14px; display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:wrap; }
    .sel { font-size:12px; font-family:inherit; }
    .sel:focus { border-color:var(--orange); }

    /* Buttons */

    /* Kanban */
    /* Side padding (cancelled by the negative margin) keeps the card shadows from being clipped by the scroll box. */
    .kanban-wrap { display:flex; flex:1; overflow-y:auto; min-height:0; gap:0; padding:0 16px; margin:0 -16px; }
    .kanban { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; flex:1; align-items:start; padding-bottom:16px; min-width:900px; }
    .kol { min-width:0; }
    .kol-head { display:flex; align-items:center; gap:6px; margin-bottom:10px; }
    .kol-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .kol-title { font-size:10px; font-weight:700; color:var(--gray-600); text-transform:uppercase; letter-spacing:.5px; }
    .kol-cnt { margin-left:auto; background:var(--gray-100); border-radius:10px; padding:1px 6px; font-size:12px; font-weight:600; color:var(--gray-500); }
    .kol-val { font-size:10px; color: var(--orange-text); font-weight:600; font-family:'Sora',sans-serif; white-space:nowrap; }
    .kol-cards { display:flex; flex-direction:column; gap:8px; }
    .kol-empty { font-size:12px; color:var(--gray-300); text-align:center; padding:16px 8px; border:1.5px dashed var(--gray-200); border-radius:8px; }

    .lead-card { background:var(--surface); border:1px solid var(--gray-200); border-radius:10px; padding:10px 12px; cursor:pointer; transition:all .15s; }
    .lead-card:hover { border-color:#a8d9b6; box-shadow:0 4px 12px rgba(59,170,93,.1); transform:translateY(-1px); }
    .lead-card.selected { border-color:var(--orange); box-shadow:0 0 0 2px rgba(59,170,93,.15); }
    .logo-circle { display:inline-block;width:22px;height:22px;border-radius:50%;background-size:cover;background-position:center;background-repeat:no-repeat;flex-shrink:0;border:1px solid var(--gray-200);background-color:var(--gray-50); }
    .lead-company { font-size:12px; font-weight:700; color:var(--gray-900); margin-bottom:2px; display:flex; align-items:center; gap:4px; }
    .lead-contact { font-size:12px; color:var(--gray-500); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .lead-value { display:flex; align-items:center; gap:6px; font-family:'Sora',sans-serif; font-size:12px; font-weight:700; color: var(--orange-text); margin-bottom:4px; font-variant-numeric:tabular-nums; }
    .lv-dot { width:3px; height:3px; border-radius:50%; background:var(--gray-300); flex-shrink:0; }
    .lv-pct { font-family:inherit; font-weight:600; color:var(--gray-500); }
    .lead-chips { font-size:12px; color:var(--gray-600); margin-bottom:4px; }
    .lead-meta { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
    .lead-added { margin-left:auto; font-size:10px; color:var(--gray-400); white-space:nowrap; }
    .date-range { display:inline-flex; align-items:center; gap:4px; }
    .date-range input.sel[type=date] { height:30px; min-width:0; width:128px; padding:0 10px; font-size:12px; font-weight:500; }
    .date-range.on .sel { border-color:var(--orange); }
    .date-range-lbl { font-size:12px; font-weight:500; color:var(--gray-500); }
    .date-range-sep { color:var(--gray-400); font-size:12px; }
    .date-range-x { cursor:pointer; font-size:16px; line-height:1; color:var(--gray-400); padding:0 2px; }
    .date-range-x:hover { color: var(--orange-text); }
    .hot-dot { font-size:16px; line-height:1; margin-left:4px; vertical-align:-2px; }
    .lead-card-held { opacity:.55; filter:grayscale(.6); }
    .tr-row-held { opacity:.55; filter:grayscale(.6); }
    .hold-badge { display:inline-flex; align-items:center; gap:2px; font-size:10px; font-weight:700; background:var(--gray-200); color:var(--gray-700); border-radius:6px; padding:1px 4px; line-height:16px; }
    .tag { display:inline-flex; align-items:center; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600; }
    /* Lead source: one neutral, readable chip for every source (the colour never meant anything). */
    .tag-src { background:var(--chip-bg); color:var(--chip-text); }
    .tag-blue { background:color-mix(in srgb, #eff6ff var(--tint-mix), var(--surface)); color:oklch(from #1d4ed8 max(l, var(--text-min-l)) c h); }
    .tag-purple { background:var(--gray-50); color:oklch(from #7e22ce max(l, var(--text-min-l)) c h); }
    .tag-green { background:var(--gray-50); color:oklch(from #166534 max(l, var(--text-min-l)) c h); }
    .tag-orange { background:var(--orange-pale); color:var(--orange-dark); }
    .tag-red { background:var(--gray-50); color:oklch(from #be123c max(l, var(--text-min-l)) c h); }
    .tag-gray { background:var(--gray-100); color:var(--gray-600); }
    .pipe-bar { height:4px; background:var(--gray-100); border-radius:2px; overflow:hidden; margin-top:8px; }
    .pipe-fill { height:100%; background:var(--orange); border-radius:2px; }
    .avatar-sm { width:20px; height:20px; border-radius:50%; background:var(--orange-strong); display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:700; color:white; flex-shrink:0; }

    /* Stage pill — kolory nie są klasami per etap, bo etapy są konfigurowalne
       (etap dodany przez tenanta nie miałby swojej klasy). Tło i kolor tekstu
       idą inline z LeadStagesService. */
    .stage-pill { padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600; }

    /* Detail Panel */
    .dp-overlay { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:200; display:flex; align-items:center; justify-content:center; }
    .detail-panel { width:420px; max-height:85vh; background:var(--surface); border-radius:14px; display:flex; flex-direction:column; overflow:hidden; animation:slideIn .2s ease; box-shadow:0 12px 39px rgba(0,0,0,0.163); }
    @keyframes slideIn { from { transform:translateX(16px); opacity:0; } to { transform:none; opacity:1; } }
    .dp-head { padding:14px 16px 12px; border-bottom:1px solid var(--gray-200); background:linear-gradient(135deg,var(--orange-pale) 0%,var(--surface) 70%); flex-shrink:0; }
    .dp-top-row { display:flex; align-items:flex-start; gap:6px; margin-bottom:10px; }
    .dp-company { font-family:'Sora',sans-serif; font-size:14px; font-weight:700; color:var(--gray-900); }
    .dp-sub { font-size:12px; color:var(--gray-400); margin-top:2px; }
    .dp-actions { display:flex; gap:6px; }
    .dp-close { background:none; border:none; cursor:pointer; color:var(--gray-400); font-size:16px; padding:0; line-height:1; }
    .dp-close:hover { color:var(--gray-700); }
    .dp-body { flex:1; overflow-y:auto; padding:14px 16px; }
    .dp-foot { padding:10px 16px; border-top:1px solid var(--gray-200); display:flex; gap:8px; background:var(--gray-50); flex-shrink:0; }
    .dp-user { display:flex; align-items:center; gap:8px; padding:4px 0 10px; }
    .dp-note { background:var(--gray-50); border:1px solid var(--gray-200); border-radius:8px; padding:10px 12px; font-size:12px; color:var(--gray-600); line-height:1.6; white-space:pre-line; }

    /* Tabs */
    .tab-cnt { display:inline-flex; align-items:center; justify-content:center; background:var(--orange-strong); color:white; font-size:10px; font-weight:700; min-width:15px; height:15px; border-radius:10px; padding:0 4px; margin-left:4px; }

    /* Info rows */
    .sec-title { font-size:10px; font-weight:700; color:var(--gray-400); text-transform:uppercase; letter-spacing:.7px; margin:14px 0 8px; display:flex; align-items:center; gap:8px; }
    .sec-title::after { content:''; flex:1; height:1px; background:var(--gray-200); }
    .sec-title:first-child { margin-top:0; }
    .info-row { display:flex; justify-content:space-between; align-items:center; padding:4px 0; font-size:12px; }
    .info-label { color:var(--gray-400); font-size:12px; }
    .info-val { color:var(--gray-800); font-weight:500; }
    .link { color: var(--orange-text); text-decoration:none; } .link:hover { text-decoration:underline; }

    /* Activity */
    .act-item { display:flex; gap:10px; margin-bottom:12px; }
    .act-dot { width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; flex-shrink:0; border:2px solid; }
    .act-dot.call { background:color-mix(in srgb, #eff6ff var(--tint-mix), var(--surface)); border-color:color-mix(in srgb, #bfdbfe var(--tint-mix), var(--surface)); }
    .act-dot.email { background:var(--gray-50); border-color:color-mix(in srgb, #e9d5ff var(--tint-mix), var(--surface)); }
    .act-dot.meeting { background:var(--gray-50); border-color:color-mix(in srgb, #bbf7d0 var(--tint-mix), var(--surface)); }
    .act-dot.note { background:color-mix(in srgb, #fffbeb var(--tint-mix), var(--surface)); border-color:#FDE68A; }
    .act-dot.doc_sent { background:var(--orange-pale); border-color:var(--orange-muted); }
    .act-text { flex:1; }
    .act-title { font-size:12px; font-weight:600; color:var(--gray-800); }
    .act-date { font-size:12px; color:var(--gray-400); margin-top:1px; }
    .act-body { font-size:12px; color:var(--gray-600); margin-top:4px; line-height:1.5; }

    /* Table */
    .tw { background:var(--surface); border:1px solid var(--gray-200); border-radius:10px; overflow-y:auto; flex:1; min-height:0; display:flex; flex-direction:column; }
    .thead { display:grid; background:var(--gray-50); border-bottom:1px solid var(--gray-200); padding:0 16px; flex-shrink:0; }
    .th { padding:8px 8px; font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.4px; color:var(--gray-500); display:flex; align-items:center; gap:4px; }
    .th.sortable { cursor:pointer; user-select:none; }
    .th.sortable:hover { color:var(--gray-700); }
    .si { font-size:10px; color:#d1d5db; }
    .tr-row { display:grid; padding:0 16px; border-bottom:1px solid var(--gray-100); cursor:pointer; transition:background .1s; align-items:center; }
    .tr-row:hover { background:var(--gray-50); }
    .td { padding:10px 8px; font-size:13px; color:var(--gray-700); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .empty-state { padding:48px; text-align:center; color:var(--gray-400); font-size:14px; display:flex; flex-direction:column; align-items:center; gap:8px; }
    .pagination { display:flex; align-items:center; gap:8px; justify-content:flex-end; padding:12px 16px; border-top:1px solid var(--gray-100); flex-shrink:0; }

    /* Modal */
    .overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:200; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(2px); }
    .modal { background:var(--surface); border-radius:14px; width:560px; max-width:95vw; box-shadow:0 11px 29px rgba(0,0,0,0.162); overflow:hidden; animation:scaleIn .2s ease; }
    @keyframes scaleIn { from { transform:scale(.95); opacity:0; } to { transform:scale(1); opacity:1; } }
    .modal-head { padding:18px 22px; border-bottom:1px solid var(--gray-200); display:flex; align-items:center; gap:12px; }
    .modal-icon { width:36px; height:36px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .modal-title { font-family:'Sora',sans-serif; font-size:16px; font-weight:700; color:var(--gray-900); }
    .modal-body { padding:20px 22px; max-height:65vh; overflow-y:auto; }
    .modal-foot { padding:14px 22px; border-top:1px solid var(--gray-200); display:flex; gap:8px; align-items:center; background:var(--gray-50); }
    .fgrid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .fg { display:flex; flex-direction:column; gap:4px; }
    .fl { font-size:12px; font-weight:600; color:var(--gray-600); }
    .fi,.fsel,.fta { background:var(--gray-50); border:1.5px solid var(--gray-200); border-radius:8px; padding:8px 12px; font-size:14px; color:var(--gray-800); outline:none; font-family:inherit; width:100%; box-sizing:border-box; }
    .fi:focus,.fsel:focus,.fta:focus { border-color:var(--orange); background:var(--surface); }
    .www-row { display:flex; align-items:stretch; gap:8px; }
    .hot-chip { height:auto !important; flex-shrink:0; font-size:14px !important; padding:0 14px !important; }
    .fta { min-height:60px; resize:vertical; }

    /* Loading */
    .loading-state { display:flex; align-items:center; justify-content:center; gap:10px; padding:48px; color:var(--gray-400); font-size:14px; }
    .spinner { width:20px; height:20px; border:2px solid var(--gray-200); border-top-color:var(--orange); border-radius:50%; animation:spin .7s linear infinite; flex-shrink:0; }
    @keyframes spin { to { transform:rotate(360deg); } }

    /* ═══════════════════════════════════════════════ */
    /* TIMELINE PANEL                                  */
    /* ═══════════════════════════════════════════════ */

    /* Backdrop */
    .tl-backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.38);
      z-index: 250;
      backdrop-filter: blur(1px);
      animation: tlFadeIn .2s ease;
    }
    @keyframes tlFadeIn { from { opacity:0; } to { opacity:1; } }

    /* Panel */
    .tl-panel {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: 420px; max-width: 100vw;
      background: var(--surface);
      display: flex; flex-direction: column;
      box-shadow: -6px 0 40px rgba(0,0,0,.22);
      animation: tlSlideIn .25s cubic-bezier(.25,.8,.25,1);
      z-index: 251;
    }
    @keyframes tlSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

    /* Panel header */
    .tl-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 18px 14px;
      border-bottom: 1px solid var(--gray-200);
      background: linear-gradient(135deg, var(--gray-50) 0%, var(--surface) 60%);
      flex-shrink: 0;
    }
    .tl-head-left { display:flex; align-items:center; gap:10px; }
    .tl-head-icon {
      width: 34px; height: 34px; border-radius: 9px;
      background: color-mix(in srgb, #dcfce7 var(--tint-mix), var(--surface)); color: oklch(from #16a34a max(l, var(--text-min-l)) c h);
      display: flex; align-items:center; justify-content:center; flex-shrink:0;
    }
    .tl-head-title { font-family:'Sora',sans-serif; font-size:16px; font-weight:700; color:var(--gray-900); }
    .tl-head-sub { font-size:12px; color:var(--gray-400); margin-top:1px; }

    /* Manager filter bar */
    .tl-filter {
      display: flex; align-items: center; gap:8px;
      padding: 10px 18px;
      border-bottom: 1px solid var(--gray-100);
      background: var(--gray-50);
      flex-shrink: 0;
    }

    /* Scrollable body */
    .tl-body { flex:1; overflow-y:auto; padding:0; }
    .tl-body::-webkit-scrollbar { width:5px; }
    .tl-body::-webkit-scrollbar-track { background:transparent; }
    .tl-body::-webkit-scrollbar-thumb { background:var(--gray-200); border-radius:4px; }

    /* Empty state */
    .tl-empty { padding:56px 24px; text-align:center; color:var(--gray-400); }

    /* Scroll hints */
    .tl-past-hint, .tl-future-hint {
      text-align: center; font-size: 10px; color: var(--gray-300);
      padding: 10px 24px;
      font-style: italic;
    }

    /* Date separator */
    .tl-date-sep {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px 8px;
      position: sticky; top: 0; z-index: 2;
      background: var(--surface);
    }
    .tl-sep-line { flex:1; height:1px; background: var(--gray-200); }
    .tl-sep-badge {
      display: flex; align-items: center; gap:4px;
      font-size: 10px; font-weight: 600;
      color: var(--gray-500);
      white-space: nowrap;
      padding: 2px 10px; border-radius: 16px;
      border: 1px solid var(--gray-200);
      background: var(--surface);
    }
    /* Today separator — highlighted */
    .tl-sep-today { background: linear-gradient(180deg, var(--gray-50), var(--surface)); padding-top:16px; }
    .tl-sep-today .tl-sep-line { background: #86EFAC; }
    .tl-sep-today .tl-sep-badge { background: color-mix(in srgb, #dcfce7 var(--tint-mix), var(--surface)); border-color: #86EFAC; color: oklch(from #15803d max(l, var(--text-min-l)) c h); font-size:12px; }
    .tl-today-dot { width:7px; height:7px; background:#22C55E; border-radius:50%; display:inline-block; flex-shrink:0; }
    .tl-today-tag { background:#22C55E; color:white; font-size:10px; font-weight:700; padding:1px 4px; border-radius:4px; text-transform:uppercase; letter-spacing:.5px; }
    /* Past separator — muted */
    .tl-sep-past .tl-sep-badge { color: var(--gray-300); border-color: var(--gray-100); }
    .tl-sep-past .tl-sep-line { background: var(--gray-100); }

    /* Timeline item */
    .tl-item {
      display: flex; align-items: stretch;
      padding: 4px 18px 4px 14px;
      cursor: pointer;
      transition: background .12s;
    }
    .tl-item:hover { background: var(--gray-50); }
    .tl-item-past { opacity: .65; }
    .tl-item-past:hover { opacity: 1; }

    /* Time column */
    .tl-item-time-col {
      width: 42px; flex-shrink:0;
      display: flex; flex-direction:column; align-items:flex-end;
      padding-top: 12px; padding-right: 4px;
    }
    .tl-item-time { font-size:12px; font-weight:700; color:var(--gray-700); font-family:'Sora',sans-serif; white-space:nowrap; }
    .tl-item-dur { font-size:10px; color:var(--gray-400); margin-top:2px; white-space:nowrap; }

    /* Connector column */
    .tl-item-dot-col {
      width: 24px; flex-shrink:0;
      display: flex; flex-direction:column; align-items:center;
    }
    .tl-item-line-top { width:2px; flex:1; background:var(--gray-200); min-height:10px; }
    .tl-item-line-bot { width:2px; flex:1; background:var(--gray-200); min-height:10px; }
    .tl-item-dot {
      width: 10px; height: 10px; border-radius:50%; flex-shrink:0;
      background: var(--gray-300); border: 2px solid var(--surface);
      box-shadow: 0 0 0 2px var(--gray-300);
    }
    .tl-dot-today { background: #22C55E; box-shadow: 0 0 0 2px #86EFAC; }
    .tl-dot-past  { background: var(--gray-200); box-shadow: 0 0 0 2px var(--gray-200); }

    /* Meeting card */
    .tl-item-card {
      flex: 1; min-width: 0;
      background: var(--surface); border: 1px solid var(--gray-200);
      border-radius: 10px; padding: 10px 12px;
      margin: 6px 0 6px 8px;
      position: relative;
      transition: all .15s;
    }
    .tl-item:hover .tl-item-card {
      border-color: color-mix(in srgb, #d1fae5 var(--tint-mix), var(--surface));
      box-shadow: 0 3px 12px rgba(34,197,94,.1);
    }
    .tl-card-today {
      border-color: #86EFAC;
      background: linear-gradient(135deg, var(--gray-50) 0%, var(--surface) 50%);
    }
    .tl-item-header {
      display: flex; align-items: center; gap:4px;
      margin-bottom: 4px;
    }
    .tl-src-badge {
      font-size: 10px; font-weight: 700; text-transform:uppercase; letter-spacing:.4px;
      padding: 1px 4px; border-radius: 4px; flex-shrink:0;
    }
    .tl-src-lead    { background: color-mix(in srgb, #eff6ff var(--tint-mix), var(--surface)); color: oklch(from #1d4ed8 max(l, var(--text-min-l)) c h); }
    .tl-src-partner { background: var(--gray-50); color: oklch(from #7e22ce max(l, var(--text-min-l)) c h); }
    .tl-item-company { font-size:12px; color:var(--gray-500); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tl-item-title { font-size:12px; font-weight:700; color:var(--gray-900); line-height:1.35; margin-bottom:4px; }
    .tl-item-meta { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
    .tl-item-loc { font-size:10px; color:var(--gray-500); display:flex; align-items:center; gap:4px; }
    .tl-item-rep { font-size:10px; color:var(--gray-500); display:flex; align-items:center; gap:4px; }
    .tl-item-body { font-size:12px; color:var(--gray-500); margin-top:4px; line-height:1.5; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
    .tl-item-arrow {
      position:absolute; right:10px; top:50%; transform:translateY(-50%);
      font-size:12px; color:var(--gray-300); opacity:0; transition:opacity .15s;
    }
    .tl-item:hover .tl-item-arrow { opacity:1; color: var(--orange-text); }

    /* ═══════════════════════════════════════════════ */
    /* MEETING DETAIL                                  */
    /* ═══════════════════════════════════════════════ */
    .meet-detail-grid { display:flex; flex-direction:column; gap:10px; }
    .meet-field { background:var(--gray-50); border:1px solid var(--gray-100); border-radius:8px; padding:10px 12px; }
    .meet-field-label { font-size:10px; font-weight:700; color:var(--gray-400); text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
    .meet-field-val { font-size:14px; color:var(--gray-800); font-weight:500; line-height:1.45; }
  `],
})
export class CrmLeadsListComponent implements OnInit, OnDestroy {
  private api      = inject(CrmApiService);
  private auth     = inject(AuthService);
  private settings = inject(AppSettingsService);
  private transloco = inject(TranslocoService);
  private locale = inject(LocaleService);

  get hasPbxFeature(): boolean { return this.auth.hasFeature('pbx'); }
  get hasWhatsappFeature(): boolean { return this.auth.hasFeature('whatsapp'); }

  get dictTitles(): string[] {
    try {
      const v = this.settings.get('crm_contact_titles' as any);
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') return JSON.parse(v);
    } catch (_) {}
    return ['CEO','CFO','CTO','COO','VP','Director','Manager','Specialist','Owner','Other'];
  }
  private zone   = inject(NgZone);
  readonly cdr   = inject(ChangeDetectorRef);
  private router = inject(Router);
  private projectTaskNavigation = inject(ProjectTaskNavigationService);
  private route  = inject(ActivatedRoute);

  // Etapy są konfigurowalne per tenant — kolumny kanbanu, nazwy, kolory i
  // prawdopodobieństwa czytamy z serwisu, nigdy z listy w tym pliku.
  readonly stages = inject(LeadStagesService);
  leadSources: LeadSource[] = LEAD_SOURCES;

  allLeads: Lead[]     = [];
  loading              = true;
  saving               = false;
  loadingDetail        = false;
  viewMode: 'kanban' | 'table' = 'kanban';
  sortCol = 'company';
  sortDir: 'asc' | 'desc' = 'asc';

  selected: Lead | null = null;
  dpTab: 'info' | 'activity' = 'info';

  search       = '';
  scopeFilter: 'all' | 'mine' = 'all';
  filterHot    = false;
  filterHoldOnly = false;
  filterSource = '';

  sourcesWithoutGroup(): LeadSource[] { return this.leadSources.filter(s => !s.group); }
  sourceGroups(): string[] { return [...new Set(this.leadSources.filter(s => s.group).map(s => s.group!))]; }
  sourcesInGroup(g: string): LeadSource[] { return this.leadSources.filter(s => s.group === g); }
  sourceOptionLabel(source: LeadSource): string {
    const key = leadSourceLabelKey(source.value);
    return key ? this.transloco.translate('crm.' + key) : source.label;
  }
  sourceGroupLabel(group: string): string {
    const key = DEFAULT_SOURCE_GROUP_KEYS[group];
    return key ? this.transloco.translate('crm.leadsList.sourceGroups.' + key) : group;
  }

  onSourceFilterChange(): void {
    if (this.filterSource.startsWith('__group__')) {
      // group filter — expand to comma-separated values
      const g = this.filterSource.replace('__group__', '');
      this._sourceFilterValues = this.sourcesInGroup(g).map(s => s.value);
    } else {
      this._sourceFilterValues = this.filterSource ? [this.filterSource] : [];
    }
    this.load();
  }
  private _sourceFilterValues: string[] = [];
  filterUser   = '';
  filterStageUI = '';   // filtr etapu w toolbarze (nowy)
  persistRepName = '';  // wyświetlana nazwa persistowanego handlowca
  private readonly REP_FILTER_KEY = 'crm_rep_filter';
  // Filtry z Raportu Sprzedaży (query params)
  filterStage        = '';
  filterCloseDateFrom = '';
  filterCloseDateTo   = '';
  filterCreatedFrom   = '';
  filterCreatedTo     = '';
  filterLostReason    = '';
  reportFilterLabel   = '';   // np. "Stage: Nowy" — widoczne jako chip nad listą

  page            = 1;
  totalPages      = 1;
  total           = 0;
  totalQualified  = 0;

  showNew   = false;
  submitted = false;
  newForm: any = {};
  nipError = '';
  saveError = '';
  readonly amountError = amountError;
  newFormErrors: string[] = [];
  newExtraContacts: {contact_name:string, contact_title:string, email:string, phone:string}[] = [];

  /**
   * Pełne dane są wymagane od momentu, gdy lead wchodzi do lejka na serio —
   * czyli na każdym etapie poza wejściowym (dotąd: lista od Kwalifikacji
   * w górę, wypisana na sztywno).
   */
  get newFormRequiresFull(): boolean {
    const funnel = this.stages.funnel();
    if (!this.newForm.stage || !funnel.length) return false;
    return this.newForm.stage !== funnel[0].key;
  }

  newMissing(field: string): boolean {
    if (!this.submitted || !this.newFormRequiresFull) return false;
    const f = this.newForm;
    switch (field) {
      case 'website':      return !this.newFormWebsite;
      case 'contactName':  return !f.contact_name;
      case 'contactTitle': return !f.contact_title;
      case 'email':        return !f.email;
      case 'phone':        return !f.phone;
      case 'value':        return !f.value_pln && f.value_pln !== 0;
      case 'firstContact': return !f.first_contact_date;
      case 'source':       return !f.source;
      case 'salesperson':  return !f.assigned_to;
      default:             return false;
    }
  }

  validateNewForm(): string[] {
    if (!this.newFormRequiresFull) return [];
    const f = this.newForm;
    const errs: string[] = [];
    if (!this.newFormWebsite)    errs.push(this.transloco.translate('crm.leadsList.fields.website'));
    if (!f.contact_name)         errs.push(this.transloco.translate('crm.leadsList.newLead.requiredContactName'));
    if (!f.contact_title)        errs.push(this.transloco.translate('crm.leadsList.fields.companyRole'));
    if (!f.email)                errs.push(this.transloco.translate('crm.leadsList.fields.email'));
    if (!f.phone)                errs.push(this.transloco.translate('crm.leadsList.fields.phone'));
    if (!f.value_pln && f.value_pln !== 0) errs.push(this.transloco.translate('crm.leadsList.fields.annualTurnover'));
    if (!f.first_contact_date)   errs.push(this.transloco.translate('crm.leadsList.fields.firstContact'));
    if (!f.source)               errs.push(this.transloco.translate('crm.leadsList.fields.source'));
    if (!f.assigned_to)          errs.push(this.transloco.translate('crm.leadsList.fields.salesRep'));
    return errs;
  }

  onNipChange(ctx: 'lead' | 'partner' = 'lead'): void {
    const val = (this.newForm.nip || '').trim().toUpperCase();
    if (!val) { this.nipError = this.transloco.translate('crm.leadsList.newLead.taxIdErrors.required'); return; }
    const cc = val.slice(0, 2);
    const digits = val.slice(2);
    if (!/^[A-Z]{2}$/.test(cc)) {
      this.nipError = this.transloco.translate('crm.leadsList.newLead.taxIdErrors.countryCode');
      return;
    }
    if (cc === 'PL' && !/^\d{10}$/.test(digits)) {
      this.nipError = this.transloco.translate('crm.leadsList.newLead.taxIdErrors.polishDigits');
      return;
    }
    if (cc !== 'PL' && digits.length === 0) {
      this.nipError = this.transloco.translate('crm.leadsList.newLead.taxIdErrors.numberMissing');
      return;
    }
    this.nipError = '';
  }

  crmUsers: CrmUser[] = [];
  crmGroups: CrmGroup[] = [];

  stats = { total: 0, hot: 0, pipeline: 0, won: 0, lost: 0 };

  private searchTimer: any;

  // WWW Enrichment
  newFormWebsite    = '';
  enriching         = false;
  enrichPrompt      = false;
  enrichResult: any = null;
  private enrichTimer: any;

  // Logo SAS cache: leadId → SAS URL
  logoSasMap: Record<number, string> = {};

  // ── Timeline state ──────────────────────────────────────────
  showTimeline     = false;
  timelineLoading  = false;
  timelineMeetings: CalendarMeeting[] = [];
  timelineUser     = '';

  // ── Meeting detail / edit state ─────────────────────────────
  selectedMeeting: CalendarMeeting | null = null;
  meetingEditMode  = false;
  meetingForm: any = {};
  savingMeeting    = false;

  // ─────────────────────────────────────────────────────────────

  get isManager() {
    const u = this.auth.user();
    return u?.is_admin || (u as any)?.crm_role === 'sales_manager';
  }

  ngOnInit() {
    // Załaduj dynamiczne źródła
    this.api.getLeadSources().subscribe({
      next: s => this.zone.run(() => { this.leadSources = s; this.cdr.markForCheck(); }),
      error: () => {},
    });
    // Odczytaj query params z nawigacji z Raportu Sprzedaży
    const qp = this.route.snapshot.queryParamMap;
    this.filterStage         = qp.get('stage')           || '';
    this.filterStageUI       = this.filterStage;
    this.filterSource        = qp.get('source')          || '';
    this.filterUser          = qp.get('assigned_to')     || '';
    this.filterCloseDateFrom = qp.get('close_date_from') || '';
    this.filterCloseDateTo   = qp.get('close_date_to')   || '';
    this.filterCreatedFrom   = qp.get('created_from')    || '';
    this.filterCreatedTo     = qp.get('created_to')      || '';
    this.filterLostReason    = qp.get('lost_reason')     || '';
    if (qp.get('hot') === 'true') this.filterHot = true;
    if (qp.get('hold_only') === 'true') this.filterHoldOnly = true;
    this.reportFilterLabel   = qp.get('label')           || '';
    if (qp.get('view') === 'table') this.viewMode = 'table';
    if (qp.get('mine') === 'true') this.scopeFilter = 'mine';

    // Załaduj persistowany filtr handlowca (sessionStorage) — tylko jeśli nie ma query param
    if (!this.filterUser) this.loadPersistRepFilter();

    this.load();
    this.api.getCrmUsers().subscribe({
      next: u => this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }),
      error: () => {},
    });
    if (this.isManager) {
      this.api.getCrmGroups().subscribe({
        next: g => this.zone.run(() => { this.crmGroups = g; this.cdr.markForCheck(); }),
        error: () => {},
      });
    }
    // Auto-odśwież odznaki nowych emaili co 60 sekund
    this.refreshInterval = setInterval(() => this.load(), 60_000);
  }

  private refreshInterval: any = null;

  ngOnDestroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  get sortedLeads(): any[] {
    const col = this.sortCol;
    const dir = this.sortDir;
    return [...this.allLeads].sort((a, b) => {
      let va: any = (a as any)[col] ?? '';
      let vb: any = (b as any)[col] ?? '';
      if (col === 'value_pln' || col === 'online_pct' || col === 'probability') { va = +(va||0); vb = +(vb||0); return dir==='asc' ? va-vb : vb-va; }
      if (col === 'close_date' || col === 'first_contact_date') { va = va?new Date(va).getTime():0; vb = vb?new Date(vb).getTime():0; return dir==='asc'?va-vb:vb-va; }
      const cmp = String(va).localeCompare(String(vb), this.locale.activeLocale(), { sensitivity: 'base' });
      return dir==='asc' ? cmp : -cmp;
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

  clearReportFilter(): void {
    this.filterStage = ''; this.filterStageUI = ''; this.filterCloseDateFrom = ''; this.filterCloseDateTo = '';
    this.filterCreatedFrom = ''; this.filterCreatedTo = '';
    this.filterLostReason = ''; this.reportFilterLabel = '';
    this.load();
  }

  onStageFilterChange(): void {
    this.filterStage = ''; // wyczyść filtr z raportu gdy user wybiera z toolbara
    this.load();
  }

  /**
   * A stage filter narrows the board to that stage's column. Only a stage the
   * board has no column for (Archive) cannot be shown there, so switching to
   * the board drops that one filter — otherwise the view silently stays a
   * table and the button looks broken.
   */
  setViewMode(mode: 'kanban' | 'table'): void {
    const isTarget = mode === 'kanban' ? this.isKanbanView : !this.isKanbanView;
    if (!isTarget) this.toggleViewMode();
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'kanban' ? 'table' : 'kanban';

    const activeStageFilter = this.filterStage || this.filterStageUI;
    if (this.viewMode === 'kanban' && activeStageFilter && !this.fitsKanban(activeStageFilter)) {
      this.filterStage = '';
      this.filterStageUI = '';
      // The chip describes filters that came from the sales report; it would name a
      // stage that is no longer applied, unless some other report filter survives.
      if (!this.filterCloseDateFrom && !this.filterCloseDateTo
        && !this.filterCreatedFrom && !this.filterCreatedTo && !this.filterLostReason) {
        this.reportFilterLabel = '';
      }
    }

    // Both views read different page sizes (the board needs every lead, the table
    // one page), so the data has to be refetched for the view being switched to.
    this.load();
  }

  // ── Persistent rep filter (sessionStorage) ───────────────────────
  private loadPersistRepFilter(): void {
    try {
      const saved = sessionStorage.getItem(this.REP_FILTER_KEY);
      if (saved) {
        const { userId, displayName } = JSON.parse(saved);
        this.filterUser    = userId;
        this.persistRepName = displayName;
      }
    } catch { }
  }

  onRepFilterChange(filterVal: string): void {
    let displayName = '';
    if (filterVal.startsWith('__group__')) {
      const groupId = filterVal.replace('__group__', '');
      const group = this.crmGroups.find(g => g.id === groupId);
      displayName = group ? this.transloco.translate('crm.leadsList.filters.groupChip', { name: group.name }) : '';
    } else {
      const user = this.crmUsers.find(u => u.id === filterVal);
      displayName = user?.display_name || '';
    }
    this.persistRepName = filterVal ? displayName : '';
    try {
      if (filterVal) sessionStorage.setItem(this.REP_FILTER_KEY, JSON.stringify({ userId: filterVal, displayName }));
      else           sessionStorage.removeItem(this.REP_FILTER_KEY);
    } catch { }
    this.load();
  }

  clearPersistRepFilter(): void {
    this.filterUser     = '';
    this.persistRepName = '';
    try { sessionStorage.removeItem(this.REP_FILTER_KEY); } catch { }
    this.load();
  }

  /** Kanban nie ma kolumny dla etapu spoza lejka i zamknięcia (np. Archiwum),
   *  więc przy takim filtrze Etap pokazujemy tabelę, niezależnie od viewMode. */
  get isKanbanView(): boolean {
    const activeStageFilter = this.filterStage || this.filterStageUI;
    return this.viewMode === 'kanban' && (!activeStageFilter || this.fitsKanban(activeStageFilter));
  }

  private fitsKanban(stage: string): boolean {
    return this.stages.funnel().some(s => s.key === stage)
      || (this.stages.tracksOutcome() && this.stages.isClosed(stage));
  }

  /** Przy filtrze Etap plansza pokazuje tylko kolumnę wybranego etapu. */
  kanbanColumns() {
    const activeStageFilter = this.filterStage || this.filterStageUI;
    const funnel = this.stages.funnel();
    return activeStageFilter ? funnel.filter(s => s.key === activeStageFilter) : funnel;
  }

  showsClosedColumn(): boolean {
    const activeStageFilter = this.filterStage || this.filterStageUI;
    return this.stages.tracksOutcome() && (!activeStageFilter || this.stages.isClosed(activeStageFilter));
  }

  load() {
    this.loading = true;
    const isKanban = this.isKanbanView;
    const activeStageFilter = this.filterStage || this.filterStageUI;
    const params: any = { limit: isKanban ? 2000 : 200 };
    if (this.filterHot)              params['hot']             = true;
    if (this.filterHoldOnly)         params['hold_only']       = true;
    if (this._sourceFilterValues.length === 1) {
      params['source'] = this._sourceFilterValues[0];
    } else if (this._sourceFilterValues.length > 1) {
      params['source'] = this._sourceFilterValues.join(',');
    }
    if (this.filterUser) {
      if (this.filterUser.startsWith('__group__')) {
        const groupId = this.filterUser.replace('__group__', '');
        const group = this.crmGroups.find(g => g.id === groupId);
        if (group && group.user_ids.length > 0) params['assigned_to'] = group.user_ids.join(',');
      } else {
        params['assigned_to'] = this.filterUser;
      }
    }
    if (this.scopeFilter === 'mine') params['mine'] = true;
    if (this.search)                 params['search']          = this.search;
    if (activeStageFilter)           params['stage']           = activeStageFilter;
    if (this.filterCloseDateFrom)    params['close_date_from'] = this.filterCloseDateFrom;
    if (this.filterCloseDateTo)      params['close_date_to']   = this.filterCloseDateTo;
    if (this.filterCreatedFrom)      params['created_from']    = this.filterCreatedFrom;
    if (this.filterCreatedTo)        params['created_to']      = this.filterCreatedTo;
    if (this.filterLostReason)       params['lost_reason']     = this.filterLostReason;

    this.api.getLeads(params).subscribe({
      next: res => this.zone.run(() => {
        this.allLeads        = res.data;
        this.total           = res.total;
        const entryStage = this.stages.funnel()[0]?.key;
        this.totalQualified  = res.total_qualified ?? (res.total - (res.data as any[]).filter((l: any) => l.stage === entryStage).length);
        this.totalPages      = res.pages;
        this.calcStats();
        this.loading = false;
        this.cdr.markForCheck();
        // Load SAS URLs for leads with logos
        for (const lead of res.data) {
          if ((lead as any).logo_url) this.loadLogoSas(lead);
        }
      }),
      error: () => this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }),
    });
  }

  calcStats() {
    const entryStage = this.stages.funnel()[0]?.key;
    const active = this.allLeads.filter(l =>
      !l.converted_at && l.stage !== entryStage && l.stage !== 'archived' && !l.hold_active);
    this.stats = {
      total:    this.totalQualified,
      hot:      active.filter(l => l.hot).length,
      pipeline: active.filter(l => !this.stages.isClosed(l.stage))
                      .reduce((s, l) => s + +(l.value_pln || 0), 0),
      won:      active.filter(l => this.stages.isWon(l.stage)).length,
      lost:     active.filter(l => this.stages.isLost(l.stage)).length,
    };
  }

  leadsFor(stage: string | null): Lead[] {
    if (!stage) return [];
    return this.allLeads.filter(l => l.stage === stage);
  }

  closedLeads(): Lead[] {
    return this.allLeads.filter(l => this.stages.isClosed(l.stage));
  }

  /** ✓ / ✗ przed nazwą etapu zamknięcia na liście filtrów. */
  stageOptionPrefix(kind: string): string {
    if (kind === 'won')  return '✓ ';
    if (kind === 'lost') return '✗ ';
    return '';
  }

  valueFor(stage: string): number {
    return Math.round(this.leadsFor(stage).reduce((s, l) => s + +(l.value_pln || 0), 0) / 1000);
  }

  closeOnOverlay(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('dp-overlay')) {
      this.selected = null;
      this.cdr.markForCheck();
    }
  }

  selectLead(lead: Lead) {
    this.router.navigate(['/crm/leads', lead.id]);
  }

  onSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page = 1; this.load(); }, 350);
  }

  setScope(s: 'all' | 'mine') { this.scopeFilter = s; this.load(); }
  setPage(p: number)           { this.page = p; this.load(); }

  openNew() {
    this.nipError = '';
    this.saveError = '';
    this.newForm       = { company:'', contact_name:'', contact_title:'', email:'', phone:'', nip:'PL',
                           value_pln: null, source:'', stage: this.stages.funnel()[0]?.key ?? 'new',
                           hot:false, notes:'', assigned_to:'', first_contact_date:'' };
    this.newFormWebsite   = '';
    this.enrichPrompt     = false;
    this.enrichResult     = null;
    this.submitted        = false;
    this.newExtraContacts = [];
    this.showNew          = true;
  }

  addNewExtraContact() {
    this.newExtraContacts = [...this.newExtraContacts, { contact_name:'', contact_title:'', email:'', phone:'' }];
  }

  removeNewExtraContact(i: number) {
    this.newExtraContacts = this.newExtraContacts.filter((_, idx) => idx !== i);
  }

  onWebsiteChange() {
    if (this.enrichTimer) clearTimeout(this.enrichTimer);
    this.enrichPrompt = false;
    const d = this.newFormWebsite.trim();
    if (d.length < 3) return;
    this.enrichTimer = setTimeout(() => {
      this.enrichPrompt = true;
      this.cdr.markForCheck();
    }, 800);
  }

  runEnrich() {
    this.enrichPrompt = false;
    this.enriching    = true;
    this.cdr.markForCheck();
    this.api.enrichDomain(this.newFormWebsite).subscribe({
      next: (r: any) => this.zone.run(() => {
        this.enriching    = false;
        this.enrichResult = r;
        // Pre-fill form fields only if empty
        if (r.company    && !this.newForm.company)       this.newForm.company      = r.company;
        if (r.email      && !this.newForm.email)         this.newForm.email        = r.email;
        if (r.phone      && !this.newForm.phone)         this.newForm.phone        = r.phone;
        if (r.logo_blob_path) (this.newForm as any).logo_url = r.logo_blob_path;
        (this.newForm as any).website = this.newFormWebsite;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.enriching = false; this.cdr.markForCheck(); }),
    });
  }

  hasLogo(lead: Lead): boolean { return !!(lead as any).logo_url; }

  loadLogoSas(lead: Lead): void {
    if (!(lead as any).logo_url || this.logoSasMap[lead.id] !== undefined) return;
    this.logoSasMap = { ...this.logoSasMap, [lead.id]: '' }; // placeholder
    this.api.getLeadLogoImg(lead.id).subscribe({
      next: blobUrl => { this.logoSasMap = { ...this.logoSasMap, [lead.id]: `url('${blobUrl}')` }; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  createLead() {
    this.submitted = true;
    this.saveError = '';
    this.onNipChange();
    const nipVal = (this.newForm.nip || this.enrichResult?.nip || '').trim();
    this.newFormErrors = this.validateNewForm();
    if (!this.newForm.company || !nipVal || this.nipError || this.newFormErrors.length > 0 || amountError(this.newForm.value_pln)) {
      scrollToFirstFieldError();
      return;
    }
    this.saving = true;
    const payload: any = {
      company:       this.newForm.company,
      contact_name:  this.newForm.contact_name  || null,
      contact_title: this.newForm.contact_title || null,
      email:         this.newForm.email         || null,
      phone:         this.newForm.phone         || null,
      value_pln:     this.newForm.value_pln     || null,
      source:        this.newForm.source        || null,
      stage:         this.newForm.stage,
      hot:           this.newForm.hot,
      notes:         this.newForm.notes         || null,
      first_contact_date: this.newForm.first_contact_date || null,
      nip:           (this.newForm.nip || this.enrichResult?.nip || '').trim().toUpperCase() || null,
      website:       this.newFormWebsite        || null,
      logo_url:      (this.newForm as any).logo_url || null,
    };
    if (this.newForm.assigned_to) payload.assigned_to = this.newForm.assigned_to;

    this.api.createLead(payload, { showsOwnError: true }).subscribe({
      next: lead => this.zone.run(() => {
        this.allLeads  = [lead, ...this.allLeads];
        this.total    += 1;
        this.calcStats();
        const nonEmpty = this.newExtraContacts.filter(ec => ec.contact_name || ec.email || ec.phone);
        if (nonEmpty.length > 0) {
          this.api.saveLeadContacts(lead.id, nonEmpty).subscribe({ error: () => {} });
        }
        this.showNew   = false;
        this.saving    = false;
        if ((lead as any).logo_url) this.loadLogoSas(lead);
        this.cdr.markForCheck();
      }),
      error: (err: any) => this.zone.run(() => {
        this.saving = false;
        if (err?.status === 409) {
          this.nipError = this.transloco.translate('crm.leadsList.newLead.taxIdErrors.duplicate');
          scrollToFirstFieldError();
        } else {
          this.saveError = describeHttpError(err, this.transloco);
        }
        this.cdr.markForCheck();
      }),
    });
  }

  // ─── Timeline ────────────────────────────────────────────────────

  openTimeline() {
    this.showTimeline = true;
    this.timelineUser = '';
    this.loadTimeline();
  }

  loadTimeline() {
    this.timelineLoading = true;
    this.timelineMeetings = [];
    this.cdr.markForCheck();

    const p: any = {};
    if (this.timelineUser && this.isManager) p['assigned_to'] = this.timelineUser;

    this.api.getCalendarMeetings(p).subscribe({
      next: meetings => this.zone.run(() => {
        // Sort chronologically (oldest → newest = past → future)
        this.timelineMeetings = [...meetings].sort(
          (a, b) => new Date(a.activity_at).getTime() - new Date(b.activity_at).getTime()
        );
        this.timelineLoading = false;
        this.cdr.markForCheck();

        // Scroll to today (or first future meeting) after render
        setTimeout(() => {
          const target =
            document.getElementById('tl-today') ||
            document.getElementById('tl-first-future');
          if (target) {
            const body = document.getElementById('tlBody');
            if (body) {
              body.scrollTop = target.offsetTop - (body as HTMLElement).offsetTop - 4;
            }
          }
        }, 80);
      }),
      error: () => this.zone.run(() => { this.timelineLoading = false; this.cdr.markForCheck(); }),
    });
  }

  /** Grouped meetings for template rendering */
  get timelineGroups(): {
    dateKey: string;
    dateLabel: string;
    isToday: boolean;
    isPast: boolean;
    isFuture: boolean;
    isFirstFuture: boolean;
    meetings: CalendarMeeting[];
  }[] {
    const now          = new Date();
    const todayStr     = now.toDateString();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const groups: {
      dateKey: string; dateLabel: string;
      isToday: boolean; isPast: boolean; isFuture: boolean; isFirstFuture: boolean;
      meetings: CalendarMeeting[];
    }[] = [];

    for (const m of this.timelineMeetings) {
      const d   = new Date(m.activity_at);
      const key = d.toDateString();

      let group = groups.find(g => g.dateKey === key);
      if (!group) {
        const isToday  = key === todayStr;
        const isPast   = !isToday && d.getTime() < startOfToday;
        const isFuture = !isToday && !isPast;
        group = { dateKey: key, dateLabel: this.tlDateLabel(d), isToday, isPast, isFuture, isFirstFuture: false, meetings: [] };
        groups.push(group);
      }
      group.meetings.push(m);
    }

    // Mark the very first non-past group that is NOT today as "first future" (fallback scroll target)
    let markedFirstFuture = false;
    for (const g of groups) {
      if (!g.isPast && !g.isToday && !markedFirstFuture) {
        g.isFirstFuture = true;
        markedFirstFuture = true;
      }
    }

    return groups;
  }

  get hasPastMeetings(): boolean {
    return this.timelineMeetings.some(m => {
      const d = new Date(m.activity_at);
      const startOfToday = new Date();
      startOfToday.setHours(0,0,0,0);
      return d < startOfToday;
    });
  }

  get hasFutureMeetings(): boolean {
    const now = new Date();
    now.setHours(23,59,59,999);
    return this.timelineMeetings.some(m => new Date(m.activity_at) > now);
  }

  tlDateLabel(d: Date): string {
    const today     = new Date();
    const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

    const fmt = (date: Date) =>
      date.toLocaleDateString(this.locale.activeLocale(), { day: 'numeric', month: 'long', year: 'numeric' });

    if (d.toDateString() === today.toDateString())     return fmt(d);
    if (d.toDateString() === tomorrow.toDateString())  return this.transloco.translate('crm.leadsList.timeline.tomorrow', { date: fmt(d) });
    if (d.toDateString() === yesterday.toDateString()) return this.transloco.translate('crm.leadsList.timeline.yesterday', { date: fmt(d) });

    return d.toLocaleDateString(this.locale.activeLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ─── Meeting detail / edit ───────────────────────────────────────

  openMeetingDetail(m: CalendarMeeting) {
    // Project tasks are view-only here: a click opens them in the Projects module.
    if (m.source_type === 'project') {
      this.projectTaskNavigation.open(String(m.source_id), m.project_task_id ?? null, {
        label: this.transloco.translate('crm.leadsList.breadcrumb'), route: ['/crm/leads'],
      });
      return;
    }
    this.selectedMeeting = m;
    this.meetingEditMode = false;
    this.meetingForm = {
      title:            m.title,
      body:             m.body             || '',
      activity_at:      m.activity_at
        ? new Date(m.activity_at).toISOString().slice(0, 16)
        : '',
      duration_min:     m.duration_min     ?? '',
      participants:     m.participants     || '',
      meeting_location: m.meeting_location || '',
    };
    this.cdr.markForCheck();
  }

  closeMeetingOnOverlay(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('overlay')) {
      this.selectedMeeting = null;
      this.meetingEditMode = false;
      this.cdr.markForCheck();
    }
  }

  saveMeeting() {
    if (!this.selectedMeeting || this.savingMeeting) return;
    if (!this.meetingForm.title?.trim()) return;

    this.savingMeeting = true;
    this.cdr.markForCheck();

    const data: any = {
      title:            this.meetingForm.title.trim(),
      body:             this.meetingForm.body             || null,
      activity_at:      this.meetingForm.activity_at      || null,
      duration_min:     this.meetingForm.duration_min !== '' ? +this.meetingForm.duration_min : null,
      participants:     this.meetingForm.participants     || null,
      meeting_location: this.meetingForm.meeting_location || null,
    };

    const src = this.selectedMeeting!;
    const obs$ = (src.source_type === 'lead'
      ? this.api.updateLeadActivity(+src.source_id, src.id, data)
      : this.api.updatePartnerActivity(+src.source_id, src.id, data)) as any;

    obs$.subscribe({
      next: () => this.zone.run(() => {
        // Update the item in the timeline list
        const idx = this.timelineMeetings.findIndex(
          m => m.id === src.id && m.source_type === src.source_type
        );
        if (idx >= 0) {
          this.timelineMeetings = this.timelineMeetings.map((m, i) =>
            i === idx ? { ...m, ...data } : m
          );
          // Re-sort after date change
          this.timelineMeetings.sort(
            (a, b) => new Date(a.activity_at).getTime() - new Date(b.activity_at).getTime()
          );
        }
        // Update the selected meeting preview
        this.selectedMeeting  = { ...src, ...data };
        this.meetingEditMode  = false;
        this.savingMeeting    = false;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.savingMeeting = false; this.cdr.markForCheck(); }),
    });
  }

  // ── Helpers ──
  srcLabel(val: string | null): string {
    if (!val) return '';
    const key = leadSourceLabelKey(val);
    if (key) return this.transloco.translate('crm.' + key);
    return this.leadSources.find(s => s.value === val)?.label ?? val;
  }
  initials(name: string)       { return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(); }
  tlTypeName(type: string): string {
    return ACTIVITY_TYPES_WITH_LABEL.includes(type) ? this.transloco.translate('crm.labels.activityTypes.' + type) : type;
  }
  tlTypeIcon(type: string): string {
    return { call:'📞', email:'📧', meeting:'🤝', note:'📝', training:'🎓', qbr:'📊', doc_sent:'📄', opportunity:'💡' }[type] || '💬';
  }
  trackById(_: number, l: Lead){ return l.id; }
  callPhone(p: string)         { window.location.href = `tel:${p}`; }
  mailTo(e: string)            { window.location.href = `mailto:${e}`; }
  /** Short amount in the viewer's language: 950 · 12 tys. · 4,5 mln · 11,1 mld (en: 12K, 4.5M, 11.1B). */
  formatPLN(v: number): string {
    return new Intl.NumberFormat(this.locale.activeLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v || 0);
  }

  hasUnreadReply(lead: any): boolean {
    return (lead.new_email_count ?? 0) > 0;
  }

  unreadReplyCount(lead: any): number {
    return lead.new_email_count ?? 0;
  }


  actIcon(type: string) {
    return { call:'📞', email:'✉', meeting:'🤝', note:'📝', doc_sent:'📄' }[type] ?? '💬';
  }
}

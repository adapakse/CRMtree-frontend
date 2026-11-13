// src/app/pages/crm/partners/crm-partners-list.component.ts
import { Component, OnInit, OnDestroy, inject, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { CrmApiService, Partner, PartnerStatus, PARTNER_STATUS_LABELS, CrmUser, PartnersReportPartner } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { localizedApiErrorMessage } from '../../../core/services/api-error.util';

type SortDir = 'asc' | 'desc';

@Component({
  selector: 'wt-crm-partners-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('crm')],
  template: `
<ng-container *transloco="let t; prefix: 'crm'">
<div class="page">

  <!-- TOPBAR -->
  <div class="topbar">
    <h1>{{ t('partnersList.title') }}</h1>
    <span style="flex:1"></span>
    <div class="srch-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input class="srch" type="search" [(ngModel)]="search" (ngModelChange)="onSearch()" [placeholder]="t('partnersList.toolbar.searchPlaceholder')">
    </div>
    <button class="btn btn-p" (click)="openCreateForm()">+ {{ t('partnersList.create.title') }}</button>
  </div>

  <div class="content">
  <!-- TOOLBAR -->
  <div class="toolbar">
    <button class="fchip" [class.on]="onlyMine" (click)="onlyMine = !onlyMine; onOnlyMineChange()">{{ t('partnersList.toolbar.onlyMine') }}</button>
    <select class="sel" [(ngModel)]="filterStatus" (ngModelChange)="reload()">
      <option value="">{{ t('partnersList.toolbar.allStatuses') }}</option>
      <option *ngFor="let s of statusOptions" [value]="s.key">{{ t(s.labelKey) }}</option>
    </select>
    <select class="sel" [(ngModel)]="filterManager" (ngModelChange)="reload()" *ngIf="isManager">
      <option value="">{{ t('partnersList.toolbar.allSalesReps') }}</option>
      <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
    </select>
    <select class="sel" [(ngModel)]="filterGroup" (ngModelChange)="reload()">
      <option value="">{{ t('partnersList.toolbar.allGroups') }}</option>
      <option *ngFor="let g of partnerGroupNames" [value]="g">{{g}}</option>
    </select>
    <select class="sel" [(ngModel)]="filterIndustry" (ngModelChange)="reload()">
      <option value="">{{ t('partnersList.toolbar.allIndustries') }}</option>
      <option *ngFor="let i of industries" [value]="i">{{i}}</option>
    </select>
    <button class="btn btn-g btn-sm" *ngIf="filterStatus||filterManager||filterGroup||filterIndustry||reportFilterLabel||onlyMine" (click)="clearFilters()">✕ {{ t('partnersList.toolbar.clear') }}</button>
    <div class="view-row">
      <button class="fchip" [class.on]="viewMode==='cards'" (click)="viewMode='cards'">⊞ {{ t('partnersList.view.cards') }}</button>
      <button class="fchip" [class.on]="viewMode==='table'" (click)="viewMode='table'">☰ {{ t('partnersList.view.table') }}</button>
    </div>
  </div>

  <!-- Banner filtru z raportu -->
  <div *ngIf="reportFilterLabel" style="background:var(--orange-pale);border-bottom:1px solid var(--orange-muted);padding:6px 20px;font-size:12px;color:var(--orange-dark);display:flex;align-items:center;gap:8px;flex-shrink:0">
    <span>📊</span>
    <span>{{ t('partnersList.reportFilter.label') }} <strong>{{reportFilterLabel}}</strong></span>
    <button (click)="clearFilters()" style="background:none;border:none;cursor:pointer;color:var(--orange-dark);font-size:12px;margin-left:4px">✕ {{ t('partnersList.reportFilter.clear') }}</button>
  </div>

  <div *ngIf="loading" style="height:3px;background:linear-gradient(90deg,#3BAA5D,#86efac)"></div>

  <!-- ══ KARTY ══ -->
  <div *ngIf="!loading && viewMode==='cards'" class="cards-grid">
    <div *ngFor="let p of partners" class="partner-card" (click)="goPartner(p.id, p.crm_uuid)">
      <div class="pc-top">
        <div class="pc-company">
          {{p.dwh_company_name || p.company}}
          <span *ngIf="p.dwh_partner_id" style="background:color-mix(in srgb, #ede9fe var(--tint-mix), var(--surface));color:oklch(from #7c3aed max(l, var(--text-min-l)) c h);font-size:10px;font-weight:700;padding:1px 4px;border-radius:4px;margin-left:4px;vertical-align:middle">DWH</span>
          <span *ngIf="(p.doc_count??0)===0" [title]="t('partnersList.documents.noContract')" style="color:oklch(from #f97316 max(l, var(--text-min-l)) c h);font-size:14px;margin-left:4px;vertical-align:middle">📄⚠️</span>
          <span *ngIf="p.crm_uuid && (p.doc_count??0)>0"
                [title]="t('partnersList.documents.linkedCount', { count: p.doc_count })"
                style="color:var(--gray-500);font-size:14px;margin-left:4px;vertical-align:middle;cursor:pointer"
                (click)="$event.stopPropagation(); openPartnerDocs(p)">📄</span>
        </div>
        <span class="pbadge pbadge-{{p.status}}">{{statusLabel(p.status)}}</span>
      </div>
      <div *ngIf="p.churn_risk && p.churn_risk !== 'none' && !p.churn_exempt" class="churn-badge churn-{{p.churn_risk}}">
        🔥 {{ t('partnersList.churn.riskWithLevel', { level: churnLabel(p.churn_risk) }) }}
        <span *ngIf="p.churn_score != null"> · {{ t('partnersList.churn.points', { score: p.churn_score }) }}</span>
      </div>
      <div class="pc-contact" *ngIf="p.contact_name">{{p.contact_name}}<span *ngIf="p.contact_title"> · {{p.contact_title}}</span></div>
      <div class="pc-meta">
        <span *ngIf="p.group_name" class="pc-tag">🏢 {{p.group_name}}</span>
        <span *ngIf="p.industry"   class="pc-tag">🏭 {{p.industry}}</span>
        <span *ngIf="p.manager_name" class="pc-tag">👤 {{p.manager_name}}</span>
      </div>
      <div *ngIf="hasUnreadReply(p)||(hasPbxFeature&&(p.missed_call_count??0)>0)||(hasPbxFeature&&(p.unread_sms_count??0)>0)||(hasWhatsappFeature&&(p.unread_whatsapp_count??0)>0)" style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">
        <span *ngIf="hasPbxFeature && (p.missed_call_count??0)>0" style="background:#ef4444;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;line-height:16px;display:inline-flex;align-items:center;gap:2px"><svg width="10" height="10" viewBox="0 0 24 24" fill="white" style="flex-shrink:0"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"/></svg>{{p.missed_call_count}}</span>
        <span *ngIf="hasPbxFeature && (p.unread_sms_count??0)>0" style="background:#ef4444;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;line-height:16px">💬 {{p.unread_sms_count}}</span>
        <span *ngIf="hasWhatsappFeature && (p.unread_whatsapp_count??0)>0" style="background:#ef4444;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;line-height:16px;display:inline-flex;align-items:center;gap:2px"><svg width="10" height="10" viewBox="0 0 24 24" fill="#25D366" style="flex-shrink:0"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.9.53 3.68 1.44 5.2L2 22l4.94-1.3A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>{{p.unread_whatsapp_count}}</span>
        <span *ngIf="hasUnreadReply(p)" style="background:#ef4444;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;line-height:16px">✉️ {{unreadReplyCount(p)}}</span>
      </div>
      <div class="pc-financials">
        <span *ngIf="p.contract_value" class="pc-arr">{{p.contract_value | number:'1.0-0'}} {{p.annual_turnover_currency || 'PLN'}}<span *ngIf="p.online_pct != null" class="pc-online"> · {{p.online_pct}}% online</span></span>
        <span *ngIf="p.open_opp_count"
              class="pc-opp" [class.pc-opp-valued]="+(p.open_opp_value||0)>0">
          💡 {{ t('partnersList.card.openOpportunities', { count: p.open_opp_count }) }}<span *ngIf="+(p.open_opp_value||0)>0"> · {{p.open_opp_value|number:'1.0-0'}} PLN</span>
        </span>
      </div>
      <ng-container *ngIf="partnerSales(p) as s">
        <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <span style="font-size:12px;font-weight:700;color:oklch(from #f97316 max(l, var(--text-min-l)) c h)">📈 {{s.gross_turnover_pln|number:'1.0-0'}} PLN</span>
          <span style="font-size:12px;font-weight:600;color:oklch(from #16a34a max(l, var(--text-min-l)) c h)">▲ {{ t('partnersList.card.marginAmount', { amount: (s.revenue_pln|number:'1.0-0') }) }}</span>
          <span style="font-size:10px;color:var(--gray-400)">YTD</span>
        </div>
      </ng-container>
      <div class="pc-onboarding" *ngIf="p.status==='onboarding'">
        <div class="onb-bar"><div class="onb-fill" [style.width.%]="(p.onboarding_step/3)*100"></div></div>
        <span class="onb-label">{{ t('partnersList.card.onboardingStep', { step: p.onboarding_step, total: 3 }) }}</span>
      </div>
    </div>
    <div class="no-data" *ngIf="partners.length===0">{{ t('partnersList.empty') }}</div>
  </div>

  <!-- ══ TABELA ══ -->
  <div *ngIf="!loading && viewMode==='table'" class="table-wrap">
  <div class="tw">
    <div class="tw-head" style="grid-template-columns:2fr 100px 110px 110px 110px 110px 90px 100px 90px 95px">
      <div class="th sortable" (click)="sortBy('company')">{{ t('partnersList.fields.company') }} <span class="si">{{sortIcon('company')}}</span></div>
      <div class="th">{{ t('partnersList.fields.status') }}</div>
      <div class="th sortable" (click)="sortBy('industry')">{{ t('partnersList.fields.industry') }} <span class="si">{{sortIcon('industry')}}</span></div>
      <div class="th sortable" (click)="sortBy('group_name')">{{ t('partnersList.fields.group') }} <span class="si">{{sortIcon('group_name')}}</span></div>
      <div class="th sortable" (click)="sortBy('manager_name')">{{ t('partnersList.fields.salesRep') }} <span class="si">{{sortIcon('manager_name')}}</span></div>
      <div class="th sortable" (click)="sortBy('contract_value')">{{ t('partnersList.table.crmTurnover') }} <span class="si">{{sortIcon('contract_value')}}</span></div>
      <div class="th" [title]="t('partnersList.table.dwhTurnoverHint')">{{ t('partnersList.table.dwhTurnover') }}</div>
      <div class="th" [title]="t('partnersList.table.dwhMarginHint')">{{ t('partnersList.table.dwhMargin') }}</div>
      <div class="th" [title]="t('partnersList.churn.risk')">{{ t('partnersList.table.churn') }}</div>
      <div class="th sortable" (click)="sortBy('contract_expires')">{{ t('partnersList.table.contractUntil') }} <span class="si">{{sortIcon('contract_expires')}}</span></div>
    </div>
    <div *ngFor="let p of partners" class="tw-row" style="grid-template-columns:2fr 100px 110px 110px 110px 110px 90px 100px 90px 95px"
         (click)="goPartner(p.id, p.crm_uuid)">
      <div class="td">
        <span class="td-main">{{p.dwh_company_name || p.company}}
          <span *ngIf="p.dwh_partner_id" style="background:color-mix(in srgb, #ede9fe var(--tint-mix), var(--surface));color:oklch(from #7c3aed max(l, var(--text-min-l)) c h);font-size:10px;font-weight:700;padding:1px 4px;border-radius:4px;margin-left:4px;vertical-align:middle">DWH</span>
          <span *ngIf="hasPbxFeature && (p.missed_call_count??0)>0"
                style="background:#ef4444;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px;line-height:16px;display:inline-flex;align-items:center;gap:2px"><svg width="10" height="10" viewBox="0 0 24 24" fill="white" style="flex-shrink:0"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"/></svg>{{p.missed_call_count}}</span>
          <span *ngIf="hasPbxFeature && (p.unread_sms_count??0)>0"
                style="background:#ef4444;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px;line-height:16px">💬 {{p.unread_sms_count}}</span>
          <span *ngIf="hasWhatsappFeature && (p.unread_whatsapp_count??0)>0"
                style="background:#ef4444;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px;line-height:16px;display:inline-flex;align-items:center;gap:2px"><svg width="10" height="10" viewBox="0 0 24 24" fill="#25D366" style="flex-shrink:0"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.9.53 3.68 1.44 5.2L2 22l4.94-1.3A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>{{p.unread_whatsapp_count}}</span>
          <span *ngIf="hasUnreadReply(p)"
                style="background:#ef4444;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px;line-height:16px">✉️ {{unreadReplyCount(p)}}</span>
          <span *ngIf="(p.doc_count??0)===0" [title]="t('partnersList.documents.noContract')" style="color:oklch(from #f97316 max(l, var(--text-min-l)) c h);font-size:14px;margin-left:4px;vertical-align:middle">📄⚠️</span>
          <span *ngIf="p.crm_uuid && (p.doc_count??0)>0"
                [title]="t('partnersList.documents.linkedCount', { count: p.doc_count })"
                style="color:var(--gray-500);font-size:14px;margin-left:4px;vertical-align:middle;cursor:pointer"
                (click)="$event.stopPropagation(); openPartnerDocs(p)">📄</span>
        </span>
        <span class="td-sub" *ngIf="p.contact_name">{{p.contact_name}}</span>
      </div>
      <div class="td"><span class="pbadge pbadge-{{p.status}}">{{statusLabel(p.status)}}</span></div>
      <div class="td td-sm">{{p.industry||'—'}}</div>
      <div class="td td-sm">{{p.group_name||'—'}}</div>
      <div class="td td-sm">{{p.manager_name||'—'}}</div>
      <div class="td" style="font-weight:600;color:oklch(from #f97316 max(l, var(--text-min-l)) c h);font-size:12px">{{p.contract_value?(p.contract_value|number:'1.0-0')+' '+(p.annual_turnover_currency||'PLN'):'—'}}</div>
      <ng-container *ngIf="partnerSales(p) as s; else noSales">
        <div class="td" style="font-weight:700;color:oklch(from #f97316 max(l, var(--text-min-l)) c h);font-size:12px">{{s.gross_turnover_pln|number:'1.0-0'}}</div>
        <div class="td" style="font-weight:600;color:oklch(from #16a34a max(l, var(--text-min-l)) c h);font-size:12px">{{s.revenue_pln|number:'1.0-0'}}</div>
      </ng-container>
      <ng-template #noSales>
        <div class="td td-sm" style="color:#d1d5db">—</div>
        <div class="td td-sm" style="color:#d1d5db">—</div>
      </ng-template>
      <div class="td">
        <span *ngIf="p.churn_risk && p.churn_risk !== 'none' && !p.churn_exempt"
              class="churn-badge churn-{{p.churn_risk}}">
          {{churnLabel(p.churn_risk)}}
        </span>
        <span *ngIf="!p.churn_risk || p.churn_risk === 'none' || p.churn_exempt" style="color:#d1d5db;font-size:12px">—</span>
      </div>
      <div class="td td-sm" [class.expiring]="isExpiring(p.contract_expires)">
        {{p.contract_expires?(p.contract_expires|date:'dd.MM.yy'):'—'}}
      </div>
    </div>
    <div class="no-data" style="grid-column:1/-1" *ngIf="partners.length===0">{{ t('partnersList.empty') }}</div>
  </div>
  </div>

  <!-- Pager -->
  <div class="pager" *ngIf="totalPages>1">
    <button class="nav-btn" (click)="prevPage()" [disabled]="page<=1">‹</button>
    <span>{{page}} / {{totalPages}}</span>
    <button class="nav-btn" (click)="nextPage()" [disabled]="page>=totalPages">›</button>
  </div>
  </div><!-- /content -->

  <!-- Create panel -->
  <div class="side-panel" *ngIf="showCreate" (click)="showCreate=false">
    <div class="side-panel-inner" (click)="$event.stopPropagation()">
      <h3>{{ t('partnersList.create.title') }}</h3>
      <p class="hint">{{ t('partnersList.create.hint') }}</p>
      <label>{{ t('partnersList.fields.company') }} *<input [(ngModel)]="newP.company" [placeholder]="t('partnersList.create.companyPlaceholder')"></label>
      <label>{{ t('partnersList.fields.taxId') }} <span style="font-size:10px;color:var(--gray-400)">{{ t('partnersList.create.taxIdHint') }}</span>
        <input [(ngModel)]="newP.nip" placeholder="PL1234567890" maxlength="14"
               (ngModelChange)="onPartnerNipChange()"
               [style.border-color]="partnerNipError ? '#ef4444' : ''">
        <span *ngIf="partnerNipError" style="font-size:12px;color:oklch(from #ef4444 max(l, var(--text-min-l)) c h);margin-top:2px;display:block">{{ partnerNipError }}</span>
      </label>
      <label>{{ t('partnersList.fields.contact') }}<input [(ngModel)]="newP.contact_name"></label>
      <label>{{ t('partnersList.fields.email') }}<input [(ngModel)]="newP.email" type="email"></label>
      <label>{{ t('partnersList.fields.industry') }}<input [(ngModel)]="newP.industry"></label>
      <label>{{ t('partnersList.fields.annualTurnover') }}<div style="display:flex;gap:6px"><input [(ngModel)]="newP.contract_value" type="number" min="0" placeholder="0" style="flex:1"><select [(ngModel)]="newP.annual_turnover_currency" style="width:70px"><option value="PLN">PLN</option><option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="CHF">CHF</option></select></div></label>
      <label>{{ t('partnersList.fields.licenseCount') }}<input [(ngModel)]="newP.license_count" type="number" min="0"></label>
      <label *ngIf="isManager">{{ t('partnersList.fields.accountManager') }}
        <select [(ngModel)]="newP.manager_id">
          <option value="">{{ t('partnersList.create.unassigned') }}</option>
          <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
        </select>
      </label>
      <div class="panel-actions">
        <button class="btn btn-g" (click)="showCreate=false">{{ 'actions.cancel' | transloco }}</button>
        <button class="btn btn-p" (click)="createPartner()" [disabled]="!newP.company||!!partnerNipError||saving">
          {{ saving ? t('partnersList.create.saving') : t('partnersList.create.submit') }}
        </button>
      </div>
    </div>
  </div>
</div>
</ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .page { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .topbar { display:flex; align-items:center; gap:12px; height:60px; padding:0 24px; background:var(--surface); border-bottom:1px solid var(--gray-200); flex-shrink:0; }
    .topbar h1 { font-family:'Sora',sans-serif; font-size:18px; font-weight:700; color:var(--gray-900); margin:0; }
    /* Toolbar */
    .content { flex:1; min-height:0; display:flex; flex-direction:column; padding:20px 24px 24px; overflow:hidden; }
    .toolbar { display:flex; align-items:center; gap:8px 12px; margin-bottom:16px; flex-shrink:0; flex-wrap:wrap; }
    .srch-wrap { position:relative; display:flex; align-items:center; }
    .srch-wrap svg { position:absolute; left:12px; width:15px; height:15px; color:var(--gray-400); pointer-events:none; }
    /* Cards */
    .cards-grid { flex:1; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:16px; padding:0 0 8px; align-content:start; }
    .partner-card { background:var(--surface); border-radius:var(--radius); padding:16px; cursor:pointer; box-shadow:var(--shadow-sm); transition:box-shadow .15s; }
    .partner-card:hover { box-shadow:var(--shadow); }
    .pc-top { display:flex; align-items:flex-start; gap:8px; margin-bottom:4px; }
    .pc-company { font-weight:700; font-size:14px; flex:1; color:var(--gray-800); }
    .pc-contact { font-size:12px; color:var(--gray-500); margin-bottom:6px; }
    .pc-meta { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
    .pc-tag { font-size:10px; color:var(--gray-500); background:var(--gray-100); padding:1px 6px; border-radius:4px; }
    .pc-financials { display:flex; gap:8px; align-items:center; }
    .pc-arr { font-size:12px; font-weight:700; color:oklch(from #f97316 max(l, var(--text-min-l)) c h); }
    .pc-online { font-size:10px; font-weight:600; color:oklch(from #3b82f6 max(l, var(--text-min-l)) c h); }
    .pc-opp { font-size:10px; background:color-mix(in srgb, #dbeafe var(--tint-mix), var(--surface)); color:oklch(from #1e40af max(l, var(--text-min-l)) c h); padding:2px 8px; border-radius:6px; font-weight:600; }
    .pc-opp-valued { background:color-mix(in srgb, #fff7ed var(--tint-mix), var(--surface)); color:oklch(from #c2410c max(l, var(--text-min-l)) c h); }
    .pc-onboarding { margin-top:8px; }
    .onb-bar { height:4px; background:color-mix(in srgb, #e5e7eb var(--tint-mix), var(--surface)); border-radius:2px; overflow:hidden; margin-bottom:4px; }
    .onb-fill { height:100%; background:#3b82f6; }
    .onb-label { font-size:10px; color:var(--gray-500); }
    /* Badges */
    .pbadge { padding:2px 8px; border-radius:8px; font-size:10px; font-weight:700; white-space:nowrap; }
    .pbadge-active { background:color-mix(in srgb, #dcfce7 var(--tint-mix), var(--surface)); color:oklch(from #166534 max(l, var(--text-min-l)) c h); }
    .pbadge-onboarding { background:color-mix(in srgb, #dbeafe var(--tint-mix), var(--surface)); color:oklch(from #1e40af max(l, var(--text-min-l)) c h); }
    .pbadge-inactive { background:var(--gray-100); color:var(--gray-700); }
    .pbadge-churned { background:color-mix(in srgb, #fee2e2 var(--tint-mix), var(--surface)); color:oklch(from #991b1b max(l, var(--text-min-l)) c h); }
    /* Table */
    .table-wrap { flex:1; overflow:auto; }
    .tw-head, .tw-row { display:grid; gap:0; }
    .tw-head { background:var(--gray-50); border-bottom:1px solid var(--gray-200); position:sticky; top:0; z-index:1; }
    .th { padding:8px 12px; font-size:10px; font-weight:700; text-transform:uppercase; color:var(--gray-400); letter-spacing:.4px; display:flex; align-items:center; gap:4px; }
    .th.sortable { cursor:pointer; user-select:none; }
    .th.sortable:hover { color:var(--gray-700); }
    .si { font-size:10px; color:#d1d5db; }
    .tw-row { border-bottom:1px solid var(--gray-100); cursor:pointer; }
    .tw-row:hover { background:var(--gray-50); }
    .td { padding:10px 12px; font-size:14px; color:var(--gray-700); display:flex; flex-direction:column; justify-content:center; }
    .td-main { font-weight:600; color:var(--gray-800); }
    .td-sub { font-size:12px; color:var(--gray-400); }
    .td-sm { font-size:12px; }
    .expiring { color:oklch(from #dc2626 max(l, var(--text-min-l)) c h); font-weight:600; }
    .no-data { text-align:center; color:var(--gray-400); padding:40px; }
    /* Pager */
    .pager { display:flex; justify-content:center; gap:12px; align-items:center; padding:12px; flex-shrink:0; }
        .pager button:disabled { opacity:.4; }
    /* Churn badges */
    .churn-badge { display:inline-flex; align-items:center; padding:1px 8px; border-radius:8px; font-size:10px; font-weight:700; white-space:nowrap; margin-top:4px; }
    .churn-critical { background:color-mix(in srgb, #fee2e2 var(--tint-mix), var(--surface)); color:oklch(from #991b1b max(l, var(--text-min-l)) c h); }
    .churn-high { background:color-mix(in srgb, #ffedd5 var(--tint-mix), var(--surface)); color:oklch(from #c2410c max(l, var(--text-min-l)) c h); }
    .churn-medium { background:color-mix(in srgb, #fef9c3 var(--tint-mix), var(--surface)); color:oklch(from #854d0e max(l, var(--text-min-l)) c h); }
    .churn-low { background:color-mix(in srgb, #dbeafe var(--tint-mix), var(--surface)); color:oklch(from #1e40af max(l, var(--text-min-l)) c h); }
    /* Side panel */
    .side-panel { position:fixed; inset:0; background:rgba(0,0,0,.3); z-index:100; display:flex; justify-content:flex-end; }
    .side-panel-inner { background:var(--surface); width:360px; height:100%; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:12px; }
    .side-panel-inner h3 { margin:0; font-size:16px; font-weight:700; }
    .hint { font-size:12px; color:var(--gray-400); margin:0; }
    .side-panel-inner label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; }
    .side-panel-inner input, .side-panel-inner select { border:1px solid var(--gray-300); border-radius:6px; padding:8px 10px; font-size:14px; outline:none; }
    .panel-actions { display:flex; gap:8px; margin-top:8px; }
  `],
})
export class CrmPartnersListComponent implements OnInit, OnDestroy {
  private api    = inject(CrmApiService);
  private zone   = inject(NgZone);
  private cdr    = inject(ChangeDetectorRef);
  private auth   = inject(AuthService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);
  private transloco = inject(TranslocoService);

  get hasPbxFeature(): boolean { return this.auth.hasFeature('pbx'); }
  get hasWhatsappFeature(): boolean { return this.auth.hasFeature('whatsapp'); }

  partners: Partner[] = [];
  total = 0; page = 1; pageSize = 50; loading = false;
  search = '';
  filterStatus   = '';
  filterManager  = '';
  filterGroup    = '';
  filterIndustry = '';
  reportFilterLabel = '';
  onlyMine = false;
  viewMode: 'cards' | 'table' = 'cards';
  showCreate = false; saving = false;
  crmUsers: CrmUser[] = [];
  partnerGroupNames: string[] = [];
  industries: string[] = [];
  private salesMapById   = new Map<number, PartnersReportPartner>();
  private salesMapByName = new Map<string, PartnersReportPartner>();

  // Sorting
  sortCol = 'company';
  sortDir: SortDir = 'asc';

  newP: Partial<Partner> = { nip: 'PL' };
  partnerNipError = '';

  onPartnerNipChange(): void {
    const val = (this.newP.nip || '').trim().toUpperCase();
    if (!val) { this.partnerNipError = this.transloco.translate('crm.partnersList.taxIdErrors.required'); return; }
    const cc = val.slice(0, 2);
    const digits = val.slice(2);
    if (!/^[A-Z]{2}$/.test(cc)) {
      this.partnerNipError = this.transloco.translate('crm.partnersList.taxIdErrors.countryCode');
      return;
    }
    if (cc === 'PL' && !/^\d{10}$/.test(digits)) {
      this.partnerNipError = this.transloco.translate('crm.partnersList.taxIdErrors.polishDigits');
      return;
    }
    if (cc !== 'PL' && digits.length === 0) {
      this.partnerNipError = this.transloco.translate('crm.partnersList.taxIdErrors.numberMissing');
      return;
    }
    this.partnerNipError = '';
  }
  statusOptions = (Object.keys(PARTNER_STATUS_LABELS) as PartnerStatus[]).map(key => ({ key, labelKey: 'labels.partnerStatuses.' + key }));

  get totalPages() { return Math.ceil(this.total / this.pageSize); }
  get isManager() { const u = this.auth.user(); return !!(u?.is_admin || u?.crm_role === 'sales_manager'); }
  statusLabel(s: PartnerStatus) { return s in PARTNER_STATUS_LABELS ? this.transloco.translate('crm.labels.partnerStatuses.' + s) : s; }

  sortBy(col: string): void {
    if (this.sortCol === col) { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; }
    else { this.sortCol = col; this.sortDir = 'asc'; }
    this.page = 1;
    this.reload();
  }
  sortIcon(col: string): string {
    if (this.sortCol !== col) return '↕';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  isExpiring(d?: string | null): boolean {
    if (!d) return false;
    return new Date(d).getTime() < Date.now() + 30 * 86_400_000;
  }

  ngOnInit() {
    this.api.getCrmUsers().subscribe({ next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); }, error: () => {} });
    this.api.getPartnerGroupNames().subscribe({ next: g => { this.zone.run(() => { this.partnerGroupNames = g; this.cdr.markForCheck(); }); }, error: () => {} });
    // Odczytaj query params z nawigacji z Raportu partnerów
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('manager_id')) this.filterManager = qp.get('manager_id')!;
    if (qp.get('group'))      this.filterGroup   = qp.get('group')!;
    if (qp.get('search'))     this.search        = qp.get('search')!;
    this.reportFilterLabel = qp.get('label') || '';
    this.reload();
    this.loadSalesData();
    // Auto-odśwież odznaki nowych emaili co 60 sekund
    this.refreshInterval = setInterval(() => this.reload(), 60_000);
  }

  private refreshInterval: any = null;

  ngOnDestroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  reload() {
    this.loading = true;
    const p: any = { page: this.page, limit: this.pageSize, sort: this.sortCol, dir: this.sortDir };
    if (this.search)         p.search     = this.search;
    if (this.filterStatus)   p.status     = this.filterStatus;
    if (this.filterGroup)    p.group_name = this.filterGroup;
    if (this.filterIndustry) p.industry   = this.filterIndustry;
    if (this.onlyMine) {
      p.manager_id = this.auth.user()?.id;
    } else if (this.filterManager && this.isManager) {
      p.manager_id = this.filterManager;
    }
    this.api.getPartners(p).subscribe({
      next: r => {
        this.zone.run(() => {
          this.partners = r.data;
          this.total    = r.total;
          // Collect unique industries for filter
          const set = new Set<string>(r.data.map((x: any) => x.industry).filter(Boolean));
          if (set.size > 0 || !this.industries.length) {
            this.industries = Array.from(set).sort();
          }
          this.loading = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); },
    });
  }

  private loadSalesData(): void {
    const now = new Date();
    const cur = now.toISOString().substring(0, 7);
    const shift = (n: number) => { const d = new Date(now.getFullYear(), now.getMonth() + n, 1); return d.toISOString().substring(0, 7); };
    this.api.getPartnersReport({ period_from: `${now.getFullYear()}-01`, period_to: cur }).subscribe({
      next: r => this.zone.run(() => {
        const byId   = new Map<number, PartnersReportPartner>();
        const byName = new Map<string, PartnersReportPartner>();
        for (const row of r.by_partner ?? []) {
          if (row.partner_id != null) byId.set(+row.partner_id, row);
          if (row.partner_name)       byName.set(row.partner_name.trim().toLowerCase(), row);
        }
        this.salesMapById   = byId;
        this.salesMapByName = byName;
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  partnerSales(p: Partner): PartnersReportPartner | undefined {
    if (p.dwh_partner_id != null) {
      const byId = this.salesMapById.get(+p.dwh_partner_id);
      if (byId) return byId;
    }
    const name = (p.dwh_company_name || '').trim().toLowerCase();
    return name ? this.salesMapByName.get(name) : undefined;
  }

  churnLabel(risk: string | null | undefined): string {
    switch (risk) {
      case 'critical':
      case 'high':
      case 'medium':
      case 'low':      return this.transloco.translate('crm.partnersList.churn.levels.' + risk);
      default:         return '';
    }
  }

  clearFilters(): void {
    this.filterStatus = ''; this.filterManager = '';
    this.filterGroup = ''; this.filterIndustry = '';
    this.reportFilterLabel = ''; this.onlyMine = false;
    this.page = 1; this.reload();
  }

  private searchTimer: any;
  onSearch() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.page = 1; this.reload(); }, 400); }
  onOnlyMineChange() { this.page = 1; this.reload(); }

  goPartner(id: number | null, crm_uuid?: string | null) {
    const nav = crm_uuid ?? id;
    if (nav != null) this.router.navigate(['/crm/partners', nav]);
  }

  openPartnerDocs(p: Partner): void {
    const id   = p.crm_uuid ?? String(p.id);
    const name = p.dwh_company_name || p.company;
    this.router.navigate(['/documents'], { queryParams: { partner_id: id, partner_name: name } });
  }

  hasUnreadReply(p: any): boolean {
    return (p.new_email_count ?? 0) > 0;
  }

  unreadReplyCount(p: any): number {
    return p.new_email_count ?? 0;
  }
  prevPage() { if (this.page > 1) { this.page--; this.reload(); } }
  nextPage() { if (this.page < this.totalPages) { this.page++; this.reload(); } }

  openCreateForm() {
    this.newP = { nip: 'PL' }; this.partnerNipError = '';
    this.showCreate = true;
  }

  createPartner() {
    if (!this.newP.company) return;
    // Waliduj NIP tylko jeśli podano wartość
    if (this.newP.nip && this.newP.nip !== 'PL') {
      this.onPartnerNipChange();
      if (this.partnerNipError) return;
    }
    this.saving = true;
    this.api.createPartner(this.newP).subscribe({
      next: p => { this.saving = false; this.showCreate = false; this.newP = {}; this.router.navigate(['/crm/partners', p.id]); },
      error: (err: any) => {
        this.zone.run(() => {
          this.saving = false;
          if (err?.status === 409) {
            this.partnerNipError = localizedApiErrorMessage(err?.error?.error, this.transloco) || this.transloco.translate('crm.partnersList.taxIdErrors.duplicate');
          } else {
            this.partnerNipError = this.transloco.translate('crm.partnersList.create.error');
          }
          this.cdr.markForCheck();
        });
      },
    });
  }
}

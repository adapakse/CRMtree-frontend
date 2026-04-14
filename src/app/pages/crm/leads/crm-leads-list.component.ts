// src/app/pages/crm/leads/crm-leads-list.component.ts
import {
  Component, OnInit, inject, ChangeDetectorRef, NgZone, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  CrmApiService, Lead, LEAD_STAGE_LABELS, LeadStage, LEAD_SOURCES, LEAD_SOURCE_LABELS, CrmUser, CalendarMeeting,
} from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';

const KANBAN_STAGES: { key: LeadStage; label: string; dot: string }[] = [
  { key: 'new',           label: 'Nowy',        dot: '#94A3B8' },
  { key: 'qualification', label: 'Kwalifikacja', dot: '#F59E0B' },
  { key: 'presentation',  label: 'Prezentacja',  dot: '#3B82F6' },
  { key: 'offer',         label: 'Oferta',       dot: '#A855F7' },
  { key: 'negotiation',   label: 'Negocjacje',   dot: '#F97316' },
];

const PROB_MAP: Record<LeadStage, number> = {
  new: 10, qualification: 25, presentation: 50,
  offer: 70, negotiation: 85, closed_won: 100, closed_lost: 0,
};

@Component({
  selector: 'wt-crm-leads-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
<div id="topbar">
  <span class="page-title">Leady sprzedażowe</span>
  <span class="tsp"></span>
  <div class="srch-wrap">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    <input class="srch" type="search" placeholder="Szukaj firm, kontaktów…"
           [(ngModel)]="search" (ngModelChange)="onSearch()">
  </div>
  <button class="btn btn-g btn-sm" routerLink="/crm/import">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Import CSV
  </button>
  <button class="btn btn-p" (click)="openNew()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Nowy lead
  </button>
</div>

<div id="content">

  <!-- ── Stat cards ── -->
  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-val">{{ stats.total }}</div>
      <div class="stat-lbl">Wszystkich leadów</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:#F59E0B">{{ stats.hot }}</div>
      <div class="stat-lbl">🔥 Gorących</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:var(--orange)">{{ formatPLN(stats.pipeline) }}</div>
      <div class="stat-lbl">Pipeline (PLN)</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:#16A34A">{{ stats.won }}</div>
      <div class="stat-lbl">✓ Wygranych</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="color:#DC2626">{{ stats.lost }}</div>
      <div class="stat-lbl">✗ Przegranych</div>
    </div>
  </div>

  <!-- ── Toolbar ── -->
  <div *ngIf="reportFilterLabel" style="display:flex;align-items:center;gap:8px;padding:6px 0 0 0;margin-bottom:-4px">
    <span style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:20px;padding:3px 12px;font-size:11.5px;font-weight:600;color:#9A3412;display:flex;align-items:center;gap:6px">
      📊 Filtr z raportu: {{ reportFilterLabel }}
      <span style="cursor:pointer;font-size:14px;color:#9A3412;line-height:1" (click)="clearReportFilter()">×</span>
    </span>
  </div>
  <!-- Persistent rep filter chip -->
  <div *ngIf="persistRepName" style="display:flex;align-items:center;gap:8px;padding:4px 0 0 0;margin-bottom:-4px">
    <span style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:20px;padding:3px 12px;font-size:11.5px;font-weight:600;color:#1D4ED8;display:flex;align-items:center;gap:6px">
      👤 Handlowiec: {{ persistRepName }}
      <span style="cursor:pointer;font-size:14px;line-height:1" (click)="clearPersistRepFilter()">×</span>
    </span>
  </div>
  <div class="toolbar">
    <span class="fchip" [class.on]="scopeFilter==='all'"  (click)="setScope('all')">Wszystkie</span>
    <span class="fchip" [class.on]="scopeFilter==='mine'" (click)="setScope('mine')">Moje</span>
    <span class="fchip" [class.on]="filterHot"            (click)="filterHot=!filterHot; load()">🔥 Gorące</span>
    <span style="flex:1"></span>
    <select class="sel" [(ngModel)]="filterStageUI" (ngModelChange)="onStageFilterChange()">
      <option value="">Wszystkie etapy</option>
      <option value="new">Nowy</option>
      <option value="qualification">Kwalifikacja</option>
      <option value="presentation">Prezentacja</option>
      <option value="offer">Oferta</option>
      <option value="negotiation">Negocjacje</option>
      <option value="closed_won">✓ Wygrany</option>
      <option value="closed_lost">✗ Przegrany</option>
    </select>
    <select class="sel" [(ngModel)]="filterSource" (ngModelChange)="load()">
      <option value="">Wszystkie źródła</option>
      <option *ngFor="let s of leadSources" [value]="s.value">{{ s.label }}</option>
    </select>
    <select class="sel" [(ngModel)]="filterUser" (ngModelChange)="onRepFilterChange($event)" *ngIf="isManager">
      <option value="">Wszyscy handlowcy</option>
      <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
    </select>
    <button class="btn btn-g btn-sm" (click)="openTimeline()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      Time Line
    </button>
    <button class="btn btn-g btn-sm" (click)="viewMode = viewMode==='kanban' ? 'table' : 'kanban'">
      {{ viewMode === 'kanban' ? '☰ Tabela' : '⊞ Kanban' }}
    </button>
  </div>

  <!-- Loading -->
  <div *ngIf="loading" class="loading-state">
    <div class="spinner"></div>Ładowanie leadów…
  </div>

  <!-- ════ KANBAN ════ -->
  <div *ngIf="!loading && viewMode==='kanban'" class="kanban-wrap">

    <div class="kanban">
      <!-- Kolumny aktywne -->
      <div *ngFor="let col of kanbanCols" class="kol">
        <div class="kol-head">
          <div class="kol-dot" [style.background]="col.dot"></div>
          <span class="kol-title">{{ col.label }}</span>
          <span class="kol-cnt">{{ leadsFor(col.key).length }}</span>
          <span class="kol-val" *ngIf="valueFor(col.key)>0">{{ valueFor(col.key) }}k</span>
        </div>
        <div class="kol-cards">
          <div *ngFor="let lead of leadsFor(col.key); trackBy:trackById"
               class="lead-card" [class.selected]="selected?.id===lead.id"
               (click)="selectLead(lead)">
            <div class="lead-company" style="display:flex;align-items:center;gap:6px">
              <span *ngIf="hasLogo(lead)" class="logo-circle" [style.background-image]="logoSasMap[lead.id] || ''"></span>
              {{ lead.company }}<span *ngIf="lead.hot" class="hot-dot">🔥</span>
            </div>
            <div class="lead-contact" *ngIf="lead.contact_name">
              {{ lead.contact_name }}<span *ngIf="lead.contact_title" style="color:var(--gray-400)"> · {{ lead.contact_title }}</span>
            </div>
            <div class="lead-value" *ngIf="lead.value_pln">{{ lead.value_pln | number:'1.0-0' }} {{ lead.annual_turnover_currency || 'PLN' }}</div>
            <div class="lead-chips" *ngIf="lead.probability != null || lead.online_pct != null">
              <span *ngIf="lead.probability != null" class="lchip lchip-prob">⚡ {{lead.probability}}%</span>
              <span *ngIf="lead.online_pct != null" class="lchip lchip-online">🌐 {{lead.online_pct}}%</span>
            </div>
            <div class="lead-meta">
              <span *ngIf="lead.source" class="tag" [class]="srcTagCls(lead.source)">{{ srcLabel(lead.source) }}</span>
              <span *ngIf="lead.first_contact_date" style="font-size:10px;color:var(--gray-400);margin-left:4px">📅 {{ lead.first_contact_date | date:'dd.MM.yy' }}</span>
              <span class="avatar-sm" *ngIf="lead.assigned_to_name" style="margin-left:auto" [title]="lead.assigned_to_name">
                {{ initials(lead.assigned_to_name) }}
              </span>
            </div>
            <div class="pipe-bar"><div class="pipe-fill" [style.width.%]="prob(lead.stage)"></div></div>
          </div>
          <div *ngIf="leadsFor(col.key).length===0" class="kol-empty">Brak leadów</div>
        </div>
      </div>

      <!-- Zamknięte -->
      <div class="kol">
        <div class="kol-head">
          <div class="kol-dot" style="background:#22C55E"></div>
          <span class="kol-title">Zamknięte</span>
          <span class="kol-cnt">{{ leadsFor('closed_won').length }}W / {{ leadsFor('closed_lost').length }}L</span>
        </div>
        <div class="kol-cards">
          <div *ngFor="let lead of closedLeads(); trackBy:trackById"
               class="lead-card" [class.selected]="selected?.id===lead.id"
               (click)="selectLead(lead)">
            <div class="lead-company">{{ lead.company }}</div>
            <div class="lead-contact" *ngIf="lead.contact_name">{{ lead.contact_name }}</div>
            <div class="lead-value" *ngIf="lead.value_pln">{{ lead.value_pln | number:'1.0-0' }} {{ lead.annual_turnover_currency || 'PLN' }}</div>
            <div class="lead-meta">
              <span class="tag" [class]="lead.stage==='closed_won' ? 'tag-green' : 'tag-red'">
                {{ lead.stage==='closed_won' ? '✓ Wygrany' : '✗ Przegrany' }}
              </span>
            </div>
            <div class="pipe-bar">
              <div class="pipe-fill" style="width:100%"
                   [style.background]="lead.stage==='closed_won' ? '#22C55E' : '#EF4444'"></div>
            </div>
          </div>
          <div *ngIf="closedLeads().length===0" class="kol-empty">Brak</div>
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
          <button class="btn btn-p btn-sm" [routerLink]="['/crm/leads',selected.id]" style="flex:1">Otwórz szczegóły →</button>
        </div>
      </div>

      <div class="dp-body">
        <div class="tabs">
          <button class="tab-btn" [class.active]="dpTab==='info'"     (click)="dpTab='info'">Info</button>
          <button class="tab-btn" [class.active]="dpTab==='activity'" (click)="dpTab='activity'">
            Historia<span *ngIf="selected.activities?.length" class="tab-cnt">{{ selected.activities!.length }}</span>
          </button>
        </div>

        <!-- Info -->
        <div *ngIf="dpTab==='info'">
          <div class="sec-title">Szczegóły</div>
          <div class="info-row"><span class="info-label">Firma</span><span class="info-val">{{ selected.company }}</span></div>
          <div class="info-row" *ngIf="selected.email">
            <span class="info-label">Email</span>
            <a class="info-val link" href="mailto:{{ selected.email }}">{{ selected.email }}</a>
          </div>
          <div class="info-row" *ngIf="selected.phone">
            <span class="info-label">Telefon</span><span class="info-val">{{ selected.phone }}</span>
          </div>
          <div class="info-row" *ngIf="selected.source">
            <span class="info-label">Źródło</span><span class="info-val">{{ srcLabel(selected.source) }}</span>
          </div>
          <div class="info-row" *ngIf="selected.industry">
            <span class="info-label">Branża</span><span class="info-val">{{ selected.industry }}</span>
          </div>

          <div class="sec-title">Pipeline</div>
          <div class="info-row">
            <span class="info-label">Wartość</span>
            <span class="info-val" style="color:var(--orange);font-family:'Sora',sans-serif;font-size:15px;font-weight:700">
              {{ (selected.value_pln||0) | number:'1.0-0' }} {{ selected.annual_turnover_currency || 'PLN' }}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">Prawdopodob.</span>
            <span class="info-val">{{ selected.probability ?? prob(selected.stage) }}%</span>
          </div>
          <div class="info-row">
            <span class="info-label">Ważona wartość</span>
            <span class="info-val">
              {{ ((selected.value_pln||0) * (selected.probability ?? prob(selected.stage)) / 100) | number:'1.0-0' }} PLN
            </span>
          </div>
          <div class="info-row" *ngIf="selected.close_date">
            <span class="info-label">Data zamknięcia</span>
            <span class="info-val">{{ selected.close_date | date:'dd.MM.yyyy' }}</span>
          </div>
          <div class="pipe-bar" style="margin-top:6px">
            <div class="pipe-fill" [style.width.%]="prob(selected.stage)"
                 [style.background]="selected.stage==='closed_won'?'#22C55E':selected.stage==='closed_lost'?'#EF4444':null">
            </div>
          </div>
          <div style="font-size:10px;color:var(--gray-400);margin-top:3px">Etap: {{ stageLabel(selected.stage) }}</div>

          <div class="sec-title" *ngIf="selected.assigned_to_name">Handlowiec</div>
          <div *ngIf="selected.assigned_to_name" class="dp-user">
            <div class="avatar-sm" style="width:28px;height:28px;font-size:11px">{{ initials(selected.assigned_to_name) }}</div>
            <div style="font-size:13px;font-weight:600;color:var(--gray-900)">{{ selected.assigned_to_name }}</div>
          </div>

          <div class="sec-title" *ngIf="selected.tags?.length">Tagi</div>
          <div *ngIf="selected.tags?.length" style="display:flex;flex-wrap:wrap;gap:6px">
            <span *ngFor="let t of selected.tags" class="tag tag-blue">{{ t }}</span>
          </div>

          <div class="sec-title" *ngIf="selected.notes">Notatka</div>
          <div *ngIf="selected.notes" class="dp-note">{{ selected.notes }}</div>
        </div>

        <!-- Aktywności -->
        <div *ngIf="dpTab==='activity'">
          <div *ngIf="loadingDetail" class="loading-state" style="padding:20px 0">
            <div class="spinner"></div>
          </div>
          <div *ngIf="!loadingDetail">
            <div *ngFor="let a of selected.activities||[]" class="act-item">
              <div class="act-dot" [class]="a.type">{{ actIcon(a.type) }}</div>
              <div class="act-text">
                <div class="act-title">{{ a.title }}</div>
                <div class="act-date">{{ a.activity_at | date:'dd.MM.yyyy HH:mm' }} · {{ a.created_by_name }}</div>
                <div class="act-body" *ngIf="a.body">{{ a.body }}</div>
              </div>
            </div>
            <div *ngIf="!(selected.activities?.length)" class="kol-empty" style="padding:20px 0">
              Brak aktywności. <a [routerLink]="['/crm/leads',selected.id]" style="color:var(--orange)">Dodaj w szczegółach →</a>
            </div>
          </div>
        </div>
      </div>

      <div class="dp-foot">
        <button class="btn btn-g btn-sm" (click)="selected=null; cdr.markForCheck()">Zamknij</button>
        <button class="btn btn-p btn-sm" style="flex:1" [routerLink]="['/crm/leads',selected.id]">Otwórz szczegóły →</button>
      </div>
    </div>
    </div><!-- /dp-overlay -->
  </div>

  <!-- ════ TABLE ════ -->
  <div *ngIf="!loading && viewMode==='table'" class="tw">
    <div class="thead" style="grid-template-columns:2fr 90px 110px 70px 130px 70px 110px 100px 90px">
      <div class="th sortable" (click)="sortBy('company')">Firma / Kontakt <span class="si">{{sortIcon('company')}}</span></div>
      <div class="th sortable" (click)="sortBy('first_contact_date')" style="text-align:center">Pierw. kont. <span class="si">{{sortIcon('first_contact_date')}}</span></div>
      <div class="th sortable" (click)="sortBy('stage')">Etap <span class="si">{{sortIcon('stage')}}</span></div>
      <div class="th sortable" (click)="sortBy('probability')" style="text-align:center">% Szansa <span class="si">{{sortIcon('probability')}}</span></div>
      <div class="th sortable" (click)="sortBy('value_pln')">Obrót roczny <span class="si">{{sortIcon('value_pln')}}</span></div>
      <div class="th sortable" (click)="sortBy('online_pct')" style="text-align:center">% Online <span class="si">{{sortIcon('online_pct')}}</span></div>
      <div class="th sortable" (click)="sortBy('assigned_to_name')">Handlowiec <span class="si">{{sortIcon('assigned_to_name')}}</span></div>
      <div class="th sortable" (click)="sortBy('source')">Źródło <span class="si">{{sortIcon('source')}}</span></div>
      <div class="th sortable" (click)="sortBy('close_date')">Zamkn. <span class="si">{{sortIcon('close_date')}}</span></div>
    </div>
    <div *ngFor="let lead of sortedLeads; trackBy:trackById"
         class="tr-row" style="grid-template-columns:2fr 90px 110px 70px 130px 70px 110px 100px 90px"
         [routerLink]="['/crm/leads',lead.id]">
      <div class="td" style="display:flex;align-items:center;gap:8px">
        <span *ngIf="hasLogo(lead)" class="logo-circle" [style.background-image]="logoSasMap[lead.id] || ''"></span>
        <div>
          <div style="font-weight:600;color:var(--gray-900)">{{ lead.company }}<span *ngIf="lead.hot"> 🔥</span></div>
          <div style="font-size:11px;color:var(--gray-400)">{{ lead.contact_name }}</div>
          <div *ngIf="lead.converted_at" style="font-size:10px;color:#7C3AED;font-weight:600;margin-top:2px">
            ✦ Migrowany →
            <a [routerLink]="['/crm/partners', lead.converted_partner_id]" style="color:#7C3AED" (click)="$event.stopPropagation()">Partner</a>
          </div>
        </div>
      </div>
      <div class="td" style="font-size:12px;text-align:center;color:var(--gray-400)">{{ lead.first_contact_date ? (lead.first_contact_date | date:'dd.MM.yy') : '—' }}</div>
      <div class="td"><span class="stage-pill stage-{{ lead.stage }}">{{ stageLabel(lead.stage) }}</span></div>
      <div class="td" style="font-size:12px;text-align:center;font-weight:600;color:var(--gray-600)">{{ lead.probability != null ? lead.probability+'%' : '—' }}</div>
      <div class="td" style="font-family:'Sora',sans-serif;font-weight:700;color:var(--orange)">
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
      <div style="font-size:32px">📋</div>Brak leadów spełniających kryteria
    </div>
    <div *ngIf="totalPages>1" class="pagination">
      <button class="btn btn-g btn-sm" [disabled]="page===1" (click)="setPage(page-1)">← Poprzednia</button>
      <span style="font-size:12.5px;color:var(--gray-500)">Strona {{ page }} z {{ totalPages }}</span>
      <button class="btn btn-g btn-sm" [disabled]="page===totalPages" (click)="setPage(page+1)">Następna →</button>
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
        <div class="modal-title">Nowy lead</div>
        <div style="font-size:12px;color:var(--gray-400)">Dodaj nową szansę sprzedażową</div>
      </div>
      <button class="dp-close" style="margin-left:auto" (click)="showNew=false">✕</button>
    </div>
    <div class="modal-body">
      <div class="fgrid2">
        <!-- WWW field + hot checkbox -->
        <div class="fg" style="grid-column:1/-1;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end">
          <div>
            <label class="fl">Strona WWW <span style="font-size:10px;color:var(--gray-400)">(opcjonalne)</span></label>
            <div style="position:relative">
              <input class="fi" [(ngModel)]="newFormWebsite"
                     placeholder="np. acme.pl"
                     (ngModelChange)="onWebsiteChange()"
                     style="padding-right:36px">
              <span *ngIf="enriching" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--gray-400)">⏳</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding-bottom:1px">
            <input type="checkbox" [(ngModel)]="newForm.hot" id="hotchk" style="width:auto;margin:0">
            <label for="hotchk" style="font-size:13px;cursor:pointer;font-weight:400;white-space:nowrap">🔥 Gorący lead</label>
          </div>
        </div>
        <div class="fg" style="grid-column:1/-1">
          <div>
          <!-- Enrich prompt banner -->
          <div *ngIf="enrichPrompt&&!enriching" style="margin-top:6px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:8px;font-size:12px">
            <span>🔍 Pobierz dane firmy ze strony?</span>
            <button style="background:#f97316;color:white;border:none;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;font-weight:600" (click)="runEnrich()">Tak, pobierz</button>
            <button style="background:none;border:none;color:var(--gray-400);cursor:pointer;font-size:11px" (click)="enrichPrompt=false">Nie</button>
          </div>
          <!-- Enrich result badge -->
          <div *ngIf="enrichResult" style="margin-top:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 12px;font-size:11px;color:#15803d">
            ✓ Dane pobrane — sprawdź pola poniżej i uzupełnij brakujące
          </div>
          </div>
        </div>

        <div class="fg" style="grid-column:1/-1">
          <label class="fl">Nazwa firmy <span style="color:var(--orange)">*</span></label>
          <input class="fi" [(ngModel)]="newForm.company" placeholder="np. Acme Sp. z o.o."
                 [class.fi-err]="submitted&&!newForm.company">
          <span class="ferr" *ngIf="submitted&&!newForm.company">Pole wymagane</span>
        </div>
        <div class="fg">
          <label class="fl">Imię i nazwisko kontaktu</label>
          <input class="fi" [(ngModel)]="newForm.contact_name" placeholder="Jan Kowalski">
        </div>
        <div class="fg">
          <label class="fl">Stanowisko</label>
          <input class="fi" [(ngModel)]="newForm.contact_title" placeholder="CEO">
        </div>
        <div class="fg">
          <label class="fl">Email</label>
          <input class="fi" type="email" [(ngModel)]="newForm.email" placeholder="jan@firma.pl">
        </div>
        <div class="fg">
          <label class="fl">Telefon</label>
          <input class="fi" [(ngModel)]="newForm.phone" placeholder="+48 600 000 000">
        </div>
        <div class="fg">
          <label class="fl">NIP <span style="font-size:10px;color:var(--gray-400)">(opcjonalne)</span></label>
          <input class="fi" [(ngModel)]="newForm.nip" placeholder="np. 1234567890"
                 [style.background]="enrichResult?.nip ? '#f9fafb' : ''"
                 [value]="newForm.nip || enrichResult?.nip || ''">
        </div>
        <div class="fg">
          <label class="fl">Wartość (PLN)</label>
          <input class="fi" type="number" [(ngModel)]="newForm.value_pln" placeholder="0" min="0">
        </div>
        <div class="fg">
          <label class="fl">Źródło</label>
          <select class="fsel" [(ngModel)]="newForm.source">
            <option value="">— wybierz —</option>
            <option *ngFor="let s of leadSources" [value]="s.value">{{ s.label }}</option>
          </select>
        </div>
        <div class="fg">
          <label class="fl">Pierwszy kontakt</label>
          <input class="fi" type="date" [(ngModel)]="newForm.first_contact_date">
        </div>
        <div class="fg">
          <label class="fl">Etap</label>
          <select class="fsel" [(ngModel)]="newForm.stage">
            <option value="new">Nowy</option>
            <option value="qualification">Kwalifikacja</option>
            <option value="presentation">Prezentacja</option>
            <option value="offer">Oferta</option>
            <option value="negotiation">Negocjacje</option>
          </select>
        </div>
        <div class="fg" *ngIf="isManager">
          <label class="fl">Handlowiec</label>
          <select class="fsel" [(ngModel)]="newForm.assigned_to">
            <option value="">— nieprzypisany —</option>
            <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
          </select>
        </div>
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">Notatki</label>
          <textarea class="fta" [(ngModel)]="newForm.notes" rows="2" placeholder="Dodatkowe informacje…"></textarea>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-g" (click)="showNew=false">Anuluj</button>
      <button class="btn btn-p" [disabled]="saving" (click)="createLead()">
        {{ saving ? 'Zapisywanie…' : 'Utwórz lead' }}
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
          <div class="tl-head-title">Kalendarz spotkań</div>
          <div class="tl-head-sub">Aktywności typu spotkanie · chronologicznie</div>
        </div>
      </div>
      <button class="dp-close" style="font-size:18px;padding:4px" (click)="showTimeline=false; cdr.markForCheck()">✕</button>
    </div>

    <!-- Manager filter -->
    <div class="tl-filter" *ngIf="isManager">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="color:var(--gray-400);flex-shrink:0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      <select class="sel" style="flex:1;font-size:12px" [(ngModel)]="timelineUser" (ngModelChange)="loadTimeline()">
        <option value="">Wszyscy handlowcy</option>
        <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
      </select>
    </div>

    <!-- Body — scrollable meeting list -->
    <div class="tl-body" id="tlBody">

      <!-- Loading -->
      <div *ngIf="timelineLoading" class="loading-state" style="padding:48px 0">
        <div class="spinner"></div>Ładowanie spotkań…
      </div>

      <!-- Empty -->
      <div *ngIf="!timelineLoading && timelineMeetings.length===0" class="tl-empty">
        <div style="font-size:36px;margin-bottom:10px">📭</div>
        <div style="font-weight:600;color:var(--gray-700)">Brak spotkań</div>
        <div style="font-size:12px;color:var(--gray-400);margin-top:4px">Zaplanuj pierwsze spotkanie w szczegółach leadu lub partnera</div>
      </div>

      <!-- Meeting groups -->
      <ng-container *ngIf="!timelineLoading && timelineMeetings.length > 0">

        <!-- Past hint (only when there are past meetings) -->
        <div *ngIf="hasPastMeetings" class="tl-past-hint">
          ↑ Przewiń w górę, aby zobaczyć poprzednie spotkania
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
              <span *ngIf="group.isToday" class="tl-today-tag">DZIŚ</span>
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
              <div class="tl-item-time">{{ m.activity_at | date:'HH:mm' }}</div>
              <div class="tl-item-dur" *ngIf="m.duration_min">{{ m.duration_min }}min</div>
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
                  {{ m.source_type === 'lead' ? 'Lead' : 'Partner' }}
                </span>
                <span class="tl-item-company">{{ m.source_name }}</span>
              </div>
              <div class="tl-item-title">{{ m.title }}</div>
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
          ↓ Przewiń w dół, aby zobaczyć kolejne spotkania
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
      <div class="modal-icon" style="background:#F0FDF4;font-size:18px">🤝</div>
      <div style="flex:1;min-width:0">
        <div class="modal-title">{{ meetingEditMode ? 'Edycja spotkania' : 'Szczegóły spotkania' }}</div>
        <div style="font-size:12px;color:var(--gray-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          {{ selectedMeeting.source_type === 'lead' ? '📋 Lead' : '🤝 Partner' }} · {{ selectedMeeting.source_name }}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <a *ngIf="selectedMeeting.source_type==='lead'"
           [routerLink]="['/crm/leads', selectedMeeting.source_id]"
           class="btn btn-g btn-sm"
           (click)="selectedMeeting=null; meetingEditMode=false; cdr.markForCheck()">
          Otwórz lead →
        </a>
        <a *ngIf="selectedMeeting.source_type==='partner'"
           [routerLink]="['/crm/partners', selectedMeeting.source_id]"
           class="btn btn-g btn-sm"
           (click)="selectedMeeting=null; meetingEditMode=false; cdr.markForCheck()">
          Otwórz partnera →
        </a>
        <button class="dp-close" style="font-size:18px" (click)="selectedMeeting=null; meetingEditMode=false; cdr.markForCheck()">✕</button>
      </div>
    </div>

    <!-- ── View mode ── -->
    <div *ngIf="!meetingEditMode" class="modal-body">

      <div class="meet-detail-grid">
        <div class="meet-field">
          <div class="meet-field-label">Tytuł spotkania</div>
          <div class="meet-field-val">{{ selectedMeeting.title }}</div>
        </div>
        <div class="meet-field">
          <div class="meet-field-label">Data i godzina</div>
          <div class="meet-field-val" style="font-weight:600;color:var(--gray-900)">
            {{ selectedMeeting.activity_at | date:'EEEE, dd MMMM yyyy':'':'pl' }}&nbsp;·&nbsp;{{ selectedMeeting.activity_at | date:'HH:mm' }}
          </div>
        </div>
        <div class="meet-field" *ngIf="selectedMeeting.duration_min">
          <div class="meet-field-label">Czas trwania</div>
          <div class="meet-field-val">{{ selectedMeeting.duration_min }} minut</div>
        </div>
        <div class="meet-field" *ngIf="selectedMeeting.meeting_location">
          <div class="meet-field-label">📍 Lokalizacja</div>
          <div class="meet-field-val">{{ selectedMeeting.meeting_location }}</div>
        </div>
        <div class="meet-field" *ngIf="selectedMeeting.participants">
          <div class="meet-field-label">👥 Uczestnicy</div>
          <div class="meet-field-val" style="white-space:pre-line">{{ selectedMeeting.participants }}</div>
        </div>
        <div class="meet-field" *ngIf="selectedMeeting.assigned_to_name">
          <div class="meet-field-label">Handlowiec</div>
          <div class="meet-field-val" style="display:flex;align-items:center;gap:6px">
            <span class="avatar-sm" style="width:20px;height:20px;font-size:8px">{{ initials(selectedMeeting.assigned_to_name) }}</span>
            {{ selectedMeeting.assigned_to_name }}
          </div>
        </div>
        <div class="meet-field" *ngIf="selectedMeeting.created_by_name">
          <div class="meet-field-label">Dodał(a)</div>
          <div class="meet-field-val">{{ selectedMeeting.created_by_name }}</div>
        </div>
      </div>

      <div *ngIf="selectedMeeting.body" class="dp-note" style="margin-top:14px">{{ selectedMeeting.body }}</div>
    </div>

    <!-- ── Edit mode ── -->
    <div *ngIf="meetingEditMode" class="modal-body">
      <div class="fgrid2">
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">Tytuł spotkania <span style="color:var(--orange)">*</span></label>
          <input class="fi" [(ngModel)]="meetingForm.title" placeholder="Temat spotkania">
        </div>
        <div class="fg">
          <label class="fl">Data i godzina</label>
          <input class="fi" type="datetime-local" [(ngModel)]="meetingForm.activity_at">
        </div>
        <div class="fg">
          <label class="fl">Czas trwania (min)</label>
          <input class="fi" type="number" [(ngModel)]="meetingForm.duration_min" placeholder="60" min="0">
        </div>
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">Lokalizacja</label>
          <input class="fi" [(ngModel)]="meetingForm.meeting_location" placeholder="np. Biuro klienta, Google Meet…">
        </div>
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">Uczestnicy</label>
          <input class="fi" [(ngModel)]="meetingForm.participants" placeholder="np. Jan Kowalski, anna@firma.pl">
        </div>
        <div class="fg" style="grid-column:1/-1">
          <label class="fl">Notatki ze spotkania</label>
          <textarea class="fta" [(ngModel)]="meetingForm.body" rows="3" placeholder="Omówione tematy, wnioski, kolejne kroki…"></textarea>
        </div>
      </div>
    </div>

    <div class="modal-foot">
      <ng-container *ngIf="!meetingEditMode">
        <button class="btn btn-g" (click)="selectedMeeting=null; meetingEditMode=false; cdr.markForCheck()">Zamknij</button>
        <button class="btn btn-p" style="margin-left:auto" (click)="meetingEditMode=true; cdr.markForCheck()">
          ✎ Edytuj spotkanie
        </button>
      </ng-container>
      <ng-container *ngIf="meetingEditMode">
        <button class="btn btn-g" (click)="meetingEditMode=false; cdr.markForCheck()">Anuluj</button>
        <button class="btn btn-p" style="margin-left:auto" [disabled]="savingMeeting" (click)="saveMeeting()">
          {{ savingMeeting ? 'Zapisywanie…' : '✓ Zapisz zmiany' }}
        </button>
      </ng-container>
    </div>
  </div>
</div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    #topbar { height:60px; background:white; border-bottom:1px solid var(--gray-200); display:flex; align-items:center; gap:12px; padding:0 24px; flex-shrink:0; }
    .page-title { font-family:'Sora',sans-serif; font-size:17px; font-weight:700; color:var(--gray-900); }
    .tsp { flex:1; }
    .srch-wrap { position:relative; display:flex; align-items:center; }
    .srch-wrap svg { position:absolute; left:10px; width:15px; height:15px; color:var(--gray-400); pointer-events:none; }
    .srch { background:var(--gray-100); border:1px solid var(--gray-200); border-radius:8px; padding:7px 14px 7px 34px; font-size:13px; width:260px; outline:none; font-family:inherit; }
    .srch:focus { border-color:var(--orange); background:white; }
    #content { flex:1; overflow:hidden; padding:20px 24px 24px; display:flex; flex-direction:column; gap:0; min-height:0; }

    /* Stats */
    .stats-row { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:18px; flex-shrink:0; }
    .stat-card { background:white; border:1px solid var(--gray-200); border-radius:10px; padding:14px 18px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
    .stat-val { font-family:'Sora',sans-serif; font-size:22px; font-weight:700; color:var(--gray-900); }
    .stat-lbl { font-size:12px; color:var(--gray-400); font-weight:500; margin-top:2px; }

    /* Toolbar */
    .toolbar { background:white; border:1px solid var(--gray-200); border-radius:10px; padding:10px 16px; margin-bottom:14px; display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:wrap; }
    .fchip { display:inline-flex; align-items:center; gap:5px; background:var(--gray-100); border:1px solid var(--gray-200); border-radius:20px; padding:4px 12px; font-size:12px; font-weight:500; color:var(--gray-600); cursor:pointer; transition:all .12s; user-select:none; }
    .fchip:hover { border-color:var(--orange); color:var(--orange); }
    .fchip.on { background:var(--orange); color:white; border-color:var(--orange); }
    .sel { background:var(--gray-100); border:1px solid var(--gray-200); border-radius:8px; padding:6px 10px; font-size:12.5px; color:var(--gray-700); outline:none; font-family:inherit; }

    /* Buttons */
    .btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:none; font-family:inherit; white-space:nowrap; transition:all .15s; text-decoration:none; }
    .btn-p { background:var(--orange); color:white; } .btn-p:hover { background:#d4521a; }
    .btn-g { background:white; color:var(--gray-600); border:1px solid var(--gray-200); } .btn-g:hover { background:var(--gray-50); }
    .btn-sm { padding:5px 10px; font-size:12px; }
    .btn:disabled { opacity:.55; cursor:not-allowed; }

    /* Kanban */
    .kanban-wrap { display:flex; flex:1; overflow-y:auto; min-height:0; gap:0; }
    .kanban { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; flex:1; align-items:start; padding-bottom:16px; min-width:900px; }
    .kol { min-width:0; }
    .kol-head { display:flex; align-items:center; gap:6px; margin-bottom:10px; }
    .kol-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .kol-title { font-size:10.5px; font-weight:700; color:var(--gray-600); text-transform:uppercase; letter-spacing:.5px; }
    .kol-cnt { margin-left:auto; background:var(--gray-100); border-radius:10px; padding:1px 6px; font-size:11px; font-weight:600; color:var(--gray-500); }
    .kol-val { font-size:10px; color:var(--orange); font-weight:600; font-family:'Sora',sans-serif; white-space:nowrap; }
    .kol-cards { display:flex; flex-direction:column; gap:8px; }
    .kol-empty { font-size:11px; color:var(--gray-300); text-align:center; padding:16px 8px; border:1.5px dashed var(--gray-200); border-radius:8px; }

    .lead-card { background:white; border:1px solid var(--gray-200); border-radius:10px; padding:10px 12px; cursor:pointer; transition:all .15s; }
    .lead-card:hover { border-color:#fbd0b6; box-shadow:0 4px 12px rgba(242,101,34,.1); transform:translateY(-1px); }
    .lead-card.selected { border-color:var(--orange); box-shadow:0 0 0 2px rgba(242,101,34,.15); }
    .logo-circle { display:inline-block;width:22px;height:22px;border-radius:50%;background-size:cover;background-position:center;background-repeat:no-repeat;flex-shrink:0;border:1px solid var(--gray-200);background-color:#f9fafb; }
    .lead-company { font-size:12.5px; font-weight:700; color:var(--gray-900); margin-bottom:2px; display:flex; align-items:center; gap:3px; }
    .lead-contact { font-size:11px; color:var(--gray-500); margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .lead-value { font-family:'Sora',sans-serif; font-size:12px; font-weight:700; color:var(--orange); margin-bottom:3px; }
    .lead-meta { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
    .hot-dot { font-size:11px; }
    .tag { display:inline-flex; align-items:center; padding:1px 6px; border-radius:10px; font-size:10px; font-weight:600; }
    .tag-blue { background:#EFF6FF; color:#1D4ED8; }
    .tag-purple { background:#FDF4FF; color:#7E22CE; }
    .tag-green { background:#F0FDF4; color:#166534; }
    .tag-orange { background:var(--orange-pale); color:var(--orange-dark); }
    .tag-red { background:#FFF1F2; color:#BE123C; }
    .tag-gray { background:var(--gray-100); color:var(--gray-600); }
    .pipe-bar { height:4px; background:var(--gray-100); border-radius:2px; overflow:hidden; margin-top:7px; }
    .pipe-fill { height:100%; background:var(--orange); border-radius:2px; }
    .avatar-sm { width:20px; height:20px; border-radius:50%; background:var(--orange); display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:700; color:white; flex-shrink:0; }

    /* Stage pill */
    .stage-pill { padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; }
    .stage-new { background:#F3F4F6; color:#374151; }
    .stage-qualification { background:#DBEAFE; color:#1E40AF; }
    .stage-presentation { background:#FEF3C7; color:#92400E; }
    .stage-offer { background:#F3E8FF; color:#6B21A8; }
    .stage-negotiation { background:#FFEDD5; color:#9A3412; }
    .stage-closed_won { background:#DCFCE7; color:#166534; }
    .stage-closed_lost { background:#FEE2E2; color:#991B1B; }

    /* Detail Panel */
    .dp-overlay { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:200; display:flex; align-items:center; justify-content:center; }
    .detail-panel { width:420px; max-height:85vh; background:white; border-radius:14px; display:flex; flex-direction:column; overflow:hidden; animation:slideIn .2s ease; box-shadow:0 20px 60px rgba(0,0,0,.25); }
    @keyframes slideIn { from { transform:translateX(16px); opacity:0; } to { transform:none; opacity:1; } }
    .dp-head { padding:14px 16px 12px; border-bottom:1px solid var(--gray-200); background:linear-gradient(135deg,var(--orange-pale) 0%,white 70%); flex-shrink:0; }
    .dp-top-row { display:flex; align-items:flex-start; gap:6px; margin-bottom:10px; }
    .dp-company { font-family:'Sora',sans-serif; font-size:14px; font-weight:700; color:var(--gray-900); }
    .dp-sub { font-size:11.5px; color:var(--gray-400); margin-top:2px; }
    .dp-actions { display:flex; gap:6px; }
    .dp-close { background:none; border:none; cursor:pointer; color:var(--gray-400); font-size:16px; padding:0; line-height:1; }
    .dp-close:hover { color:var(--gray-700); }
    .dp-body { flex:1; overflow-y:auto; padding:14px 16px; }
    .dp-foot { padding:10px 16px; border-top:1px solid var(--gray-200); display:flex; gap:8px; background:var(--gray-50); flex-shrink:0; }
    .dp-user { display:flex; align-items:center; gap:8px; padding:4px 0 10px; }
    .dp-note { background:var(--gray-50); border:1px solid var(--gray-200); border-radius:8px; padding:10px 12px; font-size:12px; color:var(--gray-600); line-height:1.6; white-space:pre-line; }

    /* Tabs */
    .tabs { display:flex; gap:2px; background:var(--gray-100); border-radius:8px; padding:3px; margin-bottom:12px; }
    .tab-btn { flex:1; padding:5px 6px; border-radius:6px; font-size:12px; font-weight:500; color:var(--gray-500); cursor:pointer; border:none; background:transparent; font-family:inherit; }
    .tab-btn.active { background:white; color:var(--orange); font-weight:600; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    .tab-cnt { display:inline-flex; align-items:center; justify-content:center; background:var(--orange); color:white; font-size:9px; font-weight:700; min-width:15px; height:15px; border-radius:10px; padding:0 4px; margin-left:4px; }

    /* Info rows */
    .sec-title { font-size:10px; font-weight:700; color:var(--gray-400); text-transform:uppercase; letter-spacing:.7px; margin:14px 0 8px; display:flex; align-items:center; gap:8px; }
    .sec-title::after { content:''; flex:1; height:1px; background:var(--gray-200); }
    .sec-title:first-child { margin-top:0; }
    .info-row { display:flex; justify-content:space-between; align-items:center; padding:4px 0; font-size:12.5px; }
    .info-label { color:var(--gray-400); font-size:11.5px; }
    .info-val { color:var(--gray-800); font-weight:500; }
    .link { color:var(--orange); text-decoration:none; } .link:hover { text-decoration:underline; }

    /* Activity */
    .act-item { display:flex; gap:10px; margin-bottom:12px; }
    .act-dot { width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; flex-shrink:0; border:2px solid; }
    .act-dot.call { background:#EFF6FF; border-color:#BFDBFE; }
    .act-dot.email { background:#FDF4FF; border-color:#E9D5FF; }
    .act-dot.meeting { background:#F0FDF4; border-color:#BBF7D0; }
    .act-dot.note { background:#FFFBEB; border-color:#FDE68A; }
    .act-dot.doc_sent { background:var(--orange-pale); border-color:var(--orange-muted); }
    .act-text { flex:1; }
    .act-title { font-size:12px; font-weight:600; color:var(--gray-800); }
    .act-date { font-size:11px; color:var(--gray-400); margin-top:1px; }
    .act-body { font-size:11.5px; color:var(--gray-600); margin-top:3px; line-height:1.5; }

    /* Table */
    .tw { background:white; border:1px solid var(--gray-200); border-radius:10px; overflow-y:auto; flex:1; min-height:0; display:flex; flex-direction:column; }
    .thead { display:grid; background:var(--gray-50); border-bottom:1px solid var(--gray-200); padding:0 16px; flex-shrink:0; }
    .th { padding:9px 8px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; color:var(--gray-500); display:flex; align-items:center; gap:4px; }
    .th.sortable { cursor:pointer; user-select:none; }
    .th.sortable:hover { color:#374151; }
    .si { font-size:10px; color:#d1d5db; }
    .tr-row { display:grid; padding:0 16px; border-bottom:1px solid var(--gray-100); cursor:pointer; transition:background .1s; align-items:center; }
    .tr-row:hover { background:var(--gray-50); }
    .td { padding:10px 8px; font-size:13px; color:var(--gray-700); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .empty-state { padding:48px; text-align:center; color:var(--gray-400); font-size:14px; display:flex; flex-direction:column; align-items:center; gap:8px; }
    .pagination { display:flex; align-items:center; gap:8px; justify-content:flex-end; padding:12px 16px; border-top:1px solid var(--gray-100); flex-shrink:0; }

    /* Modal */
    .overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:200; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(2px); }
    .modal { background:white; border-radius:14px; width:560px; max-width:95vw; box-shadow:0 12px 32px rgba(0,0,0,.18); overflow:hidden; animation:scaleIn .2s ease; }
    @keyframes scaleIn { from { transform:scale(.95); opacity:0; } to { transform:scale(1); opacity:1; } }
    .modal-head { padding:18px 22px; border-bottom:1px solid var(--gray-200); display:flex; align-items:center; gap:12px; }
    .modal-icon { width:36px; height:36px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .modal-title { font-family:'Sora',sans-serif; font-size:15px; font-weight:700; color:var(--gray-900); }
    .modal-body { padding:20px 22px; max-height:65vh; overflow-y:auto; }
    .modal-foot { padding:14px 22px; border-top:1px solid var(--gray-200); display:flex; gap:8px; align-items:center; background:var(--gray-50); }
    .fgrid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .fg { display:flex; flex-direction:column; gap:4px; }
    .fl { font-size:12px; font-weight:600; color:var(--gray-600); }
    .fi,.fsel,.fta { background:var(--gray-50); border:1.5px solid var(--gray-200); border-radius:8px; padding:8px 11px; font-size:13px; color:var(--gray-800); outline:none; font-family:inherit; width:100%; box-sizing:border-box; }
    .fi:focus,.fsel:focus,.fta:focus { border-color:var(--orange); background:white; }
    .fi-err { border-color:#ef4444 !important; }
    .ferr { font-size:11px; color:#ef4444; }
    .fta { min-height:60px; resize:vertical; }

    /* Loading */
    .loading-state { display:flex; align-items:center; justify-content:center; gap:10px; padding:48px; color:var(--gray-400); font-size:13px; }
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
      background: white;
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
      background: linear-gradient(135deg, #F0FDF4 0%, white 60%);
      flex-shrink: 0;
    }
    .tl-head-left { display:flex; align-items:center; gap:10px; }
    .tl-head-icon {
      width: 34px; height: 34px; border-radius: 9px;
      background: #DCFCE7; color: #16A34A;
      display: flex; align-items:center; justify-content:center; flex-shrink:0;
    }
    .tl-head-title { font-family:'Sora',sans-serif; font-size:15px; font-weight:700; color:var(--gray-900); }
    .tl-head-sub { font-size:11px; color:var(--gray-400); margin-top:1px; }

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
      text-align: center; font-size: 10.5px; color: var(--gray-300);
      padding: 10px 24px;
      font-style: italic;
    }

    /* Date separator */
    .tl-date-sep {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px 8px;
      position: sticky; top: 0; z-index: 2;
      background: white;
    }
    .tl-sep-line { flex:1; height:1px; background: var(--gray-200); }
    .tl-sep-badge {
      display: flex; align-items: center; gap:5px;
      font-size: 10.5px; font-weight: 600;
      color: var(--gray-500);
      white-space: nowrap;
      padding: 2px 10px; border-radius: 20px;
      border: 1px solid var(--gray-200);
      background: white;
    }
    /* Today separator — highlighted */
    .tl-sep-today { background: linear-gradient(180deg, #F0FDF4, white); padding-top:16px; }
    .tl-sep-today .tl-sep-line { background: #86EFAC; }
    .tl-sep-today .tl-sep-badge { background: #DCFCE7; border-color: #86EFAC; color: #15803D; font-size:11.5px; }
    .tl-today-dot { width:7px; height:7px; background:#22C55E; border-radius:50%; display:inline-block; flex-shrink:0; }
    .tl-today-tag { background:#22C55E; color:white; font-size:9px; font-weight:700; padding:1px 5px; border-radius:4px; text-transform:uppercase; letter-spacing:.5px; }
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
    .tl-item:hover { background: #F9FAFB; }
    .tl-item-past { opacity: .65; }
    .tl-item-past:hover { opacity: 1; }

    /* Time column */
    .tl-item-time-col {
      width: 42px; flex-shrink:0;
      display: flex; flex-direction:column; align-items:flex-end;
      padding-top: 12px; padding-right: 4px;
    }
    .tl-item-time { font-size:11.5px; font-weight:700; color:var(--gray-700); font-family:'Sora',sans-serif; white-space:nowrap; }
    .tl-item-dur { font-size:9.5px; color:var(--gray-400); margin-top:2px; white-space:nowrap; }

    /* Connector column */
    .tl-item-dot-col {
      width: 24px; flex-shrink:0;
      display: flex; flex-direction:column; align-items:center;
    }
    .tl-item-line-top { width:2px; flex:1; background:var(--gray-200); min-height:10px; }
    .tl-item-line-bot { width:2px; flex:1; background:var(--gray-200); min-height:10px; }
    .tl-item-dot {
      width: 10px; height: 10px; border-radius:50%; flex-shrink:0;
      background: var(--gray-300); border: 2px solid white;
      box-shadow: 0 0 0 2px var(--gray-300);
    }
    .tl-dot-today { background: #22C55E; box-shadow: 0 0 0 2px #86EFAC; }
    .tl-dot-past  { background: var(--gray-200); box-shadow: 0 0 0 2px var(--gray-200); }

    /* Meeting card */
    .tl-item-card {
      flex: 1; min-width: 0;
      background: white; border: 1px solid var(--gray-200);
      border-radius: 10px; padding: 10px 12px;
      margin: 6px 0 6px 8px;
      position: relative;
      transition: all .15s;
    }
    .tl-item:hover .tl-item-card {
      border-color: #D1FAE5;
      box-shadow: 0 3px 12px rgba(34,197,94,.1);
    }
    .tl-card-today {
      border-color: #86EFAC;
      background: linear-gradient(135deg, #F0FDF4 0%, white 50%);
    }
    .tl-item-header {
      display: flex; align-items: center; gap:5px;
      margin-bottom: 4px;
    }
    .tl-src-badge {
      font-size: 9px; font-weight: 700; text-transform:uppercase; letter-spacing:.4px;
      padding: 1px 5px; border-radius: 4px; flex-shrink:0;
    }
    .tl-src-lead    { background: #EFF6FF; color: #1D4ED8; }
    .tl-src-partner { background: #FDF4FF; color: #7E22CE; }
    .tl-item-company { font-size:11px; color:var(--gray-500); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tl-item-title { font-size:12.5px; font-weight:700; color:var(--gray-900); line-height:1.35; margin-bottom:5px; }
    .tl-item-meta { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
    .tl-item-loc { font-size:10.5px; color:var(--gray-500); display:flex; align-items:center; gap:3px; }
    .tl-item-rep { font-size:10.5px; color:var(--gray-500); display:flex; align-items:center; gap:4px; }
    .tl-item-body { font-size:11.5px; color:var(--gray-500); margin-top:5px; line-height:1.5; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
    .tl-item-arrow {
      position:absolute; right:10px; top:50%; transform:translateY(-50%);
      font-size:12px; color:var(--gray-300); opacity:0; transition:opacity .15s;
    }
    .tl-item:hover .tl-item-arrow { opacity:1; color:var(--orange); }

    /* ═══════════════════════════════════════════════ */
    /* MEETING DETAIL                                  */
    /* ═══════════════════════════════════════════════ */
    .meet-detail-grid { display:flex; flex-direction:column; gap:10px; }
    .meet-field { background:var(--gray-50); border:1px solid var(--gray-100); border-radius:8px; padding:10px 13px; }
    .meet-field-label { font-size:10.5px; font-weight:700; color:var(--gray-400); text-transform:uppercase; letter-spacing:.5px; margin-bottom:3px; }
    .meet-field-val { font-size:13px; color:var(--gray-800); font-weight:500; line-height:1.45; }
  `],
})
export class CrmLeadsListComponent implements OnInit {
  private api    = inject(CrmApiService);
  private auth   = inject(AuthService);
  private zone   = inject(NgZone);
  readonly cdr   = inject(ChangeDetectorRef);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);

  readonly kanbanCols  = KANBAN_STAGES;
  leadSources: { value: string; label: string }[] = LEAD_SOURCES;

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
  filterSource = '';
  filterUser   = '';
  filterStageUI = '';   // filtr etapu w toolbarze (nowy)
  persistRepName = '';  // wyświetlana nazwa persistowanego handlowca
  private readonly REP_FILTER_KEY = 'crm_rep_filter';
  // Filtry z Raportu Sprzedaży (query params)
  filterStage        = '';
  filterCloseDateFrom = '';
  filterCloseDateTo   = '';
  filterLostReason    = '';
  reportFilterLabel   = '';   // np. "Stage: Nowy" — widoczne jako chip nad listą

  page       = 1;
  totalPages = 1;
  total      = 0;

  showNew   = false;
  submitted = false;
  newForm: any = {};

  crmUsers: CrmUser[] = [];

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
    this.filterLostReason    = qp.get('lost_reason')     || '';
    if (qp.get('hot') === 'true') this.filterHot = true;
    this.reportFilterLabel   = qp.get('label')           || '';

    // Załaduj persistowany filtr handlowca (sessionStorage) — tylko jeśli nie ma query param
    if (!this.filterUser) this.loadPersistRepFilter();

    this.load();
    this.api.getCrmUsers().subscribe({
      next: u => this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }),
      error: () => {},
    });
  }

  get sortedLeads(): any[] {
    const col = this.sortCol;
    const dir = this.sortDir;
    return [...this.allLeads].sort((a, b) => {
      let va: any = (a as any)[col] ?? '';
      let vb: any = (b as any)[col] ?? '';
      if (col === 'value_pln' || col === 'online_pct' || col === 'probability') { va = +(va||0); vb = +(vb||0); return dir==='asc' ? va-vb : vb-va; }
      if (col === 'close_date' || col === 'first_contact_date') { va = va?new Date(va).getTime():0; vb = vb?new Date(vb).getTime():0; return dir==='asc'?va-vb:vb-va; }
      const cmp = String(va).localeCompare(String(vb), 'pl', { sensitivity: 'base' });
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
    this.filterLostReason = ''; this.reportFilterLabel = '';
    this.load();
  }

  onStageFilterChange(): void {
    this.filterStage = ''; // wyczyść filtr z raportu gdy user wybiera z toolbara
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

  clearPersistRepFilter(): void {
    this.filterUser     = '';
    this.persistRepName = '';
    try { sessionStorage.removeItem(this.REP_FILTER_KEY); } catch { }
    this.load();
  }

  load() {
    this.loading = true;
    const params: any = { limit: 200 };
    if (this.filterHot)              params['hot']             = true;
    if (this.filterSource)           params['source']          = this.filterSource;
    if (this.filterUser)             params['assigned_to']     = this.filterUser;
    if (this.scopeFilter === 'mine') params['assigned_to']     = this.auth.user()?.id;
    if (this.search)                 params['search']          = this.search;
    // filterStage z raportu lub filterStageUI z toolbara
    const activeStage = this.filterStage || this.filterStageUI;
    if (activeStage)                 params['stage']           = activeStage;
    if (this.filterCloseDateFrom)    params['close_date_from'] = this.filterCloseDateFrom;
    if (this.filterCloseDateTo)      params['close_date_to']   = this.filterCloseDateTo;
    if (this.filterLostReason)       params['lost_reason']     = this.filterLostReason;

    this.api.getLeads(params).subscribe({
      next: res => this.zone.run(() => {
        this.allLeads   = res.data;
        this.total      = res.total;
        this.totalPages = res.pages;
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
    const active = this.allLeads.filter(l => !l.converted_at);
    this.stats = {
      total:    this.total,
      hot:      active.filter(l => l.hot).length,
      pipeline: active.filter(l => !['closed_won','closed_lost'].includes(l.stage))
                      .reduce((s, l) => s + +(l.value_pln || 0), 0),
      won:      active.filter(l => l.stage === 'closed_won').length,
      lost:     active.filter(l => l.stage === 'closed_lost').length,
    };
  }

  leadsFor(stage: string): Lead[] {
    return this.allLeads.filter(l => l.stage === stage);
  }

  closedLeads(): Lead[] {
    return this.allLeads.filter(l => ['closed_won','closed_lost'].includes(l.stage));
  }

  valueFor(stage: LeadStage): number {
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
    this.newForm       = { company:'', contact_name:'', contact_title:'', email:'', phone:'',
                           value_pln: null, source:'', stage:'new', hot:false, notes:'', assigned_to:'', first_contact_date:'' };
    this.newFormWebsite = '';
    this.enrichPrompt   = false;
    this.enrichResult   = null;
    this.submitted      = false;
    this.showNew        = true;
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
    if (!this.newForm.company) return;
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
      nip:           this.newForm.nip           || this.enrichResult?.nip || null,
      website:       this.newFormWebsite        || null,
      logo_url:      (this.newForm as any).logo_url || null,
    };
    if (this.newForm.assigned_to) payload.assigned_to = this.newForm.assigned_to;

    this.api.createLead(payload).subscribe({
      next: lead => this.zone.run(() => {
        this.allLeads  = [lead, ...this.allLeads];
        this.total    += 1;
        this.calcStats();
        this.showNew   = false;
        this.saving    = false;
        if ((lead as any).logo_url) this.loadLogoSas(lead);
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.saving = false; this.cdr.markForCheck(); }),
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
      date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

    if (d.toDateString() === today.toDateString())     return fmt(d);
    if (d.toDateString() === tomorrow.toDateString())  return 'Jutro · ' + fmt(d);
    if (d.toDateString() === yesterday.toDateString()) return 'Wczoraj · ' + fmt(d);

    return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ─── Meeting detail / edit ───────────────────────────────────────

  openMeetingDetail(m: CalendarMeeting) {
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
      ? this.api.updateLeadActivity(src.source_id, src.id, data)
      : this.api.updatePartnerActivity(src.source_id, src.id, data)) as any;

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
  prob(stage: LeadStage)       { return PROB_MAP[stage] ?? 10; }
  stageLabel(s: LeadStage)     { return LEAD_STAGE_LABELS[s] || s; }
  srcLabel(val: string | null): string { if (!val) return ''; const f = this.leadSources.find(s => s.value === val) || LEAD_SOURCES.find(s => s.value === val); return f?.label ?? LEAD_SOURCE_LABELS[val] ?? val; }
  initials(name: string)       { return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(); }
  trackById(_: number, l: Lead){ return l.id; }
  callPhone(p: string)         { window.location.href = `tel:${p}`; }
  mailTo(e: string)            { window.location.href = `mailto:${e}`; }
  formatPLN(v: number)         { return v >= 1_000_000 ? (v/1_000_000).toFixed(1)+'M' : v >= 1000 ? Math.round(v/1000)+'k' : String(Math.round(v)); }

  srcTagCls(src: string) {
    const m: Record<string,string> = {
      targi:'tag-blue', polecenie:'tag-purple', linkedin:'tag-blue',
      partner:'tag-green', kampania:'tag-purple', inbound:'tag-green',
    };
    return m[src] ?? 'tag-gray';
  }

  actIcon(type: string) {
    return { call:'📞', email:'✉', meeting:'🤝', note:'📝', doc_sent:'📄' }[type] ?? '💬';
  }
}

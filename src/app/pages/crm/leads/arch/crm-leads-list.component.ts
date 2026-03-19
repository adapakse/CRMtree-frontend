// src/app/pages/crm/leads/crm-leads-list.component.ts
import {
  Component, OnInit, inject, ChangeDetectorRef, NgZone, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  CrmApiService, Lead, LEAD_STAGE_LABELS, LeadStage, LEAD_SOURCES, CrmUser,
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
  <div class="toolbar">
    <span class="fchip" [class.on]="scopeFilter==='all'"  (click)="setScope('all')">Wszystkie</span>
    <span class="fchip" [class.on]="scopeFilter==='mine'" (click)="setScope('mine')">Moje</span>
    <span class="fchip" [class.on]="filterHot"            (click)="filterHot=!filterHot; load()">🔥 Gorące</span>
    <span style="flex:1"></span>
    <select class="sel" [(ngModel)]="filterSource" (ngModelChange)="load()">
      <option value="">Wszystkie źródła</option>
      <option *ngFor="let s of leadSources" [value]="s.value">{{ s.label }}</option>
    </select>
    <select class="sel" [(ngModel)]="filterUser" (ngModelChange)="load()" *ngIf="isManager">
      <option value="">Wszyscy handlowcy</option>
      <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
    </select>
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
            <div class="lead-company">
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
    <div class="thead" style="grid-template-columns:2fr 110px 70px 130px 70px 110px 100px 90px">
      <div class="th sortable" (click)="sortBy('company')">Firma / Kontakt <span class="si">{{sortIcon('company')}}</span></div>
      <div class="th sortable" (click)="sortBy('stage')">Etap <span class="si">{{sortIcon('stage')}}</span></div>
      <div class="th sortable" (click)="sortBy('probability')" style="text-align:center">% Szansa <span class="si">{{sortIcon('probability')}}</span></div>
      <div class="th sortable" (click)="sortBy('value_pln')">Obrót roczny <span class="si">{{sortIcon('value_pln')}}</span></div>
      <div class="th sortable" (click)="sortBy('online_pct')" style="text-align:center">% Online <span class="si">{{sortIcon('online_pct')}}</span></div>
      <div class="th sortable" (click)="sortBy('assigned_to_name')">Handlowiec <span class="si">{{sortIcon('assigned_to_name')}}</span></div>
      <div class="th sortable" (click)="sortBy('source')">Źródło <span class="si">{{sortIcon('source')}}</span></div>
      <div class="th sortable" (click)="sortBy('close_date')">Zamkn. <span class="si">{{sortIcon('close_date')}}</span></div>
    </div>
    <div *ngFor="let lead of sortedLeads; trackBy:trackById"
         class="tr-row" style="grid-template-columns:2fr 110px 70px 130px 70px 110px 100px 90px"
         [routerLink]="['/crm/leads',lead.id]">
      <div class="td">
        <div style="font-weight:600;color:var(--gray-900)">{{ lead.company }}<span *ngIf="lead.hot"> 🔥</span></div>
        <div style="font-size:11px;color:var(--gray-400)">{{ lead.contact_name }}</div>
      </div>
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
        <div class="fg" style="display:flex;flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" [(ngModel)]="newForm.hot" id="hotchk" style="width:auto;margin:0">
          <label for="hotchk" style="font-size:13px;cursor:pointer;font-weight:400">🔥 Gorący lead</label>
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
    .btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:none; font-family:inherit; white-space:nowrap; transition:all .15s; }
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
    .modal-foot { padding:14px 22px; border-top:1px solid var(--gray-200); display:flex; gap:8px; justify-content:flex-end; background:var(--gray-50); }
    .fgrid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .fg { display:flex; flex-direction:column; gap:4px; }
    .fl { font-size:12px; font-weight:600; color:var(--gray-600); }
    .fi,.fsel,.fta { background:var(--gray-50); border:1.5px solid var(--gray-200); border-radius:8px; padding:8px 11px; font-size:13px; color:var(--gray-800); outline:none; font-family:inherit; width:100%; }
    .fi:focus,.fsel:focus,.fta:focus { border-color:var(--orange); background:white; }
    .fi-err { border-color:#ef4444 !important; }
    .ferr { font-size:11px; color:#ef4444; }
    .fta { min-height:60px; resize:vertical; }

    /* Loading */
    .loading-state { display:flex; align-items:center; justify-content:center; gap:10px; padding:48px; color:var(--gray-400); font-size:13px; }
    .spinner { width:20px; height:20px; border:2px solid var(--gray-200); border-top-color:var(--orange); border-radius:50%; animation:spin .7s linear infinite; flex-shrink:0; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class CrmLeadsListComponent implements OnInit {
  private api    = inject(CrmApiService);
  private auth   = inject(AuthService);
  private zone   = inject(NgZone);
  readonly cdr   = inject(ChangeDetectorRef);

  readonly kanbanCols  = KANBAN_STAGES;
  readonly leadSources = LEAD_SOURCES;

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

  page       = 1;
  totalPages = 1;
  total      = 0;

  showNew   = false;
  submitted = false;
  newForm: any = {};

  crmUsers: CrmUser[] = [];

  stats = { total: 0, hot: 0, pipeline: 0, won: 0, lost: 0 };

  private searchTimer: any;

  get isManager() {
    const u = this.auth.user();
    return u?.is_admin || (u as any)?.crm_role === 'sales_manager';
  }

  ngOnInit() {
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
      if (col === 'close_date') { va = va?new Date(va).getTime():0; vb = vb?new Date(vb).getTime():0; return dir==='asc'?va-vb:vb-va; }
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

  load() {
    this.loading = true;
    const params: any = { limit: 200 };
    if (this.filterHot)              params['hot']         = true;
    if (this.filterSource)           params['source']      = this.filterSource;
    if (this.filterUser)             params['assigned_to'] = this.filterUser;
    if (this.scopeFilter === 'mine') params['assigned_to'] = this.auth.user()?.id;
    if (this.search)                 params['search']      = this.search;

    this.api.getLeads(params).subscribe({
      next: res => this.zone.run(() => {
        this.allLeads   = res.data;
        this.total      = res.total;
        this.totalPages = res.pages;
        this.calcStats();
        this.loading = false;
        this.cdr.markForCheck();
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
    return this.allLeads.filter(l => l.stage === stage && !l.converted_at);
  }

  closedLeads(): Lead[] {
    return this.allLeads.filter(l => ['closed_won','closed_lost'].includes(l.stage) && !l.converted_at);
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
    if (this.selected?.id === lead.id) {
      this.selected = null; this.cdr.markForCheck(); return;
    }
    this.selected     = lead;
    this.dpTab        = 'info';
    this.loadingDetail = true;
    this.cdr.markForCheck();
    this.api.getLead(lead.id).subscribe({
      next: full => this.zone.run(() => {
        this.selected      = full;
        this.loadingDetail = false;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.loadingDetail = false; this.cdr.markForCheck(); }),
    });
  }

  onSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page = 1; this.load(); }, 350);
  }

  setScope(s: 'all' | 'mine') { this.scopeFilter = s; this.load(); }
  setPage(p: number)           { this.page = p; this.load(); }

  openNew() {
    this.newForm  = { company:'', contact_name:'', contact_title:'', email:'', phone:'',
                      value_pln: null, source:'', stage:'new', hot:false, notes:'', assigned_to:'' };
    this.submitted = false;
    this.showNew   = true;
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
    };
    if (this.newForm.assigned_to) payload.assigned_to = this.newForm.assigned_to;

    this.api.createLead(payload).subscribe({
      next: lead => this.zone.run(() => {
        this.allLeads  = [lead, ...this.allLeads];
        this.total    += 1;
        this.calcStats();
        this.showNew   = false;
        this.saving    = false;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.saving = false; this.cdr.markForCheck(); }),
    });
  }

  // ── Helpers ──
  prob(stage: LeadStage)       { return PROB_MAP[stage] ?? 10; }
  stageLabel(s: LeadStage)     { return LEAD_STAGE_LABELS[s] || s; }
  srcLabel(val: string | null) { return LEAD_SOURCES.find(s => s.value === val)?.label ?? val ?? ''; }
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

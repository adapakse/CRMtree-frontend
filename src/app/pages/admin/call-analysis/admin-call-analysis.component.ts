// src/app/pages/admin/call-analysis/admin-call-analysis.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute, NavigationStart } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { CrmApiService, CrmUser } from '../../../core/services/crm-api.service';
import { NavBackService } from '../../../core/services/nav-back.service';

const API = `${environment.apiUrl}/admin/call-analysis`;

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
  imports: [CommonModule, FormsModule],
  template: `
<div style="display:flex;flex-direction:column;height:100%;background:#f9fafb" (click)="closeMenu()">

  <!-- HEADER -->
  <div style="background:white;border-bottom:1px solid #e5e7eb;padding:14px 24px;display:flex;align-items:center;gap:12px;flex-shrink:0">
    <div style="flex:1">
      <div style="font-size:18px;font-weight:700;color:#18181b">Analiza rozmów</div>
      <div style="font-size:12px;color:#6b7280;margin-top:1px">Analiza notatek z rozmów telefonicznych — skłonność do zakupu (DeepSeek AI)</div>
    </div>

    <button *ngIf="rows.length && !batchProgress.running && pendingCount > 0"
            (click)="startBatch()"
            style="display:flex;align-items:center;gap:6px;padding:8px 14px;background:#3BAA5D;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      ▶ Analizuj ({{pendingCount}})
    </button>
    <button *ngIf="batchProgress.running" disabled
            style="padding:8px 14px;background:#fed7aa;color:#9a3412;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:not-allowed">
      ⏳ Analizuję...
    </button>
    <label style="display:flex;align-items:center;gap:6px;padding:8px 14px;background:#18181b;color:white;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      ⬆ Import CSV
      <input type="file" accept=".csv" (change)="onFileChange($event)" style="display:none">
    </label>
  </div>

  <!-- BACK LINK -->
  @if (navBack.ctx(); as ctx) {
    <div style="padding:5px 24px;background:#f8fafc;border-bottom:1px solid #e5e7eb;flex-shrink:0">
      <button (click)="navigateBack()" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:white;border:1px solid #e2e8f0;border-radius:6px;color:#64748b;font-size:12px;font-weight:500;cursor:pointer;line-height:1">
        ← {{ctx.label}}
      </button>
    </div>
  }

  <!-- PROGRESS BAR -->
  <div *ngIf="batchProgress.running || (batchProgress.total > 0 && !batchProgress.running)"
       style="background:white;border-bottom:1px solid #e5e7eb;padding:10px 24px;flex-shrink:0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:12px;color:#374151;font-weight:500">
        <ng-container *ngIf="batchProgress.running && batchStartedHere">Analizowanie...</ng-container>
        <ng-container *ngIf="batchProgress.running && !batchStartedHere">⚠ Analizowanie (inny użytkownik)...</ng-container>
        <ng-container *ngIf="!batchProgress.running">Zakończono</ng-container>
        &nbsp;{{batchProgress.done}} / {{batchProgress.total}} firm
      </span>
      <span *ngIf="batchProgress.errors > 0" style="font-size:11px;color:#ef4444">
        {{batchProgress.errors}} błędów
      </span>
    </div>
    <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden">
      <div [style.width.%]="batchProgress.total ? ((batchProgress.done + batchProgress.errors) / batchProgress.total * 100) : 0"
           style="height:100%;background:#3BAA5D;border-radius:3px;transition:width 0.3s ease"></div>
    </div>
  </div>

  <!-- BULK ACTION BAR -->
  <div *ngIf="selectedCount > 0"
       style="background:#1e3a5f;color:white;padding:8px 24px;display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap">
    <span style="font-size:13px;font-weight:600;margin-right:4px">{{selectedCount}} zaznaczonych</span>
    <button (click)="bulkAction('set-status', 'hold')"
            style="padding:5px 12px;background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
      ⏸ Hold
    </button>
    <button (click)="bulkAction('set-status', 'archived')"
            style="padding:5px 12px;background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
      📦 Archiwizuj
    </button>
    <button (click)="bulkAction('set-status', 'pending')"
            style="padding:5px 12px;background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
      ▶ Przywróć
    </button>
    <button (click)="bulkAction('re-analyze')"
            style="padding:5px 12px;background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
      🔄 Re-analizuj
    </button>
    <button (click)="bulkAction('delete')"
            style="padding:5px 12px;background:rgba(239,68,68,0.3);color:#fca5a5;border:1px solid rgba(239,68,68,0.4);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
      🗑 Usuń zaznaczone
    </button>
    <button (click)="cancelSelection()"
            style="padding:5px 12px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.2);border-radius:6px;font-size:12px;cursor:pointer;margin-left:auto">
      ✕ Anuluj
    </button>
  </div>

  <!-- FILTRY -->
  <div style="background:white;border-bottom:1px solid #e5e7eb;padding:10px 24px;display:flex;gap:10px;align-items:center;flex-shrink:0;flex-wrap:wrap">
    <input type="text" placeholder="Szukaj firmy lub NIP..." [(ngModel)]="filters.search"
           (ngModelChange)="onFilterChange()"
           style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;width:220px">
    <select [(ngModel)]="filters.status" (ngModelChange)="onFilterChange()"
            style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      <option value="">Wszystkie statusy</option>
      <option value="pending">Oczekuje</option>
      <option value="analyzing">Analizowanie</option>
      <option value="done">Gotowe</option>
      <option value="error">Błąd</option>
      <option value="hold">Hold</option>
      <option value="archived">Archiwum</option>
    </select>
    <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151">
      Score:
      <input type="number" placeholder="min" [(ngModel)]="filters.score_min" (ngModelChange)="onFilterChange()"
             min="0" max="100" style="width:60px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      –
      <input type="number" placeholder="max" [(ngModel)]="filters.score_max" (ngModelChange)="onFilterChange()"
             min="0" max="100" style="width:60px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
    </div>
    <select [(ngModel)]="filters.follow_up" (ngModelChange)="onFilterChange()"
            style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      <option value="">Wszystkie follow-upy</option>
      <option value="required">📞 Follow-up wymagany</option>
      <option value="done">✓ Follow-up zrobiony</option>
    </select>
    <select [(ngModel)]="filters.salesperson" (ngModelChange)="onFilterChange()"
            style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      <option value="">Wszyscy handlowcy</option>
      <option *ngFor="let u of crmUsers" [value]="u.display_name">{{u.display_name}}</option>
    </select>
    <select [(ngModel)]="filters.link" (ngModelChange)="onFilterChange()"
            style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      <option value="">Wszystkie powiązania</option>
      <option value="lead">🏷 Lead</option>
      <option value="partner">🤝 Partner</option>
      <option value="prospect">👁 Prospekt</option>
      <option value="none">— Brak powiązań</option>
    </select>
    <span style="font-size:12px;color:#6b7280;white-space:nowrap">Pierwsza rozmowa:</span>
    <input type="date" [(ngModel)]="filters.first_call_from" (ngModelChange)="onFilterChange()"
           style="padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
    <span style="font-size:12px;color:#9ca3af">–</span>
    <input type="date" [(ngModel)]="filters.first_call_to" (ngModelChange)="onFilterChange()"
           style="padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
    <span style="font-size:12px;color:#6b7280;white-space:nowrap">Ostatnia rozmowa:</span>
    <input type="date" [(ngModel)]="filters.last_call_from" (ngModelChange)="onFilterChange()"
           style="padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
    <span style="font-size:12px;color:#9ca3af">–</span>
    <input type="date" [(ngModel)]="filters.last_call_to" (ngModelChange)="onFilterChange()"
           style="padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">

    <!-- Follow-up date preset filter -->
    <div style="display:flex;align-items:center;gap:4px;border-left:1px solid #e5e7eb;padding-left:10px">
      <span style="font-size:12px;color:#6b7280;white-space:nowrap">Follow-up date:</span>
      <button *ngFor="let p of followUpDatePresets"
              (click)="setFollowUpDatePreset(p.value)"
              [style.background]="filters.follow_up_date_preset===p.value?'#3BAA5D':'white'"
              [style.color]="filters.follow_up_date_preset===p.value?'white':'#374151'"
              [style.border]="filters.follow_up_date_preset===p.value?'1px solid #3BAA5D':'1px solid #d1d5db'"
              style="padding:5px 8px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap">
        {{p.label}}
      </button>
      <ng-container *ngIf="filters.follow_up_date_preset==='custom'">
        <input type="date" [(ngModel)]="filters.follow_up_date_from" (ngModelChange)="onFilterChange()"
               style="padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
        <span style="font-size:12px;color:#9ca3af">–</span>
        <input type="date" [(ngModel)]="filters.follow_up_date_to" (ngModelChange)="onFilterChange()"
               style="padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      </ng-container>
    </div>

    <span *ngIf="total > 0" style="font-size:12px;color:#6b7280;margin-left:auto">
      {{total}} firm
    </span>
  </div>

  <!-- IMPORT FEEDBACK -->
  <div *ngIf="importResult" [style.background]="importResult.error ? '#fef2f2' : '#f0fdf4'"
       style="border-bottom:1px solid;padding:10px 24px;font-size:13px;flex-shrink:0"
       [style.border-color]="importResult.error ? '#fca5a5' : '#86efac'"
       [style.color]="importResult.error ? '#dc2626' : '#15803d'">
    <span *ngIf="importResult.error">⚠ {{importResult.error}}</span>
    <span *ngIf="!importResult.error">
      ✓ Zaimportowano:
      <ng-container *ngIf="importResult.created !== undefined">
        {{importResult.created}} nowych, {{importResult.appended}} zaktualizowanych
      </ng-container>
      <ng-container *ngIf="importResult.created === undefined">{{importResult.upserted}} firm</ng-container>
      z {{importResult.total_rows}} wierszy
      (kolumny notatek: {{importResult.note1_column_detected || '—'}} / {{importResult.note2_column_detected || '—'}})
    </span>
  </div>

  <!-- TABELA -->
  <div style="flex:1;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f3f4f6;border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:1">
          <th style="padding:10px 12px;width:36px">
            <input type="checkbox" [checked]="allSelected && rows.length > 0" (change)="toggleSelectAll()"
                   style="cursor:pointer">
          </th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('company_name')">
            Firma {{sortIcon('company_name')}}
          </th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;white-space:nowrap">
            NIP
          </th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('salesperson')">
            Handlowiec {{sortIcon('salesperson')}}
          </th>
          <th style="padding:10px 8px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('calls_count')">
            Rozmowy {{sortIcon('calls_count')}}
          </th>
          <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('first_call_date')">
            Pierwsza rozmowa {{sortIcon('first_call_date')}}
          </th>
          <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('last_call_end_date')">
            Ostatnia rozmowa {{sortIcon('last_call_end_date')}}
          </th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('score')">
            Potencjał {{sortIcon('score')}}
            <div class="ca-info-wrap" (click)="$event.stopPropagation()">
              <button class="ca-info">?</button>
              <div class="ca-info-tip">
                <div class="ca-info-tip-title">Potencjał (0–100)</div>
                Ocena skłonności firmy do zakupu usług CRM.<br><br>
                0–20 ✗ Niezainteresowany<br>
                21–40 ↓ Niskie zainteresowanie<br>
                41–60 → Umiarkowane zainteresowanie<br>
                61–80 ↑ Silne zainteresowanie<br>
                81–100 ✓ Gotowy do zakupu<br><br>
                Wartość oblicza model AI na podstawie notatek z rozmów.
              </div>
            </div>
          </th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;white-space:nowrap">
            Status
          </th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;white-space:nowrap;cursor:pointer"
              (click)="setSort('analyzed_at')">
            Analizowano {{sortIcon('analyzed_at')}}
          </th>
          <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;white-space:nowrap;width:120px">Powiązania</th>
          <th style="padding:10px 8px;text-align:center;width:44px"></th>
        </tr>
      </thead>
      <tbody>
        <ng-container *ngFor="let r of rows">
          <!-- Wiersz główny -->
          <tr (click)="toggleExpand(r.nip)"
              style="border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background .1s"
              [style.background]="expandedNip === r.nip ? '#fff7ed' : (isSelected(r.nip) ? '#eff6ff' : 'white')"
              onmouseenter="this.style.background=this.getAttribute('data-expanded')==='true'?'#fff7ed':this.getAttribute('data-selected')==='true'?'#dbeafe':'#f9fafb'"
              onmouseleave="this.style.background=this.getAttribute('data-expanded')==='true'?'#fff7ed':this.getAttribute('data-selected')==='true'?'#eff6ff':'white'"
              [attr.data-expanded]="expandedNip === r.nip"
              [attr.data-selected]="isSelected(r.nip)">
            <td style="padding:10px 12px" (click)="$event.stopPropagation()">
              <input type="checkbox" [checked]="isSelected(r.nip)" (change)="toggleSelect(r.nip)"
                     style="cursor:pointer">
            </td>
            <td style="padding:10px 16px;font-weight:600;color:#18181b">
              {{r.company_name || '—'}}
            </td>
            <td style="padding:10px 16px;font-family:monospace;color:#374151">
              {{r.nip}}
            </td>
            <td style="padding:10px 16px;color:#374151;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              {{r.salesperson || '—'}}
            </td>
            <td style="padding:10px 8px;text-align:right;color:#374151">
              {{r.calls_count}}
            </td>
            <td style="padding:10px 8px;text-align:center;color:#6b7280;font-size:12px;white-space:nowrap">
              {{r.first_call_date ? (r.first_call_date | date:'dd.MM.yyyy') : '—'}}
            </td>
            <td style="padding:10px 8px;text-align:center;color:#6b7280;font-size:12px;white-space:nowrap">
              {{r.last_call_end_date ? (r.last_call_end_date | date:'dd.MM.yyyy') : '—'}}
            </td>
            <td style="padding:10px 16px;text-align:center">
              <span *ngIf="r.score !== null"
                    [style.background]="scoreBg(r.score)"
                    [style.color]="scoreColor(r.score)"
                    style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:26px;border-radius:20px;font-size:13px;font-weight:700">
                {{r.score}}
              </span>
              <span *ngIf="r.score === null" style="color:#d1d5db">—</span>
            </td>
            <td style="padding:10px 16px">
              <span [class]="statusClass(r.analysis_status)" style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600">
                {{statusLabel(r.analysis_status)}}
              </span>
              <button *ngIf="r.follow_up_required && !r.follow_up_done"
                      (click)="toggleFollowUpDone(r, $event)"
                      title="Kliknij aby oznaczyć follow-up jako zrobiony"
                      style="margin-left:6px;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;background:#fef3c7;color:#92400e;border:1px solid #fde68a;white-space:nowrap;cursor:pointer">
                📞 Follow-up<span *ngIf="r.follow_up_date"> · {{r.follow_up_date | date:'dd.MM'}}</span>
              </button>
              <button *ngIf="r.follow_up_done"
                      (click)="toggleFollowUpDone(r, $event)"
                      title="Follow-up wykonany. Kliknij aby cofnąć."
                      style="margin-left:6px;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;background:#f3f4f6;color:#9ca3af;border:1px solid #e5e7eb;white-space:nowrap;cursor:pointer;text-decoration:line-through">
                📞 Follow-up<span *ngIf="r.follow_up_date"> · {{r.follow_up_date | date:'dd.MM'}}</span>
              </button>
            </td>
            <td style="padding:10px 16px;color:#9ca3af;font-size:12px">
              {{r.analyzed_at ? (r.analyzed_at | date:'dd.MM.yyyy HH:mm') : '—'}}
            </td>
            <td style="padding:6px 8px;text-align:center">
              <div style="display:flex;flex-direction:column;gap:3px;align-items:center">
                <button *ngIf="r.has_prospect"
                        (click)="goToProspect(r.nip, $event)"
                        title="Przejdź do Prospekta"
                        style="padding:2px 7px;background:#fff7ed;border:1px solid #fbd0b6;color:#c2410c;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap">
                  ↗ Prospekt
                </button>
                <button *ngIf="r.has_lead"
                        (click)="goToLead(r.lead_id, r.nip, $event)"
                        title="Przejdź do Leada"
                        style="padding:2px 7px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap">
                  ↗ Lead
                </button>
                <button *ngIf="r.has_partner"
                        (click)="goToPartner(r.partner_nav_id, r.nip, $event)"
                        title="Przejdź do Partnera"
                        style="padding:2px 7px;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap">
                  ↗ Partner
                </button>
              </div>
            </td>
            <td style="padding:6px 8px;text-align:center" (click)="$event.stopPropagation()">
              <button (click)="openMenu(r.nip, $event)"
                      style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:16px;padding:2px 8px;border-radius:4px;line-height:1"
                      onmouseenter="this.style.color='#374151';this.style.background='#f3f4f6'"
                      onmouseleave="this.style.color='#9ca3af';this.style.background='none'"
                      title="Akcje">⋮</button>
            </td>
          </tr>

          <!-- Rozwinięty panel szczegółów -->
          <tr *ngIf="expandedNip === r.nip">
            <td colspan="12" style="padding:0;background:#fff7ed;border-bottom:2px solid #3BAA5D">
              <div style="padding:16px 24px">
                <div *ngIf="r.analysis_status === 'error' && r.analysis_error"
                     style="color:#dc2626;font-size:12px;margin-bottom:8px">
                  ⚠ {{r.analysis_error}}
                </div>
                <div *ngIf="r.ai_summary" style="color:#374151;font-size:13px;margin-bottom:12px;line-height:1.5">
                  {{r.ai_summary}}
                </div>
                <div style="display:flex;gap:24px;flex-wrap:wrap">
                  <div *ngIf="r.ai_signals?.length">
                    <div style="font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;margin-bottom:6px">✓ Sygnały pozytywne</div>
                    <ul style="margin:0;padding:0 0 0 16px;list-style:none">
                      <li *ngFor="let s of r.ai_signals" style="font-size:12px;color:#374151;margin-bottom:3px;padding-left:4px">
                        <span style="color:#22c55e;margin-right:6px">●</span>{{s}}
                      </li>
                    </ul>
                  </div>
                  <div *ngIf="r.ai_objections?.length">
                    <div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;margin-bottom:6px">✗ Obiekcje</div>
                    <ul style="margin:0;padding:0 0 0 16px;list-style:none">
                      <li *ngFor="let o of r.ai_objections" style="font-size:12px;color:#374151;margin-bottom:3px;padding-left:4px">
                        <span style="color:#ef4444;margin-right:6px">●</span>{{o}}
                      </li>
                    </ul>
                  </div>
                </div>
                <div style="margin-top:10px;font-size:11px;color:#9ca3af;display:flex;gap:16px">
                  <span>Rozmów: {{r.calls_count}}</span>
                  <span *ngIf="r.last_call_date">Ostatnia: {{r.last_call_date | date:'dd.MM.yyyy'}}</span>
                  <span *ngIf="r.imported_at">Import: {{r.imported_at | date:'dd.MM.yyyy HH:mm'}}</span>
                </div>

                <!-- Transkrypcja rozmów -->
                <div *ngIf="r.notes_text" style="margin-top:16px">
                  <div (click)="toggleTranscript(r.nip, $event)" class="transcript-toggle">
                    <span style="font-size:10px;margin-right:4px">{{ transcriptExpanded.has(r.nip) ? '▼' : '▶' }}</span>
                    📋 Transkrypcja rozmów ({{ getTranscripts(r).length }})
                  </div>
                  <div *ngIf="transcriptExpanded.has(r.nip)">
                    <div *ngFor="let chunk of getTranscripts(r); let i = index"
                         style="margin-bottom:12px;background:white;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
                      <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:6px 12px;font-size:11px;font-weight:600;color:#6b7280">
                        {{ chunk.label || ('Rozmowa ' + (i + 1)) }}
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
          <td colspan="12" style="padding:60px 24px;text-align:center;color:#9ca3af">
            <div style="font-size:32px;margin-bottom:8px">{{ hasActiveFilters ? '🔍' : '📞' }}</div>
            <div style="font-size:14px;font-weight:500">{{ hasActiveFilters ? 'Brak wyników dla wybranych filtrów' : 'Brak notatek z rozmów' }}</div>
            <div *ngIf="!hasActiveFilters" style="font-size:12px;margin-top:4px">Notatki pojawią się po imporcie CSV lub po zakończeniu rozmów telefonicznych</div>
          </td>
        </tr>

        <tr *ngIf="loading">
          <td colspan="12" style="padding:40px 24px;text-align:center;color:#9ca3af;font-size:13px">
            Ładowanie...
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- PAGINACJA -->
  <div *ngIf="pages > 1" style="background:white;border-top:1px solid #e5e7eb;padding:10px 24px;display:flex;align-items:center;justify-content:center;gap:8px;flex-shrink:0">
    <button [disabled]="page <= 1" (click)="goPage(page - 1)"
            style="padding:5px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;font-size:13px"
            [style.opacity]="page <= 1 ? '0.4' : '1'">←</button>
    <span style="font-size:13px;color:#374151">{{page}} / {{pages}}</span>
    <button [disabled]="page >= pages" (click)="goPage(page + 1)"
            style="padding:5px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;font-size:13px"
            [style.opacity]="page >= pages ? '0.4' : '1'">→</button>
  </div>

  <!-- MENU KONTEKSTOWE (⋮) -->
  <div *ngIf="openMenuNip"
       (click)="$event.stopPropagation()"
       [style.top.px]="menuPos.top"
       [style.left.px]="menuPos.left"
       style="position:fixed;z-index:9999;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:190px;padding:4px 0">
    <ng-container *ngFor="let r of rows">
      <ng-container *ngIf="r.nip === openMenuNip">
        <button (click)="setStatus(r.nip, r.analysis_status === 'hold' ? 'pending' : 'hold', $event)"
                style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;font-size:13px;color:#374151;cursor:pointer"
                onmouseenter="this.style.background='#f9fafb'"
                onmouseleave="this.style.background='none'">
          {{r.analysis_status === 'hold' ? '▶ Przywróć z Hold' : '⏸ Wstrzymaj (Hold)'}}
        </button>
        <button (click)="setStatus(r.nip, r.analysis_status === 'archived' ? 'pending' : 'archived', $event)"
                style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;font-size:13px;color:#374151;cursor:pointer"
                onmouseenter="this.style.background='#f9fafb'"
                onmouseleave="this.style.background='none'">
          {{r.analysis_status === 'archived' ? '📤 Przywróć z archiwum' : '📦 Archiwizuj'}}
        </button>
        <button (click)="reAnalyze(r.nip, $event)"
                style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;font-size:13px;color:#374151;cursor:pointer"
                onmouseenter="this.style.background='#f9fafb'"
                onmouseleave="this.style.background='none'">
          🔄 Re-analizuj
        </button>
        <button (click)="openInspect(r, $event)"
                style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;font-size:13px;color:#374151;cursor:pointer"
                onmouseenter="this.style.background='#f9fafb'"
                onmouseleave="this.style.background='none'">
          🔍 Inspekcja
        </button>
        <div style="height:1px;background:#e5e7eb;margin:4px 0"></div>
        <button (click)="deleteRow(r, $event)"
                style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;font-size:13px;color:#dc2626;cursor:pointer"
                onmouseenter="this.style.background='#fef2f2'"
                onmouseleave="this.style.background='none'">
          🗑 Usuń
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
              width:min(960px,calc(100vw - 32px));max-height:92vh;background:white;
              border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.28);
              display:flex;flex-direction:column;overflow:hidden">

    <!-- Header -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:14px 18px 12px;border-bottom:1px solid #e5e7eb;flex-shrink:0">
      <div style="display:flex;flex-direction:column;gap:3px">
        <span style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:.6px">🔍 Inspekcja analizatora</span>
        <span style="font-size:15px;font-weight:700;color:#3BAA5D">
          {{inspectRow.company_name || '—'}}
          <span style="font-size:12px;font-weight:400;color:#9ca3af;font-family:monospace"> · {{inspectRow.nip}}</span>
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="display:flex;gap:2px;background:#f3f4f6;padding:3px;border-radius:8px">
          <button (click)="inspectView='analysis'"
                  [style.background]="inspectView==='analysis'?'white':'transparent'"
                  [style.box-shadow]="inspectView==='analysis'?'0 1px 3px rgba(0,0,0,.1)':'none'"
                  [style.color]="inspectView==='analysis'?'#111827':'#6b7280'"
                  style="padding:4px 14px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:500">
            Analiza AI
          </button>
          <button (click)="switchInspectToPrompt()"
                  [style.background]="inspectView==='prompt'?'white':'transparent'"
                  [style.box-shadow]="inspectView==='prompt'?'0 1px 3px rgba(0,0,0,.1)':'none'"
                  [style.color]="inspectView==='prompt'?'#111827':'#6b7280'"
                  style="padding:4px 14px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:500">
            Prompt DeepSeek
          </button>
        </div>
        <button (click)="closeInspect()"
                style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:none;cursor:pointer;font-size:14px;color:#6b7280;line-height:1">
          ✕
        </button>
      </div>
    </div>

    <!-- TAB: Analiza AI -->
    <ng-container *ngIf="inspectView==='analysis'">
      <div style="display:grid;grid-template-columns:210px 1fr;flex:1;min-height:0;overflow:hidden">

        <!-- Lewa kolumna: score + follow-up + status -->
        <div style="padding:14px;border-right:1px solid #e5e7eb;overflow-y:auto;display:flex;flex-direction:column;gap:12px">

          <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Potencjał zakupu</div>
            <ng-container *ngIf="inspectRow.score !== null">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
                  <div [style.width.%]="inspectRow.score" [style.background]="scoreColor(inspectRow.score)"
                       style="height:100%;border-radius:4px"></div>
                </div>
                <span [style.color]="scoreColor(inspectRow.score)" style="font-size:22px;font-weight:800;min-width:32px;text-align:right">
                  {{inspectRow.score}}
                </span>
              </div>
              <div style="font-size:11px;color:#6b7280;margin-top:5px">{{scoreLabel(inspectRow.score)}}</div>
            </ng-container>
            <div *ngIf="inspectRow.score === null" style="color:#9ca3af;font-size:13px">Brak oceny</div>
          </div>

          <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Follow-up</div>
            <div style="font-size:12px;display:flex;flex-direction:column;gap:5px">
              <span [style.color]="inspectRow.follow_up_required?'#15803d':'#6b7280'" style="font-weight:600">
                {{inspectRow.follow_up_required ? '✓ Wymagany' : '— Nie wymagany'}}
              </span>
              <span *ngIf="inspectRow.follow_up_date" style="color:#374151">
                📅 {{inspectRow.follow_up_date | date:'dd.MM.yyyy'}}
              </span>
              <span *ngIf="inspectRow.follow_up_done" style="color:#9ca3af;text-decoration:line-through;font-size:11px">✓ Wykonany</span>
            </div>
          </div>

          <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Status analizy</div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <span [class]="statusClass(inspectRow.analysis_status)" style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;align-self:flex-start">
                {{statusLabel(inspectRow.analysis_status)}}
              </span>
              <span *ngIf="inspectRow.analyzed_at" style="font-size:11px;color:#9ca3af">
                {{inspectRow.analyzed_at | date:'dd.MM.yyyy HH:mm'}}
              </span>
            </div>
          </div>
        </div>

        <!-- Prawa kolumna: summary + sygnały + obiekcje -->
        <div style="padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:14px">
          <div *ngIf="inspectRow.ai_summary">
            <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Podsumowanie AI</div>
            <div style="font-size:13px;line-height:1.6;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px">
              {{inspectRow.ai_summary}}
            </div>
          </div>

          <div *ngIf="inspectRow.ai_signals?.length">
            <div style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">
              ✓ Sygnały pozytywne ({{inspectRow.ai_signals.length}})
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              <div *ngFor="let s of inspectRow.ai_signals"
                   style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;color:#374151">
                <span style="color:#22c55e;font-weight:700;flex-shrink:0;margin-top:1px">●</span>{{s}}
              </div>
            </div>
          </div>

          <div *ngIf="inspectRow.ai_objections?.length">
            <div style="font-size:10px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">
              ✗ Obiekcje ({{inspectRow.ai_objections.length}})
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              <div *ngFor="let o of inspectRow.ai_objections"
                   style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;background:#fff5f5;border:1px solid #fecaca;border-radius:6px;font-size:12px;color:#374151">
                <span style="color:#ef4444;font-weight:700;flex-shrink:0;margin-top:1px">●</span>{{o}}
              </div>
            </div>
          </div>

          <div *ngIf="!inspectRow.ai_summary && !inspectRow.ai_signals?.length && !inspectRow.ai_objections?.length"
               style="text-align:center;color:#9ca3af;font-size:13px;padding:32px">
            Brak wyników analizy AI dla tej firmy.
          </div>
        </div>
      </div>

      <!-- Stopka: notatki z rozmów -->
      <div *ngIf="inspectRow.notes_text"
           style="border-top:1px solid #e5e7eb;background:#fafafa;flex-shrink:0;max-height:200px;overflow-y:auto">
        <div style="padding:10px 14px">
          <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">
            Podstawa analizy — notatki ({{inspectRow.notes_text.length}} znaków · {{getTranscripts(inspectRow).length}} rozmów)
          </div>
          <pre style="margin:0;font-family:monospace;font-size:11px;line-height:1.6;color:#374151;white-space:pre-wrap;word-break:break-word">{{inspectRow.notes_text}}</pre>
        </div>
      </div>
    </ng-container>

    <!-- TAB: Prompt DeepSeek -->
    <ng-container *ngIf="inspectView==='prompt'">
      <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column">
        <div *ngIf="inspectPromptLoading"
             style="display:flex;align-items:center;justify-content:center;height:200px;gap:10px;color:#9ca3af;font-size:13px">
          <span class="ca-spin"></span> Wczytuję prompt…
        </div>
        <pre *ngIf="!inspectPromptLoading && inspectPromptText"
             style="flex:1;overflow:auto;margin:0;padding:16px 20px;font-family:monospace;font-size:11.5px;line-height:1.6;color:#1f2937;white-space:pre-wrap;word-break:break-word;background:#f9fafb">{{inspectPromptText}}</pre>
      </div>
    </ng-container>

  </div>

</div>
  `,
  styles: [`
    .status-pending   { background:#fef3c7;color:#92400e }
    .status-analyzing { background:#dbeafe;color:#1e40af }
    .status-done      { background:#dcfce7;color:#15803d }
    .status-error     { background:#fee2e2;color:#991b1b }
    .status-hold      { background:#f3f4f6;color:#374151 }
    .status-archived  { background:#e5e7eb;color:#6b7280 }

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
      border: 1px solid #d1d5db;
      background: #f9fafb;
      color: #9ca3af;
      font-size: 10px; font-weight: 700;
      cursor: help;
      display: inline-flex; align-items: center; justify-content: center;
      padding: 0; line-height: 1;
    }
    .ca-info:hover { background: #f0f9ff; border-color: #3BAA5D; color: #3BAA5D; }
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
      font-size: 13px;
    }
    .ca-info-wrap:hover .ca-info-tip { display: block; }

    /* Transkrypcja rozmów */
    .transcript-toggle {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: .5px;
      padding: 6px 0;
      margin-bottom: 8px;
      user-select: none;
    }
    .transcript-toggle:hover { color: #3BAA5D; }
    .transcript-body {
      padding: 12px 14px;
      font-size: 12px;
      line-height: 1.6;
      color: #374151;
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
      border: 2px solid #bbf7d0;
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
    { value: 'today',          label: 'Dziś' },
    { value: 'today_tomorrow', label: 'Dziś+Jutro' },
    { value: 'next_2_days',    label: 'Następne 2 dni' },
    { value: 'this_week',      label: 'Ten tydzień' },
    { value: 'custom',         label: 'Własny…' },
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
        this.importResult = { error: e.error?.error || 'Błąd importu' };
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
    this.navBack.set({ label: 'Analiza rozmów', route: ['/admin/call-analysis'], queryParams: { search: nip }, targetUrlPrefix: '/admin/prospects' });
    this.router.navigate(['/admin/prospects'], { queryParams: { search: nip } });
  }

  goToLead(id: number | null, nip: string, event: Event) {
    event.stopPropagation();
    if (id) {
      this.navBack.set({ label: 'Analiza rozmów', route: ['/admin/call-analysis'], queryParams: { search: nip }, targetUrlPrefix: '/crm/leads' });
      this.router.navigate(['/crm/leads', id]);
    }
  }

  goToPartner(navId: string | null, nip: string, event: Event) {
    event.stopPropagation();
    if (navId) {
      this.navBack.set({ label: 'Analiza rozmów', route: ['/admin/call-analysis'], queryParams: { search: nip }, targetUrlPrefix: '/crm/partners' });
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
    if (action === 'delete' && !confirm(`Usunąć ${nips.length} rekordów?`)) return;

    const body: any = { action, nips };
    if (status) body.status = status;

    this.http.post<any>(`${API}/bulk`, body).subscribe({
      next: () => {
        this.selectedNips.clear();
        this.load();
        this.cdr.markForCheck();
      },
      error: e => alert(e.error?.error || 'Błąd operacji zbiorczej'),
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
      error: () => { this.inspectPromptText = 'Błąd wczytywania promptu.'; this.inspectPromptLoading = false; this.cdr.markForCheck(); },
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
      error: e => alert(e.error?.error || 'Błąd aktualizacji follow-up'),
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
      error: e => alert(e.error?.error || 'Błąd zmiany statusu'),
    });
  }

  reAnalyze(nip: string, event: Event) {
    event.stopPropagation();
    this.openMenuNip = null;
    this.http.post<any>(`${API}/${nip}/re-analyze`, {}).subscribe({
      next: () => {
        const row = this.rows.find(r => r.nip === nip);
        if (row) (row as any).analysis_status = 'pending';
        this.batchStartedHere = true;
        this.startPolling();
        this.cdr.markForCheck();
      },
      error: e => alert(e.error?.error || 'Błąd re-analizy'),
    });
  }

  deleteRow(r: CallAnalysisRow, event: Event) {
    event.stopPropagation();
    this.openMenuNip = null;
    if (!confirm(`Usuń analizę dla ${r.company_name || r.nip}?`)) return;
    this.http.delete(`${API}/${r.nip}`).subscribe({
      next: () => {
        this.rows = this.rows.filter(x => x.nip !== r.nip);
        this.total--;
        this.cdr.markForCheck();
      },
      error: e => alert(e.error?.error || 'Błąd usuwania'),
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
    if (score >= 41) return '#c2410c';
    return '#b91c1c';
  }

  statusLabel(s: string): string {
    const m: Record<string, string> = {
      pending:   'Oczekuje',
      analyzing: 'Analizuję...',
      done:      'Gotowe',
      error:     'Błąd',
      hold:      'Hold',
      archived:  'Archiwum',
    };
    return m[s] || s;
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
    if (score >= 81) return '✓ Gotowy do zakupu';
    if (score >= 61) return '↑ Silne zainteresowanie';
    if (score >= 41) return '→ Umiarkowane zainteresowanie';
    if (score >= 21) return '↓ Niskie zainteresowanie';
    return '✗ Niezainteresowany';
  }
}

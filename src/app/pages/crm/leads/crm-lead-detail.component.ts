// src/app/pages/crm/leads/crm-lead-detail.component.ts
import { Component, OnInit, OnDestroy, inject, Input, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  CrmApiService, Lead, LeadActivity, LEAD_STAGE_LABELS, LeadStage,
  LEAD_SOURCES, CrmUser,
} from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'wt-crm-lead-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
<div class="detail-page" *ngIf="lead">
  <div class="detail-header">
    <button class="back-btn" routerLink="/crm/leads">← Leady</button>
    <div class="header-main">
      <h1>{{lead.company}}</h1>
      <span class="stage-badge stage-{{lead.stage}}">{{stageLabel(lead.stage)}}</span>
      <span *ngIf="lead.hot" class="hot-badge">🔥 Gorący</span>
    </div>
    <div class="header-actions">
      <button class="btn-outline" (click)="openEdit()">✏️ Edytuj</button>
      <button class="btn-primary" *ngIf="!lead.converted_at" (click)="showConvert = true">→ Konwertuj na partnera</button>
    </div>
  </div>

  <div class="detail-body">
    <div class="info-card">
      <h3>Informacje</h3>
      <div class="info-grid">
        <span class="lbl">Kontakt</span><span>{{lead.contact_name || '—'}}<span class="sub" *ngIf="lead.contact_title"> · {{lead.contact_title}}</span></span>
        <span class="lbl">Email</span><span>{{lead.email || '—'}}</span>
        <span class="lbl">Telefon</span><span>{{lead.phone || '—'}}</span>
        <span class="lbl">Branża</span><span>{{lead.industry || '—'}}</span>
        <span class="lbl">Źródło</span><span>{{sourceLabel(lead.source) || '—'}}</span>
        <span class="lbl">Obrót roczny</span><span>{{(lead.value_pln || 0) | number:'1.0-0'}} {{lead.annual_turnover_currency || 'PLN'}}</span>
        </div>
        <div class="info-row">
          <span class="lbl">% Online</span><span>{{lead.online_pct != null ? lead.online_pct + '%' : '—'}}</span>
        <span class="lbl">Prawdopodob.</span><span>{{lead.probability || 0}}%</span>
        <span class="lbl">Data zamkn.</span><span>{{lead.close_date ? (lead.close_date | date:'dd.MM.yyyy') : '—'}}</span>
        <span class="lbl">Handlowiec</span><span>{{lead.assigned_to_name || '—'}}</span>
        <span class="lbl">Tagi</span><span>{{lead.tags?.join(', ') || '—'}}</span>
        <span class="lbl">Notatki</span><span class="notes">{{lead.notes || '—'}}</span>
      </div>
    </div>

    <div class="activities-card">
      <div class="card-header">
        <h3>Aktywności</h3>
        <button class="btn-sm" (click)="showNewActivity = !showNewActivity">+ Dodaj</button>
      </div>
      <div class="new-activity-form" *ngIf="showNewActivity">
        <select [(ngModel)]="actForm.type" class="act-sel" (ngModelChange)="onActTypeChange()">
          <option value="call">📞 Połączenie</option>
          <option value="email">📧 Email</option>
          <option value="meeting">🤝 Spotkanie</option>
          <option value="note">📝 Notatka</option>
          <option value="doc_sent">📄 Dokument</option>
        </select>
        <input [(ngModel)]="actForm.title" placeholder="Tytuł *" class="act-input">
        <!-- Pola tylko dla spotkania -->
        <ng-container *ngIf="actForm.type === 'meeting'">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
              Data i czas
              <input type="datetime-local" [(ngModel)]="actForm.activity_at" class="act-input" style="font-size:11px">
            </label>
            <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
              Czas trwania (min)
              <input type="number" min="0" [(ngModel)]="actForm.duration_min" placeholder="np. 60" class="act-input" style="font-size:11px">
            </label>
          </div>
          <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
            Miejsce spotkania
            <input [(ngModel)]="actForm.meeting_location" placeholder="np. Sala konferencyjna A, Warszawa" class="act-input" style="font-size:11px">
          </label>
          <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
            Uczestnicy (emaile)
            <div class="participant-input-wrap">
              <div class="participant-chips">
                <span *ngFor="let e of actForm.participantList; let i = index" class="participant-chip">
                  {{e}} <button (click)="removeParticipant(actForm, i)" type="button">✕</button>
                </span>
                <input class="participant-input" [(ngModel)]="participantQuery"
                       (ngModelChange)="filterSuggestions()"
                       (keydown.enter)="addParticipantFromInput(actForm)"
                       (keydown.Tab)="addParticipantFromInput(actForm)"
                       placeholder="Wpisz email lub imię…" autocomplete="off">
              </div>
              <div class="suggestions-dropdown" *ngIf="filteredSuggestions.length && participantQuery">
                <div *ngFor="let s of filteredSuggestions" class="suggestion-item"
                     (mousedown)="pickSuggestion(actForm, s)">
                  <span style="font-weight:600">{{s.name}}</span>
                  <span style="color:#9ca3af;margin-left:6px;font-size:11px">{{s.email}}</span>
                </div>
              </div>
            </div>
          </label>
        </ng-container>
        <textarea [(ngModel)]="actForm.body" placeholder="Treść…" rows="2" class="act-input"></textarea>
        <div class="act-actions">
          <button class="btn-sm" (click)="showNewActivity = false">Anuluj</button>
          <button class="btn-sm primary" (click)="addActivity()" [disabled]="!actForm.title || savingActivity">
            {{savingActivity ? '…' : 'Zapisz'}}
          </button>
        </div>
      </div>
      <div class="activity-list">
        <div *ngFor="let a of lead.activities || []" class="act-item">
          <span class="act-type-icon">{{actIcon(a.type)}}</span>
          <div class="act-body" *ngIf="editingActId !== a.id">
            <strong>{{a.title}}</strong>
            <div class="act-meta">{{a.activity_at | date:'dd.MM.yyyy HH:mm'}} · {{a.created_by_name}}</div>
            <div *ngIf="a.meeting_location" class="act-text">📍 {{a.meeting_location}}</div>
            <div *ngIf="a.participants" class="act-text">👥 {{a.participants}}</div>
            <div class="act-text" *ngIf="a.body">{{a.body}}</div>
          </div>
          <div class="act-body act-edit-form" *ngIf="editingActId === a.id">
            <select [(ngModel)]="actEditForm.type" class="act-sel">
              <option value="call">📞 Połączenie</option>
              <option value="email">📧 Email</option>
              <option value="meeting">🤝 Spotkanie</option>
              <option value="note">📝 Notatka</option>
              <option value="doc_sent">📄 Dokument</option>
            </select>
            <input [(ngModel)]="actEditForm.title" placeholder="Tytuł *" class="act-input">
            <ng-container *ngIf="actEditForm.type === 'meeting'">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                  Data i czas
                  <input type="datetime-local" [(ngModel)]="actEditForm.activity_at" class="act-input" style="font-size:11px">
                </label>
                <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                  Czas trwania (min)
                  <input type="number" min="0" [(ngModel)]="actEditForm.duration_min" placeholder="60" class="act-input" style="font-size:11px">
                </label>
              </div>
              <input [(ngModel)]="actEditForm.meeting_location" placeholder="Miejsce spotkania" class="act-input">
              <input [(ngModel)]="actEditForm.participants" placeholder="Uczestnicy (emaile oddzielone przecinkiem)" class="act-input">
            </ng-container>
            <textarea [(ngModel)]="actEditForm.body" placeholder="Treść…" rows="2" class="act-input"></textarea>
            <div class="act-actions">
              <button class="btn-sm" (click)="cancelEditActivity()">Anuluj</button>
              <button class="btn-sm primary" (click)="saveEditActivity(a)" [disabled]="!actEditForm.title || savingActivity">
                {{savingActivity ? '…' : 'Zapisz'}}
              </button>
            </div>
          </div>
          <div class="act-controls" *ngIf="editingActId !== a.id && canEditActivity(a)">
            <button class="act-ctrl-btn" (click)="startEditActivity(a)" title="Edytuj">✏️</button>
            <button class="act-ctrl-btn del" (click)="deleteActivity(a)" title="Usuń">🗑️</button>
          </div>
        </div>
        <div class="empty-act" *ngIf="!(lead.activities?.length)">Brak aktywności.</div>
      </div>
    </div>
  </div>

  <!-- Edit modal -->
  <div class="modal-overlay" *ngIf="showEdit" (click)="showEdit = false">
    <div class="modal modal-wide" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <h3>Edytuj lead</h3>
        <button class="close-btn" (click)="showEdit = false">✕</button>
      </div>
      <div class="modal-body">

        <div class="edit-section">
          <div class="edit-section-title">Podstawowe</div>
          <div class="edit-row">
            <label>Nazwa firmy *<input [(ngModel)]="editForm.company" placeholder="Nazwa firmy" required></label>
            <label>Etap
              <select [(ngModel)]="editForm.stage">
                <option *ngFor="let s of stageOptions" [value]="s.key">{{s.label}}</option>
              </select>
            </label>
          </div>
          <div class="edit-row" *ngIf="editForm.stage === 'closed_lost'">
            <label class="full" style="color:#991b1b">
              Powód przegranej *
              <input [(ngModel)]="editForm.lost_reason"
                     placeholder="np. Cena, Konkurencja, Brak budżetu, Brak decyzji…"
                     [style.border-color]="editForm.stage === 'closed_lost' && !editForm.lost_reason ? '#ef4444' : ''">
              <span style="font-size:11px;color:#9ca3af;font-weight:400">Podaj krótki powód — pojawi się w raportach</span>
            </label>
          </div>
          <div class="edit-row">
            <label class="check-label"><input type="checkbox" [(ngModel)]="editForm.hot"> 🔥 Gorący lead</label>
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Kontakt</div>
          <div class="edit-row">
            <label>Imię i nazwisko<input [(ngModel)]="editForm.contact_name" placeholder="Jan Kowalski"></label>
            <label>Stanowisko<input [(ngModel)]="editForm.contact_title" placeholder="CEO"></label>
          </div>
          <div class="edit-row">
            <label>Email<input [(ngModel)]="editForm.email" type="email" placeholder="jan@firma.pl"></label>
            <label>Telefon<input [(ngModel)]="editForm.phone" placeholder="+48 600 000 000"></label>
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Szczegóły sprzedażowe</div>
          <div class="edit-row">
            <label>Obrót roczny
              <div style="display:flex;gap:6px">
                <input [(ngModel)]="editForm.value_pln" type="number" min="0" placeholder="0" style="flex:1">
                <select [(ngModel)]="editForm.annual_turnover_currency" style="width:80px">
                  <option value="PLN">PLN</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="CHF">CHF</option>
                </select>
              </div>
            </label>
            <label>% Online (udział kanału online)
              <select [(ngModel)]="editForm.online_pct">
                <option value="">— brak —</option>
                <option value="0">0%</option>
                <option value="10">10%</option>
                <option value="20">20%</option>
                <option value="30">30%</option>
                <option value="40">40%</option>
                <option value="50">50%</option>
                <option value="60">60%</option>
                <option value="70">70%</option>
                <option value="80">80%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
              </select>
            </label>
            <label>Prawdopodobieństwo (%)
              <select [(ngModel)]="editForm.probability">
                <option value="">— brak —</option>
                <option value="0">0%</option>
                <option value="10">10%</option>
                <option value="20">20%</option>
                <option value="30">30%</option>
                <option value="40">40%</option>
                <option value="50">50%</option>
                <option value="60">60%</option>
                <option value="70">70%</option>
                <option value="80">80%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
              </select>
            </label>
          </div>
          <div class="edit-row">
            <label>Data zamknięcia<input [(ngModel)]="editForm.close_date" type="date"></label>
            <label>Źródło
              <select [(ngModel)]="editForm.source">
                <option value="">— brak —</option>
                <option *ngFor="let s of leadSources" [value]="s.value">{{s.label}}</option>
              </select>
            </label>
          </div>
          <div class="edit-row">
            <label>Branża<input [(ngModel)]="editForm.industry" placeholder="np. IT, finanse"></label>
            <label>Handlowiec
              <select [(ngModel)]="editForm.assigned_to">
                <option value="">— nieprzypisany —</option>
                <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
              </select>
            </label>
          </div>
          <div class="edit-row">
            <label class="full">Tagi (oddzielone przecinkiem)<input [(ngModel)]="editForm.tagsStr" placeholder="tag1, tag2"></label>
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Notatki</div>
          <textarea [(ngModel)]="editForm.notes" rows="3" class="edit-textarea" placeholder="Dowolne notatki…"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" (click)="showEdit = false">Anuluj</button>
        <button class="btn-primary" (click)="saveLead()" [disabled]="saving || !editForm.company">
          {{saving ? 'Zapisywanie…' : 'Zapisz zmiany'}}
        </button>
      </div>
    </div>
  </div>

  <!-- Convert dialog -->
  <div class="modal-overlay" *ngIf="showConvert" (click)="showConvert = false">
    <div class="modal" (click)="$event.stopPropagation()">
      <h3>Konwertuj lead na partnera</h3>
      <p>Firma <strong>{{lead.company}}</strong> zostanie przeniesiona do rejestru partnerów.</p>
      <label>Wartość kontraktu (PLN)<input [(ngModel)]="convertForm.contract_value" type="number" min="0"></label>
      <label>Data podpisania<input [(ngModel)]="convertForm.contract_signed" type="date"></label>
      <div class="modal-actions">
        <button class="btn-outline" (click)="showConvert = false">Anuluj</button>
        <button class="btn-primary" (click)="convertLead()" [disabled]="converting">
          {{converting ? '…' : 'Konwertuj'}}
        </button>
      </div>
    </div>
  </div>
</div>
<div *ngIf="!lead && !loading" class="not-found">{{ loadError ? 'Błąd ładowania leada.' : 'Lead nie znaleziony.' }}</div>
<div *ngIf="loading" class="loading">Ładowanie…</div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; flex:1; overflow:hidden; height:100%; }
    .detail-page { padding:20px; max-width:900px; width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box; }
    .detail-header { display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap; flex-shrink:0; }
    .back-btn { background:none; border:none; color:#f97316; cursor:pointer; font-size:13px; }
    .header-main { display:flex; align-items:center; gap:10px; flex:1; flex-wrap:wrap; }
    .header-main h1 { font-size:22px; font-weight:800; margin:0; }
    .stage-badge { padding:3px 10px; border-radius:10px; font-size:12px; font-weight:700; }
    .stage-new{background:#f3f4f6;color:#374151} .stage-qualification{background:#dbeafe;color:#1e40af}
    .stage-presentation{background:#fef3c7;color:#92400e} .stage-offer{background:#f3e8ff;color:#6b21a8}
    .stage-negotiation{background:#ffedd5;color:#9a3412} .stage-closed_won{background:#dcfce7;color:#166534}
    .stage-closed_lost{background:#fee2e2;color:#991b1b}
    .hot-badge { background:#fef3c7; color:#92400e; font-size:11px; padding:2px 8px; border-radius:8px; font-weight:700; }
    .header-actions { display:flex; gap:8px; }
    .btn-primary { background:#f97316; color:white; border:none; border-radius:8px; padding:7px 14px; font-size:13px; font-weight:600; cursor:pointer; }
    .btn-primary:disabled { opacity:.6; cursor:not-allowed; }
    .btn-outline { background:white; color:#374151; border:1px solid #d1d5db; border-radius:8px; padding:7px 14px; font-size:13px; cursor:pointer; }
    .detail-body { display:grid; grid-template-columns:300px 1fr; gap:16px; flex:1; overflow:hidden; min-height:0; }
    @media(max-width:700px) { .detail-body { grid-template-columns:1fr; } }
    .info-card, .activities-card { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:16px; overflow-y:auto; min-height:0; }
    .info-card h3, .activities-card h3 { font-size:13px; font-weight:700; margin:0 0 12px; }
    .info-grid { display:grid; grid-template-columns:auto 1fr; gap:5px 10px; font-size:13px; }
    .lbl { color:#9ca3af; font-size:11px; white-space:nowrap; padding-top:2px; }
    .sub { color:#9ca3af; }
    .notes { white-space:pre-line; }
    .card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .card-header h3 { margin:0; }
    .btn-sm { font-size:12px; border:1px solid #e5e7eb; background:white; border-radius:6px; padding:3px 10px; cursor:pointer; }
    .btn-sm.primary { background:#f97316; color:white; border-color:#f97316; }
    .new-activity-form { background:#fafafa; border-radius:8px; padding:10px; margin-bottom:12px; display:flex; flex-direction:column; gap:7px; }
    .act-sel { border:1px solid #d1d5db; border-radius:6px; padding:5px 8px; font-size:12px; }
    .act-input { border:1px solid #d1d5db; border-radius:6px; padding:6px 10px; font-size:12px; font-family:inherit; resize:vertical; }
    .act-actions { display:flex; gap:6px; justify-content:flex-end; }
    .activity-list { display:flex; flex-direction:column; gap:10px; overflow-y:auto; }
    .act-item { display:flex; gap:10px; }
    .act-type-icon { font-size:18px; }
    .act-body { flex:1; }
    .act-body strong { font-size:13px; }
    .act-meta { font-size:10px; color:#9ca3af; }
    .act-text { font-size:12px; color:#6b7280; margin-top:2px; white-space:pre-line; }
    .act-edit-form { display:flex;flex-direction:column;gap:6px; }
    .act-controls { display:flex;gap:4px;align-self:flex-start;opacity:0;transition:opacity .15s; }
    .act-item:hover .act-controls { opacity:1; }
    .act-ctrl-btn { background:none;border:none;cursor:pointer;font-size:13px;padding:2px 4px;border-radius:4px;color:#9ca3af; }
    .act-ctrl-btn:hover { background:#f3f4f6;color:#374151; }
    .act-ctrl-btn.del:hover { color:#ef4444; }
    .participant-input-wrap { position:relative; }
    .participant-chips { display:flex;flex-wrap:wrap;gap:4px;align-items:center;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;min-height:32px;background:white; }
    .participant-chip { display:inline-flex;align-items:center;gap:4px;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:1px 8px;font-size:11px; }
    .participant-chip button { background:none;border:none;cursor:pointer;color:#9ca3af;font-size:11px;padding:0;line-height:1; }
    .participant-chip button:hover { color:#ef4444; }
    .participant-input { border:none;outline:none;font-size:12px;min-width:120px;flex:1;font-family:inherit; }
    .suggestions-dropdown { position:absolute;top:100%;left:0;right:0;z-index:100;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);max-height:160px;overflow-y:auto;margin-top:2px; }
    .suggestion-item { padding:7px 12px;font-size:12px;cursor:pointer; }
    .suggestion-item:hover { background:#f9fafb; }
    .empty-act { color:#9ca3af; font-size:12px; text-align:center; padding:16px; }
    .loading, .not-found { padding:40px; text-align:center; color:#9ca3af; }
    /* Modal shared */
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
    .modal { background:white; border-radius:14px; padding:24px; width:380px; display:flex; flex-direction:column; gap:12px; }
    .modal h3 { margin:0; font-size:16px; font-weight:700; }
    .modal p { margin:0; font-size:13px; color:#6b7280; }
    .modal label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; }
    .modal input { border:1px solid #d1d5db; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; }
    .modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:4px; }
    /* Edit modal */
    .modal-wide { width:min(700px,100%); max-height:86vh; overflow-y:auto; padding:0; gap:0; }
    .modal-header { display:flex; align-items:center; justify-content:space-between; padding:18px 24px 14px; border-bottom:1px solid #f3f4f6; position:sticky; top:0; background:white; z-index:1; }
    .modal-header h3 { margin:0; font-size:16px; font-weight:700; }
    .close-btn { background:none; border:none; font-size:18px; color:#9ca3af; cursor:pointer; }
    .modal-body { padding:20px 24px; display:flex; flex-direction:column; gap:16px; }
    .modal-footer { padding:14px 24px; border-top:1px solid #f3f4f6; display:flex; justify-content:flex-end; gap:8px; position:sticky; bottom:0; background:white; }
    .edit-section { display:flex; flex-direction:column; gap:10px; }
    .edit-section-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#9ca3af; }
    .edit-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .edit-row label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; color:#374151; }
    .edit-row label.full { grid-column:1/-1; }
    .edit-row label input, .edit-row label select { border:1px solid #d1d5db; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; font-family:inherit; background:white; }
    .edit-row label input:focus, .edit-row label select:focus { border-color:#f97316; }
    .edit-textarea { width:100%; border:1px solid #d1d5db; border-radius:6px; padding:8px 10px; font-size:13px; font-family:inherit; resize:vertical; outline:none; box-sizing:border-box; }
    .edit-textarea:focus { border-color:#f97316; }
    .check-label { flex-direction:row !important; align-items:center; gap:8px !important; font-size:13px !important; font-weight:400 !important; cursor:pointer; }
    .check-label input { width:auto; }
  `],
})
export class CrmLeadDetailComponent implements OnInit {
  @Input() id!: string;
  private route  = inject(ActivatedRoute);
  private zone   = inject(NgZone);
  private api    = inject(CrmApiService);
  private auth   = inject(AuthService);
  private router = inject(Router);
  private cdr    = inject(ChangeDetectorRef);

  lead: Lead | null = null;
  loading      = false;
  loadError    = false;
  saving       = false;
  savingActivity = false;
  showNewActivity = false;
  showEdit     = false;
  showConvert  = false;
  converting   = false;

  editForm: any  = {};
  actForm: any   = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participantList: [] as string[] };
  actEditForm: any = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participants: '' };
  editingActId: number | null = null;
  // Autocomplete participants
  allSuggestions: { email: string; name: string }[] = [];
  filteredSuggestions: { email: string; name: string }[] = [];
  participantQuery = '';
  convertForm    = { contract_value: null as number | null, contract_signed: '' };

  crmUsers: CrmUser[] = [];
  readonly stageOptions = Object.entries(LEAD_STAGE_LABELS).map(([key, label]) => ({ key: key as LeadStage, label }));
  readonly leadSources  = LEAD_SOURCES;

  get isManager() {
    const u = this.auth.user();
    return u?.is_admin || u?.crm_role === 'sales_manager';
  }

  ngOnInit() {
    const rawId = this.id || this.route.snapshot.paramMap.get('id') || '';
    const numId = parseInt(rawId, 10);
    if (!numId || isNaN(numId)) { this.loadError = true; return; }
    this.loadLead(numId);
    this.api.getContactSuggestions(numId).subscribe({
      next: s => { this.allSuggestions = s; },
      error: () => {},
    });
  }

  loadLead(numId?: number) {
    const id = numId ?? parseInt(this.id, 10);
    if (!id || isNaN(id)) return;
    this.loading = true;
    this.loadError = false;
    this.lead = null;
    this.api.getLead(id).pipe(
      finalize(() => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); })
    ).subscribe({
      next: l  => { this.zone.run(() => { this.lead = l; this.cdr.markForCheck(); }); },
      error: () => { this.zone.run(() => { this.loadError = true; this.cdr.markForCheck(); }); },
    });
  }

  openEdit() {
    if (!this.lead) return;
    this.editForm = {
      company:      this.lead.company,
      stage:        this.lead.stage,
      hot:          this.lead.hot,
      contact_name: this.lead.contact_name || '',
      contact_title:this.lead.contact_title || '',
      email:        this.lead.email || '',
      phone:        this.lead.phone || '',
      value_pln:                this.lead.value_pln ?? null,
      annual_turnover_currency: this.lead.annual_turnover_currency || 'PLN',
      online_pct:           this.lead.online_pct ?? '',
      probability:  this.lead.probability ?? null,
      close_date:   this.lead.close_date || '',
      source:       this.lead.source || '',
      industry:     this.lead.industry || '',
      assigned_to:  this.lead.assigned_to || '',
      tagsStr:      (this.lead.tags || []).join(', '),
      notes:        this.lead.notes || '',
    };
    // Załaduj użytkowników CRM do selecta (zawsze, gdy lista jest pusta)
    if (!this.crmUsers.length) {
      this.api.getCrmUsers().subscribe({
        next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); },
        error: () => {},
      });
    }
    this.showEdit = true;
  }

  saveLead() {
    if (!this.lead || !this.editForm.company) return;
    this.saving = true;
    const payload: Partial<Lead> = {
      company:       this.editForm.company,
      stage:         this.editForm.stage,
      hot:           this.editForm.hot,
      contact_name:  this.editForm.contact_name || null,
      contact_title: this.editForm.contact_title || null,
      email:         this.editForm.email || null,
      phone:         this.editForm.phone || null,
      value_pln:                this.editForm.value_pln != null && this.editForm.value_pln !== '' ? +this.editForm.value_pln : null,
      annual_turnover_currency: this.editForm.annual_turnover_currency || 'PLN',
      online_pct:               this.editForm.online_pct !== '' && this.editForm.online_pct != null ? +this.editForm.online_pct : null,
      probability:   this.editForm.probability != null && this.editForm.probability !== '' ? +this.editForm.probability : null,
      close_date:    this.editForm.close_date || null,
      source:        this.editForm.source || null,
      industry:      this.editForm.industry || null,
      assigned_to:   this.editForm.assigned_to || null,
      tags:          this.editForm.tagsStr ? this.editForm.tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      notes:         this.editForm.notes || null,
      lost_reason:   this.editForm.stage === 'closed_lost' ? (this.editForm.lost_reason || null) : null,
    };
    this.api.updateLead(this.lead.id, payload).subscribe({
      next: updated => {
        this.zone.run(() => {
          // Zachowaj activities których serwer nie zwraca w PATCH
          this.lead = { ...this.lead!, ...updated, activities: this.lead!.activities };
          // Zaktualizuj assigned_to_name jeśli zmieniono handlowca
          if (this.editForm.assigned_to) {
            const u = this.crmUsers.find(x => x.id === this.editForm.assigned_to);
            if (u) this.lead!.assigned_to_name = u.display_name;
          } else {
            this.lead!.assigned_to_name = null;
          }
          this.saving = false;
          this.showEdit = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.saving = false; this.cdr.markForCheck(); }); },
    });
  }

  canEditActivity(a: any): boolean {
    const u = this.auth.user();
    return u?.is_admin || u?.crm_role === 'sales_manager' || a.created_by === u?.id;
  }

  startEditActivity(a: any): void {
    this.editingActId = a.id;
    this.actEditForm  = {
      type:             a.type,
      title:            a.title,
      body:             a.body || '',
      activity_at:      a.activity_at ? a.activity_at.substring(0, 16) : '',
      duration_min:     a.duration_min ?? '',
      meeting_location: a.meeting_location || '',
      participants:     a.participants || '',
    };
  }

  cancelEditActivity(): void {
    this.editingActId = null;
  }

  saveEditActivity(a: any): void {
    if (!this.actEditForm.title || !this.lead) return;
    this.savingActivity = true;
    const payload: any = {
      type:  this.actEditForm.type,
      title: this.actEditForm.title,
      body:  this.actEditForm.body || null,
    };
    if (this.actEditForm.type === 'meeting') {
      if (this.actEditForm.activity_at)      payload.activity_at      = this.actEditForm.activity_at;
      if (this.actEditForm.duration_min !== '') payload.duration_min   = +this.actEditForm.duration_min;
      payload.meeting_location = this.actEditForm.meeting_location || null;
      payload.participants     = this.actEditForm.participants || null;
    }
    this.api.updateLeadActivity(this.lead.id, a.id, payload).subscribe({
      next: updated => {
        this.zone.run(() => {
          if (this.lead) {
            this.lead = {
              ...this.lead,
              activities: (this.lead.activities || []).map(x => x.id === a.id ? { ...x, ...updated } : x),
            };
          }
          this.editingActId   = null;
          this.savingActivity = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.savingActivity = false; this.cdr.markForCheck(); }); },
    });
  }

  deleteActivity(a: any): void {
    if (!this.lead || !confirm(`Usunąć aktywność "${a.title}"?`)) return;
    this.api.deleteLeadActivity(this.lead.id, a.id).subscribe({
      next: () => {
        this.zone.run(() => {
          if (this.lead) {
            this.lead = {
              ...this.lead,
              activities: (this.lead.activities || []).filter(x => x.id !== a.id),
            };
          }
          this.cdr.markForCheck();
        });
      },
      error: () => {},
    });
  }

  onActTypeChange(): void {
    if (this.actForm.type !== 'meeting') {
      this.actForm.participantList = [];
      this.participantQuery = '';
    }
    this.cdr.markForCheck();
  }

  filterSuggestions(): void {
    const q = this.participantQuery.toLowerCase();
    if (!q) { this.filteredSuggestions = []; this.cdr.markForCheck(); return; }
    // Załaduj sugestie jeśli jeszcze nie załadowane
    if (!this.allSuggestions.length && this.lead?.id) {
      this.api.getContactSuggestions(this.lead.id).subscribe({
        next: s => {
          this.allSuggestions = s;
          this._applyFilter(q);
        },
        error: () => {},
      });
      return;
    }
    this._applyFilter(q);
  }

  private _applyFilter(q: string): void {
    const existing = new Set((this.actForm.participantList || []) as string[]);
    this.filteredSuggestions = this.allSuggestions.filter(
      s => !existing.has(s.email) && (s.email.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    ).slice(0, 8);
    this.cdr.markForCheck();
  }

  pickSuggestion(form: any, s: { email: string; name: string }): void {
    if (!form.participantList) form.participantList = [];
    if (!form.participantList.includes(s.email)) form.participantList.push(s.email);
    this.participantQuery = '';
    this.filteredSuggestions = [];
    this.cdr.markForCheck();
  }

  addParticipantFromInput(form: any): void {
    const val = this.participantQuery.trim().replace(/,\s*$/, '');
    if (!val) return;
    if (!form.participantList) form.participantList = [];
    const emails = val.split(/[,;\s]+/).map((e: string) => e.trim()).filter(Boolean);
    emails.forEach((e: string) => { if (!form.participantList.includes(e)) form.participantList.push(e); });
    this.participantQuery = '';
    this.filteredSuggestions = [];
    this.cdr.markForCheck();
  }

  removeParticipant(form: any, idx: number): void {
    form.participantList.splice(idx, 1);
    this.cdr.markForCheck();
  }

  addActivity() {
    if (!this.actForm.title || !this.lead) return;
    this.savingActivity = true;
    const payload: any = {
      type:  this.actForm.type,
      title: this.actForm.title,
      body:  this.actForm.body || null,
    };
    if (this.actForm.type === 'meeting') {
      if (this.actForm.activity_at) payload.activity_at = this.actForm.activity_at;
      if (this.actForm.duration_min) payload.duration_min = +this.actForm.duration_min;
      payload.meeting_location = this.actForm.meeting_location || null;
      payload.participants = (this.actForm.participantList || []).join(', ') || null;
    }
    this.api.createLeadActivity(this.lead.id, payload).subscribe({
      next: newAct => {
        this.zone.run(() => {
          if (this.lead) {
            this.lead = { ...this.lead, activities: [newAct, ...(this.lead.activities || [])] };
          }
          this.actForm = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participantList: [] };
          this.participantQuery = '';
          this.showNewActivity  = false;
          this.savingActivity   = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.savingActivity = false; this.cdr.markForCheck(); }); },
    });
  }

  convertLead() {
    if (!this.lead) return;
    this.converting = true;
    this.api.convertLead(this.lead.id, this.convertForm).subscribe({
      next: r => { this.converting = false; this.router.navigate(['/crm/partners', r.partner.id]); },
      error: () => { this.zone.run(() => { this.converting = false; this.cdr.markForCheck(); }); },
    });
  }

  sourceLabel(val: string | null): string {
    if (!val) return '';
    return LEAD_SOURCES.find(s => s.value === val)?.label ?? val;
  }

  stageLabel(s: LeadStage) { return LEAD_STAGE_LABELS[s] || s; }
  actIcon(type: string) {
    return { call:'📞', email:'📧', meeting:'🤝', note:'📝', doc_sent:'📄' }[type] || '💬';
  }
}
